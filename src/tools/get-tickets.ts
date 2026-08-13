import { z } from 'zod';

import type { Ticket } from '../domain.ts';

export const getTicketsInputSchema = z.object({
  ids: z
    .array(z.string())
    .min(1)
    .describe(
      'Ticket ids, e.g. ["T12","T14"], resolved repo-wide. A Legacy Ticket with no id is ' +
        'fetched by the <effort>#<order> handle its Board line shows.',
    ),
  root: z.string().optional().describe('Workspace directory. Defaults to the session workspace.'),
});

export const getTicketsDescription =
  'Full bodies for a list of Ticket ids, in one call. Use after get_board, only for the ' +
  'Tickets you actually work.';

/**
 * Bodies verbatim, under a header carrying the fields a reader needs in hand
 * while reading one. Ids that resolve to nothing are named rather than dropped,
 * so a typo does not look like an empty Ticket.
 */
export function renderTickets(requested: readonly string[], found: readonly Ticket[]): string {
  // Addressable by id when it has one, and by its handle either way — an
  // id-less Legacy Ticket has no other route to its own body.
  const byName = new Map<string, Ticket>();
  for (const ticket of found) {
    byName.set(ticket.handle, ticket);
    if (ticket.id !== undefined) byName.set(ticket.id, ticket);
  }

  const blocks: string[] = [];
  const missing: string[] = [];

  for (const name of requested) {
    const ticket = byName.get(name);
    if (ticket === undefined) {
      missing.push(name);
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
    ticket.type === undefined ? undefined : `type=${ticket.type}`,
    `status=${ticket.status}`,
    ticket.triage === undefined ? undefined : `triage=${ticket.triage}`,
    ticket.blockedBy.length > 0 ? `blocked_by=${ticket.blockedBy.join(',')}` : undefined,
    ticket.claimedBy === undefined ? undefined : `claimed_by=${ticket.claimedBy}`,
    ticket.claimedAt === undefined ? undefined : `claimed_at=${ticket.claimedAt}`,
    ticket.answerGist === undefined ? undefined : `answer_gist=${ticket.answerGist}`,
    ticket.droppedReason === undefined ? undefined : `dropped_reason=${ticket.droppedReason}`,
    ticket.legacy ? 'legacy' : undefined,
  ].filter(field => field !== undefined);

  return `# ${ticket.handle} — ${ticket.title}\n${fields.join('  ')}\n\n${ticket.body}`;
}
