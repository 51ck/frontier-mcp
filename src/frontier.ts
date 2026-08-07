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
  const byId = indexById(all);

  return new Set(all.filter(ticket => isTakeable(ticket, byId)));
}

export function indexById(all: readonly TicketSummary[]): ReadonlyMap<string, TicketSummary> {
  const byId = new Map<string, TicketSummary>();

  for (const ticket of all) {
    // A Legacy Ticket may carry no id at all, and the first id wins so that a
    // duplicate cannot silently displace the Ticket already answering to it.
    if (ticket.id !== undefined && !byId.has(ticket.id)) byId.set(ticket.id, ticket);
  }

  return byId;
}

/**
 * Status and Edges decide this, and nothing else. A Triage role never does:
 * `/triage` and the graph must not compete for one field, so a Ticket labelled
 * `wontfix` still counts as takeable here and the Board says so in its
 * warnings, leaving the judgement to the reader.
 */
function isTakeable(ticket: TicketSummary, byId: ReadonlyMap<string, TicketSummary>): boolean {
  if (ticket.status !== 'open') return false;

  return ticket.blockedBy.every(id => byId.get(id)?.status === 'resolved');
}
