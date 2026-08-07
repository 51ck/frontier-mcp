import type {
  Effort,
  MapDocument,
  MapEdit,
  MigrateOptions,
  MigrationReport,
  SpecDocument,
  Ticket,
  TicketDraft,
} from './domain.ts';
import type {
  CreateOptions,
  HeaderDocOptions,
  StorageDriver,
  TicketEdit,
} from './storage/driver.ts';

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
  /** Create a batch of Tickets and discard the scan, for the same reason. */
  create(
    effort: string,
    drafts: readonly TicketDraft[],
    options: CreateOptions,
  ): Promise<readonly Ticket[]>;
  readMap(effort: string): Promise<MapDocument>;
  editMap(
    effort: string,
    edit: MapEdit,
    expectedRevision: string | undefined,
    options: HeaderDocOptions,
  ): Promise<MapDocument>;
  readSpec(effort: string): Promise<SpecDocument>;
  putSpec(
    effort: string,
    body: string,
    expectedRevision: string | undefined,
    options: HeaderDocOptions,
  ): Promise<SpecDocument>;
  migrate(effort: string, options: MigrateOptions): Promise<MigrationReport>;
}

export function createWorkspaceIndex(driver: StorageDriver): WorkspaceIndex {
  const efforts = cache(() => driver.listEfforts());
  const tickets = cache(() => driver.listTickets());

  return {
    efforts: efforts.get,
    tickets: tickets.get,
    async update(handle, edit, expectedRevision) {
      return moved(() => driver.updateTicket(handle, edit, expectedRevision));
    },
    async create(effort, drafts, options) {
      return moved(() => driver.createTickets(effort, drafts, options));
    },
    readMap: effort => driver.readMap(effort),
    async editMap(effort, edit, expectedRevision, options) {
      return moved(() => driver.editMap(effort, edit, expectedRevision, options));
    },
    readSpec: effort => driver.readSpec(effort),
    async putSpec(effort, body, expectedRevision, options) {
      return moved(() => driver.putSpec(effort, body, expectedRevision, options));
    },
    async migrate(effort, options) {
      return moved(() => driver.migrateEffort(effort, options));
    },
  };

  /**
   * A write moves the workspace on whether or not it succeeded partway, so the
   * next read rebuilds rather than trusting a scan taken before it.
   */
  async function moved<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } finally {
      efforts.invalidate();
      tickets.invalidate();
    }
  }
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
