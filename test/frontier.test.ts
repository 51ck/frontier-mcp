import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

/** The Ticket ids a Board marks as on the Frontier. */
function marked(board: string): string[] {
  return board
    .split('\n')
    .filter(line => line.startsWith('> '))
    .map(line => line.slice(2).split('  ')[0] ?? '');
}

describe('the Frontier', () => {
  it('holds a Ticket that is open with no Edges', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-takeable.md': ticket('T1', 'Takeable'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(marked(await frontier.call('get_board', { effort: 'alpha' }))).toEqual(['T1']);
  });

  it('excludes a Ticket whose blocker is still open, and holds it once resolved', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-blocker.md': ticket('T1', 'Blocker'),
      '.scratch/alpha/issues/02-T2-blocked.md': ticket('T2', 'Blocked', { blocked_by: ['T1'] }),
      '.scratch/beta/map.md': map('Elsewhere.'),
      '.scratch/beta/issues/01-T3-done.md': ticket('T3', 'Done', {
        status: 'resolved',
        answer_gist: 'Landed.',
      }),
      '.scratch/beta/issues/02-T4-unblocked.md': ticket('T4', 'Unblocked', { blocked_by: ['T3'] }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(marked(await frontier.call('get_board', { effort: 'alpha' }))).toEqual(['T1']);
    expect(marked(await frontier.call('get_board', { effort: 'beta' }))).toEqual(['T4']);
  });

  it('excludes Tickets that are claimed, resolved, or dropped', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-claimed.md': ticket('T1', 'Claimed', {
        status: 'claimed',
        claimed_by: 'someone',
        claimed_at: '2026-08-07T00:00:00Z',
      }),
      '.scratch/alpha/issues/02-T2-resolved.md': ticket('T2', 'Resolved', {
        status: 'resolved',
        answer_gist: 'Landed.',
      }),
      '.scratch/alpha/issues/03-T3-dropped.md': ticket('T3', 'Dropped', {
        status: 'dropped',
        dropped_reason: 'Beyond the destination.',
      }),
      '.scratch/alpha/issues/04-T4-open.md': ticket('T4', 'Open'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(marked(await frontier.call('get_board', { effort: 'alpha' }))).toEqual(['T4']);
  });

  it('does not promote a Ticket whose blocker was dropped', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-dropped.md': ticket('T1', 'Dropped', {
        status: 'dropped',
        dropped_reason: 'Ruled out.',
      }),
      '.scratch/alpha/issues/02-T2-orphaned.md': ticket('T2', 'Orphaned', { blocked_by: ['T1'] }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    // A dropped Ticket does not unblock its dependents: the precondition was
    // never answered, so starting T2 would be starting work on a false premise.
    expect(marked(await frontier.call('get_board', { effort: 'alpha' }))).toEqual([]);
  });

  it('reports Frontier size per Effort in list_efforts', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-takeable.md': ticket('T1', 'Takeable'),
      '.scratch/alpha/issues/02-T2-blocked.md': ticket('T2', 'Blocked', { blocked_by: ['T1'] }),
      '.scratch/alpha/issues/03-T3-takeable.md': ticket('T3', 'Also takeable'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('list_efforts')).toContain('frontier=2');
  });
});
