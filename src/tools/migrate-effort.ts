import { z } from 'zod';

export const migrateEffortInputSchema = z.object({
  effort: z.string().describe('Effort slug. Accepted and ignored: nothing is migrated.'),
  preview: z.boolean().optional().describe('Accepted and ignored: nothing is ever written.'),
  root: z.string().optional().describe('Workspace directory. Defaults to the session workspace.'),
});

export const migrateEffortDescription =
  'Retired in 3.0: writes nothing and reports why. A file is a Ticket only when its frontmatter ' +
  'carries frontier: ticket, which the server never adds; list_efforts counts unmarked= files.';

/**
 * Kept registered so the surface stays at eight tools (ADR 0009); a later
 * Ticket replaces it. Nothing is normalized, rewritten, marked or moved.
 */
export function renderMigrationRetired(): string {
  return [
    'nothing migrated: migrate_effort writes nothing since FrontierMCP 3.0',
    'a file is a Ticket only when its frontmatter carries frontier: ticket; add it by hand',
    'list_efforts counts unmarked= look-alikes, and get_board names them',
  ].join('\n');
}
