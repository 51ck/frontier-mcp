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

export const STATUSES: readonly Status[] = ['open', 'claimed', 'resolved', 'dropped'];

/**
 * A Ticket without its body — everything a Board line needs. Bodies are fetched
 * separately, so a Board never pays for prose it does not show.
 */
export interface TicketSummary {
  /** `T<n>`, unique repo-wide. Absent on a Legacy Ticket that carries no id. */
  readonly id: string | undefined;
  /**
   * How to name this Ticket in a call. The id when it has one; otherwise
   * `<effort>#<order>`, which is the only handle an id-less Legacy Ticket has
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
   * A Ticket predating the schema, parsed best-effort. Its title, status, and
   * Edges are inferences an agent should distrust.
   */
  readonly legacy: boolean;
  /** The raw `Status:` text of a Legacy Ticket whose value did not map. */
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
  readonly status?: Status;
  readonly triage?: string | null;
  readonly claimedBy?: string | null;
  readonly claimedAt?: string | null;
  readonly answerGist?: string | null;
  readonly droppedReason?: string | null;
  readonly answer?: string;
  /** Appended to the comment log, verbatim. Nothing is added around it. */
  readonly comment?: string;
  /** Acceptance criteria to tick, addressed by their text. */
  readonly tick?: readonly string[];
}

/** The five roles `/triage` writes. A Status is never one of these. */
export const TRIAGE_ROLES = [
  'needs-triage',
  'needs-info',
  'ready-for-agent',
  'ready-for-human',
  'wontfix',
] as const;
