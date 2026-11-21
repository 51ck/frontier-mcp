import { bareIdOf } from '../domain.ts';
import type {
  Diagnostic,
  Effort,
  MapDocument,
  MapEdit,
  SpecDocument,
  Ticket,
  TicketDraft,
  TicketEdit,
  TicketSummary,
  TrackerContract,
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
   * Called with the workspace as the driver reads it immediately before
   * writing; the drafts it returns are the ones written, in place of those
   * passed. Throwing abandons the batch and nothing is created — not the
   * Tickets, and not the Effort either.
   *
   * It exists because the rules above the seam were first applied to a scan
   * that may be stale: a name taken since, a dangling Edge that the new name
   * would close into a loop, or what an Edge's stored form now resolves to, is
   * only visible here.
   */
  readonly settle?: (tickets: readonly TicketSummary[]) => readonly TicketDraft[];
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
 *
 * A driver is the workspace *cached and live*, not a bare set of queries.
 * Whether to hold a scan, when it goes stale, and how it hears that another
 * process wrote are all answers about one physical model — the markdown driver
 * caches a full walk and watches a directory; a SQLite driver would query and
 * let its own page cache do the work. A layer above the seam deciding any of
 * this for both of them is one model's policy wearing a generic interface, so
 * there is no such layer. Callers see none of it: every method answers as
 * though it had just read.
 */
export interface DirectoryDiagnostics {
  readonly slug: string;
  readonly effort: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export interface StorageDriver {
  /**
   * Every Effort in the workspace, ordered by slug. A workspace holding no
   * Efforts yields an empty list; that is not an error.
   */
  listEfforts(): Promise<readonly Effort[]>;

  /**
   * Every Ticket in the workspace without its body, ordered by Effort, then by
   * filename prefix where there is one, then by name. Ids resolve repo-wide, so callers that need one Effort filter
   * this rather than asking for a subset — at these volumes the whole set is the
   * cheap answer, and it stays cheap only because no body rides along.
   */
  listTickets(): Promise<readonly TicketSummary[]>;

  /**
   * What is wrong with the workspace as a whole rather than with one Ticket —
   * duplicated ids and names, configuration the driver no longer reads — for a
   * Board to show with its other warnings. None of them refuses a write by
   * itself: a write addressed to a duplicate is refused where it is addressed.
   */
  workspaceWarnings(): readonly string[];

  /**
   * How a reader would name this workspace's storage when it does not exist at
   * all — the markdown driver's `.scratch/` — and undefined when it exists,
   * empty or not. Never creates it: a read must leave a bare repository bare.
   */
  absentStorage(): string | undefined;

  /**
   * Refuses as a write addressed to `handle` would refuse before it reads the
   * Ticket — {@link DuplicateId} when more than one Ticket answers to it,
   * `AmbiguousName` for a bare name several Efforts have — and never
   * writes. Lets a caller put that refusal ahead of its own rules.
   */
  assertAddressable(handle: string): Promise<void>;

  /**
   * For each handle, the Diagnostics of every diagnosed file that would answer
   * to it were it a Ticket — its id, its full `<effort>.<name>`, or its bare
   * name — from one fresh read for the whole call. A handle nothing diagnosed
   * answers to maps to an empty list. Never writes.
   */
  diagnosticsFor(handles: readonly string[]): Promise<ReadonlyMap<string, readonly Diagnostic[]>>;

  /**
   * What a Ticket must be and where it must live, built from the definitions
   * this driver's validation and scan read. Never touches the workspace.
   */
  contract(): TrackerContract;

  /**
   * Every Diagnostic in the workspace from one fresh read, grouped by the
   * directory under the storage root it was found in. `effort` is false for a
   * directory scanned only because it holds a marked file outside `issues/`,
   * which is no Effort. Never writes.
   */
  trackerDiagnostics(): Promise<readonly DirectoryDiagnostics[]>;

  /**
   * The named Tickets with their bodies, each addressed as `Names.input`
   * resolves it: an id, a full `<effort>.<name>`, or a bare name one Effort
   * alone has. A name the workspace does not hold is absent from `tickets`
   * and keyed in `diagnostics` with what {@link diagnosticsFor} would answer
   * for it, from the same fresh read, so a mixed call walks once. A bare name
   * several Efforts have throws `AmbiguousName`. `all` is every Ticket of
   * that same read, so what the graph says about a body's Ticket — what it
   * blocks — comes from the read the body did, not from a second one.
   *
   * Separate from {@link listTickets} because a body is the one field almost
   * nothing reads — Boards, the Frontier and Edge resolution all work from
   * summary fields — so bodies are fetched for the few Tickets being worked
   * rather than carried by every read of the workspace.
   */
  readTickets(handles: readonly string[]): Promise<{
    readonly tickets: readonly Ticket[];
    readonly diagnostics: ReadonlyMap<string, readonly Diagnostic[]>;
    readonly all: readonly TicketSummary[];
  }>;

  /**
   * Apply an edit to one Ticket and return it as written.
   *
   * `expectedRevision` is the {@link TicketSummary.revision} the caller last
   * read. The driver refuses the write if the stored Ticket has moved on since,
   * so a concurrent edit fails loudly instead of being clobbered. The write is
   * atomic: it either lands whole or not at all.
   *
   * Resolving or dropping also refreshes the Map's derived blocks. That refresh
   * is best-effort: a failure after the Ticket write still returns success, with
   * a warning that Decisions-so-far / dropped Out-of-scope may be stale.
   *
   * `settle`, when given, is called with the workspace as the driver reads it
   * immediately before writing, and the edit it returns is the one applied in
   * place of `edit`. It is for an edit that depends on Tickets other than this
   * one — its Edges — which `expectedRevision` does not guard. Throwing
   * abandons the write.
   */
  updateTicket(
    handle: string,
    edit: TicketEdit,
    expectedRevision: string,
    settle?: (tickets: readonly TicketSummary[]) => TicketEdit,
  ): Promise<TicketWriteResult>;

  /**
   * Create a whole set of Tickets in one Effort and return them as written, in
   * the order asked for.
   *
   * The batch is the unit for a reason: sibling drafts name each other in their
   * Edges, and either all of them are created or none. Splitting this into a
   * create call and a wire-them-up call is the second pass this exists to delete.
   *
   * Each Ticket is stored under its {@link TicketDraft.name} and given no id. A
   * name is created exclusively, so of two sessions in separate processes
   * creating one name in one Effort at the same instant exactly one succeeds
   * and the other gets {@link TicketAlreadyExists}.
   */
  createTickets(
    effort: string,
    drafts: readonly TicketDraft[],
    options: CreateOptions,
  ): Promise<readonly TicketSummary[]>;

  /**
   * The Map's typed sections for one Effort. Decisions-so-far is not here — it
   * is derived from Tickets and never read from the file.
   */
  readMap(effort: string): Promise<MapDocument>;

  /**
   * Apply a section edit to a Map and regenerate its derived blocks. Reads go
   * through {@link readMap} — the tool layer never uses an empty edit as a
   * refresh; resolve/drop refresh the derived blocks on their own path.
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

  /**
   * Release whatever this driver holds open to stay live — the markdown
   * driver's filesystem watcher, a connection for a driver that has one. Reads
   * and writes are not expected after it, and a driver that holds nothing may
   * do nothing.
   *
   * Synchronous, because closing is: an `FSWatcher` closes synchronously and so
   * does `node:sqlite`. Widening it to a promise the day a driver needs one is
   * a change to this line and to the one caller that closes them all.
   */
  close(): void;
}

/** A Ticket write, plus any non-fatal warnings that rode along. */
export interface TicketWriteResult {
  readonly ticket: TicketSummary;
  readonly warnings: readonly string[];
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
  constructor(handle: string, where = 'this workspace') {
    const bare = bareIdOf(handle);
    super(
      bare === undefined
        ? `No Ticket '${handle}' in ${where}.`
        : `No Ticket '${handle}' in ${where}. Ids resolve repo-wide, so the ` +
            `'@<effort>' a Board shows is decoration — name it '${bare}'.`,
    );
    this.name = 'NoSuchTicket';
  }
}

/**
 * Thrown when a write is addressed to an id more than one Ticket carries, or to
 * a name more than one file of an Effort reduces to. Which of them the caller
 * means cannot be told, and picking one is how a duplicate becomes two Tickets
 * with diverged content. Nothing renumbers or renames either one: a new id
 * cannot reach the commit messages and PR bodies already naming the old.
 */
export class DuplicateId extends Error {
  constructor(id: string, files: readonly string[], kind: 'id' | 'name' = 'id') {
    super(
      `Nothing was written: ${id} is carried by ${String(files.length)} Ticket files — ` +
        `${files.join(', ')} — so which one is meant cannot be told. ` +
        (kind === 'id'
          ? 'Give all but one a new id by hand; FrontierMCP never renumbers.'
          : 'Rename all but one file by hand; FrontierMCP never renames one.'),
    );
    this.name = 'DuplicateId';
  }
}

/** Thrown when a creation names an Effort that does not exist and may not be made. */
export class TicketAlreadyExists extends Error {
  constructor(effort: string, name: string) {
    super(
      `${effort}.${name} could not be created: a file already holds its path, written by ` +
        'another session or under another name. Nothing was created.',
    );
    this.name = 'TicketAlreadyExists';
  }
}

/**
 * Thrown when a refused batch could not take back everything it had written,
 * because another session changed one of its Tickets in the meantime. Removing
 * that file would destroy the other session's write, so it stays.
 */
export class BatchNotUndone extends Error {
  constructor(cause: Error, remaining: readonly string[]) {
    const [verb, pronoun] = remaining.length === 1 ? ['remains', 'it'] : ['remain', 'them'];
    super(
      `${cause.message.replace(/ Nothing was created\.$/, '')} The batch was not fully undone: ` +
        `${remaining.join(', ')} ${verb} on disk, because another session changed ${pronoun} ` +
        'after this call created it. Every other Ticket of the batch was removed.',
    );
    this.name = 'BatchNotUndone';
  }
}

/**
 * Thrown when a write would leave a file the scan would not read as a Ticket —
 * a blank title, or a marker an anchor tied to an edited field. Checked on the
 * text about to be written, with the scan's own validator, before anything is
 * staged or renamed.
 */
/** Thrown when a value to replace or remove holds an anchor another field of the fence aliases. */
export class AliasedValue extends Error {
  constructor(key: string, anchor: string) {
    super(
      `Nothing was written: ${key} holds the anchor &${anchor}, which another field of this ` +
        `Ticket's frontmatter aliases. Replace the alias with its value by hand, then retry.`,
    );
    this.name = 'AliasedValue';
  }
}

export class WriteWouldExclude extends Error {
  constructor(handle: string, problems: readonly string[]) {
    super(
      `Nothing was written: ${handle} would not read back as a valid Ticket — ${problems.join('; ')}.`,
    );
    this.name = 'WriteWouldExclude';
  }
}

/**
 * Thrown when a file a write would edit is not valid UTF-8. Decoding it would
 * replace the invalid bytes, so writing it back would change bytes the edit
 * never touched; it is refused instead. Reads stay lenient.
 */
export class FileNotUtf8 extends Error {
  constructor(file: string) {
    super(`Nothing was written: ${file} is not valid UTF-8. Repair its encoding by hand.`);
    this.name = 'FileNotUtf8';
  }
}

/** Thrown when the storage cannot hold a new Ticket the way creation needs it held. */
export class TicketStorageUnusable extends Error {
  constructor(problem: string) {
    super(`${problem} Nothing was created.`);
    this.name = 'TicketStorageUnusable';
  }
}

/**
 * Thrown when an Effort slug from a caller could not be one directory name
 * inside the storage directory. Checked before any path is built from it: a
 * slug that climbs or nests would read and write outside the Effort it claims
 * to name — outside the workspace altogether, for `..`.
 */
export class InvalidEffortSlug extends Error {
  constructor(slug: string) {
    super(
      `${JSON.stringify(slug)} is not an Effort slug. A slug is one directory name: not empty, ` +
        'not starting with a dot, and holding no path separator or control character.',
    );
    this.name = 'InvalidEffortSlug';
  }
}

/**
 * Thrown when a caller's Effort directory is a symbolic link. Only the storage
 * directory itself is followed: a linked Effort would serve, and take writes
 * into, a directory outside the storage root, so it is not an Effort at all.
 */
export class SymlinkedEffort extends Error {
  constructor(slug: string) {
    super(
      `'${slug}' is a symbolic link, and an Effort is only served from a real directory. ` +
        'Replace the link with the directory itself by hand. Nothing was read or written.',
    );
    this.name = 'SymlinkedEffort';
  }
}

export class SymlinkedHeaderDoc extends Error {
  constructor(slug: string, filename: string) {
    super(
      `'${slug}/${filename}' is a symbolic link, and a Header doc is only served from a real file. ` +
        'Replace the link with the file itself by hand. Nothing was read or written.',
    );
    this.name = 'SymlinkedHeaderDoc';
  }
}

export class EffortSpelledDifferently extends Error {
  constructor(slug: string, existing: string) {
    super(
      `No Effort '${slug}', but there is '${existing}', which differs only by case. Names ` +
        `compare without regard to case, so a second Effort beside it would duplicate its ` +
        `Tickets' names. Pass '${existing}'. Nothing was created.`,
    );
    this.name = 'EffortSpelledDifferently';
  }
}

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

/** Thrown when a Map value holds text the Map reader would take as structure rather than prose. */
export class SectionBreakInValue extends Error {
  constructor(argument: string, line: string, kind: 'heading' | 'marker' = 'heading') {
    super(
      kind === 'heading'
        ? `Nothing was written: ${argument} cannot contain a level-2 heading ('${line}') — it ` +
            'would split off as its own section. Use ### or deeper.'
        : `Nothing was written: ${argument} cannot contain a GENERATED marker ('${line}') — the ` +
            'server owns those blocks and would hide or overwrite the text beside one.',
    );
    this.name = 'SectionBreakInValue';
  }
}

/** Thrown when an `add_fog` or `rule_out` value spans lines: a bullet is one line to the reader. */
export class MultiLineBullet extends Error {
  constructor(argument: string) {
    super(
      `Nothing was written: ${argument} must be a single line — a newline would split the ` +
        'bullet, and the lines after the first could never be removed by value.',
    );
    this.name = 'MultiLineBullet';
  }
}

/** Thrown when `drop_keys` names a key the schema imports — those change through their own arguments. */
export class SchemaKeyNotDroppable extends Error {
  constructor(keys: readonly string[]) {
    super(
      `Nothing was written: ${keys.join(', ')} ${keys.length === 1 ? 'is a schema key' : 'are schema keys'}. ` +
        'drop_keys removes only Unimported frontmatter.',
    );
    this.name = 'SchemaKeyNotDroppable';
  }
}

/** Thrown when `drop_keys` names a key the Ticket's frontmatter does not carry. */
export class NoSuchKey extends Error {
  constructor(keys: readonly string[]) {
    super(`Nothing was written: no frontmatter key ${keys.map(key => `'${key}'`).join(', ')}.`);
    this.name = 'NoSuchKey';
  }
}

/**
 * Thrown when cutting the named keys out of the fence would not leave exactly
 * the other keys behind — another entry aliases an anchor in a dropped one, or
 * shares its line in a flow mapping.
 */
export class KeyNotCleanlyDroppable extends Error {
  constructor(keys: readonly string[]) {
    super(
      `Nothing was written: ${keys.map(key => `'${key}'`).join(', ')} cannot be cut out without ` +
        'damaging the rest of the frontmatter — another entry refers to it or shares its line. ' +
        'Remove it by hand.',
    );
    this.name = 'KeyNotCleanlyDroppable';
  }
}

/** Thrown when `drop_keys` is addressed to a Ticket with no parseable frontmatter to drop from. */
export class NoFrontmatterToDrop extends Error {
  constructor() {
    super(
      'Nothing was written: this Ticket has no parseable frontmatter, so it has no keys to drop.',
    );
    this.name = 'NoFrontmatterToDrop';
  }
}

/** Thrown when an extra key is a schema key or `extra` itself. The tool layer refuses first, naming the argument. */
export class ExtraKeyReserved extends Error {
  constructor(key: string) {
    super(`Nothing was written: ${key} is reserved and cannot be written as an extra key.`);
    this.name = 'ExtraKeyReserved';
  }
}

/** Thrown when an extra value, as written to the fence, would not read back as the value given. */
export class ExtraDoesNotReadBack extends Error {
  constructor(key: string) {
    super(
      `Nothing was written: extra.${key} would not read back from the frontmatter as the value given.`,
    );
    this.name = 'ExtraDoesNotReadBack';
  }
}

/**
 * Thrown when replacing, adding or removing the named entries as text would
 * not leave every other entry reading as it did, or the named ones reading as
 * given. The fence is edited entry by entry and never re-rendered whole, so
 * the write is refused rather than landed some other way.
 */
export class FenceNotCleanlyEditable extends Error {
  constructor(keys: readonly string[]) {
    super(
      `Nothing was written: ${keys.map(key => `'${key}'`).join(', ')} cannot be written into the ` +
        'frontmatter without changing how another entry reads. Edit it by hand.',
    );
    this.name = 'FenceNotCleanlyEditable';
  }
}
