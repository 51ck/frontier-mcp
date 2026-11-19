import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map, spec, ticket } from './support/fixtures.ts';
import {
  cleanupFixtures,
  connectFrontier,
  makeFixtureTree,
  type ConnectedFrontier,
  type FixtureTree,
} from './support/harness.ts';

afterEach(cleanupFixtures);

const CONFIG = '.scratch/frontier.yml';
const WARNING =
  '  .scratch/frontier.yml is ignored since FrontierMCP 2.0: no id is minted, so id_pattern ' +
  'does nothing and no write depends on this file — it can be deleted';

const TREE: FixtureTree = {
  '.scratch/alpha/map.md': map('Somewhere.'),
  '.scratch/alpha/spec.md': spec('Alpha'),
  '.scratch/alpha/issues/01-T1-one.md': ticket('T1', 'One'),
  '.scratch/beta/issues/01-old.md': '---\nfrontier: ticket\ntitle: Old\nstatus: open\n---\n',
  '.scratch/beta/issues/02-older.md':
    '---\nfrontier: ticket\ntitle: Older\nstatus: open\nblocked_by: [old]\n---\n',
};

async function start(extra: FixtureTree) {
  const root = await makeFixtureTree({ ...TREE, ...extra });
  return { root, frontier: await connectFrontier({ cwd: root, env: {} }) };
}

function warningsOf(board: string): string[] {
  const at = board.indexOf('warnings:');
  return at < 0 ? [] : board.slice(at).split('\n').slice(1);
}

function revisionIn(read: string): string {
  return /revision: (\S+)/.exec(read)?.[1] ?? '';
}

/** Every writer once: each of the four tools that can change a file, creating an Effort too. */
async function writeWithEveryTool(frontier: ConnectedFrontier): Promise<void> {
  await frontier.call('create_tickets', {
    effort: 'alpha',
    tickets: [{ name: 'new', title: 'New', blocked_by: ['T1'] }],
  });
  await frontier.call('create_tickets', {
    effort: 'gamma',
    create: true,
    tickets: [{ name: 'first', title: 'First' }],
  });
  await frontier.call('update_ticket', { id: 'T1', claim: { by: 'me' } });
  await frontier.call('update_ticket', { id: 'T1', resolve: { answer_gist: 'Done.' } });
  await frontier.call('edit_map', {
    effort: 'alpha',
    add_fog: 'Something unknown.',
    expected_revision: revisionIn(await frontier.call('edit_map', { effort: 'alpha' })),
  });
  await frontier.call('edit_map', { effort: 'gamma', destination: 'Elsewhere.' });
  await frontier.call('spec', {
    effort: 'alpha',
    content: '# Alpha, again\n',
    expected_revision: revisionIn(await frontier.call('spec', { effort: 'alpha' })),
  });
  await frontier.call('spec', { effort: 'gamma', content: '# Gamma\n' });
  expect(await frontier.call('migrate_effort', { effort: 'beta' })).toContain('nothing migrated');
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .toSorted();
}

const TICKETS_MAPS_AND_SPECS = [
  'alpha/issues/01-T1-one.md',
  'alpha/issues/new.md',
  'alpha/map.md',
  'alpha/spec.md',
  'beta/issues/01-old.md',
  'beta/issues/02-older.md',
  'gamma/issues/first.md',
  'gamma/map.md',
  'gamma/spec.md',
];

