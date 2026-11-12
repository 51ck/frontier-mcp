import { z } from 'zod';

import { bareIdOf } from '../domain.ts';
import type { Ticket } from '../domain.ts';

export const getTicketsInputSchema = z.object({
  ids: z
    .array(z.string())
    .min(1)
    .describe(
      'Ticket ids, e.g. ["T12","T14"], resolved repo-wide. A Ticket with no id is ' +
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
  // id-less Ticket has no other route to its own body.
  const byName = new Map<string, Ticket[]>();
  const add = (name: string, ticket: Ticket) => {
    const claimants = byName.get(name) ?? [];
    if (!claimants.includes(ticket)) claimants.push(ticket);
    byName.set(name, claimants);
  };
  for (const ticket of found) {
    add(ticket.handle, ticket);
    if (ticket.id !== undefined) add(ticket.id, ticket);
  }

  const blocks: string[] = [];
  const missing: string[] = [];

  for (const name of requested) {
    const claimants = byName.get(name);
    if (claimants === undefined) {
      missing.push(name);
      continue;
    }
    // Every claimant of a duplicated id, never silently the first.
    if (claimants.length > 1) {
      blocks.push(
        `${name} is carried by ${String(claimants.length)} Tickets — writes to it are refused ` +
          'until all but one are renumbered by hand',
      );
    }
    for (const ticket of claimants) blocks.push(renderOne(ticket));
  }

  if (missing.length > 0) {
    blocks.push(
      `not found: ${missing
        .map(name => {
          const bare = bareIdOf(name);
          return bare === undefined ? name : `${name} (name it '${bare}')`;
        })
        .join(' ')}`,
    );
  }

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
    ticket.foreign ? 'foreign' : undefined,
  ].filter(field => field !== undefined);

  const head = `# ${ticket.handle} — ${ticket.title}\n${fields.join('  ')}\n\n${ticket.body}`;
  return ticket.unimported === undefined
    ? head
    : `${head}\n\n${renderFence(ticket.unimported.yaml)}`;
}

/**
 * The file's own YAML, never re-serialized. Its delimiter outruns any backtick
 * run inside it, so YAML holding a code fence cannot close the block early.
 */
function renderFence(raw: string): string {
  const longest = Math.max(0, ...(raw.match(/`+/g) ?? []).map(run => run.length));
  const delimiter = '`'.repeat(Math.max(3, longest + 1));
  return `## Unimported frontmatter\n\n${delimiter}yaml\n${raw}\n${delimiter}`;
}
