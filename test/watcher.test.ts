import {
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createMarkdownDriver } from '../src/storage/markdown/driver.ts';
import { map, ticket } from './support/fixtures.ts';
import {
  cleanupFixtures,
  connectFrontier,
  makeFixtureTree,
  type ConnectedFrontier,
} from './support/harness.ts';

afterEach(cleanupFixtures);

const FILE = '.scratch/alpha/issues/01-T1-work.md';
const DEBOUNCE_MS = 25;

/**
 * How long a watched change may take to surface. This budget covers scheduling
 * jitter on a loaded machine and nothing else: an event lost in a watch's
 * warm-up window is not a slow event but a missing one, and no budget outlasts
 * a missing event — recovering those is the watcher's settle, per
 * {@link watchStorage}.
 *
 * The same twelve-process probe that measured that window (see
 * `DEFAULT_SETTLE_MS`) also timed the events it did deliver: median 8-34ms,
 * slowest 175ms. Five seconds is roughly 30x the slowest one. Even so it
 * reaches the 5s default vitest allows a whole test, which is why the tests
 * below pass TEST_TIMEOUT_MS to `it`.
 */
const WAIT_MS = 5_000;

/**
 * Comfortably above WAIT_MS, so waitFor's message wins the race to report —
 * three times it rather than two, because the tests that wait for a change and
 * then for a second one spend two full budgets before anything else they do.
 */
const TEST_TIMEOUT_MS = 15_000;

/**
 * Poll until `probe` satisfies `ready`, or throw. Throwing beats returning
 * the last value — a silent timeout used to surface as a puzzling content
 * mismatch instead of the wait it actually was.
 */
