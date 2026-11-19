import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

describe('a stale claim', () => {
  it('is flagged on the Board', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-stale.md': ticket('T1', 'Held for ages', {
        status: 'claimed',
        claimed_by: 'agent-gone',
        claimed_at: '2020-01-01T00:00:00Z',
      }),
      '.scratch/alpha/issues/02-T2-fresh.md': ticket('T2', 'Just taken', {
        status: 'claimed',
        claimed_by: 'agent-here',
        claimed_at: new Date().toISOString(),
      }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).toContain('stale claim');
    expect(board).toContain('T1');
    // The fresh one is not flagged; only the abandoned-looking one is.
    const warning = board.split('\n').find(line => line.includes('stale claim')) ?? '';
    expect(warning).not.toContain('T2');
  });

  it('is never auto-released', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-stale.md': ticket('T1', 'Held for ages', {
        status: 'claimed',
        claimed_by: 'agent-gone',
        claimed_at: '2020-01-01T00:00:00Z',
      }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('get_board', { effort: 'alpha' });

    // A long-running agent must never be silently robbed of its Ticket.
    const onDisk = await readFile(join(root, '.scratch/alpha/issues/01-T1-stale.md'), 'utf8');
    expect(onDisk).toContain('claimed_by: agent-gone');
    expect(onDisk).toContain('status: claimed');

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      claim: { by: 'agent-new' },
    });
    expect(error).toContain('already claimed by agent-gone');
  });
});
