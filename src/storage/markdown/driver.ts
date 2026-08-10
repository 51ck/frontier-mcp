import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  Effort,
  HeaderDoc,
  MapDocument,
  MapEdit,
  MigrateOptions,
  MigrationReport,
  SpecDocument,
  Ticket,
  TicketDraft,
  TicketSummary,
} from '../../domain.ts';
import type {
  CreateOptions,
  HeaderDocOptions,
  StorageDriver,
  TicketWriteResult,
} from '../driver.ts';
import type { TicketEdit } from '../../domain.ts';
import { NoSuchEffort, NoSuchMap, NoSuchSpec, NoSuchTicket, RevisionMismatch } from '../driver.ts';
import { createTicketFiles } from './create.ts';
import { migrateEffortFiles } from './migrate.ts';
import { applyEdit, type Defaults } from './serialize.ts';
import { currentRevision, GuardHeld, withGuard, writeAtomically } from './write.ts';
import {
  applyMapEdit,
  type DerivedPointer,
  readMapDocument,
  readSection,
  readSpecOpening,
  scaffoldMap,
  SECTION_HEADINGS,
} from './header-doc.ts';
import { parseTicketSummary, ticketBody } from './ticket.ts';
import { watchStorage, type StorageWatcher } from './watcher.ts';

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
const MAP_FILE = 'map.md';
const SPEC_FILE = 'spec.md';
const HEADER_DOCS: ReadonlyArray<readonly [HeaderDoc, string]> = [
  ['map', MAP_FILE],
  ['spec', SPEC_FILE],
];

export interface MarkdownDriverOptions {
  /** Debounce filesystem watcher events before dropping the scan. */
  readonly watcherDebounceMs?: number;
}

/**
 * The markdown driver — the only driver in v1. Bound to `root`, the resolved
 * workspace, so that no path crosses the {@link StorageDriver} interface.
 *
 * It is the workspace *cached and live*: it holds the scan a Board is built
 * from, drops it when it writes, and watches the storage directory so a change
 * another process made drops it too. Both are markdown policy — a full scan is
 * cheap enough to cache wholesale, and `node:fs.watch` is how this physical
 * model learns it moved. A driver over a database would cache and notice
 * neither the same way, which is why nothing above the seam does it for them.
 *
 * Close it to stop the watcher; a process that keeps a workspace open forever
 * never needs to.
 */
