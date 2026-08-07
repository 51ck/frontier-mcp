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
  /** Every Ticket in the workspace, because Edges resolve repo-wide. */
  readonly byId: ReadonlyMap<string, TicketSummary>;
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
    const line = renderLine(ticket, board);
    lines.push(frontier.has(ticket) ? `> ${line}` : line);
  }

  const warnings = collectWarnings(board);
  if (warnings.length > 0) lines.push('', 'warnings:', ...warnings.map(entry => `  ${entry}`));

  return lines.join('\n');
}

function renderLine(ticket: TicketSummary, board: Board): string {
  const parts = [
    ticket.id ?? '(no id)',
    ticket.title,
    `${ticket.kind}/${ticket.status}`,
    ticket.blockedBy.length > 0
      ? `blocked_by=${ticket.blockedBy.map(id => renderEdge(id, ticket, board)).join(',')}`
      : undefined,
  ].filter(part => part !== undefined);

  return parts.join('  ');
}

/**
 * An Edge is a plain id. A blocker living in another Effort is annotated with
 * its owning Effort so it stays followable — there is no compound reference
 * form to carry that, and without it a foreign blocker is a dead end.
 */
function renderEdge(id: string, from: TicketSummary, board: Board): string {
  const blocker = board.byId.get(id);
  if (blocker === undefined) return `${id}?`;

  return blocker.effort === from.effort ? id : `${id}@${blocker.effort}`;
}

/**
 * Broken Edges surface here rather than through a separate validation tool,
 * because a validation tool nobody calls is a validator that does not exist.
 */
function collectWarnings(board: Board): string[] {
  const warnings: string[] = [];

  for (const ticket of board.tickets) {
    const id = ticket.id ?? '(no id)';

    for (const edge of ticket.blockedBy) {
      const blocker = board.byId.get(edge);

      if (blocker === undefined) {
        warnings.push(`${id} blocked_by ${edge} — no such Ticket`);
      } else if (blocker.status === 'dropped') {
        warnings.push(`${id} blocked_by ${edge} — which was dropped, so it never unblocks`);
      }
    }
  }

  return warnings;
}
