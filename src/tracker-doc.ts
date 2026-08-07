import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Stable URI for the tracker configuration document MCP resource. */
export const TRACKER_DOC_URI = 'frontier://tracker-doc';

/** Path to the shipped tracker configuration document inside the package. */
export function trackerDocPath(fromDir = dirname(fileURLToPath(import.meta.url))): string {
  return join(fromDir, '..', 'docs', 'agents', 'issue-tracker.md');
}

/** Read the shipped tracker configuration document from disk. */
export function readTrackerDoc(): string {
  return readFileSync(trackerDocPath(), 'utf8');
}
