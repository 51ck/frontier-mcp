import type {
  Effort,
  MapDocument,
  MapEdit,
  SpecDocument,
  Ticket,
  TicketDraft,
  TicketEdit,
} from '../domain.ts';

export type { MapDocument, MapEdit, SpecDocument, TicketDraft, TicketEdit };

export interface CreateOptions {
  /**
   * Create the Effort rather than failing when the workspace does not hold it.
   * Off by default, so starting work is one deliberate call while a mistyped
   * slug never silently forks an Effort.
   */
  readonly createEffort: boolean;
  /**
   * Called with the ids about to be written, in draft order, and the workspace
   * as it looks under those reservations. Runs before anything lands, so
   * throwing abandons the batch and nothing is created — not the Tickets, and
   * not the Effort either.
   *
   * It exists for the rules that cannot be checked until the ids are real. A
   * cycle is the one that matters: a Ticket already on disk may declare an Edge
   * on an id nobody has minted yet, which the Board reports as dangling — and
   * minting exactly that id is the moment it becomes a loop. Nothing above the
   * seam can see that coming, because nothing above the seam knows what the
   * next id will be.
   */
  readonly validate?: (ids: readonly string[], tickets: readonly Ticket[]) => void;
}

/**
 * Whether a Header-doc write may start an Effort that does not yet exist.
 * Off by default — same reason as {@link CreateOptions.createEffort}.
 */
export interface HeaderDocOptions {
  readonly createEffort: boolean;
}

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

  /**
   * Create a whole set of Tickets in one Effort and return them as written, in
   * the order asked for.
   *
   * The batch is the unit for a reason: the driver mints every id, resolves
   * every {@link TicketDraft.key} an Edge names into the id it was given, and
   * either creates all of them or none. Splitting this into a create call and a
   * wire-them-up call is the second pass this exists to delete.
   *
   * Ids are unique across the whole workspace, and stay unique when two sessions
   * in separate processes create at the same instant.
   */
  createTickets(
    effort: string,
    drafts: readonly TicketDraft[],
    options: CreateOptions,
  ): Promise<readonly Ticket[]>;

  /**
   * The Map's typed sections for one Effort. Decisions-so-far is not here — it
   * is derived from Tickets and never read from the file.
   */
  readMap(effort: string): Promise<MapDocument>;

  /**
   * Apply a section edit to a Map and regenerate its derived blocks. An empty
   * edit is a no-op write that still refreshes Decisions-so-far and dropped
   * Tickets into Out of scope.
   */
  editMap(
    effort: string,
    edit: MapEdit,
    expectedRevision: string | undefined,
    options: HeaderDocOptions,
  ): Promise<MapDocument>;

  /** A Spec as an opaque document. Absent when the Effort has none. */
  readSpec(effort: string): Promise<SpecDocument>;

  /** Replace a Spec wholesale with opaque document bytes. */
  putSpec(
    effort: string,
    body: string,
    expectedRevision: string | undefined,
    options: HeaderDocOptions,
  ): Promise<SpecDocument>;
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

/** Thrown when a creation names an Effort that does not exist and may not be made. */
export class NoSuchEffort extends Error {
  constructor(slug: string) {
    super(`No Effort '${slug}' in this workspace. Pass create to start it.`);
    this.name = 'NoSuchEffort';
  }
}

/** Thrown when a Map operation names an Effort that holds no Map. */
export class NoSuchMap extends Error {
  constructor(slug: string) {
    super(`No Map for Effort '${slug}'.`);
    this.name = 'NoSuchMap';
  }
}

/** Thrown when a Spec operation names an Effort that holds no Spec. */
export class NoSuchSpec extends Error {
  constructor(slug: string) {
    super(`No Spec for Effort '${slug}'.`);
    this.name = 'NoSuchSpec';
  }
}

/** Thrown when graduating a fog patch that the Map does not hold. */
export class NoSuchFogPatch extends Error {
  constructor(patch: string) {
    super(`No fog patch matching '${patch}' under Not yet specified.`);
    this.name = 'NoSuchFogPatch';
  }
}
