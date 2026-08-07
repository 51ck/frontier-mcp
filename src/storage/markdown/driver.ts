import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Effort, HeaderDoc, Ticket } from '../../domain.ts';
import type { StorageDriver } from '../driver.ts';
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

  return {
    async listEfforts(): Promise<readonly Effort[]> {
      // A repo that has never used the tracker is a supported starting state,
      // not an error: it simply holds no Efforts.
      const candidates = await readDirectories(scratch);

      const efforts = await Promise.all(candidates.map(slug => readEffort(scratch, slug)));

      return efforts
        .filter((effort): effort is Effort => effort !== undefined)
        .toSorted((a, b) => a.slug.localeCompare(b.slug));
    },

    async listTickets(): Promise<readonly Ticket[]> {
      const slugs = await readDirectories(scratch);
      const perEffort = await Promise.all(slugs.map(slug => readTickets(scratch, slug)));

      return perEffort
        .flat()
        .toSorted((a, b) => a.effort.localeCompare(b.effort) || a.order - b.order);
    },
  };
}

/** Every Ticket in one Effort. A missing or unreadable `issues/` yields none. */
async function readTickets(scratch: string, effort: string): Promise<Ticket[]> {
  const issues = join(scratch, effort, ISSUES_DIR);
  const entries = await readDir(issues);
  const filenames = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name);

  return Promise.all(
    filenames.map(async filename => {
      const contents = await readFile(join(issues, filename), 'utf8');
      return parseTicket(effort, { filename, contents });
    }),
  );
}

/**
 * A directory under `.scratch/` is an Effort only once it holds something the
 * schema recognizes — a Header doc or an `issues/` directory. `.scratch/` is
 * also where these repos keep loose scratch output, and a directory of research
 * notes is not an empty Effort.
 */
async function readEffort(scratch: string, slug: string): Promise<Effort | undefined> {
  const dir = join(scratch, slug);
  const [entries, ticketCount] = await Promise.all([
    readDir(dir),
    countTickets(join(dir, ISSUES_DIR)),
  ]);

  const files = new Set(entries.filter(entry => entry.isFile()).map(entry => entry.name));
  const headerDocs = HEADER_DOCS.filter(([, filename]) => files.has(filename)).map(([doc]) => doc);

  const hasIssues = entries.some(entry => entry.isDirectory() && entry.name === ISSUES_DIR);
  if (headerDocs.length === 0 && !hasIssues) return undefined;

  return { slug, headerDocs, ticketCount };
}

/** Tickets are the `.md` files directly under `issues/`. Nothing else counts. */
async function countTickets(issues: string): Promise<number> {
  const entries = await readDir(issues);
  return entries.filter(entry => entry.isFile() && entry.name.endsWith('.md')).length;
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
