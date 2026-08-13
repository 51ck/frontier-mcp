import { z } from 'zod';

import type { MigrationChange, MigrationReport } from '../domain.ts';

export const migrateEffortInputSchema = z.object({
  effort: z.string().describe('Effort slug whose Legacy Tickets to normalize.'),
  preview: z
    .boolean()
    .optional()
    .describe('Report every change and write nothing. Defaults to false.'),
  rename: z
    .boolean()
    .optional()
    .describe(
      'Rename files to <NN>-T<n>-<slug>.md. Off by default so relative links keep resolving.',
    ),
  root: z.string().optional().describe('Workspace directory. Defaults to the session workspace.'),
});

export const migrateEffortDescription =
  'Normalize Legacy Tickets in an Effort: schema frontmatter, preserve existing ids, mint ' +
  'ids for Tickets that have none, turn prose Edges into blocked_by. Preview writes nothing. ' +
  'Filename rewriting is opt-in. Unrecognized files in the Effort directory are ignored.';

export function renderMigration(report: MigrationReport): string {
  const count = report.changes.length;
  const verb = report.preview ? 'would migrate' : 'migrated';
  const rename = report.renamed ? ' (renamed)' : '';
  const lines = [
    `${report.effort}: ${report.preview ? 'preview — ' : ''}${verb} ${String(count)}${rename}`,
  ];

  if (count === 0) {
    lines.push('(nothing to migrate)');
    return lines.join('\n');
  }

  for (const change of report.changes) {
    lines.push(renderChange(change));
  }

  return lines.join('\n');
}

function renderChange(change: MigrationChange): string {
  const flags = [
    change.normalized ? 'normalize' : undefined,
    change.minted ? 'mint' : undefined,
  ].filter(part => part !== undefined);

  const rename =
    change.fromName !== undefined && change.toName !== undefined
      ? `${change.fromName} -> ${change.toName}`
      : undefined;

  const was =
    change.minted && change.beforeHandle !== change.id ? `was ${change.beforeHandle}` : undefined;

  const edges =
    change.blockedBy.length === 0 ? undefined : `blocked_by=${change.blockedBy.join(',')}`;

  return [
    change.id,
    change.title,
    flags.length === 0 ? undefined : flags.join('+'),
    was,
    rename,
    edges,
  ]
    .filter(part => part !== undefined)
    .join('  ');
}
