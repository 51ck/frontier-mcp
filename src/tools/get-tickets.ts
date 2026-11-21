import { z } from 'zod';

import { bareIdOf } from '../domain.ts';
import type { Diagnostic, Ticket, TicketSummary } from '../domain.ts';
import { duplicateKindOf, fullNameOf, indexNames, type Names } from '../names.ts';
import { renderDiagnostic } from './diagnostics.ts';
import { renderNamedFrom } from './get-board.ts';
import { renderTags } from './tags.ts';

export const getTicketsInputSchema = z.strictObject({
  ids: z
    .array(z.string())
    .min(1)
    .describe(
      'Ticket ids or names, e.g. ["T12","token-cache"]. A name several Efforts have ' +
        'must be given in full: <effort>.<name>.',
    ),
  root: z.string().optional().describe('Workspace directory. Defaults to the session workspace.'),
});

export const getTicketsDescription =
  'Full bodies for a list of Ticket ids, in one call. Use after get_board, only for the ' +
  'Tickets you actually work.';

/**
 * Bodies verbatim, under a header carrying the fields a reader needs in hand
 * while reading one. Names that resolve to nothing are named rather than
 * dropped, so a typo does not look like an empty Ticket.
 *
 * `all` is every Ticket of the read the bodies came from, which is where the
 * Edges naming each one are found.
 */
export function renderTickets(
  requested: readonly string[],
  found: readonly Ticket[],
  excluded: ReadonlyMap<string, readonly Diagnostic[]>,
  all: readonly TicketSummary[],
): string {
  // The driver resolved each name against the whole workspace and returned only
  // what it meant, so resolving again over that subset pairs them back up.
  const names = indexNames(found);
  const workspace = indexNames(all);

  const blocks: string[] = [];
  const missing: string[] = [];

  for (const name of requested) {
    const claimants = names.input(name) as readonly Ticket[];
    if (claimants.length === 0) {
      const diagnostics = excluded.get(name) ?? [];
      if (diagnostics.length === 0) missing.push(name);
      else blocks.push(renderExcluded(name, diagnostics));
      continue;
    }
    // Every claimant of a duplicated name, never silently the first.
    if (claimants.length > 1) {
      const fix = duplicateKindOf(claimants) === 'id' ? 'renumbered' : 'renamed';
      blocks.push(
        `${name} is carried by ${String(claimants.length)} Tickets — writes to it are refused ` +
          `until all but one are ${fix} by hand`,
      );
    }
    for (const ticket of claimants) blocks.push(renderOne(ticket, workspace));
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

/** A file that would answer to the name, were it a valid Ticket. */
export function renderExcluded(name: string, diagnostics: readonly Diagnostic[]): string {
  const excluded = diagnostics.some(entry => entry.effect === 'excluded');
  return [
    excluded
      ? `${name} is not a Ticket — excluded until fixed by hand:`
      : `${name} is not a Ticket — unmarked, so it is not read as one:`,
    ...diagnostics.map(entry => `  ${renderDiagnostic(entry)}`),
  ].join('\n');
}

function renderOne(ticket: Ticket, workspace: Names): string {
  const dependents = workspace.dependents(ticket);
  const fields = [
    `effort=${ticket.effort}`,
    `kind=${ticket.kind}`,
    ticket.type === undefined ? undefined : `type=${ticket.type}`,
    `status=${ticket.status}`,
    ticket.triage === undefined ? undefined : `triage=${ticket.triage}`,
    ticket.blockedBy.length > 0 ? `blocked_by=${ticket.blockedBy.join(',')}` : undefined,
    dependents.length > 0 ? `blocks=${renderNamedFrom(dependents, ticket.effort, ',')}` : undefined,
    ticket.tags.length > 0 ? `tags=${renderTags(ticket.tags)}` : undefined,
    ticket.claimedBy === undefined ? undefined : `claimed_by=${ticket.claimedBy}`,
    ticket.claimedAt === undefined ? undefined : `claimed_at=${ticket.claimedAt}`,
    ticket.answerGist === undefined ? undefined : `answer_gist=${ticket.answerGist}`,
    ticket.droppedReason === undefined ? undefined : `dropped_reason=${ticket.droppedReason}`,
  ].filter(field => field !== undefined);

  const head = `# ${fullNameOf(ticket)} — ${ticket.title}\n${fields.join('  ')}\n\n${ticket.body}`;
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