export function createMarkdownDriver(
  root: string,
  { watcherDebounceMs }: MarkdownDriverOptions = {},
): StorageDriver {
  const scratch = join(root, SCRATCH_DIR);
  let writes: Promise<unknown> = Promise.resolve();

  const walk = async (): Promise<ScannedEffort[]> => {
    // A repo that has never used the tracker is a supported starting state,
    // not an error: it simply holds no Efforts.
    const slugs = await readDirectories(scratch);
    const scanned = await Promise.all(slugs.map(slug => readEffort(scratch, slug)));

    return scanned
      .filter((entry): entry is ScannedEffort => entry !== undefined)
      .toSorted((a, b) => a.effort.slug.localeCompare(b.effort.slug));
  };

  /**
   * Hold the in-flight walk, not just its result, so concurrent callers share
   * one scan instead of racing several. A failed scan is never cached as the
   * answer.
   *
   * The whole scan is one cache rather than one per method: `listEfforts` and
   * `listTickets` are two readings of a single walk, and every caller that
   * wants a Board wants both.
   */
  let scanned: Promise<ScannedEffort[]> | undefined;
  const scan = () => {
    scanned ??= walk().catch((error: unknown) => {
      scanned = undefined;
      throw error;
    });
    return scanned;
  };

  /** Drop the scan, so the next read rebuilds from disk. */
  const invalidate = () => {
    scanned = undefined;
  };

  /**
   * A write moves the workspace on whether or not it succeeded partway, so the
   * next read rebuilds rather than trusting a scan taken before it.
   */
  const moved = async <T>(operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation();
    } finally {
      invalidate();
    }
  };

  const watcher: StorageWatcher = watchStorage(
    root,
    invalidate,
    watcherDebounceMs === undefined ? {} : { debounceMs: watcherDebounceMs },
  );

  return {
    async listEfforts(): Promise<readonly Effort[]> {
      return (await scan()).map(entry => entry.effort);
    },

    async listTickets(): Promise<readonly TicketSummary[]> {
      return (await scan()).flatMap(entry => summariesOf(entry));
    },

    async readTickets(handles): Promise<readonly Ticket[]> {
      // Deliberately the fresh walk rather than the cached one. A body is read
      // for the few Tickets being worked, and reading it against a scan taken
      // before another process wrote is exactly the staleness `get_tickets`
      // exists not to serve.
      return readBodies(scratch, await walk(), handles);
    },

    updateTicket(handle, edit, expectedRevision) {
      return moved(() => serialized(() => write(scratch, handle, edit, expectedRevision)));
    },

    createTickets(effort, drafts, options) {
      // The scan is deliberately not the cached one: allocation re-reads under
      // its own guards, and a walk started before them would defeat the check
      // it exists to make.
      return moved(() => serialized(() => create(scratch, effort, drafts, options, walk)));
    },

    readMap(effort) {
      return serialized(() => loadMap(scratch, effort));
    },

    editMap(effort, edit, expectedRevision, options) {
      return moved(() =>
        serialized(() => saveMap(scratch, effort, edit, expectedRevision, options)),
      );
    },

    readSpec(effort) {
      return serialized(() => loadSpec(scratch, effort));
    },

    putSpec(effort, body, expectedRevision, options) {
      return moved(() =>
        serialized(() => saveSpec(scratch, effort, body, expectedRevision, options)),
      );
    },

    migrateEffort(effort, options) {
      return moved(() => serialized(() => migrate(scratch, effort, options, walk)));
    },

    close() {
      watcher.close();
      invalidate();
    },
  };

  /**
   * Writes are serialized per workspace. Two calls racing on one Ticket would
   * otherwise both pass the revision check before either renamed, and the
   * loser's edit would be lost rather than refused. The queue is in-memory and
   * dies with the process — no lock file can outlive a crash.
   *
   * Queueing continues after a failure: one refused write must not stop the next.
   */
  function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const next = writes.then(operation, operation);
    writes = next.catch(() => undefined);
    return next;
  }
}

async function migrate(
  scratch: string,
  effort: string,
  options: MigrateOptions,
  walk: () => Promise<ScannedEffort[]>,
): Promise<MigrationReport> {
  const dir = join(scratch, effort);
  if ((await readEffort(scratch, effort)) === undefined) throw new NoSuchEffort(effort);

  const entries = await readTicketFiles(dir, effort);
  const allTickets = (await walk()).flatMap(summariesOf);
  const issues = join(dir, ISSUES_DIR);

  return migrateEffortFiles({
    scratch,
    effort,
    issues,
    entries,
    allTickets,
    preview: options.preview,
    rename: options.rename,
    // Allocation must not share a walk started before the guards — same reason
    // createTickets builds its own rescan.
    rescan: async () => (await walk()).flatMap(summariesOf),
    readContents: filename => readFile(join(issues, filename), 'utf8'),
  });
}

async function create(
  scratch: string,
  effort: string,
  drafts: readonly TicketDraft[],
  options: CreateOptions,
  walk: () => Promise<ScannedEffort[]>,
): Promise<readonly TicketSummary[]> {
  const dir = join(scratch, effort);
  const missing = (await readEffort(scratch, effort)) === undefined;
  if (missing && !options.createEffort) throw new NoSuchEffort(effort);

  // The directory is made inside, after validation — an Effort created here and
  // then refused would show up in list_efforts as an empty one nobody asked for.
  const filenames = await createTicketFiles({
    scratch,
    effort,
    dir,
    issues: join(dir, ISSUES_DIR),
    drafts,
    rescan: async () => (await walk()).flatMap(summariesOf),
    validate: options.validate ?? (() => {}),
    createEffort: missing,
  });

  const written = await readTicketFiles(dir, effort);
  const byFilename = new Map(written.map(entry => [entry.filename, entry.ticket]));

  return filenames.map(filename => {
    const ticket = byFilename.get(filename);
    if (ticket === undefined)
      throw new Error(`${filename} was written but could not be read back.`);
    return ticket;
  });
}

