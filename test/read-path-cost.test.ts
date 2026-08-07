import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { cleanupFixtures, connectFrontier, makeLegacyWorkspace } from './support/harness.ts';

afterEach(cleanupFixtures);

/**
 * The spec's measurements are `wc -c` over an Effort's Tickets converted at
 * roughly four bytes per token. They are the whole argument for the project, so
 * they belong here as assertions rather than only in prose.
 */
const BYTES_PER_TOKEN = 4;

function tokens(text: string): number {
  return Math.round(Buffer.byteLength(text, 'utf8') / BYTES_PER_TOKEN);
}

/** Every file under a directory, recursively, as path -> contents. */
async function snapshot(dir: string): Promise<Map<string, string>> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const paths = entries
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name))
    .toSorted();

  const stamped = await Promise.all(
    paths.map(async path => {
      const [info, contents] = await Promise.all([stat(path), readFile(path, 'utf8')]);
      return [path, `${String(info.size)}:${info.mtimeMs.toString()}:${contents}`] as const;
    }),
  );

  return new Map(stamped);
}

/** What reading the Effort the old way costs: every Ticket file, whole. */
async function costOfReadingWhole(root: string, effort: string): Promise<number> {
  const issues = join(root, '.scratch', effort, 'issues');
  const names = await readdir(issues);
  const bodies = await Promise.all(names.map(async name => readFile(join(issues, name), 'utf8')));

  return tokens(bodies.join(''));
}

describe('the cost of a Board', () => {
  it('reproduces the spec measurement of what reading an Effort whole costs', async () => {
    const root = await makeLegacyWorkspace({
      telegram: 'sobrina-telegram',
      'ship-0-5-0': 'tag-customizer-ship-0-5-0',
    });

    // The spec's Problem Statement: telegram is 15 Tickets / 32.7 KB ~ 8.2k
    // tokens, ship-0-5-0 is 7 Tickets / 52.7 KB ~ 13k. These are the numbers the
    // whole project argues from, so they are pinned, not merely bounded.
    expect(await costOfReadingWhole(root, 'telegram')).toBeCloseTo(8200, -2.5);
    expect(await costOfReadingWhole(root, 'ship-0-5-0')).toBeCloseTo(13100, -2.5);
  });

  it('answers the same question for a small, pinned fraction of that', async () => {
    const root = await makeLegacyWorkspace({
      telegram: 'sobrina-telegram',
      'ship-0-5-0': 'tag-customizer-ship-0-5-0',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const measured = await Promise.all(
      (
        [
          ['telegram', 12],
          ['ship-0-5-0', 20],
        ] as const
      ).map(async ([effort, floor]) => ({
        effort,
        floor,
        board: tokens(await frontier.call('get_board', { effort })),
        whole: await costOfReadingWhole(root, effort),
      })),
    );

    for (const { board, whole, floor } of measured) {
      // The criterion is a comparison, so it is asserted as one: the Board is
      // measured *against* reading the same Effort whole, in one assertion.
      expect(whole / board).toBeGreaterThan(floor);

      // And pinned, not merely bounded — a Board that doubled would still clear
      // a ratio floor on an Effort this expensive, and quietly giving back the
      // saving is the regression this file exists to catch.
      expect(board).toBeLessThan(700);
    }
  });

  it('does not grow when an Effort carries far longer bodies', async () => {
    const root = await makeLegacyWorkspace({
      telegram: 'sobrina-telegram',
      'ship-0-5-0': 'tag-customizer-ship-0-5-0',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const cheap = tokens(await frontier.call('get_board', { effort: 'telegram' }));
    const expensive = tokens(await frontier.call('get_board', { effort: 'ship-0-5-0' }));

    // ship-0-5-0 costs 1.6x telegram to read whole while holding half the
    // Tickets, because resolved Tickets carry their full answers. The Boards
    // must not track that: the one with fewer Tickets must not cost more than
    // the Ticket count alone would explain.
    const wholeRatio =
      (await costOfReadingWhole(root, 'ship-0-5-0')) / (await costOfReadingWhole(root, 'telegram'));
    expect(wholeRatio).toBeGreaterThan(1.5);
    expect(expensive).toBeLessThan(cheap * 1.5);
  });
});

describe('reads', () => {
  it('never modify a file, so querying the tracker is not a source of git noise', async () => {
    const root = await makeLegacyWorkspace({
      telegram: 'sobrina-telegram',
      'ship-0-5-0': 'tag-customizer-ship-0-5-0',
    });
    const before = await snapshot(root);

    const frontier = await connectFrontier({ cwd: root, env: {} });
    await frontier.call('list_efforts');
    await frontier.call('get_board', { effort: 'telegram' });
    await frontier.call('get_board', { effort: 'ship-0-5-0' });
    await frontier.call('get_tickets', { ids: ['T30', 'T31', 'T44'] });

    const after = await snapshot(root);

    expect(before.size).toBeGreaterThan(20);
    expect([...after.entries()]).toEqual([...before.entries()]);
  });
});