describe('a frontier.yml left over from 1.x', () => {
  it.each([
    ['a valid id_pattern', 'id_pattern: T<N>\n'],
    ['an id_pattern 1.x refused', 'id_pattern: <effort>-<N>\n'],
    ['an id_pattern that is not a string', 'id_pattern: [a, b]\n'],
    ['a file that does not parse', 'id_pattern: [unclosed\nsecret: value\n'],
  ])('accepts every write and shows the one warning for %s', async (_name, config) => {
    const { root, frontier } = await start({ [CONFIG]: config });

    expect(warningsOf(await frontier.call('get_board', { effort: 'alpha' }))).toEqual([WARNING]);

    await writeWithEveryTool(frontier);

    const boards = await Promise.all(
      ['alpha', 'beta', 'gamma'].map(effort => frontier.call('get_board', { effort })),
    );
    for (const board of boards) {
      expect(warningsOf(board)).toEqual([WARNING]);
      expect(board).not.toContain('secret');
    }
    expect(await readFile(join(root, CONFIG), 'utf8')).toBe(config);
    expect(await filesUnder(join(root, '.scratch'))).toEqual(
      [...TICKETS_MAPS_AND_SPECS, 'frontier.yml'].toSorted(),
    );
  });

  it.each([
    ['no file', {}],
    ['an empty file', { [CONFIG]: '' }],
    ['a file that sets no id_pattern', { [CONFIG]: '# nothing here\nother: 1\n' }],
    ['a file that is not a mapping', { [CONFIG]: '- T<N>\n' }],
  ])('says nothing for %s', async (_name, extra) => {
    const { frontier } = await start(extra);

    expect(await frontier.call('get_board', { effort: 'alpha' })).not.toContain('warnings:');
    expect(await frontier.call('get_board', { effort: 'beta' })).not.toContain('frontier.yml');
  });

  it('keeps the warning to Boards: no write result and no list_efforts line carries it', async () => {
    const { frontier } = await start({ [CONFIG]: 'id_pattern: T<N>\n' });

    const created = await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'new', title: 'New' }],
    });
    const migrated = await frontier.call('migrate_effort', { effort: 'beta' });

    for (const text of [created, migrated, await frontier.call('list_efforts')]) {
      expect(text).not.toMatch(/frontier\.yml|id_pattern|regression|warnings:/);
    }
  });
});

describe('what the tools write', () => {
  it('is Ticket, Map and Spec files and nothing else', async () => {
    const { root, frontier } = await start({});

    await writeWithEveryTool(frontier);

    expect(await filesUnder(join(root, '.scratch'))).toEqual(TICKETS_MAPS_AND_SPECS);
    expect(await filesUnder(root)).toEqual(TICKETS_MAPS_AND_SPECS.map(file => `.scratch/${file}`));
  });

  it('never reads, counts or deletes a guard file 1.x left behind', async () => {
    const guards: FixtureTree = {
      '.scratch/.frontier-id-N-2.guard': '4242\n',
      '.scratch/.frontier-id-T7.guard': '4243\n',
      '.scratch/alpha/issues/.frontier-id-N-3.guard': '4244\n',
    };
    const { root, frontier } = await start(guards);

    expect(await frontier.call('list_efforts')).toMatch(
      /^root: .*\nalpha {2}tickets=1 .*\nbeta {2}tickets=2 .*$/,
    );
    expect(await frontier.call('get_board', { effort: 'alpha' })).not.toContain('warnings:');

    await writeWithEveryTool(frontier);

    expect(
      await Promise.all(Object.keys(guards).map(file => readFile(join(root, file), 'utf8'))),
    ).toEqual(Object.values(guards));
    expect(await filesUnder(join(root, '.scratch'))).toEqual(
      [
        ...TICKETS_MAPS_AND_SPECS,
        ...Object.keys(guards).map(file => file.slice('.scratch/'.length)),
      ].toSorted(),
    );
    expect(await frontier.call('list_efforts')).toMatch(
      /^root: .*\nalpha {2}tickets=2 .*\nbeta {2}tickets=2 .*\ngamma {2}tickets=1 .*$/,
    );
  });
});