async function write(
  scratch: string,
  handle: string,
  edit: TicketEdit,
  expectedRevision: string,
): Promise<TicketWriteResult> {
  const located = await locate(scratch, handle);
  if (located === undefined) throw new NoSuchTicket(handle);

  const { dir, effort, filename, ticket } = located;
  const path = join(dir, ISSUES_DIR, filename);

  // The index that produced expectedRevision may be stale, so the check is
  // against the file as it is right now, immediately before the write.
  if ((await currentRevision(path)) !== expectedRevision) throw new RevisionMismatch(handle);

  const contents = await readFile(path, 'utf8');
  const updated = applyEdit(contents, edit, defaultsFor(ticket));

  try {
    await withGuard(path, expectedRevision, async () => {
      // Re-check inside the guard: holding it means nobody else can be writing
      // this revision, so a mismatch now is a genuinely earlier write.
      if ((await currentRevision(path)) !== expectedRevision) throw new RevisionMismatch(handle);
      await writeAtomically(path, updated);
    });
  } catch (error) {
    // Losing the guard and losing the revision race mean the same thing to a
    // caller: somebody else got there first, and nothing of theirs was touched.
    if (error instanceof GuardHeld) throw new RevisionMismatch(handle);
    throw error;
  }

  const written = (await readTicketFiles(dir, effort)).find(
    entry => entry.filename === filename,
  )?.ticket;
  if (written === undefined) throw new NoSuchTicket(handle);

  // Resolving or dropping moves what the Map's derived blocks must show. Refresh
  // them here so a session that never touches edit_map still leaves the file
  // truthful for a human reading it on GitHub. Best-effort: the Ticket Status is
  // already on disk, so a refresh failure must not make the lifecycle change look
  // like it failed — the Map catches up on a later successful refresh or edit.
  const warnings: string[] = [];
  if (edit.status === 'resolved' || edit.status === 'dropped') {
    try {
      await refreshMapDerived(scratch, effort);
    } catch {
      warnings.push(
        'Decisions-so-far / dropped Out-of-scope may be stale — Map derived refresh failed after the Ticket write.',
      );
    }
  }

  return { ticket: written, warnings };
}

async function loadMap(scratch: string, effort: string): Promise<MapDocument> {
  const path = join(scratch, effort, MAP_FILE);
  const revision = await currentRevision(path);
  if (revision === undefined) throw new NoSuchMap(effort);
  return readMapDocument(await readFile(path, 'utf8'), revision);
}

async function saveMap(
  scratch: string,
  effort: string,
  edit: MapEdit,
  expectedRevision: string | undefined,
  options: HeaderDocOptions,
): Promise<MapDocument> {
  const dir = join(scratch, effort);
  const path = join(dir, MAP_FILE);
  const current = await currentRevision(path);
  const handle = `map:${effort}`;

  if (current === undefined) {
    // createEffort only guards starting a new Effort. An Effort that already
    // holds a Spec or issues/ must be able to gain a Map without that flag —
    // that is wayfinder's handoff, not a mistyped slug.
    if ((await readEffort(scratch, effort)) === undefined && !options.createEffort) {
      throw new NoSuchEffort(effort);
    }

    await mkdir(join(dir, ISSUES_DIR), { recursive: true });
    const entries = await readTicketFiles(dir, effort);
    const seeded = applyMapEdit(
      scaffoldMap(edit),
      {},
      ticketPointers(entries, 'resolved'),
      ticketPointers(entries, 'dropped'),
    );
    await writeAtomically(path, seeded);
    return readMapDocument(seeded, await requireRevision(path));
  }

  if (expectedRevision === undefined || current !== expectedRevision) {
    throw new RevisionMismatch(handle);
  }

  const contents = await readFile(path, 'utf8');
  const entries = await readTicketFiles(dir, effort);
  const updated = applyMapEdit(
    contents,
    edit,
    ticketPointers(entries, 'resolved'),
    ticketPointers(entries, 'dropped'),
  );

  await guardedWrite(path, current, updated, handle);
  return readMapDocument(updated, await requireRevision(path));
}

