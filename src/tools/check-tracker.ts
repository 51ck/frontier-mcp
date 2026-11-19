import { z } from 'zod';

import type { Diagnostic, FieldDefinition, TrackerContract } from '../domain.ts';
import { renderDiagnostic } from './diagnostics.ts';

export const checkTrackerInputSchema = z.object({
  effort: z
    .string()
    .optional()
    .describe('Effort slug: list only its diagnostics. Omit for the whole workspace.'),
  root: z.string().optional().describe('Workspace directory. Defaults to the session workspace.'),
});

export const checkTrackerDescription =
  'How to write a Ticket and what is wrong with the files there: the frontmatter schema, the ' +
  'versioned layout contract, a valid example, and every diagnostic itemized with file, key, ' +
  'expected and fix. Reads only; the server never repairs a file.';

function fieldLine(field: FieldDefinition): string {
  const values = (field.values ?? []).join(' | ');
  const type =
    field.type === 'marker'
      ? `exactly ${values}`
      : field.type === 'enum'
        ? values
        : field.type === 'list'
          ? `list of ${field.items ?? 'scalars'}`
          : 'text';
  const convention = field.convention === undefined ? '' : `; convention only: ${field.convention}`;
  return `  ${field.key}  ${field.required ? 'required' : 'optional'}  ${type} — ${field.checked}${convention}`;
}

/**
 * The contract alone, the part every call returns whatever the workspace
 * holds. The tracker doc carries this text verbatim, pinned by a test.
 */
export function renderContract(contract: TrackerContract): string {
  const fence = '`'.repeat(
    Math.max(3, ...[...contract.example.contents.matchAll(/`+/g)].map(m => m[0].length + 1)),
  );
  return [
    `schema: frontmatter between --- lines; keys any order, the marker first by convention`,
    ...contract.fields.map(fieldLine),
    `  other keys: ${contract.unimported}`,
    `layout v${String(contract.layoutVersion)}:`,
    ...contract.paths.map(({ path, role }) => `  ${path}  ${role}`),
    'unsupported, diagnosed:',
    ...contract.unsupported.map(({ code, effect, where }) => `  ${code} (${effect})  ${where}`),
    'ignored, no diagnostic:',
    ...contract.ignored.map(entry => `  ${entry}`),
    `symlinks: ${contract.symlinks}`,
    `example ${contract.example.path}:`,
    `${fence}markdown`,
    contract.example.contents.trimEnd(),
    fence,
  ].join('\n');
}

export function renderCheck(
  contract: TrackerContract,
  diagnostics: readonly Diagnostic[],
  effort: string | undefined,
): string {
  const scope = effort === undefined ? '' : ` in ${effort}`;
  const findings =
    diagnostics.length === 0
      ? [`diagnostics${scope}: none, nothing to fix`]
      : [
          `diagnostics${scope} (${String(diagnostics.length)}):`,
          ...diagnostics.map(entry => `  ${renderDiagnostic(entry)}`),
        ];
  return [renderContract(contract), ...findings].join('\n');
}
