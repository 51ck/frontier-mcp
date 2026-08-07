import type { Effort, Ticket } from './domain.ts';
import type { StorageDriver, TicketEdit } from './storage/driver.ts';

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
  /** Apply an edit and discard the scan, since the workspace has moved on. */
  update(handle: string, edit: TicketEdit, expectedRevision: string): Promise<Ticket>;
}

export function createWorkspaceIndex(driver: StorageDriver): WorkspaceIndex {
  const efforts = cache(() => driver.listEfforts());
  const tickets = cache(() => driver.listTickets());

  return {
    efforts: efforts.get,
    tickets: tickets.get,
    async update(handle, edit, expectedRevision) {
      try {
        return await driver.updateTicket(handle, edit, expectedRevision);
      } finally {
        // A write moves the workspace on whether or not it succeeded partway,
        // so the next read rebuilds rather than trusting a scan taken before it.
        efforts.invalidate();
        tickets.invalidate();
      }
    },
  };
}

/**
 * Hold the in-flight scan, not just its result, so concurrent callers share one
 * scan instead of racing several. A failed scan is never cached as the answer.
 */
function cache<T>(scan: () => Promise<T>): { get: () => Promise<T>; invalidate: () => void } {
  let pending: Promise<T> | undefined;

  return {
    get: () => {
      pending ??= scan().catch((error: unknown) => {
        pending = undefined;
        throw error;
      });
      return pending;
    },
    invalidate: () => {
      pending = undefined;
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
