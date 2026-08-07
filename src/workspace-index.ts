import type { Effort, Ticket } from './domain.ts';
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
  tickets(): Promise<readonly Ticket[]>;
}

export function createWorkspaceIndex(driver: StorageDriver): WorkspaceIndex {
  return {
    efforts: cache(() => driver.listEfforts()),
    tickets: cache(() => driver.listTickets()),
  };
}

/**
 * Hold the in-flight scan, not just its result, so concurrent callers share one
 * scan instead of racing several. A failed scan is never cached as the answer.
 */
function cache<T>(scan: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;

  return () => {
    pending ??= scan().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
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
