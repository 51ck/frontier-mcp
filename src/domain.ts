/**
 * The vocabulary from CONTEXT.md, as types. Everything above the storage driver
 * speaks in these terms.
 */

/**
 * Which Header doc an Effort holds. An Effort has zero, one, or two — a Map, a
 * Spec, or a Map that later gained a Spec.
 *
 * Deliberately not named for a "kind": CONTEXT.md reserves Kind for a Ticket's
 * `build`/`decision` shape.
 */
export type HeaderDoc = 'map' | 'spec';

/** Which of the two shapes a Ticket is. */
export type Kind = 'build' | 'decision';

/** A Ticket's position in the graph's lifecycle. Owned by the server. */
export type Status = 'open' | 'claimed' | 'resolved' | 'dropped';

/**
 * The bare id inside a pasted `<id>@<effort>`, or undefined for any other name.
 * A Board renders a foreign blocker as `T9@beta` and the obvious next call pastes
 * it back; the `@<effort>` half is decoration, never input. A `#` on either side
 * is a handle, which is a different address.
 */
export function bareIdOf(name: string): string | undefined {
  return /^([^@#]+)@[^@#]+$/.exec(name)?.[1];
}

export const STATUSES: readonly Status[] = ['open', 'claimed', 'resolved', 'dropped'];

/**
 * A Ticket without its body — everything a Board line needs. Bodies are fetched
 * separately, so a Board never pays for prose it does not show.
 */
export interface TicketSummary {
  /**
   * Opaque, unique repo-wide, never reused or changed. Its shape is the storage
   * driver's to define. Absent on a Foreign Ticket that carries no id.
   */
  readonly id: string | undefined;
  /**
   * How to name this Ticket in a call. The id when it has one; otherwise
   * `<effort>#<order>`, which is the only handle an id-less Ticket has
   * until migration mints it a real one.
   */
  readonly handle: string;
  readonly title: string;
  readonly kind: Kind;
  /** `research` / `prototype` / `grilling` / `task`. Only when `kind` is `decision`. */
  readonly type: string | undefined;
  readonly status: Status;
  /** A `/triage` label. A separate field from {@link status}. */
  readonly triage: string | undefined;
  /** Required when resolved — the one line that makes a Board of finished work readable. */
  readonly answerGist: string | undefined;
  /** Required when dropped. What the Map's Out-of-scope section renders. */
  readonly droppedReason: string | undefined;
  /** Who holds the claim, and when they took it. Set together. */
  readonly claimedBy: string | undefined;
  readonly claimedAt: string | undefined;
  /** Edges: the Tickets that must finish first, as plain ids resolved repo-wide. */
  readonly blockedBy: readonly string[];
  /** The slug of the Effort that owns this Ticket. */
  readonly effort: string;
  /** Sort order within its Effort. Order only — never identity. */
  readonly order: number;
  /**
   * A Ticket whose file does not conform to the schema: no frontmatter fence, a
   * fence that does not parse, or a fence that parses but carries no `id` and at
   * least one key outside the schema. Conformance is evaluated on every read,
   * never provenance. Its title, status, and Edges are inferences an agent
   * should distrust. A fence with an `id` is never Foreign, whatever else it
   * holds; a status that will not map is flagged by `unrecognizedStatus` instead.
   */
  readonly foreign: boolean;
  /**
   * Foreign by its fence — one that parses, with no `id` and a key outside the
   * schema — rather than by having none. Its fields were read from that fence,
   * not inferred from prose. Never true unless {@link foreign} is.
   */
  readonly foreignFenced: boolean;
  /** The raw status text of a Ticket whose value did not map, fenced or prose. */
  readonly unrecognizedStatus: string | undefined;
  /** Sub-slice references (`T38.1`) coarsened to the Ticket that exists. */
  readonly collapsedRefs: readonly string[];
  /**
   * An opaque token for what was read. A write passes back the one it read and
   * is refused if the stored Ticket has moved on. The markdown driver builds it
   * from the file's modification time and size; another driver would use
   * whatever its store offers, so nothing above the seam may parse it.
   */
  readonly revision: string;
}

/** A Ticket with its prose. */
export interface Ticket extends TicketSummary {
  readonly body: string;
  /**
   * Unimported keys: frontmatter outside the schema, which the server reads
   * past and never writes. Carried on the body path only; undefined for every
   * conforming Ticket.
   */
  readonly unimported?: UnimportedFrontmatter;
}

export interface UnimportedFrontmatter {
  /** The top-level keys outside the schema, in file order. */
  readonly keys: readonly string[];
  /**
   * The file's own YAML for them, never re-serialized: a Foreign Ticket's
   * whole fence, otherwise only the unimported entries.
   */
  readonly yaml: string;
  /** Whether {@link yaml} is the whole fence, as it is for a Foreign Ticket. */
  readonly whole: boolean;
}

/**
 * One Effort: enough to choose one without opening it. Frontier size is not a
 * field — it is computed from the Tickets, like the Frontier itself.
 */
export interface Effort {
  /** The Effort's identity. Unique within a workspace. */
  readonly slug: string;
  /** Which Header docs the Effort holds, `map` before `spec`. */
  readonly headerDocs: readonly HeaderDoc[];
  /** How many Tickets the Effort holds. */
  readonly ticketCount: number;
  /**
   * Where this line of enquiry is going, from the Map's Destination. Absent
   * when the Effort has no Map, or a Map that has not been given one.
   */
  readonly destination: string | undefined;
  /**
   * The opening of the Effort's Spec. Not a Destination — a Spec has no such
   * section — but it is the orienting text a Spec-only Effort does have, and a
   * Board that opens with nothing leaves every Ticket line below uninterpretable.
   */
  readonly specOpening: string | undefined;
}

/**
 * The mutation points on a Ticket, in the vocabulary rather than the storage
 * format. A field left out is left alone; `null` clears one that was set.
 *
 * `answer` is a body mutation point rather than a field — a Ticket body is
 * opaque apart from the three places the schema says are edited.
 */
export interface TicketEdit {
  readonly title?: string;
  readonly kind?: Kind;
  readonly type?: string | null;
  readonly status?: Status;
  readonly triage?: TriageRole;
  readonly claimedBy?: string | null;
  readonly claimedAt?: string | null;
  readonly answerGist?: string | null;
  readonly droppedReason?: string | null;
  readonly answer?: string;
  /** Replaces the Edge list outright. An empty list clears it. */
  readonly blockedBy?: readonly string[];
  /** Appended to the comment log, verbatim. Nothing is added around it. */
  readonly comment?: string;
  /** Acceptance criteria to tick, addressed by their text. */
  readonly tick?: readonly string[];
}

/**
 * A Ticket asked for but not yet minted an id.
 *
 * `key` is the caller's own temporary name for this draft, and exists only for
 * the length of the call: sibling drafts declare Edges on it before any id
 * exists, which is what removes the create-then-wire second pass. It is never
 * stored, and never appears in a file.
 */
export interface TicketDraft {
  /**
   * The caller's temporary name. Never something the driver would accept as an
   * id — such a key could not be told apart from the real one an Edge might mean.
   */
  readonly key: string | undefined;
  readonly title: string;
  readonly kind: Kind;
  readonly type: string | undefined;
  readonly triage: TriageRole | undefined;
  /** Edges, each either a real Ticket id or a sibling draft's {@link key}. */
  readonly blockedBy: readonly string[];
  /** The prose, written verbatim. A draft with none produces a Ticket with none. */
  readonly body: string | undefined;
}

/** The five roles `/triage` writes. A Status is never one of these. */
export const TRIAGE_ROLES = [
  'needs-triage',
  'needs-info',
  'ready-for-agent',
  'ready-for-human',
  'wontfix',
] as const;

export type TriageRole = (typeof TRIAGE_ROLES)[number];

/**
 * A Map's typed sections, without Decisions-so-far — that section is derived
 * from resolved Tickets and never read from the file.
 */
export interface MapDocument {
  readonly destination: string | undefined;
  readonly notes: string | undefined;
  /** Fog patches under Not yet specified, in file order. */
  readonly notYetSpecified: readonly string[];
  /** Hand-ruled Out-of-scope items. Dropped Tickets are not here — they render. */
  readonly outOfScope: readonly string[];
  readonly revision: string;
}

/**
 * A section mutation on a Map. A field left out is left alone. Decisions-so-far
 * is never a field — it is regenerated from Tickets on every write.
 */
export interface MapEdit {
  readonly destination?: string;
  readonly notes?: string;
  /** Append a fog patch to Not yet specified. */
  readonly addFog?: string;
  /** Remove a fog patch matched on its text. Fails when none match. */
  readonly graduateFog?: string;
  /** Append a hand-ruled item to Out of scope. */
  readonly ruleOut?: string;
}

/**
 * A Spec as an opaque document. Nothing edits it section by section; the driver
 * stores the bytes and the tool layer may present them with framing the store
 * itself does not know about.
 */
export interface SpecDocument {
  /** Opaque Spec document as stored. */
  readonly body: string;
  readonly revision: string;
}

/** How a migration call may rewrite filenames. */
export interface MigrateOptions {
  /**
   * Report every change and write nothing. Planned mint ids come from the
   * current scan (`max + 1`) without taking allocation guards.
   */
  readonly preview: boolean;
  /**
   * Rename Ticket files to `<NN>-T<n>-<slug>.md`. Off by default so relative
   * links in Maps and Tickets keep resolving.
   */
  readonly rename: boolean;
}

/** One Ticket a migration would touch, or did. */
export interface MigrationChange {
  /** Handle before the call — the id when it had one, else `<effort>#<order>`. */
  readonly beforeHandle: string;
  /** Id after migration — preserved or newly minted. */
  readonly id: string;
  readonly title: string;
  /** True when this call (or preview) assigns a fresh id. */
  readonly minted: boolean;
  /** True when the file was Foreign: a fenceless one gains schema frontmatter, a fenced one an id. */
  readonly normalized: boolean;
  /**
   * Cosmetic Ticket filenames (basenames only) when rename would move the file.
   * Absent when filenames stay put. Not filesystem paths — those stay below the
   * storage seam.
   */
  readonly fromName: string | undefined;
  readonly toName: string | undefined;
  /** Edges as they will be written after bare sort-order remapping. */
  readonly blockedBy: readonly string[];
  /**
   * Preview only: every Ticket file already carrying this preserved id, this
   * one included. A real run refuses with DuplicateId instead.
   */
  readonly duplicateFiles: readonly string[] | undefined;
}

/** The result of migrating one Effort — enough for the tool to render a report. */
export interface MigrationReport {
  readonly effort: string;
  readonly preview: boolean;
  readonly renamed: boolean;
  readonly changes: readonly MigrationChange[];
  /** Written Edges landing on another Effort's Ticket, as `T9@beta` — likelier a misparse than intent. */
  readonly crossEffortEdges: readonly string[];
  /** Sub-slice references (`T1.4`) written as declared because their parent is not in this Effort. */
  readonly keptSubSlices: readonly string[];
}
