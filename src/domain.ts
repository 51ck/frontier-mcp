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
  readonly title: string;
  readonly kind: Kind;
  readonly status: Status;
  /** A `/triage` label. A separate field from {@link status}. */
  readonly triage: string | undefined;
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
}

/** A Ticket with its prose. */
export interface Ticket extends TicketSummary {
  readonly body: string;
}

/**
 * One Effort, as much of it as T1 knows: enough to choose an Effort without
 * opening it. Frontier size joins this in T2, when Tickets are parsed.
 */
export interface Effort {
  /** The Effort's identity. Unique within a workspace. */
  readonly slug: string;
  /** Which Header docs the Effort holds, `map` before `spec`. */
  readonly headerDocs: readonly HeaderDoc[];
  /** How many Tickets the Effort holds. */
  readonly ticketCount: number;
}