describe('an id of every shape 1.x could mint', () => {
  const IDS = ['T12', 'Tik4z0t', 'AUTH-7', 'T35-ab12'];
  const SHAPES: FixtureTree = {
    // A pattern none of the four matches: nothing consults it.
    [CONFIG]: 'id_pattern: x<b16{8}>\n',
    '.scratch/alpha/map.md': map('Somewhere.'),
    '.scratch/alpha/issues/01-T12-counted.md': ticket('T12', 'Counted'),
    '.scratch/alpha/issues/02-Tik4z0t-random.md': ticket('Tik4z0t', 'Random'),
    '.scratch/alpha/issues/03-AUTH-7-prefixed.md': ticket('AUTH-7', 'Prefixed'),
    '.scratch/alpha/issues/04-T35-ab12-mixed.md': ticket('T35-ab12', 'Mixed'),
    '.scratch/alpha/issues/05-T99-waits.md': ticket('T99', 'Waits', { blocked_by: IDS }),
    '.scratch/beta/map.md': map('Elsewhere.'),
    '.scratch/beta/issues/far.md':
      '---\nfrontier: ticket\ntitle: Far\nkind: build\nstatus: open\nblocked_by: [T12, Tik4z0t, AUTH-7, T35-ab12]\n---\n',
  };

  it('still resolves as a name, as an Edge and as tool input', async () => {
    const root = await makeFixtureTree(SHAPES);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const alpha = await frontier.call('get_board', { effort: 'alpha' });
    expect(alpha).toContain('T99  Waits  build/open  blocked_by=T12,Tik4z0t,AUTH-7,T35-ab12');
    expect(alpha).not.toContain('dangling');
    expect(await frontier.call('get_board', { effort: 'beta' })).toContain(
      'far  Far  build/open  blocked_by=T12@alpha,Tik4z0t@alpha,AUTH-7@alpha,T35-ab12@alpha',
    );

    const bodies = await frontier.call('get_tickets', { ids: IDS });
    for (const title of ['Counted', 'Random', 'Prefixed', 'Mixed']) {
      expect(bodies).toContain(` — ${title}\neffort=alpha`);
    }
    expect(bodies).not.toContain('not found');

    await Promise.all(
      IDS.map(id => frontier.call('update_ticket', { id, resolve: { answer_gist: 'Done.' } })),
    );
    expect(await frontier.call('get_board', { effort: 'alpha' })).toMatch(/^> T99 {2}Waits/m);
    expect(await frontier.call('get_board', { effort: 'beta' })).toMatch(/^> far {2}Far/m);

    await frontier.call('create_tickets', {
      effort: 'beta',
      tickets: [{ name: 'next', title: 'Next', blocked_by: ['auth-7', 'T35-ab12'] }],
    });
    expect(await readFile(join(root, '.scratch/beta/issues/next.md'), 'utf8')).toContain(
      'blocked_by: [AUTH-7, T35-ab12]',
    );
  });

  it.each(['t12', 'tik4z0t', 'auth-7', 't35-ab12'])(
    'is found by lookup when a new Ticket asks for its name (%s)',
    async name => {
      const frontier = await connectFrontier({ cwd: await makeFixtureTree(SHAPES), env: {} });

      const refused = await frontier.callExpectingError('create_tickets', {
        effort: 'alpha',
        tickets: [{ name, title: 'Shadow' }],
      });

      expect(refused).toContain(`name "${name}", is already a Ticket of alpha`);
      expect(await frontier.call('list_efforts')).toContain('alpha  tickets=5');
    },
  );
});

describe('a frontier.yml that is a symbolic link', () => {
  it('is not followed, so a linked file outside storage draws no warning', async () => {
    const { mkdtemp, symlink, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const outside = await mkdtemp(join(tmpdir(), 'frontier-yml-'));
    await writeFile(join(outside, 'frontier.yml'), 'id_pattern: T<N>\n', 'utf8');
    const root = await makeFixtureTree(TREE);
    await symlink(join(outside, 'frontier.yml'), join(root, CONFIG));
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(warningsOf(await frontier.call('get_board', { effort: 'alpha' }))).not.toContain(
      WARNING,
    );
  });
});
