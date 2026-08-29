import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';
import { map, ticket } from './support/fixtures.ts';

afterEach(cleanupFixtures);

const GENERATED_OPEN =
  '<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->';

function fullMap(): string {
  return `---
header: map
---

# Map

## Destination

Ship the header docs.

## Decisions so far

${GENERATED_OPEN}
<!-- /GENERATED -->

## Not yet specified

- Fog

## Out of scope

${GENERATED_OPEN}
<!-- /GENERATED -->
`;
}

/** The Ticket lines a Board marks as takeable. */
function takeable(board: string): string[] {
  return board.split('\n').filter(line => line.startsWith('> '));
}

async function alphaTwoTickets(
  t1: Parameters<typeof ticket>[2] = {},
  t2: Parameters<typeof ticket>[2] = {},
) {
  const root = await makeFixtureTree({
    '.git/HEAD': 'ref: refs/heads/main\n',
    '.scratch/alpha/map.md': map('Somewhere.'),
    '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', t1),
    '.scratch/alpha/issues/02-T2-second.md': ticket('T2', 'Second', { ...t2, blocked_by: ['T1'] }),
  });
  const frontier = await connectFrontier({ cwd: root, env: {} });
  return { root, frontier };
}

describe('reopening a resolved Ticket', () => {
  it('returns it to open, clears the gist, archives it in a comment, and makes it takeable', async () => {
    const { root, frontier } = await alphaTwoTickets({
      status: 'resolved',
      answer_gist: 'Landed the seam',
    });

    await frontier.call('update_ticket', { id: 'T1', reopen: { reason: 'Decision was wrong.' } });

    const onDisk = await readFile(join(root, '.scratch/alpha/issues/01-T1-first.md'), 'utf8');
    const frontmatter = onDisk.split('---')[1] ?? '';
    expect(onDisk).toContain('status: open');
    expect(frontmatter).not.toContain('answer_gist:');
    expect(onDisk).toContain('Reopened: Decision was wrong.');
    expect(onDisk).toContain('Previous answer_gist: Landed the seam');

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(takeable(board).some(line => line.includes('T1'))).toBe(true);
  });
});

describe('reopening a dropped Ticket', () => {
  it('returns it to open, clears dropped_reason, and archives the prior reason', async () => {
    const { root, frontier } = await alphaTwoTickets({
      status: 'dropped',
      dropped_reason: 'Beyond v1',
    });

    await frontier.call('update_ticket', { id: 'T1', reopen: { reason: 'Back in scope now.' } });

    const onDisk = await readFile(join(root, '.scratch/alpha/issues/01-T1-first.md'), 'utf8');
    const frontmatter = onDisk.split('---')[1] ?? '';
    expect(onDisk).toContain('status: open');
    expect(frontmatter).not.toContain('dropped_reason:');
    expect(onDisk).toContain('Reopened: Back in scope now.');
    expect(onDisk).toContain('Previous dropped_reason: Beyond v1');
  });
});

describe('reopen requires a reason', () => {
  it('refuses an empty reason', async () => {
    const { frontier } = await alphaTwoTickets({ status: 'resolved', answer_gist: 'Done.' });

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      reopen: { reason: '' },
    });

    expect(error.length).toBeGreaterThan(0);
  });
});

describe('reopen refuses the wrong status', () => {
  it('names open and claimed', async () => {
    const { frontier: openFrontier } = await alphaTwoTickets();
    expect(
      await openFrontier.callExpectingError('update_ticket', {
        id: 'T1',
        reopen: { reason: 'Nope.' },
      }),
    ).toContain('open');

    const { frontier: claimedFrontier } = await alphaTwoTickets({
      status: 'claimed',
      claimed_by: 'agent-1',
      claimed_at: '2026-01-01T00:00:00.000Z',
    });
    expect(
      await claimedFrontier.callExpectingError('update_ticket', {
        id: 'T1',
        reopen: { reason: 'Nope.' },
      }),
    ).toContain('claimed');
  });
});

