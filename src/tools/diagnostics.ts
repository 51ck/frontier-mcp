import type { Diagnostic, DiagnosticCode } from '../domain.ts';

/** One Diagnostic on one line, every field it carries named. */
export function renderDiagnostic(diagnostic: Diagnostic): string {
  const { code, effect, file, key, expected, found, fix } = diagnostic;
  const parts = [
    `${code} (${effect})`,
    file,
    key === undefined ? undefined : `key=${key}`,
    expected === undefined ? undefined : `expected=${expected}`,
    found === undefined ? undefined : `found=${found}`,
  ].filter(part => part !== undefined);
  return `${parts.join('  ')} — ${fix}`;
}

/** What a file shows for, by code, on a Board's warnings. */
const GROUP_TEXT: Readonly<Record<DiagnosticCode, string>> = {
  'yaml-unparseable': 'marked files whose frontmatter does not parse, excluded',
  'missing-key': 'marked files missing title or status, excluded',
  'invalid-value': 'marked files holding an invalid value, excluded',
  'ticket-outside-issues': 'marked files outside issues/, excluded until moved there by hand',
  'directory-in-issues': 'directories inside issues/, never read',
  'symlinked-issues': 'issues/ directories that are symbolic links, never followed',
  'symlinked-header-doc': 'map.md or spec.md files that are symbolic links, never followed',
  unreadable: 'files in issues/ the server cannot read, excluded',
  'unmarked-ticket-like': 'unmarked files that look like Tickets — add frontier: ticket by hand',
};

/** Files named per group before the rest are counted, as the duplicate warning does. */
const FILES_NAMED = 3;

/**
 * One line per code, never one per file: a whole Effort left unmarked after
 * an upgrade would otherwise bury the Board under its own warnings.
 */
export function groupedDiagnostics(diagnostics: readonly Diagnostic[]): string[] {
  const byCode = new Map<DiagnosticCode, Set<string>>();
  for (const { code, file } of diagnostics) {
    const files = byCode.get(code) ?? new Set();
    files.add(file);
    byCode.set(code, files);
  }
  return (Object.keys(GROUP_TEXT) as DiagnosticCode[]).flatMap(code => {
    const files = [...(byCode.get(code) ?? [])];
    if (files.length === 0) return [];
    const rest = files.length - FILES_NAMED;
    const listed =
      files.slice(0, FILES_NAMED).join(' ') + (rest > 0 ? ` and ${String(rest)} more` : '');
    const hint =
      code === 'directory-in-issues' ||
      code === 'symlinked-issues' ||
      code === 'symlinked-header-doc'
        ? ''
        : "; get_tickets <name> gives each file's detail";
    return [`${code}: ${GROUP_TEXT[code]} (${String(files.length)}): ${listed}${hint}`];
  });
}

/** Files carrying at least one Diagnostic of the effect. */
export function filesWith(
  diagnostics: readonly Diagnostic[],
  effect: Diagnostic['effect'],
): number {
  return new Set(diagnostics.filter(entry => entry.effect === effect).map(entry => entry.file))
    .size;
}
