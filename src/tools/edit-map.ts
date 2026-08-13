import { z } from 'zod';

import type { MapDocument, MapEdit } from '../domain.ts';

export const editMapInputSchema = z.object({
  effort: z.string().describe('Effort slug whose Map to read or edit.'),
  create: z
    .boolean()
    .optional()
    .describe(
      'Start a missing Effort and its Map. Only for Effort/Map that do not exist yet — ' +
        'not a flag to send on every call. Does not change revision rules for mutations on an ' +
        'existing Map; create with no section fields reads an existing Map like a plain read.',
    ),
  destination: z.string().optional().describe('Replace the Destination section.'),
  notes: z.string().optional().describe('Replace the Notes section.'),
  add_fog: z.string().min(1).optional().describe('Append a fog patch under Not yet specified.'),
  graduate_fog: z
    .string()
    .min(1)
    .optional()
    .describe('Remove a fog patch matched on its text. Fails when none match.'),
  rule_out: z
    .string()
    .min(1)
    .optional()
    .describe('Append a hand-ruled item under Out of scope. Never touches Decisions-so-far.'),
  expected_revision: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Revision from a prior edit_map read. Required when overwriting an existing Map; ' +
        'omitted when creating one.',
    ),
  root: z.string().optional().describe('Workspace directory. Defaults to the session workspace.'),
});

export const editMapDescription =
  "Read a Map's Destination and Notes, or edit one typed section — set Destination or Notes, " +
  'add or graduate a fog patch, rule something out of scope — without rewriting the others. ' +
  'Decisions-so-far is generated from resolved Tickets and never accepted as input. ' +
  'Mutations pass expected_revision from a prior read so concurrent sessions cannot clobber each other.';

export interface EditMapRequest {
  readonly destination?: string | undefined;
  readonly notes?: string | undefined;
  readonly add_fog?: string | undefined;
  readonly graduate_fog?: string | undefined;
  readonly rule_out?: string | undefined;
}

/** Turn the tool args into the edit the driver applies. */
export function mapEditFor(request: EditMapRequest): MapEdit {
  return {
    ...(request.destination !== undefined ? { destination: request.destination } : {}),
    ...(request.notes !== undefined ? { notes: request.notes } : {}),
    ...(request.add_fog !== undefined ? { addFog: request.add_fog } : {}),
    ...(request.graduate_fog !== undefined ? { graduateFog: request.graduate_fog } : {}),
    ...(request.rule_out !== undefined ? { ruleOut: request.rule_out } : {}),
  };
}

/**
 * Destination and Notes for orientation, then the fog and out-of-scope lists.
 * Never the whole Map body, and never Decisions-so-far — that is derived.
 */
export function renderMap(effort: string, document: MapDocument): string {
  const lines = [`effort: ${effort}`, `map revision: ${document.revision}`];

  if (document.destination !== undefined) {
    lines.push(labelled('destination', document.destination));
  } else {
    lines.push('destination: (none)');
  }

  if (document.notes !== undefined) {
    lines.push(labelled('notes', document.notes));
  } else {
    lines.push('notes: (none)');
  }

  lines.push('', 'not yet specified:');
  if (document.notYetSpecified.length === 0) lines.push('  (none)');
  else for (const patch of document.notYetSpecified) lines.push(`  - ${patch}`);

  lines.push('', 'out of scope:');
  if (document.outOfScope.length === 0) lines.push('  (none)');
  else for (const item of document.outOfScope) lines.push(`  - ${item}`);

  return lines.join('\n');
}

function labelled(label: string, prose: string): string {
  const [first, ...rest] = prose.split('\n');
  return [`${label}: ${first}`, ...rest.map(line => `  ${line}`)].join('\n');
}
