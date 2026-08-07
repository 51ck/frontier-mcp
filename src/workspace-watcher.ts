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
 */
export function watchWorkspace(
  root: string,
  invalidate: () => void,
  options: WorkspaceWatcherOptions = {},
): WorkspaceWatcher {
  const debounceMs = options.debounceMs ?? 50;
  const scratchPath = join(root, SCRATCH);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let watcher: FSWatcher | undefined;

  const scheduleInvalidate = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      invalidate();
    }, debounceMs);
  };

  if (existsSync(scratchPath)) {
    try {
      watcher = watch(scratchPath, { recursive: true }, () => {
        scheduleInvalidate();
      });
      watcher.on('error', () => {
        watcher?.close();
        watcher = undefined;
      });
    } catch {
      // A workspace with no `.scratch/` yet is valid; reads stay empty until one appears.
    }
  }

  return {
    close() {
      if (timer !== undefined) clearTimeout(timer);
      watcher?.close();
      watcher = undefined;
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
