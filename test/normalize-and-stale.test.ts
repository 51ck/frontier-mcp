import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

/** A Legacy Ticket, exactly the shape the real repos hold: no frontmatter at all. */
const LEGACY = `# T30 — Grammy group boot

Status: resolved

**Problem:** Without a running group bot entry, no Telegram MVP path is real.

**Depends on:** T31 ([02-identity-bridge.md](02-identity-bridge.md))

**Tasks:**

- [x] **T30.1** Bot factory reading the token
`;

/** The same shape, still open — claiming a resolved Ticket is rightly refused. */
const LEGACY_OPEN = LEGACY.replace('Status: resolved', 'Status: open');

describe('writing to a Legacy Ticket', () => {
  it('normalizes that file to the schema', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-grammy-group-boot.md': LEGACY,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('update_ticket', { id: 'T30', drop: { reason: 'Superseded by T44.' } });

    const onDisk = await readFile(
      join(root, '.scratch/alpha/issues/01-grammy-group-boot.md'),
      'utf8',
    );

    // The tracker converts itself as it is worked, rather than in one risky
    // pass: this file now carries the schema it was only being guessed at from.
    expect(onDisk.startsWith('---\n')).toBe(true);
    expect(onDisk).toContain('id: T30');
    expect(onDisk).toContain('title: Grammy group boot');
    expect(onDisk).toContain('status: dropped');
    expect(onDisk).toContain('dropped_reason: Superseded by T44.');
    expect(onDisk).toContain('blocked_by:');
  });

  it('keeps the prose it inferred from, verbatim', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-grammy-group-boot.md': LEGACY_OPEN,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('update_ticket', { id: 'T30', claim: { by: 'agent-7' } });

    const onDisk = await readFile(
      join(root, '.scratch/alpha/issues/01-grammy-group-boot.md'),
      'utf8',
    );

    expect(onDisk).toContain('**Problem:** Without a running group bot entry');
    expect(onDisk).toContain('- [x] **T30.1** Bot factory reading the token');
  });

  it('stops being reported as Legacy once normalized', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-grammy-group-boot.md': LEGACY_OPEN,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('are Legacy');

    await frontier.call('update_ticket', { id: 'T30', claim: { by: 'agent-7' } });

    expect(await frontier.call('get_board', { effort: 'alpha' })).not.toContain('are Legacy');
  });
});

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