async function waitFor<T>(
  probe: () => Promise<T>,
  ready: (value: T) => boolean,
  deadline = Date.now() + WAIT_MS,
): Promise<T> {
  const value = await probe();
  if (ready(value)) return value;
  if (Date.now() >= deadline) {
    throw new Error(`waitFor timed out; last value was:\n${String(value)}`);
  }
  await new Promise(resolve => setTimeout(resolve, DEBOUNCE_MS));
  return waitFor(probe, ready, deadline);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Short, so {@link quiesce} can outwait it. */
const SETTLE_MS = [10, 50];

/**
 * Outwait the settle, then read, so the cache holds a scan only a watch can
 * drop — and in per-directory mode every drop a watch provokes runs after a
 * re-sync. Without the read, a settle that already dropped the scan lets the
 * next Board show a change no watch heard.
 */
async function quiesce(frontier: ConnectedFrontier): Promise<void> {
  await sleep(Math.max(...SETTLE_MS) * 2);
  await frontier.call('list_efforts');
}

function connectWatching(root: string, options: { perDirectory?: true } = {}) {
  return connectFrontier({
    cwd: root,
    env: {},
    createDriver: driverRoot =>
      createMarkdownDriver(driverRoot, {
        watcherDebounceMs: DEBOUNCE_MS,
        watcherSettleMs: SETTLE_MS,
        ...(options.perDirectory === undefined ? {} : { watcherPerDirectory: true }),
      }),
  });
}

/** A Board that may not exist yet reads as its error text, so waitFor can keep polling it. */
function boardOf(frontier: ConnectedFrontier, effort: string): () => Promise<string> {
  return () => frontier.call('get_board', { effort }).catch((error: unknown) => String(error));
}

/**
 * Watches this process holds, counted by Node and, on Linux, by the kernel —
 * the two places a watch costs something, read the way any process's are, so
 * no entry point below the tool layer is involved. Vitest's default `forks`
 * pool gives each test file a process of its own, so nothing else is counted.
 * Node's count includes a handle the kernel has already dropped, which is how
 * a watch left on a removed directory would show.
 */
function watchCounts(): { node: number; inotify: number | undefined } {
  const node = process.getActiveResourcesInfo().filter(name => name === 'FSEventWrap').length;
  if (process.platform !== 'linux') return { node, inotify: undefined };
  let inotify = 0;
  for (const fd of readdirSync('/proc/self/fd')) {
    let target;
    try {
      target = readlinkSync(`/proc/self/fd/${fd}`);
    } catch {
      continue;
    }
    if (target !== 'anon_inode:inotify') continue;
    inotify += readFileSync(`/proc/self/fdinfo/${fd}`, 'utf8')
      .split('\n')
      .filter(line => line.startsWith('inotify wd:')).length;
  }
  return { node, inotify };
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

describe('filesystem watcher', { timeout: TEST_TIMEOUT_MS }, () => {
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

  // Linux's mode, forced so it runs on every platform. What it proves is that a
  // change in each kind of watched directory is heard, an Effort made after
  // start included; which directories it leaves unwatched is not observable here.
  it('in per-directory mode hears the storage root, an Effort and its issues/', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: ticket('T1', 'Open work'),
    });
    const frontier = await connectFrontier({
      cwd: root,
      env: {},
      watcherDebounceMs: DEBOUNCE_MS,
      watcherPerDirectory: true,
    });
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('Open work');

    await writeFile(join(root, FILE), ticket('T1', 'Edited in issues'), 'utf8');
    await waitFor(
      () => frontier.call('get_board', { effort: 'alpha' }),
      text => text.includes('Edited in issues'),
    );

    await mkdir(join(root, '.scratch/beta/issues'), { recursive: true });
    await waitFor(
      () => frontier.call('list_efforts'),
      text => /^beta /m.test(text),
    );
    await writeFile(join(root, '.scratch/beta/issues/late.md'), ticket('T2', 'Late one'), 'utf8');
    const board = await waitFor(
      () => frontier.call('get_board', { effort: 'beta' }),
      text => text.includes('Late one'),
    );
    expect(board).toContain('Late one');
  });

  it('survives a watched directory being replaced by a same-named file (T99)', async () => {
    const root = await makeFixtureTree({
      [FILE]: ticket('T1', 'Before the swap'),
    });
    const mapPath = join(root, '.scratch/alpha/map.md');
    await mkdir(mapPath);
    const frontier = await connectWatching(root);
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('Before the swap');

    // Synchronously, so no watch event is handled between the two: on Linux
    // Node 24.22+ that is what turns its lstat of `map.md/map.md` into ENOTDIR
    // rather than ENOENT, deterministically.
    rmSync(mapPath, { recursive: true });
    writeFileSync(mapPath, map('Now a file.'), 'utf8');
    await waitFor(
      () => frontier.call('get_board', { effort: 'alpha' }),
      text => text.includes('Now a file.'),
    );

    // A directory created after the swap must be watched too, or the
    // replacement watch would see only the tree it started with. The marker
    // is written with the directory, in one turn, and can only be seen
    // through a watch's invalidation, so the write after it lands in a
    // directory a watch already covers rather than in a scan still to come.
    await quiesce(frontier);
    mkdirSync(join(root, '.scratch/beta/issues'), { recursive: true });
    writeFileSync(join(root, '.scratch/beta/issues/00-T3-marker.md'), ticket('T3', 'Marker'));
    await waitFor(boardOf(frontier, 'beta'), text => text.includes('Marker'));
    await writeFile(
      join(root, '.scratch/beta/issues/01-T2-later.md'),
      ticket('T2', 'In a new directory'),
      'utf8',
    );
    const board = await waitFor(
      () => frontier.call('get_board', { effort: 'beta' }),
      text => text.includes('In a new directory'),
    );
    expect(board).toContain('In a new directory');
  });

  // A restore from backup does this: the path stays, the directory under it is new.
  it('in per-directory mode hears an issues/ removed and made again (T109)', async () => {
    const root = await makeFixtureTree({ [FILE]: ticket('T1', 'Open work') });
    const frontier = await connectWatching(root, { perDirectory: true });
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('Open work');
    await quiesce(frontier);

    const issues = join(root, '.scratch/alpha/issues');
    rmSync(issues, { recursive: true });
    mkdirSync(issues);
    writeFileSync(join(issues, '02-T2-new.md'), ticket('T2', 'In the new issues'));
    await waitFor(boardOf(frontier, 'alpha'), text => text.includes('In the new issues'));

    writeFileSync(join(issues, '02-T2-new.md'), ticket('T2', 'Edited in the new issues'));
    const board = await waitFor(boardOf(frontier, 'alpha'), text =>
      text.includes('Edited in the new issues'),
    );
    expect(board).toContain('Edited in the new issues');
  });

  // A checkout does this: another directory is moved into the watched path.
  it('in per-directory mode hears an Effort moved into a watched path (T109)', async () => {
    const root = await makeFixtureTree({
      [FILE]: ticket('T1', 'Open work'),
      '.scratch/other/issues/01-T3-elsewhere.md': ticket('T3', 'Other work'),
    });
    const frontier = await connectWatching(root, { perDirectory: true });
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('Open work');
    await quiesce(frontier);

    renameSync(join(root, '.scratch/alpha'), join(root, '.scratch/old'));
    renameSync(join(root, '.scratch/other'), join(root, '.scratch/alpha'));
    await waitFor(boardOf(frontier, 'alpha'), text => text.includes('Other work'));

    writeFileSync(
      join(root, '.scratch/alpha/issues/03-T4-moved.md'),
      ticket('T4', 'Written after the move'),
    );
    const board = await waitFor(boardOf(frontier, 'alpha'), text =>
      text.includes('Written after the move'),
    );
    expect(board).toContain('Written after the move');
  });

  // A busy loop during a checkout does this: the debounce fires before the
  // move's own event is read, so the re-sync meets the moved directory under
  // both names at once. Linux shares one watch per inode and names its events
  // after the path that took it first, so a watch attached before the old
  // one closes would hear itself removed under the wrong name.
  it('in per-directory mode hears an Effort replaced after a move the re-sync ran ahead of (T109)', async () => {
    const root = await makeFixtureTree({
      '.scratch/other/map.md': map('Before the move.'),
      '.scratch/other/issues/01-T3-elsewhere.md': ticket('T3', 'Other work'),
    });
    const frontier = await connectWatching(root, { perDirectory: true });
    expect(await frontier.call('get_board', { effort: 'other' })).toContain('Other work');
    await quiesce(frontier);

    writeFileSync(join(root, '.scratch/other/map.md'), map('Moved.'));
    await sleep(5);
    await new Promise<void>(resolve =>
      setTimeout(
        () =>
          setImmediate(() => {
            renameSync(join(root, '.scratch/other'), join(root, '.scratch/alpha'));
            const end = Date.now() + DEBOUNCE_MS * 2;
            while (Date.now() < end);
            resolve();
          }),
        10,
      ),
    );
    await waitFor(boardOf(frontier, 'alpha'), text => text.includes('Moved.'));
    await quiesce(frontier);

    rmSync(join(root, '.scratch/alpha'), { recursive: true });
    mkdirSync(join(root, '.scratch/alpha/issues'), { recursive: true });
    writeFileSync(join(root, '.scratch/alpha/map.md'), map('Replaced.'));
    await waitFor(boardOf(frontier, 'alpha'), text => text.includes('Replaced.'));
    await quiesce(frontier);

    writeFileSync(join(root, '.scratch/alpha/map.md'), map('Edited after the replacement.'));
    const board = await waitFor(boardOf(frontier, 'alpha'), text =>
      text.includes('Edited after the replacement.'),
    );
    expect(board).toContain('Edited after the replacement.');
  });

  it('in per-directory mode hears a storage directory removed and recreated (T109)', async () => {
    const root = await makeFixtureTree({ [FILE]: ticket('T1', 'Before removal') });
    const frontier = await connectWatching(root, { perDirectory: true });
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('Before removal');
    await quiesce(frontier);

    const storage = join(root, '.scratch');
    rmSync(storage, { recursive: true });
    await waitFor(
      () => frontier.call('list_efforts'),
      text => text.includes('no tracker here'),
    );
    mkdirSync(join(storage, 'alpha/issues'), { recursive: true });
    writeFileSync(join(root, FILE), ticket('T1', 'Recreated'));
    await waitFor(boardOf(frontier, 'alpha'), text => text.includes('Recreated'));
    // Re-attaching settles again.
    await quiesce(frontier);
    writeFileSync(join(root, FILE), ticket('T1', 'Edited once watched again'));
    await waitFor(boardOf(frontier, 'alpha'), text => text.includes('Edited once watched again'));

    // Inside one debounce window, so no re-sync sees it missing.
    rmSync(storage, { recursive: true });
    mkdirSync(join(storage, 'alpha/issues'), { recursive: true });
    writeFileSync(join(root, FILE), ticket('T1', 'Recreated at once'));
    await waitFor(boardOf(frontier, 'alpha'), text => text.includes('Recreated at once'));
    writeFileSync(join(root, FILE), ticket('T1', 'Edited after the quick swap'));
    const board = await waitFor(boardOf(frontier, 'alpha'), text =>
      text.includes('Edited after the quick swap'),
    );
    expect(board).toContain('Edited after the quick swap');
  });

  it('in per-directory mode holds one watch per scanned directory across swaps, none once closed (T109)', async () => {
    const before = watchCounts();
    const root = await makeFixtureTree({
      [FILE]: ticket('T1', 'Round 0'),
      '.scratch/other/issues/01-T3-elsewhere.md': ticket('T3', 'Other work'),
    });
    const frontier = await connectWatching(root, { perDirectory: true });
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('Round 0');
    await quiesce(frontier);

    // The storage directory, two Efforts and their issues/.
    const watching = {
      node: before.node + 5,
      inotify: before.inotify === undefined ? undefined : before.inotify + 5,
    };
    const counted = (expected: typeof watching) =>
      waitFor(
        () => Promise.resolve(JSON.stringify(watchCounts())),
        text => text === JSON.stringify(expected),
      );
    await counted(watching);

    const storage = join(root, '.scratch');
    const swapRound = async (round: number) => {
      const issues = join(storage, 'alpha/issues');
      rmSync(issues, { recursive: true });
      mkdirSync(issues);
      writeFileSync(join(issues, `R${String(round)}.md`), ticket(`R${String(round)}`, 'Remade'));
      await waitFor(boardOf(frontier, 'alpha'), text => text.includes(`R${String(round)} `));
      await counted(watching);

      renameSync(join(storage, 'alpha'), join(storage, 'swap'));
      renameSync(join(storage, 'other'), join(storage, 'alpha'));
      renameSync(join(storage, 'swap'), join(storage, 'other'));
      const moved = join(storage, `alpha/issues/M${String(round)}.md`);
      writeFileSync(moved, ticket(`M${String(round)}`, 'Moved'));
      await waitFor(boardOf(frontier, 'alpha'), text => text.includes(`M${String(round)} `));
      await counted(watching);

      const kept = join(root, 'kept');
      renameSync(storage, kept);
      mkdirSync(storage);
      renameSync(join(kept, 'alpha'), join(storage, 'alpha'));
      renameSync(join(kept, 'other'), join(storage, 'other'));
      rmSync(kept, { recursive: true });
      writeFileSync(moved, ticket(`M${String(round)}`, `Restored ${String(round)}`));
      await waitFor(boardOf(frontier, 'alpha'), text => text.includes(`Restored ${String(round)}`));
      await counted(watching);
    };
    await [1, 2, 3].reduce(
      (pending, round) => pending.then(() => swapRound(round)),
      Promise.resolve(),
    );

    await cleanupFixtures();
    await counted(before);
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

  it('writes nothing while watching', async () => {
    const mapPath = '.scratch/alpha/map.md';
    const tracked = [mapPath, FILE];
    const root = await makeFixtureTree({
      [mapPath]: map('Somewhere.'),
      [FILE]: ticket('T1', 'Quiet'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {}, watcherDebounceMs: DEBOUNCE_MS });

    await frontier.call('get_board', { effort: 'alpha' });
    await new Promise(resolve => setTimeout(resolve, DEBOUNCE_MS * 2));

    const before = await snapshotScratch(root, tracked);
    await frontier.call('get_board', { effort: 'alpha' });
    await new Promise(resolve => setTimeout(resolve, DEBOUNCE_MS * 2));
    const after = await snapshotScratch(root, tracked);

    for (const path of tracked) {
      expect(after.get(path)).toBe(before.get(path));
    }
  });

  it('ignores changes outside .scratch/', async () => {
    const outside = 'README.md';
    const root = await makeFixtureTree({
      [outside]: '# Not tracker data\n',
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: ticket('T1', 'Stable'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {}, watcherDebounceMs: DEBOUNCE_MS });

    const initial = await frontier.call('get_board', { effort: 'alpha' });
    expect(initial).toContain('Stable');

    await writeFile(join(root, outside), '# Changed outside scratch\n', 'utf8');
    await new Promise(resolve => setTimeout(resolve, DEBOUNCE_MS * 2));

    expect(await frontier.call('get_board', { effort: 'alpha' })).toBe(initial);

    await writeFile(join(root, FILE), ticket('T1', 'Changed inside scratch'), 'utf8');

    const updated = await waitFor(
      () => frontier.call('get_board', { effort: 'alpha' }),
      text => text.includes('Changed inside scratch'),
    );
    expect(updated).toContain('Changed inside scratch');
  });

  /**
   * The watcher watches the directory its driver was constructed with. It has
   * no `.scratch` of its own to name — that the default happens to be
   * `.scratch` is the markdown driver's answer, passed down.
   */
  it('watches the storage directory the driver was given', async () => {
    const watched = '.tracker/alpha/issues/01-T1-work.md';
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.tracker/alpha/map.md': map('Somewhere else entirely.'),
      [watched]: ticket('T1', 'Before'),
    });
    const frontier = await connectFrontier({
      cwd: root,
      env: {},
      createDriver: driverRoot =>
        createMarkdownDriver(driverRoot, {
          storageDir: '.tracker',
          watcherDebounceMs: DEBOUNCE_MS,
        }),
    });

    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('Before');

    await writeFile(join(root, watched), ticket('T1', 'After a hand edit'), 'utf8');

    const board = await waitFor(
      () => frontier.call('get_board', { effort: 'alpha' }),
      text => text.includes('After a hand edit'),
    );
    expect(board).toContain('After a hand edit');
  });

  /**
   * An `fs.watch` is not delivering events the moment it is created, and a
   * change landing in that window is dropped rather than delayed — so the
   * watcher settles by dropping the scan a few times after it attaches, whether
   * or not it saw anything.
   *
   * The debounce here is 60s, which is longer than the whole test: no event the
   * watcher does receive can possibly reach `invalidate` before the assertion
   * below. The settle is therefore the only thing that can have dropped the
   * cache, which is what makes this a test of the settle and not a second test
   * of the watch. The schedule is two entries so it also pins that the settle
   * repeats — the first has fired well before the write, and only the second
   * can be the one that sees it.
   */
  it('drops the cache after attaching, with no filesystem event in play', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: ticket('T1', 'Cached at startup'),
    });
    const frontier = await connectFrontier({
      cwd: root,
      env: {},
      createDriver: driverRoot =>
        createMarkdownDriver(driverRoot, {
          watcherDebounceMs: 60_000,
          watcherSettleMs: [25, 1000],
        }),
    });

    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('Cached at startup');

    await writeFile(join(root, FILE), ticket('T1', 'Written while warming up'), 'utf8');

    const board = await waitFor(
      () => frontier.call('get_board', { effort: 'alpha' }),
      text => text.includes('Written while warming up'),
    );
    expect(board).toContain('Written while warming up');
  });

  /**
   * A workspace whose storage directory does not exist yet is watched at its
   * root until one appears, and the recursive watch takes over then. That
   * handover is the branch with the most to lose: the event it waits for
   * arrives exactly once, so a watcher that missed it would go on watching the
   * root forever while every change inside the storage directory went unseen.
   *
   * The assertion is deliberately about a *second* change, made once the settle
   * schedule is spent. Seeing the Effort appear proves nothing — dropping the
   * scan alone does that, because a fresh walk reads whatever is on disk. Only
   * a watch that actually handed over can carry the edit that comes after.
   */
  it('starts watching a storage directory that appeared after the driver did', async () => {
    const settleMs = [10, 20];
    const root = await makeFixtureTree({ '.git/HEAD': 'ref: refs/heads/main\n' });
    const frontier = await connectFrontier({
      cwd: root,
      env: {},
      createDriver: driverRoot =>
        createMarkdownDriver(driverRoot, {
          watcherDebounceMs: DEBOUNCE_MS,
          watcherSettleMs: settleMs,
        }),
    });

    expect(await frontier.call('list_efforts')).not.toContain('alpha');

    await mkdir(join(root, '.scratch', 'alpha', 'issues'), { recursive: true });
    await writeFile(join(root, '.scratch/alpha/map.md'), map('Arrived later.'), 'utf8');
    await writeFile(join(root, FILE), ticket('T1', 'Late arrival'), 'utf8');

    await waitFor(
      () => frontier.call('list_efforts'),
      text => text.includes('alpha'),
    );

    // Past the last settle, so nothing but the recursive watch is left to
    // notice anything.
    await new Promise(resolve => setTimeout(resolve, Math.max(...settleMs) * 2));

    await writeFile(join(root, FILE), ticket('T1', 'Edited once watched'), 'utf8');

    const board = await waitFor(
      () => frontier.call('get_board', { effort: 'alpha' }),
      text => text.includes('Edited once watched'),
    );
    expect(board).toContain('Edited once watched');
  });
});
