import type { Effort } from './domain.ts';
import type { StorageDriver } from './storage/driver.ts';

/**
 * The in-memory index: a derived, rebuildable view of one workspace, built by a
 * full scan. At the volumes involved a full scan is single-digit milliseconds,
 * so the index rebuilds wholesale rather than tracking entries individually.
 *
 * The scan is held for the life of the process, so a file edited on disk is not
 * seen until T8 adds the watcher that discards it. Within one session that is
 * the gap T8 exists to close.
 */
export interface WorkspaceIndex {
  efforts(): Promise<readonly Effort[]>;
}

export function createWorkspaceIndex(driver: StorageDriver): WorkspaceIndex {
  // The in-flight scan is cached, not just its result, so that concurrent
  // callers share one scan instead of racing several.
  let scan: Promise<readonly Effort[]> | undefined;

  return {
    efforts() {
      scan ??= driver.listEfforts().catch(error => {
        // A failed scan must not become the cached answer.
        scan = undefined;
        throw error;
      });
      return scan;
    },
  };
}

/**
 * One index per workspace. A call carrying an explicit `root` reads a different
 * workspace from the session's own, and each keeps its own scan.
 */
export interface IndexRegistry {
  forWorkspace(root: string): WorkspaceIndex;
}

export function createIndexRegistry(createDriver: (root: string) => StorageDriver): IndexRegistry {
  const indexes = new Map<string, WorkspaceIndex>();

  return {
    forWorkspace(root) {
      let index = indexes.get(root);
      if (index === undefined) {
        index = createWorkspaceIndex(createDriver(root));
        indexes.set(root, index);
      }
      return index;
    },
  };
}
