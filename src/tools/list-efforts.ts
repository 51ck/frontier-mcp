import { z } from 'zod';

import type { Effort } from '../domain.ts';

/**
 * `root` is the per-call workspace override. It is the only argument, and it is
 * optional, because the workspace normally resolves from the session itself.
 */
export const listEffortsInputSchema = {
  root: z
    .string()
    .optional()
    .describe('Workspace directory. Defaults to $FRONTIER_ROOT, then the session working directory.'),
};

export const listEffortsDescription =
  'List the Efforts in a repo, each with its Ticket count and which header docs it holds.';

/**
 * One line per Effort, preceded by the workspace that produced them so that a
 * caller can tell which repo it just read.
 */
export function renderEfforts(root: string, efforts: readonly Effort[]): string {
  const lines = [`root: ${root}`];

  if (efforts.length === 0) {
    lines.push('(no efforts)');
  } else {
    for (const effort of efforts) {
      const docs = effort.headerDocs.length === 0 ? 'none' : effort.headerDocs.join(',');
      lines.push(`${effort.slug}  tickets=${effort.ticketCount}  docs=${docs}`);
    }
  }

  return lines.join('\n');
}
