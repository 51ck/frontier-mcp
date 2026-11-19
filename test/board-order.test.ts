import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import {
  cleanupFixtures,
  connectFrontier,
  makeFixtureTree,
  type ConnectedFrontier,
  type FixtureTree,
} from './support/harness.ts';

afterEach(cleanupFixtures);

function named(title: string, blockedBy: readonly string[] = []): string {
  return `---\nfrontier: ticket\ntitle: ${title}\nkind: build\nstatus: open\nblocked_by: [${blockedBy.join(', ')}]\n---\n\nProse.\n`;
}

/** The name each Ticket line opens with, in the order the Board lists them. */
function listed(board: string): string[] {
  const [, lines = ''] = board.split('\n\n');
  return lines
    .split('\n')
    .filter(line => !line.startsWith('frontier:') && line !== '')
    .map(line => line.replace(/^> /, '').split('  ')[0] ?? '');
}

async function boardOf(frontier: ConnectedFrontier, effort = 'alpha'): Promise<string[]> {
  return listed(await frontier.call('get_board', { effort }));
}

async function workspace(tree: FixtureTree) {
  const root = await makeFixtureTree({
    '.git/HEAD': '',
    '.scratch/alpha/map.md': map('Somewhere.'),
    ...tree,
  });
  return { root, frontier: await connectFrontier({ cwd: root, env: {} }) };
}

describe('Board order in an Effort of unprefixed Tickets', () => {
  it('lists a chain blocker first, where name order alone would list it last', async () => {
    const { frontier } = await workspace({});

    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [
        { name: 'apply', title: 'Apply', blocked_by: ['merge'] },
        { name: 'merge', title: 'Merge', blocked_by: ['zip'] },
        { name: 'zip', title: 'Zip' },
      ],
    });

    expect(await boardOf(frontier)).toEqual(['zip', 'merge', 'apply']);
  });

  it('lists a diamond root first, its arms by name, and the join last', async () => {
    const { frontier } = await workspace({
      '.scratch/alpha/issues/apex.md': named('Join', ['left', 'right']),
      '.scratch/alpha/issues/left.md': named('Left arm', ['shell']),
      '.scratch/alpha/issues/right.md': named('Right arm', ['shell']),
      '.scratch/alpha/issues/shell.md': named('Root'),
    });

    expect(await boardOf(frontier)).toEqual(['shell', 'left', 'right', 'apex']);
  });

  it('lists unrelated Tickets by name, case folded rather than by code unit', async () => {
    const { frontier } = await workspace({
      '.scratch/alpha/issues/Beta.md': named('Second'),
      '.scratch/alpha/issues/alpha.md': named('First'),
      '.scratch/alpha/issues/gamma.md': named('Third'),
    });

    expect(await boardOf(frontier)).toEqual(['alpha', 'Beta', 'gamma']);
  });
});

describe('Board order in an Effort of prefixed Tickets', () => {
  it('lists by prefix when every Edge agrees with the prefixes', async () => {
    const { frontier } = await workspace({
      '.scratch/alpha/issues/01-T9-first.md': ticket('T9', 'First'),
      '.scratch/alpha/issues/02-T4-second.md': ticket('T4', 'Second', { blocked_by: ['T9'] }),
      '.scratch/alpha/issues/03-T7-third.md': ticket('T7', 'Third', { blocked_by: ['T4', 'T9'] }),
      '.scratch/alpha/issues/04-T1-fourth.md': ticket('T1', 'Fourth'),
      '.scratch/alpha/issues/10-T2-fifth.md': ticket('T2', 'Fifth', { blocked_by: ['T1'] }),
    });

    expect(await boardOf(frontier)).toEqual(['T9', 'T4', 'T7', 'T1', 'T2']);
  });

  it('lets an Edge win over a prefix it disagrees with — the one visible change for existing workspaces', async () => {
    const { frontier } = await workspace({
      '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', { blocked_by: ['T3'] }),
      '.scratch/alpha/issues/02-T2-second.md': ticket('T2', 'Second'),
      '.scratch/alpha/issues/03-T3-third.md': ticket('T3', 'Third'),
      '.scratch/alpha/issues/04-T4-fourth.md': ticket('T4', 'Fourth'),
    });

    expect(await boardOf(frontier)).toEqual(['T2', 'T3', 'T1', 'T4']);
  });
});

describe('the filename prefix a Board takes as a hint', () => {
  it('is digits then a hyphen: 02-fa.md is fa with hint 2, 2fa.md is 2fa with none', async () => {
    const { frontier } = await workspace({
      '.scratch/alpha/issues/2fa.md': named('Two-factor'),
      '.scratch/alpha/issues/02-fa.md': named('Prefixed'),
      '.scratch/alpha/issues/10-aaa.md': named('Prefixed later'),
    });

    // Read as a prefix, 2fa.md would list between the other two.
    expect(await boardOf(frontier)).toEqual(['fa', 'aaa', '2fa']);
  });
});

