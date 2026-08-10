import { existsSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';

const SCRATCH = '.scratch';

export interface StorageWatcher {
  close(): void;
}

/**
 * Long enough to coalesce the burst a branch switch makes, short enough that a
 * hand edit is live by the time the next call arrives.
 */
const DEFAULT_DEBOUNCE_MS = 50;

/**
 * Watch this driver's storage directory under a resolved workspace and call
 * `invalidate` when it changes. Never writes — only schedules invalidation
 * after debouncing.
 *
 * It lives below the seam because what it does is markdown-driver policy: it
 * watches a directory of files with `node:fs`, at a granularity chosen because
 * a full markdown scan is single-digit milliseconds. A driver over a database
 * would learn that its workspace moved some entirely different way.
 *
 * If the storage directory does not exist yet, the workspace root is watched
 * until it appears, then the recursive watch is attached.
 */
export function watchStorage(
  root: string,
  invalidate: () => void,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): StorageWatcher {
  const scratchPath = join(root, SCRATCH);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scratchWatcher: FSWatcher | undefined;
  let rootWatcher: FSWatcher | undefined;

  const scheduleInvalidate = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      invalidate();
    }, debounceMs);
  };

  const attachScratchWatcher = () => {
    if (scratchWatcher !== undefined || !existsSync(scratchPath)) return;
    try {
      scratchWatcher = watch(scratchPath, { recursive: true }, () => {
        scheduleInvalidate();
      });
      scratchWatcher.on('error', () => {
        scratchWatcher?.close();
        scratchWatcher = undefined;
      });
      rootWatcher?.close();
      rootWatcher = undefined;
    } catch {
      // The storage directory may have disappeared between the exists check
      // and the watch.
    }
  };

  attachScratchWatcher();

  if (scratchWatcher === undefined) {
    try {
      rootWatcher = watch(root, (_event, filename) => {
        if (filename !== SCRATCH) return;
        attachScratchWatcher();
        scheduleInvalidate();
      });
      rootWatcher.on('error', () => {
        rootWatcher?.close();
        rootWatcher = undefined;
      });
    } catch {
      // Unusual, but a missing workspace root should not wedge the server.
    }
  }

  return {
    close() {
      if (timer !== undefined) clearTimeout(timer);
      scratchWatcher?.close();
      rootWatcher?.close();
      scratchWatcher = undefined;
      rootWatcher = undefined;
    },
  };
}
