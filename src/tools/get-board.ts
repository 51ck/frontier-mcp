import { z } from 'zod';

import type { Effort, TicketSummary } from '../domain.ts';

export const getBoardInputSchema = {
  effort: z.string().describe('Effort slug, as reported by list_efforts.'),
  root: z.string().optional().describe('Workspace directory. Defaults to the session workspace.'),
};

export const getBoardDescription =
  "An Effort's Destination, then one line per Ticket — id, title, kind, status, Edges — with the " +
  'Frontier marked. Never returns bodies; fetch those with get_tickets.';

export interface Board {
  readonly effort: Effort;
  readonly tickets: readonly TicketSummary[];
  /** The Tickets takeable right now. Computed repo-wide; never read from a file. */
  readonly frontier: ReadonlySet<TicketSummary>;
}

/**
 * One line per Ticket, and nothing an agent has to open a file to interpret.
 * The whole point is that this costs a fraction of reading the Effort, so every
 * character here is spent deliberately.
 */
export function renderBoard(board: Board): string {
  const { effort, tickets, frontier } = board;
  const lines = [`effort: ${effort.slug}`];

  if (effort.destination !== undefined) lines.push(`destination: ${effort.destination}`);

  if (tickets.length === 0) {
    lines.push('', '(no tickets)');
    return lines.join('\n');
  }

  const takeable = tickets.filter(ticket => frontier.has(ticket));
  lines.push(
    takeable.length === 0
      ? 'frontier: none takeable in this Effort'
      : `frontier: ${takeable.length} marked >`,
    '',
  );

  for (const ticket of tickets) {
    lines.push(frontier.has(ticket) ? `> ${renderLine(ticket)}` : renderLine(ticket));
  }

  return lines.join('\n');
}

function renderLine(ticket: TicketSummary): string {
  const parts = [
    ticket.id ?? '(no id)',
    ticket.title,
    `${ticket.kind}/${ticket.status}`,
    ticket.blockedBy.length > 0 ? `blocked_by=${ticket.blockedBy.join(',')}` : undefined,
  ].filter(part => part !== undefined);

  return parts.join('  ');
}
