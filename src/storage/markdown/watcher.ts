import { existsSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';

export interface StorageWatcher {
  close(): void;
}

/**
 * Long enough to coalesce the burst a branch switch makes, short enough that a
 * hand edit is live by the time the next call arrives.
 */
const DEFAULT_DEBOUNCE_MS = 50;

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
 */
export function watchStorage(
  root: string,
  storageDir: string,
  invalidate: () => void,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): StorageWatcher {
  const storagePath = join(root, storageDir);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let storageWatcher: FSWatcher | undefined;
  let rootWatcher: FSWatcher | undefined;

  const scheduleInvalidate = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      invalidate();
    }, debounceMs);
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
    } catch {
      // Unusual, but a missing workspace root should not wedge the server.
    }
  }

  return {
    close() {
      if (timer !== undefined) clearTimeout(timer);
      storageWatcher?.close();
      rootWatcher?.close();
      storageWatcher = undefined;
      rootWatcher = undefined;
    },
  };
}
