import { existsSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';

const SCRATCH = '.scratch';

export interface WorkspaceWatcher {
  close(): void;
}

export interface WorkspaceWatcherOptions {
  /** Debounce rapid events before invalidating. Defaults to 50ms. */
  readonly debounceMs?: number;
}

/**
 * Watch `.scratch/` under a resolved workspace and call `invalidate` when it
 * changes. Never writes — only schedules invalidation after debouncing.
 *
 * If `.scratch/` does not exist yet, the workspace root is watched until the
 * directory appears, then the recursive scratch watch is attached.
 */
export function watchWorkspace(
  root: string,
  invalidate: () => void,
  options: WorkspaceWatcherOptions = {},
): WorkspaceWatcher {
  const debounceMs = options.debounceMs ?? 50;
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
      // `.scratch/` may have disappeared between the exists check and watch.
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

/**
 * One watcher per workspace root. Started when an index is first opened.
 */
export interface WatcherRegistry {
  attach(root: string, invalidate: () => void): void;
  closeAll(): void;
}

export function createWatcherRegistry(options: WorkspaceWatcherOptions = {}): WatcherRegistry {
  const watchers = new Map<string, WorkspaceWatcher>();

  return {
    attach(root, invalidate) {
      if (watchers.has(root)) return;
      watchers.set(root, watchWorkspace(root, invalidate, options));
    },
    closeAll() {
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
}