/**
 * How many times a resolve/drop may re-read and rewrite the Map's derived
 * blocks when a parallel edit_map holds the guard. This path is server-owned
 * regeneration, not a caller CAS — swallowing GuardHeld left Decisions stale
 * when the winner had scanned Tickets before the resolve landed.
 */
const DERIVED_REFRESH_ATTEMPTS = 16;

/**
 * Rewrite the Map's generated blocks from the Effort's Tickets. No-op when the
 * Effort has no Map — a Spec-only Effort has nowhere to put them.
 *
 * Retries on GuardHeld / lost revision: re-read Map + Tickets and regenerate.
 * Invents the GENERATED-bearing headings when absent so a slim Map still gets
 * a truthful Decisions / Out-of-scope cache after resolve or drop.
 */
async function refreshMapDerived(scratch: string, effort: string): Promise<void> {
  return refreshMapDerivedOnce(scratch, effort, DERIVED_REFRESH_ATTEMPTS);
}

async function refreshMapDerivedOnce(
  scratch: string,
  effort: string,
  remaining: number,
): Promise<void> {
  const path = join(scratch, effort, MAP_FILE);
  const revision = await currentRevision(path);
  if (revision === undefined) return;

  const contents = await readFile(path, 'utf8');
  const entries = await readTicketFiles(join(scratch, effort), effort);
  const updated = applyMapEdit(
    contents,
    {},
    ticketPointers(entries, 'resolved'),
    ticketPointers(entries, 'dropped'),
    { ensureDerivedSections: true },
  );
  if (updated === contents) return;

  try {
    await withGuard(path, revision, async () => {
      if ((await currentRevision(path)) !== revision) {
        throw new DerivedRefreshLost();
      }
      await writeAtomically(path, updated);
    });
  } catch (error) {
    // Server-owned derived regeneration may retry; caller CAS mismatches never do.
    if (!(error instanceof GuardHeld || error instanceof DerivedRefreshLost)) throw error;
    if (remaining <= 1) {
      throw new Error(
        `Could not refresh Map derived blocks for ${effort} after concurrent edits.`,
        { cause: error },
      );
    }
    await new Promise(wait => setTimeout(wait, 10));
    return refreshMapDerivedOnce(scratch, effort, remaining - 1);
  }
}

/** Internal signal: another writer changed the Map while we held its guard. */
class DerivedRefreshLost extends Error {
  constructor() {
    super('Map revision changed during derived refresh');
    this.name = 'DerivedRefreshLost';
  }
}

async function loadSpec(scratch: string, effort: string): Promise<SpecDocument> {
  const path = join(scratch, effort, SPEC_FILE);
  const revision = await currentRevision(path);
  if (revision === undefined) throw new NoSuchSpec(effort);
  return { body: await readFile(path, 'utf8'), revision };
}

