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
