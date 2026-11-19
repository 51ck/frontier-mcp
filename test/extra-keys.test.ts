import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { map } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const ISSUES = '.scratch/alpha/issues';

async function setup(files: Record<string, string> = {}) {
  const root = await makeFixtureTree({ '.scratch/alpha/map.md': map('Somewhere.'), ...files });
  const frontier = await connectFrontier({ cwd: root, env: {} });
  const read = (name: string) => readFile(join(root, ISSUES, `${name}.md`), 'utf8');
  const listing = async () => (await readdir(join(root, ISSUES)).catch(() => [])).toSorted();
  return { root, frontier, read, listing };
}

function fence(contents: string): Record<string, unknown> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(contents);
  return parse(match?.[1] ?? '') as Record<string, unknown>;
}

/** Every JSON shape, and strings YAML would misread if written plain. */
const VALUES: Record<string, unknown> = {
  text: 'plain words',
  leading_zero: '02',
  yes_word: 'yes',
  null_word: 'null',
  empty: '',
  dashes: '---',
  hash: '#not a comment',
  alias_like: '*anchor',
  spaced: '  padded  ',
  multiline: 'one\nfrontier: ticket\n---\nthree',
  unicode: 'naïve — ✓',
  int: 42,
  negative: -7,
  float: 1.5,
  big: 1e300,
  truth: true,
  falsity: false,
  nothing: null,
  list: [1, 'two', null, [3], { four: 4 }],
  empty_list: [],
  empty_map: {},
  nested: { frontier: 'ticket', status: 'resolved', deeper: { list: ['a', 'b'] } },
};

describe('create_tickets extra', () => {
  it('writes each key at the top level, never under extra, and get_tickets shows them', async () => {
    const { frontier, read } = await setup();
    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'cache', title: 'Cache', extra: { estimate: 3, owner: 'ops' } }],
    });

    const contents = await read('cache');
    expect(contents).toBe(
      '---\nfrontier: ticket\ntitle: Cache\nkind: build\nstatus: open\nblocked_by: []\n' +
        'estimate: 3\nowner: ops\n---\n',
    );
    expect(contents).not.toMatch(/^extra:/m);

    const shown = await frontier.call('get_tickets', { ids: ['cache'] });
    expect(shown).toContain('## Unimported frontmatter');
    expect(shown).toContain('estimate: 3\nowner: ops');
  });

  it('round-trips every JSON value it writes', async () => {
    const { frontier, read } = await setup();
    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'cache', title: 'Cache', extra: VALUES }],
    });

    const stored = fence(await read('cache'));
    for (const [key, value] of Object.entries(VALUES)) expect(stored[key]).toStrictEqual(value);
    // A nested `frontier: ticket` and a multi-line one leave the marker alone.
    expect((await read('cache')).match(/^frontier:/gm)).toHaveLength(1);
    expect(stored['status']).toBe('open');
  });

  it.each([
    ['status', 'update_ticket claim, resolve, drop, reopen or release'],
    ['title', 'Use title'],
    ['blocked_by', 'Use blocked_by'],
    ['tags', 'Use tags'],
    ['answer_gist', 'update_ticket resolve'],
    ['frontier', 'No argument sets it'],
    ['id', 'No argument sets it'],
  ])(
    'refuses %s in a batch, naming the entry and the argument, and creates none',
    async (key, hint) => {
      const { frontier, listing } = await setup();
      const error = await frontier.callExpectingError('create_tickets', {
        effort: 'alpha',
        tickets: [
          { name: 'first', title: 'First', extra: { fine: 1 } },
          { name: 'second', title: 'Second', extra: { [key]: 'x' } },
        ],
      });

      expect(error).toContain('Ticket 2 of this call, name "second"');
      expect(error).toContain(`${key} is a schema key, reserved`);
      expect(error).toContain(hint);
      expect(error).toContain('No Ticket of the batch was created');
      expect(await listing()).toEqual([]);
    },
  );

  it('refuses a key named extra, and a value that would not read back', async () => {
    const { frontier, listing } = await setup();
    const extra = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'one', title: 'One', extra: { extra: { a: 1 } } }],
    });
    expect(extra).toContain('cannot hold a key named extra');

    const blank = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'one', title: 'One', extra: { ' ': 1 } }],
    });
    expect(blank).toContain('must be non-blank');

    const multiline = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'one', title: 'One', extra: { 'a\nfrontier': 1 } }],
    });
    expect(multiline).toContain('one line');

    const surrogate = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'one', title: 'One', extra: { s: '\uD800' } }],
    });
    expect(surrogate).toContain('unpaired surrogate');
    expect(await listing()).toEqual([]);
  });
});

