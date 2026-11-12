import { z } from 'zod';

import type { MigrationChange, MigrationReport } from '../domain.ts';

export const migrateEffortInputSchema = z.object({
  effort: z.string().describe('Effort slug whose Foreign Tickets to normalize.'),
  preview: z
    .boolean()
    .optional()
    .describe('Report every change and write nothing. Defaults to false.'),
  root: z.string().optional().describe('Workspace directory. Defaults to the session workspace.'),
});

export const migrateEffortDescription =
  'Normalize Foreign Tickets in an Effort: schema frontmatter, preserve existing ids, mint ' +
  'ids for Tickets that have none, turn prose Edges into blocked_by. Filenames never change. ' +
  'Preview writes nothing and names a Ticket it would mint by its handle, not a predicted id. ' +
  'Unrecognized files in the Effort directory are ignored.';

/**
 * Every Ticket line is labelled reference-style and resolved once in a closing
 * definition block, so a `blocked_by=` naming three siblings stays one short
 * line. Paths are workspace-root-relative: the reader's working directory is
 * not knowable, the root the call resolved is.
 */
export function renderMigration(report: MigrationReport): string {
  const count = report.changes.length;
  const verb = report.preview ? 'would migrate' : 'migrated';
  const lines = [`${report.effort}: ${report.preview ? 'preview — ' : ''}${verb} ${String(count)}`];

  if (count === 0) {
    lines.push('(nothing to migrate)');
    return lines.join('\n');
  }

  const defined = new Set(report.changes.map(labelOf));
  for (const change of report.changes) {
    lines.push(renderChange(change, defined));
  }

  if (report.crossEffortEdges.length > 0) {
    lines.push(
      `> Edges to another Effort (${String(report.crossEffortEdges.length)}) — check each is meant: ` +
        report.crossEffortEdges.join(' '),
    );
  }
  if (report.keptSubSlices.length > 0) {
    lines.push(
      `> sub-slice Edges kept as declared, parent not in this Effort (${String(report.keptSubSlices.length)}): ` +
        report.keptSubSlices.join(' '),
    );
  }

  lines.push('');
  for (const change of report.changes) {
    lines.push(`[${labelOf(change)}]: ${report.directory}/${change.filename}`);
  }

  return lines.join('\n');
}

function labelOf(change: MigrationChange): string {
  return change.id ?? change.beforeHandle;
}

function renderChange(change: MigrationChange, defined: ReadonlySet<string>): string {
  const flags = [
    change.normalized ? 'normalize' : undefined,
    change.minted ? 'mint' : undefined,
  ].filter(part => part !== undefined);

  const was =
    change.minted && change.id !== undefined && change.beforeHandle !== change.id
      ? `was ${change.beforeHandle}`
      : undefined;

  const edges =
    change.blockedBy.length === 0
      ? undefined
      : `blocked_by=${change.blockedBy.map(edge => (defined.has(edge) ? `[${edge}]` : edge)).join(',')}`;

  return [
    `[${labelOf(change)}]`,
    change.title,
    flags.length === 0 ? undefined : flags.join('+'),
    was,
    edges,
    change.duplicateFiles === undefined
      ? undefined
      : `duplicate id, carried by ${change.duplicateFiles.join(', ')} — a real run refuses`,
  ]
    .filter(part => part !== undefined)
    .join('  ');
}
