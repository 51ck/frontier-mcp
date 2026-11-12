import type { TicketSummary } from './domain.ts';

/**
 * The Frontier: the Tickets takeable right now — open, unblocked, unclaimed.
 * Computed on every read, never stored, because a stored frontier is a second
 * place for the truth to live.
 *
 * Edges resolve repo-wide, so this takes every Ticket in the workspace rather
 * than one Effort's: a Ticket can be blocked by one that lives elsewhere.
 */
export function frontierOf(all: readonly TicketSummary[]): ReadonlySet<TicketSummary> {
  const byId = claimantsById(all);

  return new Set(all.filter(ticket => isTakeable(ticket, byId)));
}

export function indexById(all: readonly TicketSummary[]): ReadonlyMap<string, TicketSummary> {
  const byId = new Map<string, TicketSummary>();

  for (const ticket of all) {
    // A Foreign Ticket may carry no id at all. The first id wins, which is only
    // good enough for naming an Edge's Effort: takeability and cycles weigh
    // every claimant through claimantsById.
    if (ticket.id !== undefined && !byId.has(ticket.id)) byId.set(ticket.id, ticket);
  }

  return byId;
}

/**
 * Every Ticket carrying each id. More than one is a duplicate, which the Board
 * warns about; anything deciding the graph must weigh every claimant, never
 * just the first scanned.
 */
export function claimantsById(
  all: readonly TicketSummary[],
): ReadonlyMap<string, readonly TicketSummary[]> {
  const byId = new Map<string, TicketSummary[]>();

  for (const ticket of all) {
    if (ticket.id === undefined) continue;
    const claimants = byId.get(ticket.id) ?? [];
    claimants.push(ticket);
    byId.set(ticket.id, claimants);
  }

  return byId;
}

/** The Edges leaving an id: those of every Ticket carrying it. */
export function edgesOfClaimants(
  byId: ReadonlyMap<string, readonly TicketSummary[]>,
  id: string,
): readonly string[] {
  return (byId.get(id) ?? []).flatMap(ticket => ticket.blockedBy);
}

/**
 * Status and Edges decide this, and nothing else. A Triage role never does:
 * `/triage` and the graph must not compete for one field, so a Ticket labelled
 * `wontfix` still counts as takeable here and the Board says so in its
 * warnings, leaving the judgement to the reader.
 */
function isTakeable(
  ticket: TicketSummary,
  byId: ReadonlyMap<string, readonly TicketSummary[]>,
): boolean {
  if (ticket.status !== 'open') return false;
  if (ticket.unrecognizedStatus !== undefined) return false;
  // Every write to a duplicated id is refused, so neither claimant can be taken.
  if (ticket.id !== undefined && (byId.get(ticket.id)?.length ?? 0) > 1) return false;

  // An Edge to a duplicated id is satisfied only when every claimant is
  // resolved, so a duplicate can never make the Frontier larger.
  return ticket.blockedBy.every(id => {
    const claimants = byId.get(id) ?? [];
    return claimants.length > 0 && claimants.every(blocker => blocker.status === 'resolved');
  });
}
