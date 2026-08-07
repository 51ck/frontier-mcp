import { z } from 'zod';

import type { Ticket } from '../domain.ts';

export const getTicketsInputSchema = {
  ids: z.array(z.string()).min(1).describe('Ticket ids, e.g. ["T12", "T14"]. Resolved repo-wide.'),
  root: z.string().optional().describe('Workspace directory. Defaults to the session workspace.'),
};

export const getTicketsDescription =
  'Full bodies for a list of Ticket ids, in one call. Use after get_board, only for the ' +
  'Tickets you actually work.';

/**
 * Bodies verbatim, under a header carrying the fields a reader needs in hand
 * while reading one. Ids that resolve to nothing are named rather than dropped,
 * so a typo does not look like an empty Ticket.
 */
export function renderTickets(requested: readonly string[], found: readonly Ticket[]): string {
  const byId = new Map(found.map(entry => [entry.id, entry]));
  const blocks: string[] = [];
  const missing: string[] = [];

  for (const id of requested) {
    const ticket = byId.get(id);
    if (ticket === undefined) {
      missing.push(id);
      continue;
    }
    blocks.push(renderOne(ticket));
  }

  if (missing.length > 0) blocks.push(`not found: ${missing.join(' ')}`);

  return blocks.join('\n\n---\n\n');
}

function renderOne(ticket: Ticket): string {
  const fields = [
    `effort=${ticket.effort}`,
    `kind=${ticket.kind}`,
    `status=${ticket.status}`,
    ticket.triage === undefined ? undefined : `triage=${ticket.triage}`,
    ticket.blockedBy.length > 0 ? `blocked_by=${ticket.blockedBy.join(',')}` : undefined,
    ticket.legacy ? 'legacy' : undefined,
  ].filter(field => field !== undefined);

  return `# ${ticket.id ?? '(no id)'} — ${ticket.title}\n${fields.join('  ')}\n\n${ticket.body}`;
}
