import type { TicketSummary } from './domain.ts';
import { indexNames, type Names } from './names.ts';

/**
 * The Frontier: the Tickets takeable right now — open, unblocked, unclaimed.
 * Computed on every read, never stored, because a stored frontier is a second
 * place for the truth to live.
 *
 * An Edge can lead into another Effort, so this takes every Ticket in the
 * workspace rather than one Effort's.
 */
export function frontierOf(
  all: readonly TicketSummary[],
  names: Names = indexNames(all),
): ReadonlySet<TicketSummary> {
  return new Set(all.filter(ticket => isTakeable(ticket, names)));
}

/**
 * Status and Edges decide this, and nothing else. A Triage role never does:
 * `/triage` and the graph must not compete for one field, so a Ticket labelled
 * `wontfix` still counts as takeable here and the Board says so in its
 * warnings, leaving the judgement to the reader.
 */
function isTakeable(ticket: TicketSummary, names: Names): boolean {
  if (ticket.status !== 'open') return false;
  // Every write to a duplicated name is refused, so neither claimant can be taken.
  if (names.claimants(ticket).length > 1) return false;

  // An Edge to a duplicated name is satisfied only when every claimant is
  // resolved, so a duplicate can never make the Frontier larger.
  return ticket.blockedBy.every(edge => {
    const claimants = names.edge(edge, ticket.effort);
    return claimants.length > 0 && claimants.every(blocker => blocker.status === 'resolved');
  });
}