const HELD = [
  '---',
  'frontier: ticket',
  'title: Held',
  'kind: build',
  'status: open',
  'blocked_by: []',
  'a: 0',
  'b:',
  '  keep: [1, 2]',
  '  note: "quoted"',
  'nested:',
  '  x: 1',
  '  y: 2',
  '---',
  '',
  '## What to build',
  '',
  'Something.',
  '',
].join('\n');

describe('update_ticket extra', () => {
  it('replaces only the keys it names; the others stay byte-identical', async () => {
    const { frontier, read } = await setup({ [`${ISSUES}/held.md`]: HELD });
    await frontier.call('update_ticket', { id: 'held', extra: { a: 1 } });
    expect(await read('held')).toBe(HELD.replace('a: 0', 'a: 1'));
  });

  it('replaces a nested value whole, never merging', async () => {
    const { frontier, read } = await setup({ [`${ISSUES}/held.md`]: HELD });
    await frontier.call('update_ticket', { id: 'held', extra: { nested: { z: 3 } } });
    expect(fence(await read('held'))['nested']).toStrictEqual({ z: 3 });
    expect(await read('held')).toBe(HELD.replace('  x: 1\n  y: 2', '  z: 3'));
  });

  it('adds a new key after the others and round-trips every JSON value', async () => {
    const { frontier, read } = await setup({ [`${ISSUES}/held.md`]: HELD });
    await frontier.call('update_ticket', { id: 'held', extra: VALUES });
    const stored = fence(await read('held'));
    for (const [key, value] of Object.entries(VALUES)) expect(stored[key]).toStrictEqual(value);
    expect(stored['status']).toBe('open');
    expect(stored['b']).toStrictEqual({ keep: [1, 2], note: 'quoted' });
  });

  it('leaves every extra key byte-identical through an update that names none', async () => {
    const { frontier, read } = await setup({ [`${ISSUES}/held.md`]: HELD });
    await frontier.call('update_ticket', { id: 'held', triage: 'ready-for-agent' });
    await frontier.call('update_ticket', { id: 'held', claim: { by: 'me' } });
    const after = await read('held');
    expect(after).toContain(
      'a: 0\nb:\n  keep: [1, 2]\n  note: "quoted"\nnested:\n  x: 1\n  y: 2\n',
    );
  });

  it('removes a key with drop_keys, and fails the call on an absent one', async () => {
    const { frontier, read } = await setup({ [`${ISSUES}/held.md`]: HELD });
    await frontier.call('update_ticket', { id: 'held', drop_keys: ['a'] });
    expect(await read('held')).toBe(HELD.replace('a: 0\n', ''));

    const before = await read('held');
    const error = await frontier.callExpectingError('update_ticket', {
      id: 'held',
      extra: { c: 1 },
      drop_keys: ['missing'],
    });
    expect(error).toContain("no frontmatter key 'missing'");
    expect(await read('held')).toBe(before);
  });

  it.each([
    ['status', 'Use claim, resolve, drop, reopen or release'],
    ['claimed_by', 'Use claim or release'],
    ['kind', 'Use kind'],
    ['frontier', 'No argument sets it'],
    ['id', 'No argument sets it'],
  ])('refuses %s through extra, naming the Ticket and the argument', async (key, hint) => {
    const { frontier, read } = await setup({ [`${ISSUES}/held.md`]: HELD });
    const error = await frontier.callExpectingError('update_ticket', {
      id: 'held',
      comment: 'with it',
      extra: { a: 5, [key]: 'x' },
    });
    expect(error).toContain(`alpha.held: ${key} is a schema key, reserved, so extra`);
    expect(error).toContain(hint);
    expect(await read('held')).toBe(HELD);
  });

  it.each(['frontier', 'id', 'status'])(
    'refuses %s through drop_keys, naming the Ticket',
    async key => {
      const fenceWithId = HELD.replace('title: Held', 'id: H1\ntitle: Held');
      const { frontier, read } = await setup({ [`${ISSUES}/held.md`]: fenceWithId });
      const error = await frontier.callExpectingError('update_ticket', {
        id: 'H1',
        drop_keys: ['a', key],
      });
      expect(error).toContain(`H1: ${key} is a schema key, reserved, so drop_keys`);
      expect(await read('held')).toBe(fenceWithId);
    },
  );

  it('refuses a key named extra, -0, and a key both set and dropped', async () => {
    const { frontier, read } = await setup({ [`${ISSUES}/held.md`]: HELD });
    const refuse = (extra: Record<string, unknown>) =>
      frontier.callExpectingError('update_ticket', { id: 'held', extra });
    expect(await refuse({ extra: 1 })).toContain('cannot hold a key named extra');
    expect(await refuse({ a: -0 })).toContain('is -0');
    expect(
      await frontier.callExpectingError('update_ticket', {
        id: 'held',
        extra: { a: 1 },
        drop_keys: ['a'],
      }),
    ).toContain('a is in both extra and drop_keys');
    expect(await read('held')).toBe(HELD);
  });

  it('leaves a Ticket with an id named, resolved and rendered by it', async () => {
    const withId = HELD.replace('title: Held', 'id: H1\ntitle: Held');
    const { frontier, read } = await setup({ [`${ISSUES}/held.md`]: withId });
    const result = await frontier.call('update_ticket', { id: 'H1', extra: { a: 1 } });
    expect(result).toContain('H1 updated');
    expect(await read('held')).toBe(withId.replace('a: 0', 'a: 1'));
    expect(await frontier.call('get_board', { effort: 'alpha' })).toMatch(/^> H1 {2}Held/m);
  });
});