async function saveSpec(
  scratch: string,
  effort: string,
  body: string,
  expectedRevision: string | undefined,
  options: HeaderDocOptions,
): Promise<SpecDocument> {
  const dir = join(scratch, effort);
  const path = join(dir, SPEC_FILE);
  const current = await currentRevision(path);
  const handle = `spec:${effort}`;
  // Opaque bytes — store what the caller sent. No BOM strip, no trailing
  // newline inject, no frontmatter reshape (ADR 0001; Spec has no typed body).

  if (current === undefined) {
    // Same rule as Maps: createEffort starts an Effort; putting a Spec onto an
    // Effort that already has a Map needs no flag.
    if ((await readEffort(scratch, effort)) === undefined && !options.createEffort) {
      throw new NoSuchEffort(effort);
    }

    await mkdir(join(dir, ISSUES_DIR), { recursive: true });
    await writeAtomically(path, body);
    return { body, revision: await requireRevision(path) };
  }

  if (expectedRevision === undefined || current !== expectedRevision) {
    throw new RevisionMismatch(handle);
  }

  await guardedWrite(path, current, body, handle);
  return { body, revision: await requireRevision(path) };
}

async function guardedWrite(
  path: string,
  revision: string,
  contents: string,
  handle: string,
): Promise<void> {
  try {
    await withGuard(path, revision, async () => {
      if ((await currentRevision(path)) !== revision) throw new RevisionMismatch(handle);
      await writeAtomically(path, contents);
    });
  } catch (error) {
    if (error instanceof GuardHeld) throw new RevisionMismatch(handle);
    throw error;
  }
}

async function requireRevision(path: string): Promise<string> {
  const revision = await currentRevision(path);
  if (revision === undefined) {
    throw new Error(`Wrote ${path} but could not read its revision back.`);
  }
  return revision;
}

function ticketPointers(
  entries: readonly TicketFileEntry[],
  status: 'resolved' | 'dropped',
): DerivedPointer[] {
  return entries.flatMap(entry => {
    const { ticket, filename } = entry;
    if (ticket.status !== status || ticket.id === undefined) return [];
    const gist = status === 'resolved' ? ticket.answerGist : ticket.droppedReason;
    return [
      {
        id: ticket.id,
        title: ticket.title,
        link: `${ISSUES_DIR}/${filename}`,
        gist: gist ?? '',
      },
    ];
  });
}

/** Find the file backing a Ticket, by id or by its `<effort>#<order>` handle. */
async function locate(
  scratch: string,
  handle: string,
): Promise<{ dir: string; effort: string; filename: string; ticket: TicketSummary } | undefined> {
  const slugs = await readDirectories(scratch);
  const perEffort = await Promise.all(
    slugs.map(async slug => ({ slug, entries: await readTicketFiles(join(scratch, slug), slug) })),
  );

  for (const { slug, entries } of perEffort) {
    const found = entries.find(
      entry => entry.ticket.id === handle || entry.ticket.handle === handle,
    );

    if (found !== undefined) {
      return {
        dir: join(scratch, slug),
        effort: slug,
        filename: found.filename,
        ticket: found.ticket,
      };
    }
  }

  return undefined;
}

function defaultsFor(ticket: TicketSummary): Defaults {
  return {
    id: ticket.id,
    title: ticket.title,
    kind: ticket.kind,
    type: ticket.type,
    status: ticket.status,
    triage: ticket.triage,
    blockedBy: ticket.blockedBy,
  };
}

interface ScannedEffort {
  readonly effort: Effort;
  /**
   * The Effort's Ticket files in sort order. A scan keeps the filename beside
   * each summary because that is what a body fetch opens — the pairing stays
   * below the seam, where paths live.
   */
  readonly entries: readonly TicketFileEntry[];
}

interface TicketFileEntry {
  readonly filename: string;
  readonly ticket: TicketSummary;
}

/** The Tickets of one scanned Effort, without the files behind them. */
function summariesOf(scanned: ScannedEffort): readonly TicketSummary[] {
  return scanned.entries.map(entry => entry.ticket);
}

/**
 * The named Tickets with their prose, read from disk now. The scan located the
 * files; their bodies are read here rather than carried by every scan, so the
 * cost is paid per Ticket worked instead of per Ticket in the workspace.
 *
 * A name matching nothing yields nothing — naming what was missing belongs to
 * the caller, which is the only side that knows what it asked for.
 */
