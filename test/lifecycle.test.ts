import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createMarkdownDriver,
  type MarkdownDriverOptions,
} from '../src/storage/markdown/driver.ts';
import { map, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const FILE = '.scratch/alpha/issues/01-T1-work.md';

/**
 * A driver whose watcher never refreshes the cached scan on its own: a debounce
 * longer than any test here, so no filesystem event can reach `invalidate`, and
 * an empty settle schedule, so the unconditional drops that follow an attach
 * never happen either. Under these the only thing that can refresh the cache is
 * a write through the server, which is what lets a test hold a stale view for
 * as long as it needs one.
 */
const NO_STALENESS_RECOVERY: MarkdownDriverOptions = {
  watcherDebounceMs: 60_000,
  watcherSettleMs: [],
};

/**
 * One Effort holding one Ticket, served over the harness. `driverOptions`
 * constructs the markdown driver by hand instead of taking the server's
 * default, which is how a test asks for watcher behaviour the default does not
 * give it.
 */
async function oneTicket(body?: string, driverOptions?: MarkdownDriverOptions) {
  const root = await makeFixtureTree({
    '.scratch/alpha/map.md': map('Somewhere.'),
    [FILE]: ticket('T1', 'Work', body === undefined ? {} : { body }),
  });
  const frontier = await connectFrontier(
    driverOptions === undefined
      ? { cwd: root, env: {} }
      : {
          cwd: root,
          env: {},
          createDriver: driverRoot => createMarkdownDriver(driverRoot, driverOptions),
        },
  );
  return { root, frontier };
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
    // The subject here is what the server does with a view it has not
    // refreshed, so the staleness is the fixture rather than a race to win: the
    // watcher's recovery is switched off for this test, because a settle drop
    // or a debounced event landing between the hand edit and the call would
    // make `listTickets()` re-walk, the expected revision would then match the
    // edited file, and the check under test would rightly never fire.
    const { root, frontier } = await oneTicket(undefined, NO_STALENESS_RECOVERY);

    // Warm the cached scan, then edit the file behind the server's back.
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

  it('refuses a call that asks for nothing, and one that names two transitions', async () => {
    const { frontier } = await oneTicket();

    expect(await frontier.callExpectingError('update_ticket', { id: 'T1' })).toContain(
      'Nothing to do',
    );
    expect(
      await frontier.callExpectingError('update_ticket', {
        id: 'T1',
        claim: { by: 'a' },
        drop: { reason: 'b' },
      }),
    ).toContain('at most one');
  });
});
