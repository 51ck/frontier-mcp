import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { StorageDriver } from '../src/storage/driver.ts';
import { map, spec, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const FILE = '.scratch/alpha/issues/01-T1-work.md';

async function workspace() {
  const root = await makeFixtureTree({
    '.git/HEAD': 'ref: refs/heads/main\n',
    '.scratch/alpha/map.md': map('Somewhere.'),
    '.scratch/alpha/spec.md': spec('Alpha'),
    [FILE]: ticket('T1', 'Work', { status: 'claimed', claimed_by: 'agent-1' }),
    '.scratch/alpha/issues/02-T2-more.md': ticket('T2', 'More'),
  });
  return { root, frontier: await connectFrontier({ cwd: root, env: {} }) };
}

/** Every file under the root, with its size and modification time, so a rewrite of equal bytes still shows. */
async function snapshot(dir: string): Promise<Map<string, string>> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const paths = entries
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name))
    .toSorted();
  const stamped = await Promise.all(
    paths.map(async path => {
      const [info, contents] = await Promise.all([stat(path), readFile(path, 'utf8')]);
      return [path, `${String(info.size)}:${info.mtimeMs.toString()}:${contents}`] as const;
    }),
  );
  return new Map(stamped);
}

/** A valid call per tool, which an unknown key is added to. */
const VALID: Readonly<Record<string, Record<string, unknown>>> = {
  list_efforts: {},
  get_board: { effort: 'alpha' },
  get_tickets: { ids: ['T1'] },
  create_tickets: { effort: 'alpha', tickets: [{ name: 'fresh', title: 'Fresh' }] },
  update_ticket: { id: 'T2', comment: 'A note.' },
  edit_map: { effort: 'alpha', notes: 'New notes.' },
  spec: { effort: 'alpha', content: '# Alpha\n\nNew.\n' },
  check_tracker: {},
};

describe('an argument the tool does not know', () => {
  for (const [tool, args] of Object.entries(VALID)) {
    it(`is refused by ${tool} by name, before the driver is asked anything`, async () => {
      const root = await makeFixtureTree({ '.git/HEAD': 'ref: refs/heads/main\n' });
      const calls: string[] = [];
      const driver = new Proxy(
        {},
        {
          get: (_target, key) => {
            if (key === 'then') return undefined;
            if (key === 'close') return () => {};
            return () => {
              calls.push(String(key));
              throw new Error('the driver was asked');
            };
          },
        },
      ) as StorageDriver;
      const frontier = await connectFrontier({ cwd: root, env: {}, createDriver: () => driver });
      calls.length = 0;

      const refused = await frontier.callExpectingError(tool, { ...args, bogus: 1 });
      expect(refused).toBe(
        `Input validation error: Invalid arguments for tool ${tool}: Unrecognized key: "bogus"`,
      );
      expect(calls).toEqual([]);

      // The probe bites: the same call without the unknown key reaches the driver.
      expect(await frontier.callExpectingError(tool, args)).toContain('the driver was asked');
      expect(calls).not.toEqual([]);
    });

    it(`is refused by ${tool} and leaves every file as it was`, async () => {
      const { root, frontier } = await workspace();
      const before = await snapshot(root);

      expect(await frontier.callExpectingError(tool, { ...args, bogus: 1 })).toContain(
        'Unrecognized key: "bogus"',
      );

      expect([...(await snapshot(root)).entries()]).toEqual([...before.entries()]);
    });
  }

  it('fails check_tracker { rename: true } naming rename', async () => {
    const { frontier } = await workspace();

    expect(await frontier.callExpectingError('check_tracker', { rename: true })).toBe(
      'Input validation error: Invalid arguments for tool check_tracker: Unrecognized key: "rename"',
    );
  });
});

describe('a key the tool does not know inside a nested object', () => {
  it.each([
    ['claim', { by: 'agent-2', bi: 'agent-3' }, 'bi'],
    ['resolve', { answer_gist: 'x', anwser: 'long answer' }, 'anwser'],
    ['drop', { reason: 'Out.', resaon: 'Out.' }, 'resaon'],
    ['reopen', { reason: 'Back.', why: 'Back.' }, 'why'],
  ])('is refused in update_ticket %s, naming where it sits', async (field, value, key) => {
    const { root, frontier } = await workspace();
    const before = await snapshot(root);

    expect(await frontier.callExpectingError('update_ticket', { id: 'T1', [field]: value })).toBe(
      `Input validation error: Invalid arguments for tool update_ticket: ${field}: Unrecognized key: "${key}"`,
    );

    expect([...(await snapshot(root)).entries()]).toEqual([...before.entries()]);
  });

  it('is refused in a create_tickets entry, naming its index, and creates nothing', async () => {
    const { root, frontier } = await workspace();
    const before = await snapshot(root);

    const refused = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [
        { name: 'first', title: 'First' },
        { name: 'second', title: 'Second', blockedby: ['first'], triag: 'wontfix' },
      ],
    });

    expect(refused).toBe(
      'Input validation error: Invalid arguments for tool create_tickets: ' +
        'tickets.1: Unrecognized keys: "blockedby", "triag"',
    );
    expect([...(await snapshot(root)).entries()]).toEqual([...before.entries()]);
  });

  it('still refuses a create_tickets key by its own message', async () => {
    const { frontier } = await workspace();

    expect(
      await frontier.callExpectingError('create_tickets', {
        effort: 'alpha',
        tickets: [{ name: 'first', title: 'First', key: 'first' }],
      }),
    ).toBe(
      'Input validation error: Invalid arguments for tool create_tickets: ' +
        'tickets.0.key: `key` was replaced by `name`.',
    );
  });
});

describe('the cases 1.0 silently accepted', () => {
  it('refuses a resolve whose answer is misspelled, leaving the Ticket claimed', async () => {
    const { root, frontier } = await workspace();
    const before = await readFile(join(root, FILE));

    expect(
      await frontier.callExpectingError('update_ticket', {
        id: 'T1',
        resolve: { answer_gist: 'x', anwser: 'long answer' },
      }),
    ).toContain('resolve: Unrecognized key: "anwser"');

    expect(await readFile(join(root, FILE))).toEqual(before);
  });

  it('refuses a misspelled blocked_by beside a valid argument', async () => {
    const { root, frontier } = await workspace();
    const before = await readFile(join(root, FILE));

    expect(
      await frontier.callExpectingError('update_ticket', {
        id: 'T1',
        blockedby: ['T2'],
        triage: 'wontfix',
      }),
    ).toContain('Unrecognized key: "blockedby"');

    expect(await readFile(join(root, FILE))).toEqual(before);
  });
});

describe('extra', () => {
  it('stays open to keys of the caller’s choosing', async () => {
    const { frontier } = await workspace();

    expect(await frontier.call('update_ticket', { id: 'T2', extra: { anything: 1 } })).toContain(
      'T2 updated',
    );
  });
});
