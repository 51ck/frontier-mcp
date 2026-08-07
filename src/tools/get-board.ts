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

  // Header-doc prose is the author's, wrapped however they wrote it. Indenting
  // continuation lines keeps a multi-paragraph Destination from being read as
  // more Ticket lines, which are strictly one per line.
  if (effort.destination !== undefined) lines.push(labelled('destination', effort.destination));
  else if (effort.specOpening !== undefined) lines.push(labelled('spec', effort.specOpening));

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

function labelled(label: string, prose: string): string {
  return `${label}: ${prose.split('\n').join('\n  ')}`;
}

function renderLine(ticket: TicketSummary, board: Board): string {
  const parts = [
    ticket.handle,
    ticket.title,
    `${ticket.kind}/${ticket.status}`,
    ticket.triage === undefined ? undefined : `triage=${ticket.triage}`,
    ticket.blockedBy.length > 0
      ? `blocked_by=${ticket.blockedBy.map(id => renderEdge(id, ticket, board)).join(',')}`
      : undefined,
    ticket.answerGist === undefined ? undefined : `gist=${ticket.answerGist}`,
    ticket.droppedReason === undefined ? undefined : `dropped=${ticket.droppedReason}`,
    ticket.claimedBy === undefined ? undefined : `claimed_by=${ticket.claimedBy}`,
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
 *
 * Every warning is grouped, never itemized per Ticket. An Effort of Legacy
 * Tickets can carry a dangling Edge on nearly every one of them, and a warnings
 * block longer than the Board it annotates would undo the saving the Board
 * exists to deliver.
 */
function collectWarnings(board: Board): string[] {
  const warnings: string[] = [];
  const dangling = new Set<string>();
  const orphaned = new Set<string>();
  const unrecognized = new Set<string>();
  const collapsed = new Set<string>();

  for (const ticket of board.tickets) {
    for (const edge of ticket.blockedBy) {
      const blocker = board.byId.get(edge);

      if (blocker === undefined) dangling.add(edge);
      else if (blocker.status === 'dropped') orphaned.add(ticket.handle);
    }

    if (ticket.unrecognizedStatus !== undefined) unrecognized.add(ticket.handle);
    for (const ref of ticket.collapsedRefs) collapsed.add(ref);
  }

  if (dangling.size > 0) {
    warnings.push(
      `dangling Edges (${String(dangling.size)}), pointing at no Ticket in this workspace: ` +
        [...dangling].toSorted().join(' '),
    );
  }
  if (orphaned.size > 0) {
    warnings.push(
      `blocked by a dropped Ticket, which never unblocks (${String(orphaned.size)}): ` +
        [...orphaned].toSorted().join(' '),
    );
  }
  if (unrecognized.size > 0) {
    warnings.push(
      `unrecognized status, read as open (${String(unrecognized.size)}): ` +
        [...unrecognized].toSorted().join(' '),
    );
  }
  if (collapsed.size > 0) {
    warnings.push(
      `sub-slice Edges coarsened to their parent Ticket (${String(collapsed.size)}): ` +
        [...collapsed].toSorted().join(' '),
    );
  }

  const legacy = board.tickets.filter(ticket => ticket.legacy);
  if (legacy.length > 0) {
    const unidentified = legacy.filter(ticket => ticket.id === undefined).length;
    const idNote =
      unidentified === 0
        ? ''
        : ` ${String(unidentified)} carry no id — fetch those by the <effort>#<order> handle shown, ` +
          'and note nothing can declare an Edge on them until migration mints one.';

    warnings.push(
      `${String(legacy.length)}/${String(board.tickets.length)} Tickets are Legacy — title, ` +
        `status and Edges are inferred from prose.${idNote} Run migrate_effort to normalize.`,
    );
  }

  return warnings;
}
