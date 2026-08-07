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
  it('is a small fraction of reading the same Effort whole', async () => {
    const root = await makeLegacyWorkspace({ telegram: 'sobrina-telegram' });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = tokens(await frontier.call('get_board', { effort: 'telegram' }));
    const whole = await costOfReadingWhole(root, 'telegram');

    // The spec measured sobrina's telegram Effort at 15 Tickets / 32.7 KB, and
    // claims a Board answers the same question for a fraction of it.
    expect(whole).toBeGreaterThan(5000);
    expect(board).toBeLessThan(whole / 10);
  });

  it('does not grow when Tickets carry long resolved answers', async () => {
    const root = await makeLegacyWorkspace({
      telegram: 'sobrina-telegram',
      'ship-0-5-0': 'tag-customizer-ship-0-5-0',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    // ship-0-5-0 is half the Ticket count of telegram but carries far longer
    // bodies — an Effort gets more expensive to read the further it progresses,
    // and a Board is the thing that does not.
    const board = tokens(await frontier.call('get_board', { effort: 'ship-0-5-0' }));
    const whole = await costOfReadingWhole(root, 'ship-0-5-0');

    expect(board).toBeLessThan(whole / 10);
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
