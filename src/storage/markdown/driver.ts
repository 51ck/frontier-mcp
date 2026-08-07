import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Effort, HeaderDoc, Ticket } from '../../domain.ts';
import type { StorageDriver } from '../driver.ts';
import { readDestination, readSpecOpening } from './header-doc.ts';
import { parseTicket } from './ticket.ts';

/**
 * The layout this driver serves, per AGENTS.md:
 *
 *   .scratch/<effort>/
 *   ├── map.md            # Header doc — wayfinder
 *   ├── spec.md           # Header doc — to-spec
 *   └── issues/
 *       └── NN-slug.md    # Tickets
 *
 * Anything else in an Effort directory is ignored, never an error.
 */
const SCRATCH_DIR = '.scratch';
const ISSUES_DIR = 'issues';
const HEADER_DOCS: ReadonlyArray<readonly [HeaderDoc, string]> = [
  ['map', 'map.md'],
  ['spec', 'spec.md'],
];

/**
 * The markdown driver — the only driver in v1. Bound to `root`, the resolved
 * workspace, so that no path crosses the {@link StorageDriver} interface.
 */
export function createMarkdownDriver(root: string): StorageDriver {
  const scratch = join(root, SCRATCH_DIR);

  // One scan answers both methods. They are always called together, and
  // scanning twice meant reading every issues/ directory twice per index build.
  const scan = async () => {
    // A repo that has never used the tracker is a supported starting state,
    // not an error: it simply holds no Efforts.
    const slugs = await readDirectories(scratch);
    const scanned = await Promise.all(slugs.map(slug => readEffort(scratch, slug)));

    return scanned
      .filter((entry): entry is ScannedEffort => entry !== undefined)
      .toSorted((a, b) => a.effort.slug.localeCompare(b.effort.slug));
  };

  return {
    async listEfforts(): Promise<readonly Effort[]> {
      return (await scan()).map(entry => entry.effort);
    },

    async listTickets(): Promise<readonly Ticket[]> {
      return (await scan()).flatMap(entry => entry.tickets);
    },
  };
}

interface ScannedEffort {
  readonly effort: Effort;
  readonly tickets: readonly Ticket[];
}

/** Every Ticket in one Effort, in sort order. A missing `issues/` yields none. */
async function readTickets(dir: string, effort: string): Promise<Ticket[]> {
  const issues = join(dir, ISSUES_DIR);
  const entries = await readDir(issues);
  const filenames = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name)
    .toSorted();

  const tickets = await Promise.all(
    filenames.map(async (filename, position) => {
      const contents = await readFile(join(issues, filename), 'utf8');
      // A file with no `NN-` prefix still needs a position; its place in the
      // sorted listing is the only order it has.
      return parseTicket(effort, { filename, contents }, position + 1);
    }),
  );

  return tickets.toSorted((a, b) => a.order - b.order);
}

/**
 * A directory under `.scratch/` is an Effort only once it holds something the
 * schema recognizes — a Header doc or an `issues/` directory. `.scratch/` is
 * also where these repos keep loose scratch output, and a directory of research
 * notes is not an empty Effort.
 */
async function readEffort(scratch: string, slug: string): Promise<ScannedEffort | undefined> {
  const dir = join(scratch, slug);
  const entries = await readDir(dir);

  const files = new Set(entries.filter(entry => entry.isFile()).map(entry => entry.name));
  const headerDocs = HEADER_DOCS.filter(([, filename]) => files.has(filename)).map(([doc]) => doc);

  const hasIssues = entries.some(entry => entry.isDirectory() && entry.name === ISSUES_DIR);
  if (headerDocs.length === 0 && !hasIssues) return undefined;

  const [tickets, destination, specOpening] = await Promise.all([
    readTickets(dir, slug),
    headerDocs.includes('map') ? readText(join(dir, 'map.md')).then(readDestination) : undefined,
    headerDocs.includes('spec') ? readText(join(dir, 'spec.md')).then(readSpecOpening) : undefined,
  ]);

  return {
    effort: { slug, headerDocs, ticketCount: tickets.length, destination, specOpening },
    tickets,
  };
}

/** A file that vanished between the scan and the read is read as empty, not as a failure. */
async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isMissing(error)) return '';
    throw error;
  }
}

async function readDirectories(dir: string): Promise<string[]> {
  const entries = await readDir(dir);
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
}

/** A missing directory reads as empty — the layout is optional at every level. */
async function readDir(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}
