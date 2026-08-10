import { existsSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';

export interface StorageWatcher {
  close(): void;
}

export interface WatchStorageOptions {
  // Explicitly `| undefined` under exactOptionalPropertyTypes, so the driver can
  // hand its own optional knobs straight through rather than assembling the
  // object one present key at a time.
  readonly debounceMs?: number | undefined;
  readonly settleMs?: readonly number[] | undefined;
}

/**
 * Long enough to coalesce the burst a branch switch makes, short enough that a
 * hand edit is live by the time the next call arrives.
 */
const DEFAULT_DEBOUNCE_MS = 50;

/**
 * When to re-drop the scan after a watch attaches, because an event may have
 * been lost while that watch was still warming up.
 *
 * Measured on macOS with twelve probe processes writing in parallel, 180
 * samples per bucket: a write 0ms after `watch()` returned lost the event 14%
 * of the time, 1ms lost 7%, 5ms lost 1%, and 25ms lost none — the window
 * closes before 25ms even under that load. These three sit at 2x, 10x and 40x
 * that margin, so a slower machine has room too. Three extra scans at
 * construction cost nothing: a full scan is single-digit milliseconds, and
 * these run once per watch rather than per event.
 */
const DEFAULT_SETTLE_MS: readonly number[] = [50, 250, 1000];

/**
 * Watch `storageDir` under a resolved workspace and call `invalidate` when it
 * changes. Never writes — only schedules invalidation after debouncing.
 *
 * It lives below the seam because what it does is markdown-driver policy: it
 * watches a directory of files with `node:fs`, at a granularity chosen because
 * a full markdown scan is single-digit milliseconds. A driver over a database
 * would learn that its workspace moved some entirely different way. It names no
 * directory of its own for the same reason — which one to watch is the driver's
 * answer, handed down.
 *
 * If the storage directory does not exist yet, the workspace root is watched
 * until it appears, then the recursive watch is attached.
 *
 * **A watch is not live the moment `watch()` returns.** On macOS libuv
 * registers the FSEvents stream off-thread, and multiplexes every watch in the
 * process onto one stream that it tears down and rebuilds whenever a handle is
 * added or removed. A change landing in that gap is dropped outright, never
 * replayed — so waiting longer can never recover it, and a server started and
 * hand-edited immediately would serve a stale Board until the *next* edit. So
 * every successful attach schedules an unconditional invalidation at each delay
 * in the settle schedule: the watcher assumes it missed an event while warming
 * up, rather than trusting a window it cannot observe.
 */
export function watchStorage(
  root: string,
  storageDir: string,
  invalidate: () => void,
  { debounceMs = DEFAULT_DEBOUNCE_MS, settleMs = DEFAULT_SETTLE_MS }: WatchStorageOptions = {},
): StorageWatcher {
  const storagePath = join(root, storageDir);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let storageWatcher: FSWatcher | undefined;
  let rootWatcher: FSWatcher | undefined;
  // Held so close() can clear them: a settle timer that outlives the driver
  // keeps a test worker's event loop alive long after the workspace is gone.
  const settleTimers = new Set<ReturnType<typeof setTimeout>>();

  const scheduleInvalidate = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      invalidate();
    }, debounceMs);
  };

  /**
   * Deliberately neither debounced nor conditional on an event having arrived.
   * The whole point is that an event may have been dropped, so there is nothing
   * to react to and nothing to coalesce with.
   *
   * Each pass retries the attach before dropping the scan, because the event a
   * root watch is warming up to miss is "the storage directory appeared" — and
   * losing that one costs more than a stale scan. Nothing would ever call
   * {@link attachStorageWatcher} again, so the recursive watch would never take
   * over and every later change would go unseen. Re-attaching here is idempotent:
   * a watch already in place returns immediately.
   */
  const settle = () => {
    for (const delay of settleMs) {
      const settleTimer = setTimeout(() => {
        settleTimers.delete(settleTimer);
        attachStorageWatcher();
        invalidate();
      }, delay);
      settleTimers.add(settleTimer);
    }
  };

  const attachStorageWatcher = () => {
    if (storageWatcher !== undefined || !existsSync(storagePath)) return;
    try {
      storageWatcher = watch(storagePath, { recursive: true }, () => {
        scheduleInvalidate();
      });
      storageWatcher.on('error', () => {
        storageWatcher?.close();
        storageWatcher = undefined;
      });
      rootWatcher?.close();
      rootWatcher = undefined;
      settle();
    } catch {
      // The storage directory may have disappeared between the exists check
      // and the watch.
    }
  };

  attachStorageWatcher();

  if (storageWatcher === undefined) {
    try {
      rootWatcher = watch(root, (_event, filename) => {
        // One segment deep, so the name a root watch reports can match it
        // whole. A nested path would never match, and the watch would never
        // hand over to the recursive one.
        if (filename !== storageDir) return;
        attachStorageWatcher();
        scheduleInvalidate();
      });
      rootWatcher.on('error', () => {
        rootWatcher?.close();
        rootWatcher = undefined;
      });
      // The root watch has the same warm-up gap, and the event it waits for
      // arrives exactly once. Missing "the storage directory appeared" would
      // strand the driver on a scan of a workspace that has since grown one.
      settle();
    } catch {
      // Unusual, but a missing workspace root should not wedge the server.
    }
  }

  return {
    close() {
      if (timer !== undefined) clearTimeout(timer);
      for (const settleTimer of settleTimers) clearTimeout(settleTimer);
      settleTimers.clear();
      storageWatcher?.close();
      rootWatcher?.close();
      storageWatcher = undefined;
      rootWatcher = undefined;
    },
  };
}