describe('releasing a claimed Ticket', () => {
  it('returns it to open and clears the claim without inventing gist comments', async () => {
    const { root, frontier } = await alphaTwoTickets({
      status: 'claimed',
      claimed_by: 'agent-7',
      claimed_at: '2026-01-01T00:00:00.000Z',
    });

    await frontier.call('update_ticket', { id: 'T1', release: true });

    const onDisk = await readFile(join(root, '.scratch/alpha/issues/01-T1-first.md'), 'utf8');
    expect(onDisk).toContain('status: open');
    expect(onDisk).not.toContain('claimed_by:');
    expect(onDisk).not.toContain('claimed_at:');
    expect(onDisk).not.toContain('Reopened:');
    expect(onDisk).not.toContain('Previous answer_gist:');
  });
});

describe('release refuses the wrong status', () => {
  it('names open, resolved, and dropped', async () => {
    const { frontier: openFrontier } = await alphaTwoTickets();
    expect(
      await openFrontier.callExpectingError('update_ticket', { id: 'T1', release: true }),
    ).toContain('open');

    const { frontier: resolvedFrontier } = await alphaTwoTickets({
      status: 'resolved',
      answer_gist: 'Done.',
    });
    expect(
      await resolvedFrontier.callExpectingError('update_ticket', { id: 'T1', release: true }),
    ).toContain('resolved');

    const { frontier: droppedFrontier } = await alphaTwoTickets({
      status: 'dropped',
      dropped_reason: 'Nope.',
    });
    expect(
      await droppedFrontier.callExpectingError('update_ticket', { id: 'T1', release: true }),
    ).toContain('dropped');
  });
});

describe('reopening a blocker', () => {
  it('removes its dependent from the Frontier', async () => {
    const { frontier } = await alphaTwoTickets(
      { status: 'resolved', answer_gist: 'Blocker done.' },
      { status: 'open' },
    );

    const before = await frontier.call('get_board', { effort: 'alpha' });
    expect(takeable(before).some(line => line.includes('T2'))).toBe(true);

    await frontier.call('update_ticket', { id: 'T1', reopen: { reason: 'Not actually done.' } });

    const after = await frontier.call('get_board', { effort: 'alpha' });
    expect(takeable(after).some(line => line.includes('T2'))).toBe(false);
    expect(takeable(after).some(line => line.includes('T1'))).toBe(true);
  });
});

describe('reopen after resolve', () => {
  it('removes the gist from Map Decisions-so-far', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': fullMap(),
      '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', {
        status: 'claimed',
        claimed_by: 'a',
        claimed_at: '2026-01-01T00:00:00.000Z',
      }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('update_ticket', {
      id: 'T1',
      resolve: { answer_gist: 'Landed the read path' },
    });

    let onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    expect(onDisk).toContain('- [T1 — First](issues/01-T1-first.md) — Landed the read path');

    await frontier.call('update_ticket', { id: 'T1', reopen: { reason: 'Wrong call.' } });

    onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    const decisions = onDisk.slice(
      onDisk.indexOf('## Decisions so far'),
      onDisk.indexOf('## Not yet specified'),
    );
    expect(decisions).not.toContain('Landed the read path');
    expect(decisions).not.toContain('T1 — First');
  });
});

describe('reopen with a caller comment', () => {
  it('concatenates archive then caller words', async () => {
    const { root, frontier } = await alphaTwoTickets({
      status: 'resolved',
      answer_gist: 'Done.',
    });

    await frontier.call('update_ticket', {
      id: 'T1',
      reopen: { reason: 'Revisit.' },
      comment: 'Caller note.',
    });

    const onDisk = await readFile(join(root, '.scratch/alpha/issues/01-T1-first.md'), 'utf8');
    expect(onDisk).toContain('Reopened: Revisit.\nPrevious answer_gist: Done.\n\nCaller note.');
  });
});

describe('at most one lifecycle action', () => {
  it('refuses reopen and claim together', async () => {
    const { frontier } = await alphaTwoTickets({ status: 'resolved', answer_gist: 'Done.' });

    expect(
      await frontier.callExpectingError('update_ticket', {
        id: 'T1',
        reopen: { reason: 'Again.' },
        claim: { by: 'a' },
      }),
    ).toContain('at most one');
  });
});
