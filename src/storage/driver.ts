import type { Effort, Status, Ticket } from '../domain.ts';

/**
 * The seam from ADR 0001. Every read and write reaches storage through this
 * interface, and the tool layer never touches a filesystem.
 *
 * Nothing markdown-shaped may cross it — no file paths, no frontmatter, no
 * section names. A driver is constructed already bound to its workspace (the
 * markdown driver takes a directory, a SQLite driver would take a connection),
 * so no method ever takes or returns a location. The planned SQLite driver, and
 * the `md <-> db` conversion either side of it, are only writable if this holds.
 */
export interface StorageDriver {
  /**
   * Every Effort in the workspace, ordered by slug. A workspace holding no
   * Efforts yields an empty list; that is not an error.
   */
  listEfforts(): Promise<readonly Effort[]>;

  /**
   * Every Ticket in the workspace, ordered by Effort then by sort order. Ids
   * resolve repo-wide, so callers that need one Effort filter this rather than
   * asking for a subset — at these volumes the whole set is the cheap answer.
   */
  listTickets(): Promise<readonly Ticket[]>;

  /**
   * Apply an edit to one Ticket and return it as written.
   *
   * `expectedRevision` is the {@link TicketSummary.revision} the caller last
   * read. The driver refuses the write if the stored Ticket has moved on since,
   * so a concurrent edit fails loudly instead of being clobbered. The write is
   * atomic: it either lands whole or not at all.
   */
  updateTicket(handle: string, edit: TicketEdit, expectedRevision: string): Promise<Ticket>;
}

/**
 * The mutation points on a Ticket, in the vocabulary rather than the storage
 * format. A field left out is left alone; `null` clears one that was set.
 *
 * `answer` is a body mutation point rather than a field — a Ticket body is
 * opaque apart from the three places the schema says are edited.
 */
export interface TicketEdit {
  readonly status?: Status;
  readonly claimedBy?: string | null;
  readonly claimedAt?: string | null;
  readonly answerGist?: string | null;
  readonly droppedReason?: string | null;
  readonly answer?: string;
}

/** Thrown when the stored Ticket moved on since the caller read it. */
export class RevisionMismatch extends Error {
  constructor(handle: string) {
    super(
      `${handle} changed on disk since it was read. Nothing was written — re-read it and retry.`,
    );
    this.name = 'RevisionMismatch';
  }
}

/** Thrown when the edit names a Ticket the workspace does not hold. */
export class NoSuchTicket extends Error {
  constructor(handle: string) {
    super(`No Ticket '${handle}' in this workspace.`);
    this.name = 'NoSuchTicket';
  }
}
