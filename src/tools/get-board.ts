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
/**
 * Warnings are grouped, not itemized. An unmigrated Effort can carry a dangling
 * Edge on nearly every Ticket, and a warnings block longer than the Board it
 * annotates would undo the saving the Board exists to deliver.
 */
function collectWarnings(board: Board): string[] {
  const warnings: string[] = [];
  const dangling = new Set<string>();
  const orphaned: string[] = [];
  const unrecognized: string[] = [];

  for (const ticket of board.tickets) {
    const id = ticket.id ?? `#${String(ticket.order)}`;

    for (const edge of ticket.blockedBy) {
      const blocker = board.byId.get(edge);

      if (blocker === undefined) dangling.add(edge);
      else if (blocker.status === 'dropped') orphaned.push(`${id} blocked_by ${edge}`);
    }

    if (ticket.unrecognizedStatus !== undefined) {
      unrecognized.push(`${id} "${ticket.unrecognizedStatus}"`);
    }
  }

  if (dangling.size > 0) {
    warnings.push(
      `dangling Edges (${String(dangling.size)}), pointing at no Ticket in this workspace: ` +
        [...dangling].toSorted().join(' '),
    );
  }
  if (orphaned.length > 0) {
    warnings.push(`blocked by a dropped Ticket, which never unblocks: ${orphaned.join(', ')}`);
  }
  if (unrecognized.length > 0) {
    warnings.push(`unrecognized status, read as open: ${unrecognized.join(', ')}`);
  }

  const legacy = board.tickets.filter(ticket => ticket.legacy);
  if (legacy.length > 0) {
    const unidentified = legacy.filter(ticket => ticket.id === undefined).length;
    const idNote =
      unidentified === 0
        ? ''
        : ` ${String(unidentified)} carry no id and cannot be fetched or blocked on until one is minted.`;

    warnings.push(
      `${String(legacy.length)}/${String(board.tickets.length)} Tickets are Legacy — title, ` +
        `status and Edges are inferred from prose.${idNote} Run migrate_effort to normalize.`,
    );
  }

  return warnings;
}
