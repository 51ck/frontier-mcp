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

  const labels = labelsOf(report.changes);
  const defined = new Set(labels.values());
  for (const change of report.changes) {
    lines.push(renderChange(change, labels.get(change) ?? change.filename, defined));
  }

  if (report.crossEffortEdges.length > 0) {
    lines.push(
      `> Edges to another Effort (${String(report.crossEffortEdges.length)}) — check each is meant: ` +
        capped(report.crossEffortEdges),
    );
  }
  if (report.keptSubSlices.length > 0) {
    lines.push(
      `> sub-slice Edges kept as declared, parent not in this Effort ` +
        `(${String(report.keptSubSlices.length)}): ${capped(report.keptSubSlices)} — they dangle; ` +
        'fix each with update_ticket blocked_by',
    );
  }

  lines.push('');
  for (const change of report.changes) {
    // Angle brackets keep a filename with a space a valid link destination.
    lines.push(
      `[${labels.get(change) ?? change.filename}]: <${report.directory}/${change.filename}>`,
    );
  }

  return lines.join('\n');
}

// One line each, however large the Effort: the first few are named, the rest
// counted — the duplicate-id Board warning's shape. The count stays exact.
const NOTE_NAMED = 10;

function capped(items: readonly string[]): string {
  const named = items.slice(0, NOTE_NAMED).join(' ');
  const rest = items.length - NOTE_NAMED;
  return rest > 0 ? `${named} and ${String(rest)} more` : named;
}

/**
 * A Ticket's id, or its handle before it has one. Two files a preview finds
 * carrying one id would share a label and the first definition would win, so
 * those are labelled by filename, which an Effort cannot repeat.
 */
function labelsOf(changes: readonly MigrationChange[]): Map<MigrationChange, string> {
  const natural = changes.map(change => change.id ?? change.beforeHandle);
  return new Map(
    changes.map((change, index) => {
      const label = natural[index] ?? change.filename;
      return [
        change,
        natural.indexOf(label) === natural.lastIndexOf(label) ? label : change.filename,
      ];
    }),
  );
}

function renderChange(
  change: MigrationChange,
  label: string,
  defined: ReadonlySet<string>,
): string {
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
    `[${label}]`,
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
