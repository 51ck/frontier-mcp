import { afterEach, describe, expect, it } from 'vitest';

import type { Effort, Ticket } from '../src/domain.ts';
import type { StorageDriver } from '../src/storage/driver.ts';
import { spec } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

/**
 * A driver with no filesystem behind it at all — it answers from a literal list
 * of Efforts. Anything the tool layer needed that this could not supply would
 * be a markdown concept leaking across the seam.
 */
function fixedDriver(
  efforts: readonly Effort[],
  tickets: readonly Ticket[] = [],
): {
  createDriver: () => StorageDriver;
  scans: () => number;
} {
  let scans = 0;
  return {
    createDriver: () => ({
      async listEfforts() {
        scans += 1;
        return efforts;
      },
      async listTickets() {
        return tickets;
      },
      updateTicket() {
        throw new Error('this driver is read-only');
      },
      createTickets() {
        throw new Error('this driver is read-only');
      },
    }),
    scans: () => scans,
  };
}

describe('the storage driver seam', () => {
  it('serves list_efforts from a driver that knows nothing about files', async () => {
    const root = await makeFixtureTree({ '.git/HEAD': 'ref: refs/heads/main\n' });
    const driver = fixedDriver([
      {
        slug: 'from-nowhere',
        headerDocs: ['map', 'spec'],
        ticketCount: 7,
        destination: undefined,
        specOpening: undefined,
      },
      {
        slug: 'also-nowhere',
        headerDocs: [],
        ticketCount: 0,
        destination: undefined,
        specOpening: undefined,
      },
    ]);
    const frontier = await connectFrontier({
      cwd: root,
      env: {},
      createDriver: driver.createDriver,
    });

    expect(await frontier.call('list_efforts')).toBe(
      [
        `root: ${root}`,
        'from-nowhere  tickets=7  docs=map,spec  frontier=0',
        'also-nowhere  tickets=0  docs=none  frontier=0',
      ].join('\n'),
    );
  });

  it('does not let a failed read poison the reads after it', async () => {
    const root = await makeFixtureTree({ '.git/HEAD': 'ref: refs/heads/main\n' });
    let attempts = 0;
    const createDriver = (): StorageDriver => ({
      async listEfforts() {
        attempts += 1;
        // Startup takes the first attempt, the first tool call the second.
        if (attempts <= 2) throw new Error('scan blew up');
        return [
          {
            slug: 'recovered',
            headerDocs: [],
            ticketCount: 0,
            destination: undefined,
            specOpening: undefined,
          },
        ];
      },
      async listTickets() {
        return [];
      },
      updateTicket() {
        throw new Error('this driver is read-only');
      },
      createTickets() {
        throw new Error('this driver is read-only');
      },
    });

    const frontier = await connectFrontier({ cwd: root, env: {}, createDriver });

    expect(await frontier.callExpectingError('list_efforts')).toContain('scan blew up');
    expect(await frontier.call('list_efforts')).toContain('recovered');
  });
});

describe('the in-memory index', () => {
  /**
   * The one structural assertion in the suite. "An in-memory index is built by
   * a full scan at startup" is a T1 acceptance criterion with no user-facing
   * outcome to observe instead — a warm index and a cold one answer alike.
   */
  it('is built by a full scan at startup, before any tool call', async () => {
    const root = await makeFixtureTree({ '.scratch/only/spec.md': spec('Only') });
    const driver = fixedDriver([
      {
        slug: 'only',
        headerDocs: ['spec'],
        ticketCount: 0,
        destination: undefined,
        specOpening: undefined,
      },
    ]);

    await connectFrontier({ cwd: root, env: {}, createDriver: driver.createDriver });

    expect(driver.scans()).toBe(1);
  });
});
