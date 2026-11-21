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
 * it back; the `@<effort>` half is decoration, never input.
 */
export function bareIdOf(name: string): string | undefined {
  return /^([^@#]+)@[^@#]+$/.exec(name)?.[1];
}

export const STATUSES: readonly Status[] = ['open', 'claimed', 'resolved', 'dropped'];

export const KINDS: readonly Kind[] = ['build', 'decision'];

/**
 * A Ticket without its body — everything a Board line needs. Bodies are fetched
 * separately, so a Board never pays for prose it does not show.
 */
export interface TicketSummary {
  /**
   * Opaque, unique repo-wide, never reused or changed. Its shape is the storage
   * driver's to define. Absent on a Ticket named by where it lives instead.
   */
  readonly id: string | undefined;
  /**
   * What this Ticket is called. The id when it has one, which is global;
   * otherwise a name the driver derives from where the Ticket is stored, which
   * is local to its Effort and written `<effort>.<name>` from outside it.
   */
  readonly name: string;
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
  /**
   * Edges: the Tickets that must finish first, as stored. Each is a name in this
   * Effort, a full `<effort>.<name>`, or an id resolved repo-wide.
   */
  readonly blockedBy: readonly string[];
  /**
   * Tags, as written: no folding, trimming or deduplication. They mean nothing
   * to Status, Edges or the Frontier. Empty when the Ticket carries none.
   */
  readonly tags: readonly string[];
  /** The slug of the Effort that owns this Ticket. */
  readonly effort: string;
  /**
   * The numeric prefix of its filename, where the file has one. A hint that
   * breaks ties in Board order, never identity; a file the server wrote has none.
   */
  readonly orderHint: number | undefined;
  /**
   * Whether the fence carries a key outside the schema. Known from the scan, so
   * a Board can count these; the keys themselves travel only on {@link Ticket}.
   */
  readonly hasUnimportedKeys: boolean;
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
   * The file's own YAML for them, never re-serialized: only the unimported
   * entries, or the whole fence when one of them cannot be cut out cleanly.
   */
  readonly yaml: string;
  /** Whether {@link yaml} is the whole fence rather than the entries alone. */
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
  /**
   * What the Effort's known locations hold that is not a Ticket but should be
   * looked at: marked files excluded for a fault, unmarked files that look like
   * Tickets. Computed on every scan, never stored.
   */
  readonly diagnostics: readonly Diagnostic[];
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
  /** Replaces the tags outright. An empty list removes the key. */
  readonly tags?: readonly string[];
  /** Appended to the comment log, verbatim. Nothing is added around it. */
  readonly comment?: string;
  /** Acceptance criteria to tick, addressed by their text. */
  readonly tick?: readonly string[];
  /** Acceptance criteria to append unticked, one line each. Applied before {@link tick}. */
  readonly addCriteria?: readonly string[];
  /** Unimported frontmatter keys to delete. A schema key or an absent one fails the write. */
  readonly dropKeys?: readonly string[];
  /** Top-level keys outside the schema, each set to its JSON value whole. */
  readonly extra?: Readonly<Record<string, unknown>>;
}

/**
 * A Ticket asked for and not yet written.
 *
 * `name` is the caller's choice and becomes the Ticket's identity within its
 * Effort: sibling drafts declare Edges on it in the same call, and it is where
 * the driver stores the Ticket (ADR 0008).
 */
export interface TicketDraft {
  readonly name: string;
  readonly title: string;
  readonly kind: Kind;
  readonly type: string | undefined;
  readonly triage: TriageRole | undefined;
  /** Edges, as {@link TicketSummary.blockedBy} stores them. A sibling draft is named by its {@link name}. */
  readonly blockedBy: readonly string[];
  /** Written as given; none writes no key. */
  readonly tags: readonly string[];
  /** Top-level keys outside the schema, appended after the schema fields. */
  readonly extra: Readonly<Record<string, unknown>>;
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

/** What a {@link Diagnostic} does to the file it names. */
export type DiagnosticEffect = 'excluded' | 'suggestion';

/**
 * Why a file in a Ticket location is not a Ticket, or may be one left unmarked,
 * and what each does to its file. `excluded` codes name a marked file kept off
 * every Board, the Frontier, Edge resolution and every write; `suggestion`
 * names an unmarked file that looks like a Ticket. A file that is neither — a
 * README, notes — has none. The one list of codes.
 */
export const DIAGNOSTIC_EFFECTS = {
  'yaml-unparseable': 'excluded',
  'missing-key': 'excluded',
  'invalid-value': 'excluded',
  'ticket-outside-issues': 'excluded',
  'directory-in-issues': 'excluded',
  'symlinked-issues': 'excluded',
  'symlinked-header-doc': 'excluded',
  unreadable: 'excluded',
  'unmarked-ticket-like': 'suggestion',
} as const satisfies Record<string, DiagnosticEffect>;

export type DiagnosticCode = keyof typeof DIAGNOSTIC_EFFECTS;

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly effect: DiagnosticEffect;
  /** Workspace-root-relative, `/`-separated. */
  readonly file: string;
  /** The frontmatter key at fault, where one is. */
  readonly key?: string;
  readonly expected?: string;
  readonly found?: string;
  /** What to do by hand. The server never repairs a file. */
  readonly fix: string;
}

/** How a frontmatter value is checked: the marker's one value, a scalar, one of a list, or a list. */
export type FieldType = 'marker' | 'text' | 'enum' | 'list';

/**
 * One frontmatter key of a Ticket, as the validator enforces it. The driver
 * holds the list; the contract a caller is shown is that same list.
 */
export interface FieldDefinition {
  readonly key: string;
  readonly type: FieldType;
  /** Missing or blank excludes the file. */
  readonly required: boolean;
  /** The marker's one value, or an enum's values. */
  readonly values?: readonly string[];
  /** What each entry of a list names. */
  readonly items?: string;
  /** A list whose every entry must be a non-blank scalar; otherwise null and blank entries are dropped. */
  readonly nonBlankEntries?: boolean;
  /** Exactly what validation checks and how a value is read. */
  readonly checked: string;
  /** Guidance no validation enforces. */
  readonly convention?: string;
  /** What the example Ticket carries for it; a key without one is left out of the example. */
  readonly example?: string | readonly string[];
}

/** One supported path and what it is for. */
export interface LayoutPath {
  readonly path: string;
  readonly role: string;
}

/** A placement or file state the scan diagnoses, and the code it gets. */
export interface UnsupportedPlacement {
  readonly code: DiagnosticCode;
  readonly effect: DiagnosticEffect;
  readonly where: string;
}

/**
 * What a Ticket must be and where it must live, as the driver enforces it —
 * built from the definitions validation and the scan read, never copied.
 */
export interface TrackerContract {
  readonly fields: readonly FieldDefinition[];
  /** What a key outside {@link fields} is. */
  readonly unimported: string;
  /** Raised whenever a path, placement or rule below changes meaning. */
  readonly layoutVersion: number;
  readonly paths: readonly LayoutPath[];
  readonly unsupported: readonly UnsupportedPlacement[];
  readonly ignored: readonly string[];
  readonly symlinks: string;
  /** A Ticket file that validates, and the path it would sit at. */
  readonly example: { readonly path: string; readonly contents: string };
}