async function readBodies(
  scratch: string,
  scanned: readonly ScannedEffort[],
  handles: readonly string[],
): Promise<readonly Ticket[]> {
  const wanted = new Set(handles);

  const found = scanned.flatMap(entry =>
    entry.entries
      .filter(
        ({ ticket }) =>
          wanted.has(ticket.handle) || (ticket.id !== undefined && wanted.has(ticket.id)),
      )
      .map(({ filename, ticket }) => ({
        ticket,
        path: join(scratch, entry.effort.slug, ISSUES_DIR, filename),
      })),
  );

  return Promise.all(
    found.map(async ({ ticket, path }) => withBody(ticket, ticketBody(await readText(path)))),
  );
}

function withBody(ticket: TicketSummary, body: string): Ticket {
  return { ...ticket, body };
}

/**
 * Every Ticket in one Effort with the file behind it, in sort order, each read
 * for its fields and not for its prose. Paths never cross the driver interface,
 * so this pairing stays inside the driver — it is how a write finds the file a
 * Ticket came from, and how a body fetch finds the one it must open.
 */
async function readTicketFiles(dir: string, effort: string): Promise<TicketFileEntry[]> {
  const issues = join(dir, ISSUES_DIR);
  const entries = await readDir(issues);
  const filenames = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name)
    .toSorted();

  const parsed = await Promise.all(
    filenames.map(async (filename, position) => {
      const path = join(issues, filename);
      const [contents, revision] = await Promise.all([
        readFile(path, 'utf8'),
        currentRevision(path),
      ]);
      // A file with no `NN-` prefix still needs a position; its place in the
      // sorted listing is the only order it has.
      return {
        filename,
        ticket: parseTicketSummary(effort, { filename, contents }, position + 1, revision ?? ''),
      };
    }),
  );

  return withUniqueHandles(parsed.toSorted((a, b) => a.ticket.order - b.ticket.order));
}

/**
 * Two files can share an `NN-` prefix, which would give two id-less Tickets the
 * same `<effort>#<order>` handle and make one of them unfetchable. Later
 * collisions get a suffix, so every Ticket stays individually addressable.
 */
function withUniqueHandles(entries: readonly TicketFileEntry[]): TicketFileEntry[] {
  const seen = new Set<string>();

  return entries.map(entry => {
    const { ticket } = entry;
    if (!seen.has(ticket.handle)) {
      seen.add(ticket.handle);
      return entry;
    }

    let suffix = 2;
    while (seen.has(`${ticket.handle}.${String(suffix)}`)) suffix += 1;
    const handle = `${ticket.handle}.${String(suffix)}`;
    seen.add(handle);

    return { filename: entry.filename, ticket: { ...ticket, handle } };
  });
}

/**
 * A directory under `.scratch/` is an Effort only once it holds something the
 * schema recognizes — a Header doc or an `issues/` directory. `.scratch/` is
 * also where these repos keep loose scratch output, and a directory of research
 * notes is not an empty Effort.
 */
async function readEffort(scratch: string, slug: string): Promise<ScannedEffort | undefined> {
  const dir = join(scratch, slug);
  const listing = await readDir(dir);

  const files = new Set(listing.filter(entry => entry.isFile()).map(entry => entry.name));
  const headerDocs = HEADER_DOCS.filter(([, filename]) => files.has(filename)).map(([doc]) => doc);

  const hasIssues = listing.some(entry => entry.isDirectory() && entry.name === ISSUES_DIR);
  if (headerDocs.length === 0 && !hasIssues) return undefined;

  const [entries, destination, specOpening] = await Promise.all([
    readTicketFiles(dir, slug),
    headerDocs.includes('map')
      ? readText(join(dir, 'map.md')).then(contents =>
          readSection(contents, SECTION_HEADINGS.destination),
        )
      : undefined,
    headerDocs.includes('spec') ? readText(join(dir, 'spec.md')).then(readSpecOpening) : undefined,
  ]);

  return {
    effort: { slug, headerDocs, ticketCount: entries.length, destination, specOpening },
    entries,
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
