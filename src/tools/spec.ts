import { z } from 'zod';

import type { SpecDocument } from '../domain.ts';

export const specInputSchema = z.object({
  effort: z.string().describe('Effort slug whose Spec to get or put.'),
  create: z
    .boolean()
    .optional()
    .describe('Start the Effort and its Spec if neither exists. Otherwise an unknown slug fails.'),
  content: z
    .string()
    .optional()
    .describe(
      'When set, replace the Spec wholesale (conventionally a document with YAML frontmatter). ' +
        'When omitted, return the current document.',
    ),
  expected_revision: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Revision from a prior spec read. Required when overwriting an existing Spec; ' +
        'omitted when creating one.',
    ),
  root: z.string().optional().describe('Workspace directory. Defaults to the session workspace.'),
});

export const specDescription =
  'Get or put a Spec as a whole opaque document (conventionally with YAML frontmatter). ' +
  'Nothing edits a Spec section by section — an Effort may hold both a Map and a Spec. ' +
  'Puts pass expected_revision from a prior read so concurrent sessions cannot clobber each other.';

export function renderSpec(effort: string, document: SpecDocument): string {
  return [`effort: ${effort}`, `spec revision: ${document.revision}`, '', document.body].join('\n');
}
