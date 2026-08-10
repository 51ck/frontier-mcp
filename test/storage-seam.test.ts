import { afterEach, describe, expect, it } from 'vitest';

import type { Effort, Ticket } from '../src/domain.ts';
import type { StorageDriver } from '../src/storage/driver.ts';
import { createMarkdownDriver } from '../src/storage/markdown/driver.ts';
import { map, spec, ticket } from './support/fixtures.ts';
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
      async readTickets(handles) {
        const wanted = new Set(handles);
        return tickets.filter(
          entry => wanted.has(entry.handle) || (entry.id !== undefined && wanted.has(entry.id)),
        );
      },
      updateTicket() {
        throw new Error('this driver is read-only');
      },
      createTickets() {
        throw new Error('this driver is read-only');
      },
      readMap() {
        throw new Error('this driver is read-only');
      },
      editMap() {
        throw new Error('this driver is read-only');
      },
      readSpec() {
        throw new Error('this driver is read-only');
      },
      putSpec() {
        throw new Error('this driver is read-only');
      },
      migrateEffort() {
        throw new Error('this driver is read-only');
      },
      close() {
        // Nothing held open: this driver answers from a literal list.
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

  /**
   * A driver that fails once and answers the next time must be seen to recover.
   * Nothing above the seam may remember the failure, which holds only while
   * nothing above the seam remembers anything.
   */
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
      async readTickets() {
        return [];
      },
      updateTicket() {
        throw new Error('this driver is read-only');
      },
      createTickets() {
        throw new Error('this driver is read-only');
      },
      readMap() {
        throw new Error('this driver is read-only');
      },
      editMap() {
        throw new Error('this driver is read-only');
      },
      readSpec() {
        throw new Error('this driver is read-only');
      },
      putSpec() {
        throw new Error('this driver is read-only');
      },
      migrateEffort() {
        throw new Error('this driver is read-only');
      },
      close() {
        // Nothing held open: this driver answers from a literal list.
      },
    });

    const frontier = await connectFrontier({ cwd: root, env: {}, createDriver });

    expect(await frontier.callExpectingError('list_efforts')).toContain('scan blew up');
    expect(await frontier.call('list_efforts')).toContain('recovered');
  });
});

describe("the driver's cached workspace", () => {
  /**
   * The one structural assertion in the suite. "An in-memory index is built by
   * a full scan at startup" is a T1 acceptance criterion with no user-facing
   * outcome to observe instead — a warm cache and a cold one answer alike.
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

describe("the markdown driver's storage directory", () => {
  /**
   * `.scratch` is what this driver calls its storage, not something the server
   * knows. Serving an Effort out of a directory by another name is the whole
   * assertion: nothing above the driver had to be told.
   */
  it('is a construction parameter, not a module constant', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.tracker/alpha/map.md': map('Somewhere else entirely.'),
      '.tracker/alpha/issues/01-T1-work.md': ticket('T1', 'Filed under another name'),

      // The default directory is present and holds something different, so a
      // driver still reading `.scratch` fails loudly rather than by absence.
      '.scratch/decoy/map.md': map('The directory this driver was not given.'),
    });

    const frontier = await connectFrontier({
      cwd: root,
      env: {},
      createDriver: driverRoot => createMarkdownDriver(driverRoot, { storageDir: '.tracker' }),
    });

    const efforts = await frontier.call('list_efforts');
    expect(efforts).toContain('alpha');
    expect(efforts).not.toContain('decoy');

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('Somewhere else entirely.');
    expect(board).toContain('Filed under another name');
  });
});