/** Everything above the warnings block, which alone counts the Unimported keys. */
function linesOf(board: string): string | undefined {
  return board.split('\n\nwarnings:')[0];
}

describe('extra keys and the graph', () => {
  it('never move Status, Edges, the Frontier, Board order or names', async () => {
    const tickets = [
      { name: 'base', title: 'Base' },
      { name: 'next', title: 'Next', blocked_by: ['base'] },
      { name: 'other', title: 'Other' },
    ];
    const extras = [
      { blocked_by_note: ['other'], order: 99, name: 'zzz' },
      { status_note: 'resolved', ready: true, frontier_hint: { frontier: 'ticket' } },
      { order: -1, id_hint: 'base' },
    ];

    const plain = await setup();
    await plain.frontier.call('create_tickets', { effort: 'alpha', tickets });
    const extended = await setup();
    await extended.frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: tickets.map((ticket, index) => Object.assign({}, ticket, { extra: extras[index] })),
    });

    const plainBoard = await plain.frontier.call('get_board', { effort: 'alpha' });
    const extendedBoard = await extended.frontier.call('get_board', { effort: 'alpha' });
    expect(linesOf(extendedBoard)).toEqual(linesOf(plainBoard));
    expect(extendedBoard).toContain('3/3 Tickets hold Unimported keys');

    await extended.frontier.call('update_ticket', { id: 'base', extra: { order: 0, more: [1] } });
    expect(linesOf(await extended.frontier.call('get_board', { effort: 'alpha' }))).toEqual(
      linesOf(plainBoard),
    );
  });
});
