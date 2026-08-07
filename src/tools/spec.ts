import { z } from 'zod';

import type { SpecDocument } from '../domain.ts';

export const specInputSchema = {
  effort: z.string().describe('Effort slug whose Spec to get or put.'),
  create: z
    .boolean()
    .optional()
    .describe('Start the Effort and its Spec if neither exists. Otherwise an unknown slug fails.'),
  content: z
    .string()
    .optional()
    .describe('When set, replace the Spec wholesale. When omitted, return the current document.'),
  root: z.string().optional().describe('Workspace directory. Defaults to the session workspace.'),
};

export const specDescription =
  'Get or put a Spec as a whole document with frontmatter. Nothing edits a Spec section by ' +
  'section — an Effort may hold both a Map and a Spec.';

export function renderSpec(effort: string, document: SpecDocument): string {
  return [`effort: ${effort}`, `spec revision: ${document.revision}`, '', document.content].join(
    '\n',
  );
}
