import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const FILE = '.scratch/alpha/issues/01-T1-work.md';

async function oneTicket(body?: string) {
  const root = await makeFixtureTree({
    '.scratch/alpha/map.md': map('Somewhere.'),
    [FILE]: ticket('T1', 'Work', body === undefined ? {} : { body }),
  });
  return { root, frontier: await connectFrontier({ cwd: root, env: {} }) };
}

describe('concurrent claims', () => {
  it('produce exactly one winner', async () => {
    const { frontier } = await oneTicket();

    // Genuinely concurrent, not sequential: a sequential test of a
    // compare-and-set proves nothing at all.
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        frontier.call('update_ticket', { id: 'T1', claim: { by: `agent-${String(index)}` } }),
      ),
    );

    const winners = attempts.filter(attempt => attempt.status === 'fulfilled');
    expect(winners).toHaveLength(1);
  });

  it('tell the losers who actually holds it, not merely that the file moved', async () => {
    const { frontier } = await oneTicket();

    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, (_, index) =>
        frontier.call('update_ticket', { id: 'T1', claim: { by: `agent-${String(index)}` } }),
      ),
    );

    const winner = attempts.find(attempt => attempt.status === 'fulfilled');
    const holder = /claimed_by=(\S+)/.exec(winner?.value ?? '')?.[1] ?? '?';
    const losers = attempts.filter(attempt => attempt.status === 'rejected');

    expect(losers).toHaveLength(3);
    for (const loser of losers) {
      expect(String(loser.reason)).toContain(`already claimed by ${holder}`);
    }
  });

  it('leave the Ticket held by the one that won', async () => {
    const { root, frontier } = await oneTicket();

    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        frontier.call('update_ticket', { id: 'T1', claim: { by: `agent-${String(index)}` } }),
      ),
    );

    const winner = attempts.find(attempt => attempt.status === 'fulfilled');
    const holder = /claimed_by=(\S+)/.exec(winner?.value ?? '')?.[1];

    const onDisk = await readFile(join(root, FILE), 'utf8');
    expect(onDisk).toContain(`claimed_by: ${holder ?? '?'}`);
    // Exactly one claimed_by line — no interleaved write left a second.
    expect(onDisk.match(/^claimed_by:/gm)).toHaveLength(1);
  });
});

describe('resolving a Ticket', () => {
  it('records the gist and writes the answer into the body', async () => {
    const { root, frontier } = await oneTicket('Problem prose.');

    await frontier.call('update_ticket', {
      id: 'T1',
      resolve: { answer_gist: 'Took the second option.', answer: 'The long form of why.' },
    });

    const onDisk = await readFile(join(root, FILE), 'utf8');
    expect(onDisk).toContain('status: resolved');
    expect(onDisk).toContain('answer_gist: Took the second option.');
    expect(onDisk).toContain('## Answer');
    expect(onDisk).toContain('The long form of why.');
    expect(onDisk).toContain('Problem prose.');
  });

  it('requires a gist on a build Ticket, not only a decision', async () => {
    const { frontier } = await oneTicket();

    // A build Ticket's one line of what landed is what makes a Board of
    // finished work readable, so the schema requires it on every kind.
    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      resolve: { answer_gist: '' },
    });

    expect(error.length).toBeGreaterThan(0);
  });

  it('releases the claim it had', async () => {
    const { root, frontier } = await oneTicket();

    await frontier.call('update_ticket', { id: 'T1', claim: { by: 'agent-7' } });
    await frontier.call('update_ticket', { id: 'T1', resolve: { answer_gist: 'Done.' } });

    const onDisk = await readFile(join(root, FILE), 'utf8');
    expect(onDisk).not.toContain('claimed_by:');
  });
});

describe('dropping a Ticket', () => {
  it('records why it was ruled beyond the destination', async () => {
    const { root, frontier } = await oneTicket();

    await frontier.call('update_ticket', { id: 'T1', drop: { reason: 'Out of scope for v1.' } });

    const onDisk = await readFile(join(root, FILE), 'utf8');
    expect(onDisk).toContain('status: dropped');
    expect(onDisk).toContain('dropped_reason: Out of scope for v1.');
  });

  it('requires a reason', async () => {
    const { frontier } = await oneTicket();

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      drop: { reason: '' },
    });

    expect(error.length).toBeGreaterThan(0);
  });
});

describe('the optimistic check', () => {
  it('fails loudly when the file changed since it was read, and writes nothing', async () => {
    const { root, frontier } = await oneTicket();

    // Warm the index, then edit the file behind the server's back.
    await frontier.call('get_board', { effort: 'alpha' });
    const path = join(root, FILE);
    const edited = `${await readFile(path, 'utf8')}\nA hand edit.\n`;
    await writeFile(path, edited, 'utf8');

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      claim: { by: 'agent-7' },
    });

    expect(error).toContain('changed on disk');
    // Nothing was written: the concurrent edit survives untouched.
    expect(await readFile(path, 'utf8')).toBe(edited);
  });
});

describe('rejecting impossible transitions', () => {
  it('refuses to claim a Ticket that is already closed', async () => {
    const { frontier } = await oneTicket();

    await frontier.call('update_ticket', { id: 'T1', resolve: { answer_gist: 'Done.' } });
    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      claim: { by: 'agent-7' },
    });

    expect(error).toContain('resolved');
  });

  it('refuses a call that names no action, and one that names two', async () => {
    const { frontier } = await oneTicket();

    expect(await frontier.callExpectingError('update_ticket', { id: 'T1' })).toContain(
      'exactly one',
    );
    expect(
      await frontier.callExpectingError('update_ticket', {
        id: 'T1',
        claim: { by: 'a' },
        drop: { reason: 'b' },
      }),
    ).toContain('exactly one');
  });
});