describe('Board order in a mixed Effort', () => {
  const MIXED: FixtureTree = {
    '.scratch/alpha/issues/02-T2-second.md': ticket('T2', 'Second', { blocked_by: ['cache'] }),
    '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First'),
    '.scratch/alpha/issues/03-prose.md': '# Written as prose\n\nStatus: open\n',
    '.scratch/alpha/issues/cache.md': named('Cache'),
    '.scratch/alpha/issues/Audit.md': named('Audit', ['T2']),
    '.scratch/alpha/issues/zeta.md': named('Zeta'),
    '.scratch/alpha/issues/carried.md': ticket('B7', 'Carries an id, no prefix'),
  };
  const EXPECTED = ['T1', 'B7', 'cache', 'T2', 'Audit', 'zeta'];

  it('lists prefixed Tickets first, then by name, each below its blockers', async () => {
    const { frontier } = await workspace(MIXED);

    expect(await boardOf(frontier)).toEqual(EXPECTED);
  });

  it('gives the same Board on repeated reads and from a fresh server on the same files', async () => {
    const { root, frontier } = await workspace(MIXED);

    const first = await frontier.call('get_board', { effort: 'alpha' });
    expect(await frontier.call('get_board', { effort: 'alpha' })).toBe(first);
    expect(await frontier.call('get_board', { effort: 'alpha' })).toBe(first);

    const restarted = await connectFrontier({ cwd: root, env: {} });
    expect(await restarted.call('get_board', { effort: 'alpha' })).toBe(first);
    expect(listed(first)).toEqual(EXPECTED);
  });
});

describe('Board order around Edges that order nothing', () => {
  it('lists every Ticket of a hand-made cycle exactly once, in tie-break order where it is stuck', async () => {
    const { frontier } = await workspace({
      '.scratch/alpha/issues/a.md': named('In the loop', ['c']),
      '.scratch/alpha/issues/b.md': named('In the loop', ['a']),
      '.scratch/alpha/issues/c.md': named('In the loop', ['b']),
      '.scratch/alpha/issues/d.md': named('Behind the loop', ['a']),
      '.scratch/alpha/issues/e.md': named('Free'),
      '.scratch/alpha/issues/f.md': named('Blocked by itself', ['f']),
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(listed(board)).toEqual(['e', 'f', 'a', 'b', 'c', 'd']);
    expect(board).toContain('frontier: 1 marked >');
  });

  it('never lists a Ticket downstream of a cycle above the cycle member blocking it', async () => {
    const { frontier } = await workspace({
      '.scratch/alpha/issues/a.md': named('Behind the loop', ['b']),
      '.scratch/alpha/issues/b.md': named('In the loop', ['c']),
      '.scratch/alpha/issues/c.md': named('In the loop', ['b']),
    });

    // Stuck, the smallest Ticket on the cycle is b, not the smallest remaining.
    // With b listed, a and c are both free, and a is the smaller.
    expect(await boardOf(frontier)).toEqual(['b', 'a', 'c']);
  });

  it('breaks two separate cycles one at a time, each at its own smallest member', async () => {
    const { frontier } = await workspace({
      '.scratch/alpha/issues/a.md': named('Behind both loops', ['c', 'x']),
      '.scratch/alpha/issues/b.md': named('First loop', ['c']),
      '.scratch/alpha/issues/c.md': named('First loop', ['b']),
      '.scratch/alpha/issues/x.md': named('Second loop', ['y']),
      '.scratch/alpha/issues/y.md': named('Second loop', ['x']),
    });

    expect(await boardOf(frontier)).toEqual(['b', 'c', 'x', 'a', 'y']);
  });

  it('takes no order from an Edge into another Effort, a dangling one, or one to a duplicated name', async () => {
    const { frontier } = await workspace({
      '.scratch/alpha/issues/apple.md': named('Apple', ['beta.zed', 'ghost', 'Z9']),
      '.scratch/alpha/issues/banana.md': named('Banana'),
      '.scratch/alpha/issues/one.md': ticket('Z9', 'Claims Z9'),
      '.scratch/alpha/issues/two.md': ticket('Z9', 'Claims Z9 too'),
      '.scratch/beta/issues/zed.md': named('Elsewhere'),
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(listed(board)).toEqual(['apple', 'banana', 'Z9', 'Z9']);
    expect(board).toContain('blocked_by=beta.zed,ghost?,Z9');
  });
});
