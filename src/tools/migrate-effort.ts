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
  'Normalize an Effort: give Foreign Tickets schema frontmatter, turn prose Edges into ' +
  'blocked_by, resolve sort-order Edges (01) to names. Names and filenames never change. ' +
  'Preview writes nothing. Unrecognized files in the Effort directory are ignored.';

/**
 * Every Ticket line is labelled reference-style and resolved once in a closing
 * definition block, so a `blocked_by=` naming three siblings stays one short
 * line. Paths are workspace-root-relative: the reader's working directory is
 * not knowable, the root the call resolved is.
 */
export function renderMigration(report: MigrationReport): string {
  const count = report.changes.filter(change => change.normalized || change.edgesResolved).length;
  const verb = report.preview ? 'would migrate' : 'migrated';
  const unchanged = report.unchanged > 0 ? `, unchanged ${String(report.unchanged)}` : '';
  const lines = [
    `${report.effort}: ${report.preview ? 'preview — ' : ''}${verb} ${String(count)}${unchanged}`,
  ];

  if (count === 0) lines.push('(nothing to migrate)');

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
  if (report.unresolvedSortOrders.length > 0) {
    lines.push(
      `> sort-order Edges kept as declared, no one other Ticket carries the prefix ` +
        `(${String(report.unresolvedSortOrders.length)}): ${capped(report.unresolvedSortOrders)} — ` +
        'they dangle; fix each with update_ticket blocked_by',
    );
  }

  if (report.changes.length === 0) return lines.join('\n');

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
 * A Ticket's name. Two files sharing one would share a label and the first
 * definition would win, so those are labelled by filename, which an Effort
 * cannot repeat.
 */
function labelsOf(changes: readonly MigrationChange[]): Map<MigrationChange, string> {
  const natural = changes.map(change => change.name.toLowerCase());
  return new Map(
    changes.map((change, index) => {
      const label = natural[index] ?? '';
      return [
        change,
        natural.indexOf(label) === natural.lastIndexOf(label) ? change.name : change.filename,
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
    change.edgesResolved ? 'edges' : undefined,
  ].filter(part => part !== undefined);

  const edges =
    change.blockedBy.length === 0
      ? undefined
      : `blocked_by=${change.blockedBy.map(edge => (defined.has(edge) ? `[${edge}]` : edge)).join(',')}`;

  return [
    `[${label}]`,
    change.title,
    flags.length === 0 ? undefined : flags.join('+'),
    edges,
    change.duplicate === undefined
      ? undefined
      : `duplicate ${change.duplicate.kind}, carried by ${change.duplicate.files.join(', ')} — a real run refuses`,
  ]
    .filter(part => part !== undefined)
    .join('  ');
}
