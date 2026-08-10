import { z } from 'zod';

import type { Effort, TicketSummary } from '../domain.ts';
import { workspaceLine } from './workspace-line.ts';

/**
 * `root` is the per-call workspace override. It is the only argument, and it is
 * optional, because the workspace normally resolves from the session itself.
 */
export const listEffortsInputSchema = {
  root: z
    .string()
    .optional()
    .describe(
      'Workspace directory. Defaults to $FRONTIER_ROOT, then the session working directory.',
    ),
};

export const listEffortsDescription =
  'List the Efforts in a repo, each with its Ticket count and which header docs it holds.';

/**
 * One line per Effort, preceded by the workspace that produced them so that a
 * caller can tell which repo it just read.
 */
export function renderEfforts(
  root: string,
  efforts: readonly Effort[],
  frontier: ReadonlySet<TicketSummary>,
): string {
  const lines = [workspaceLine(root)];

  if (efforts.length === 0) {
    lines.push('(no efforts)');
  } else {
    const takeable = countByEffort(frontier);
    for (const effort of efforts) {
      const docs = effort.headerDocs.length === 0 ? 'none' : effort.headerDocs.join(',');
      const size = takeable.get(effort.slug) ?? 0;
      lines.push(
        `${effort.slug}  tickets=${effort.ticketCount}  docs=${docs}  frontier=${String(size)}`,
      );
    }
  }

  return lines.join('\n');
}

function countByEffort(frontier: ReadonlySet<TicketSummary>): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const ticket of frontier) counts.set(ticket.effort, (counts.get(ticket.effort) ?? 0) + 1);

  return counts;
}
