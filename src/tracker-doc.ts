import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Stable URI for the tracker configuration document MCP resource. */
export const TRACKER_DOC_URI = 'frontier://tracker-doc';

/**
 * Read the shipped tracker configuration document. It sits beside `dist/` in
 * the published package, which is why the path is resolved from this module
 * rather than from the process working directory — the server is started from
 * the user's repo, not from its own install.
 */
export function readTrackerDoc(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, '..', 'docs', 'agents', 'issue-tracker.md'), 'utf8');
}
