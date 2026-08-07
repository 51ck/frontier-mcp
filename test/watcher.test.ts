import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const FILE = '.scratch/alpha/issues/01-T1-work.md';
const DEBOUNCE_MS = 25;

/** Poll until `probe` satisfies `ready`, or time out. */
async function waitFor<T>(
  probe: () => Promise<T>,
  ready: (value: T) => boolean,
  deadline = Date.now() + 3_000,
): Promise<T> {
  const value = await probe();
  if (ready(value) || Date.now() >= deadline) return value;
  await new Promise(resolve => setTimeout(resolve, DEBOUNCE_MS));
  return waitFor(probe, ready, deadline);
}

async function snapshotScratch(root: string, paths: string[]): Promise<Map<string, string>> {
  const contents = new Map<string, string>();
  await Promise.all(
    paths.map(async path => {
      contents.set(path, await readFile(join(root, path), 'utf8'));
    }),
  );
  return contents;
}

describe('filesystem watcher', () => {
  it('reflects a Ticket edited on disk in the next Board without restarting', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: ticket('T1', 'Open work'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {}, watcherDebounceMs: DEBOUNCE_MS });

    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('Open work');

    await writeFile(
      join(root, FILE),
      ticket('T1', 'Edited on disk', {
        status: 'resolved',
        answer_gist: 'Hand edit.',
      }),
      'utf8',
    );

    const board = await waitFor(
      () => frontier.call('get_board', { effort: 'alpha' }),
      text => text.includes('Edited on disk') && text.includes('gist=Hand edit.'),
    );

    expect(board).toContain('Edited on disk');
    expect(board).toContain('gist=Hand edit.');
  });

  it('reflects a Ticket added or deleted on disk', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: ticket('T1', 'Only one'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {}, watcherDebounceMs: DEBOUNCE_MS });

    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('T1');

    const added = '.scratch/alpha/issues/02-T2-new.md';
    await writeFile(join(root, added), ticket('T2', 'Fresh file'), 'utf8');

    const withAdd = await waitFor(
      () => frontier.call('get_board', { effort: 'alpha' }),
      text => text.includes('T2'),
    );
    expect(withAdd).toContain('Fresh file');

    await rm(join(root, added));

    const withDelete = await waitFor(
      () => frontier.call('get_board', { effort: 'alpha' }),
      text => !text.includes('T2'),
    );
    expect(withDelete).not.toContain('T2');
  });

  it('leaves the working tree byte-identical after many files change at once', async () => {
    const mapPath = '.scratch/alpha/map.md';
    const t1Path = '.scratch/alpha/issues/01-T1-one.md';
    const t2Path = '.scratch/alpha/issues/02-T2-two.md';
    const t3Path = '.scratch/alpha/issues/03-T3-three.md';
    const tracked = [mapPath, t1Path, t2Path];
    const root = await makeFixtureTree({
      [mapPath]: map('Branch switch target.'),
      [t1Path]: ticket('T1', 'One'),
      [t2Path]: ticket('T2', 'Two'),
      [t3Path]: ticket('T3', 'Three'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {}, watcherDebounceMs: DEBOUNCE_MS });

    await frontier.call('get_board', { effort: 'alpha' });

    // Simulate a branch switch touching every Ticket and the Map.
    await Promise.all([
      writeFile(join(root, mapPath), map('After checkout.'), 'utf8'),
      writeFile(
        join(root, t1Path),
        ticket('T1', 'One', { status: 'resolved', answer_gist: 'Landed.' }),
        'utf8',
      ),
      writeFile(join(root, t2Path), ticket('T2', 'Two renamed'), 'utf8'),
      rm(join(root, t3Path)),
    ]);

    const afterCheckout = await snapshotScratch(root, tracked);

    await waitFor(
      () => frontier.call('get_board', { effort: 'alpha' }),
      text =>
        text.includes('After checkout.') && text.includes('Two renamed') && !text.includes('T3'),
    );

    const afterWatcher = await snapshotScratch(root, tracked);
    for (const path of tracked) {
      expect(afterWatcher.get(path)).toBe(afterCheckout.get(path));
    }
  });

  it('remains correct after a burst of rapid changes', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: ticket('T1', 'Version 0'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {}, watcherDebounceMs: DEBOUNCE_MS });

    await frontier.call('get_board', { effort: 'alpha' });

    await Array.from({ length: 20 }, (_, index) => index + 1).reduce(
      (pending, version) =>
        pending.then(() =>
          writeFile(join(root, FILE), ticket('T1', `Version ${String(version)}`), 'utf8'),
        ),
      Promise.resolve(),
    );

    const board = await waitFor(
      () => frontier.call('get_board', { effort: 'alpha' }),
      text => text.includes('Version 20'),
    );
    expect(board).toContain('Version 20');
  });
});
