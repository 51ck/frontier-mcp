import { lstat, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { lstatSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { isMap, parseDocument } from 'yaml';

import type {
  Diagnostic,
  Effort,
  HeaderDoc,
  MapDocument,
  MapEdit,
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
import { compareByOrderHint } from '../../board-order.ts';
import type { TicketEdit } from '../../domain.ts';
import { duplicateKindOf, fullNameOf, indexNames } from '../../names.ts';
import {
  EffortSpelledDifferently,
  InvalidEffortSlug,
  NoSuchEffort,
  NoSuchMap,
  NoSuchSpec,
  DuplicateId,
  NoSuchTicket,
  RevisionMismatch,
  SymlinkedEffort,
  SymlinkedHeaderDoc,
  TicketStorageUnusable,
  WriteWouldExclude,
} from '../driver.ts';
import { createTicketFiles } from './create.ts';
import {
  diagnostic,
  isEffortSlug,
  ISSUES_DIR,
  MAP_FILE,
  SPEC_FILE,
  trackerContract,
} from './schema.ts';
import { applyEdit, type Defaults } from './serialize.ts';
import {
  AtomicWriteConflict,
  currentRevision,
  GuardHeld,
  withGuard,
  writeAtomically,
} from './write.ts';
import {
  applyMapEdit,
  assertNoSectionBreaks,
  type DerivedPointer,
  readMapDocument,
  readSection,
  readSpecOpening,
  scaffoldMap,
  SECTION_HEADINGS,
} from './header-doc.ts';
import {
  classifyTicketFile,
  diagnosedNames,
  isMarked,
  type Problem,
  ticketBody,
  unimportedFrontmatter,
} from './ticket.ts';
import { watchStorage, type StorageWatcher } from './watcher.ts';

/**
 * The layout this driver serves, per AGENTS.md, under the storage directory it
 * was constructed with:
 *
 *   <storage>/<effort>/
 *   ├── map.md            # Header doc — wayfinder
 *   ├── spec.md           # Header doc — to-spec
 *   └── issues/
 *       └── <name>.md     # Tickets; an older file may carry an `NN-` prefix
 *
 * Only these are listed: the storage directory, each Effort directory, and
 * each `issues/` (ADR 0009). Nothing below `issues/` and no other directory of
 * an Effort is ever entered. A file there is a Ticket only when marked and
 * valid; what else is noticed there is a Diagnostic, never an error.
 */
const DEFAULT_STORAGE_DIR = '.scratch';
/** 1.x read `id_pattern` from it. Its contents decide nothing now; it only earns a warning. */
const CONFIG_FILE = 'frontier.yml';
const HEADER_DOCS: ReadonlyArray<readonly [HeaderDoc, string]> = [
  ['map', MAP_FILE],
  ['spec', SPEC_FILE],
];

export interface MarkdownDriverOptions {
  /**
   * The directory under `root` this driver keeps its Efforts in, relative to
   * the workspace root and one segment deep. Defaults to `.scratch`.
   *
   * It is a parameter rather than a constant because it is this driver's answer
   * to "what do you call your storage", which the seam exists to keep from
   * being everybody's.
   */
  readonly storageDir?: string;
  /** Debounce filesystem watcher events before dropping the scan. */
  readonly watcherDebounceMs?: number;
  /**
   * When the watcher drops the scan unconditionally after attaching, to cover
   * the events an `fs.watch` loses while it is still warming up — see
   * {@link watchStorage}. It exists so a test can pin those moments and assert
   * on them; the default schedule is the right one for real use.
   */
  readonly watcherSettleMs?: readonly number[];
  /** Force the watcher's per-directory mode, which only Linux uses by default. Only `true` exists. */
  readonly watcherPerDirectory?: true;
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
 * "Live" arrives slightly after construction, though: a watch is not delivering
 * events the instant it is created, and what it misses in that window is gone
 * rather than delayed, so the driver drops its scan a few times while the watch
 * warms.
 *
 * Close it to stop the watcher; a process that keeps a workspace open forever
 * never needs to.
 */
export function createMarkdownDriver(
  root: string,
  {
    storageDir = DEFAULT_STORAGE_DIR,
    watcherDebounceMs,
    watcherSettleMs,
    watcherPerDirectory,
  }: MarkdownDriverOptions = {},
): StorageDriver {
  const storage = join(root, storageDir);
  const relativeStorage = storageDir.split(/[\\/]/).filter(Boolean).join('/');
  // Read once and not watched: the answer changes only when a person deletes the file.
  const ignoredConfig = ignoredConfigWarning(storage, storageDir);
  let writes: Promise<unknown> = Promise.resolve();
  // Set only when the cached scan completes, so a Board's duplicate warning
  // describes the scan its lines were built from. The fresh walks behind
  // readTickets, create and diagnosticsFor never touch it. Kept beside the cache rather
  // than in it because workspaceWarnings is synchronous.
  let duplicates: DuplicateClaims = { ids: [], names: [] };
  // Beside `duplicates`, for the same reason: the cached scan's, read synchronously.
  let linkedEfforts: readonly string[] = [];

  const walk = async (): Promise<ScannedEffort[]> => {
    // A repo that has never used the tracker is a supported starting state,
    // not an error: it simply holds no Efforts.
    const slugs = await readDirectories(storage);
    const scanned = await Promise.all(
      slugs.map(slug => readEffort(storage, slug, relativeStorage)),
    );

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
  let cachedScan: Promise<ScannedEffort[]> | undefined;
  const scan = () => {
    if (cachedScan === undefined) {
      const started: Promise<ScannedEffort[]> = Promise.all([
        walk(),
        readLinkedDirectories(storage),
      ]).then(
        ([efforts, linked]) => {
          // A walk an invalidation has already replaced must not overwrite the
          // warning the newer scan's Board lines belong with.
          if (cachedScan === started) {
            duplicates = duplicateClaims(efforts);
            linkedEfforts = linked;
          }
          return efforts;
        },
        (error: unknown) => {
          if (cachedScan === started) cachedScan = undefined;
          throw error;
        },
      );
      cachedScan = started;
    }
    return cachedScan;
  };

  /** Drop the scan, so the next read rebuilds from disk. */
  const invalidate = () => {
    cachedScan = undefined;
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

  const watcher: StorageWatcher = watchStorage(root, storageDir, invalidate, {
    debounceMs: watcherDebounceMs,
    settleMs: watcherSettleMs,
    perDirectory: watcherPerDirectory,
  });

  return {
    async listEfforts(): Promise<readonly Effort[]> {
      return (await scan()).filter(entry => !entry.diagnosticOnly).map(entry => entry.effort);
    },

    async listTickets(): Promise<readonly TicketSummary[]> {
      return (await scan()).flatMap(entry => summariesOf(entry));
    },

    absentStorage() {
      return isAbsent(storage) ? `${storageDir}/` : undefined;
    },

    workspaceWarnings() {
      const warnings = ignoredConfig === undefined ? [] : [ignoredConfig];
      if (linkedEfforts.length > 0) {
        warnings.push(symlinkedEffortWarning(linkedEfforts, relativeStorage));
      }
      if (duplicates.ids.length > 0) warnings.push(duplicateWarning(duplicates.ids, DUPLICATE_IDS));
      if (duplicates.names.length > 0) {
        warnings.push(duplicateWarning(duplicates.names, DUPLICATE_NAMES));
      }
      return warnings;
    },

    async assertAddressable(handle) {
      await locate(storage, handle);
    },

    contract() {
      return trackerContract(relativeStorage);
    },

    async trackerDiagnostics() {
      // Fresh, as diagnosticsFor is: the call that lists what to fix by hand
      // must see the hand edit just made.
      return (await walk()).map(({ diagnosticOnly, effort }) => ({
        slug: effort.slug,
        effort: !diagnosticOnly,
        diagnostics: effort.diagnostics,
      }));
    },

    async diagnosticsFor(handles) {
      // Fresh, as readTickets is: one walk for every handle, however many.
      return diagnosticsIn(await walk(), handles);
    },

    async readTickets(handles) {
      // Deliberately the fresh walk rather than the cached one. A body is read
      // for the few Tickets being worked, and reading it against a scan taken
      // before another process wrote is exactly the staleness `get_tickets`
      // exists not to serve. It costs a walk a concurrent Board would have
      // shared — the price of an answer nothing can have staled underneath it.
      const scanned = await walk();
      const tickets = await readBodies(storage, scanned, handles);
      const names = indexNames(tickets);
      const missed = handles.filter(handle => names.input(handle).length === 0);
      return { tickets, diagnostics: diagnosticsIn(scanned, missed) };
    },

    updateTicket(handle, edit, expectedRevision, settle) {
      const settled =
        settle === undefined
          ? undefined
          : async () => settle((await walk()).flatMap(entry => summariesOf(entry)));
      return moved(() => serialized(() => write(storage, handle, edit, expectedRevision, settled)));
    },

    createTickets(effort, drafts, options) {
      // The scan is deliberately not the cached one: the last check before the
      // write has to see what another process has just created.
      return moved(() => serialized(() => create(storage, effort, drafts, options, walk)));
    },

    readMap(effort) {
      return serialized(() => loadMap(storage, effort));
    },

    editMap(effort, edit, expectedRevision, options) {
      return moved(() =>
        serialized(() => saveMap(storage, effort, edit, expectedRevision, options)),
      );
    },

    readSpec(effort) {
      return serialized(() => loadSpec(storage, effort));
    },

    putSpec(effort, body, expectedRevision, options) {
      return moved(() =>
        serialized(() => saveSpec(storage, effort, body, expectedRevision, options)),
      );
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

/**
 * What a Board says about a `frontier.yml` left over from 1.x, or undefined
 * when there is nothing to say. The file configured the id pattern and nothing
 * else, and nothing mints an id (ADR 0008), so it is never validated and can
 * never refuse a write: one that still sets `id_pattern`, or cannot be parsed
 * to find out, gets the same line. Nothing of its contents is echoed.
 */
function ignoredConfigWarning(storage: string, storageDir: string): string | undefined {
  let contents: string;
  try {
    // Only the storage directory itself is followed as a link.
    if (lstatSync(join(storage, CONFIG_FILE)).isSymbolicLink()) return undefined;
    contents = readFileSync(join(storage, CONFIG_FILE), 'utf8');
  } catch {
    return undefined;
  }

  const document = parseDocument(contents);
  const setsPattern = isMap(document.contents) && document.contents.has('id_pattern');
  if (document.errors.length === 0 && !setsPattern) return undefined;

  return (
    `${storageDir}/${CONFIG_FILE} is ignored since FrontierMCP 2.0: no id is minted, so ` +
    'id_pattern does nothing and no write depends on this file — it can be deleted'
  );
}

async function create(
  storage: string,
  effort: string,
  drafts: readonly TicketDraft[],
  options: CreateOptions,
  walk: () => Promise<ScannedEffort[]>,
): Promise<readonly TicketSummary[]> {
  const dir = await realEffortDir(storage, effort);

  // A case-insensitive filesystem would open the existing directory under the
  // caller's spelling, and every in-Effort rule above the seam, which looks the
  // slug up exactly, would be skipped. On a case-sensitive one a second Effort
  // would land beside the first with the same folded full names.
  // A diagnostic-only directory counts: under another spelling it is still the
  // directory a case-insensitive filesystem would open.
  const slugs = (await walk()).map(scanned => scanned.effort.slug);
  if (!slugs.includes(effort)) {
    const twin = slugs.find(slug => slug.toLowerCase() === effort.toLowerCase());
    if (twin !== undefined) throw new EffortSpelledDifferently(effort, twin);
  }

  if (await isSymlink(join(dir, ISSUES_DIR))) {
    throw new TicketStorageUnusable(
      `${effort}/${ISSUES_DIR} is a symbolic link, and Tickets are only written to a real directory.`,
    );
  }

  const missing = !(await isEffort(storage, effort));
  if (missing && !options.createEffort) throw new NoSuchEffort(effort);

  // The directory is made inside, after validation — an Effort created here and
  // then refused would show up in list_efforts as an empty one nobody asked for.
  const files = await createTicketFiles({
    effort,
    dir,
    issues: join(dir, ISSUES_DIR),
    rescan: async () => (await walk()).flatMap(summariesOf),
    settle: options.settle ?? (() => drafts),
    createEffort: missing,
    validate: (name, filename, contents) =>
      assertStillATicket(`${effort}.${name}`, effort, filename, contents),
  });

  // The files have landed, so from here the call has succeeded. A read-back
  // that fails, or misses a file another session has already replaced, falls
  // back to the text that was written rather than reporting a failure.
  const written = await readTicketFiles(dir, effort).catch(() => []);
  const byFilename = new Map(written.map(entry => [entry.filename, entry.ticket]));

  return files.map(({ filename, contents }) => {
    const read = byFilename.get(filename);
    if (read !== undefined) return read;
    const asWritten = classifyTicketFile(effort, { filename, contents }, '');
    // The file was serialized by this driver, so it classifies as a Ticket.
    if (asWritten.kind !== 'ticket') throw new Error(`${effort}.${filename} wrote invalid`);
    return asWritten.ticket;
  });
}

async function write(
  storage: string,
  handle: string,
  requested: TicketEdit,
  expectedRevision: string,
  settled: (() => Promise<TicketEdit>) | undefined,
): Promise<TicketWriteResult> {
  const located = await locate(storage, handle);
  if (located === undefined) throw new NoSuchTicket(handle);

  const { dir, effort, filename, ticket } = located;
  const path = join(dir, ISSUES_DIR, filename);

  // The index that produced expectedRevision may be stale, so the check is
  // against the file as it is right now, immediately before the write.
  if ((await currentRevision(path)) !== expectedRevision) throw new RevisionMismatch(handle);

  const edit = settled === undefined ? requested : await settled();
  const contents = await readFile(path, 'utf8');
  const updated = applyEdit(contents, edit, defaultsFor(ticket));
  assertStillATicket(handle, effort, filename, updated);

  try {
    await withGuard(path, expectedRevision, async () => {
      // Re-check inside the guard: holding it means nobody else can be writing
      // this revision, so a mismatch now is a genuinely earlier write.
      if ((await currentRevision(path)) !== expectedRevision) throw new RevisionMismatch(handle);
      await writeAtomically(path, updated, expectedRevision);
    });
  } catch (error) {
    // Losing the guard and losing the revision race mean the same thing to a
    // caller: somebody else got there first, and nothing of theirs was touched.
    if (error instanceof GuardHeld || error instanceof AtomicWriteConflict) {
      throw new RevisionMismatch(handle);
    }
    throw error;
  }

  const written = (await readTicketFiles(dir, effort)).find(
    entry => entry.filename === filename,
  )?.ticket;
  if (written === undefined) throw new NoSuchTicket(handle);

  // Resolving or dropping moves what the Map's derived blocks must show; reopening
  // clears a gist or dropped_reason that those blocks may still list. Refresh them
  // here so a session that never touches edit_map still leaves the file truthful
  // for a human reading it on GitHub. Best-effort: the Ticket Status is already
  // on disk, so a refresh failure must not make the lifecycle change look like it
  // failed — the Map catches up on a later successful refresh or edit.
  const warnings: string[] = [];
  const reopenClearsDerived =
    edit.status === 'open' && (edit.answerGist === null || edit.droppedReason === null);
  if (edit.status === 'resolved' || edit.status === 'dropped' || reopenClearsDerived) {
    try {
      await refreshMapDerived(storage, effort);
    } catch {
      warnings.push(
        'Decisions-so-far / dropped Out-of-scope may be stale — Map derived refresh failed after the Ticket write.',
      );
    }
  }

  return { ticket: written, warnings };
}

/**
 * Refuse text the scan would not read back as a Ticket. The scan's own
 * validator judges it, so a write can never land a file the server then
 * excludes: a blank title, or an anchored value the marker aliases.
 */
export function assertStillATicket(
  handle: string,
  effort: string,
  filename: string,
  contents: string,
): void {
  const classified = classifyTicketFile(effort, { filename, contents }, '');
  if (classified.kind === 'ticket') return;
  throw new WriteWouldExclude(
    handle,
    classified.kind === 'excluded'
      ? classified.problems.map(problem =>
          [
            problem.code,
            problem.key === undefined ? undefined : `key=${problem.key}`,
            problem.expected === undefined ? undefined : `expected=${problem.expected}`,
          ]
            .filter(part => part !== undefined)
            .join(' '),
        )
      : ['the marker would be lost'],
  );
}

async function loadMap(storage: string, effort: string): Promise<MapDocument> {
  const path = await headerDocPath(storage, effort, MAP_FILE);
  const revision = await currentRevision(path);
  if (revision === undefined) throw new NoSuchMap(effort);
  return readMapDocument(await readFile(path, 'utf8'), revision);
}

async function saveMap(
  storage: string,
  effort: string,
  edit: MapEdit,
  expectedRevision: string | undefined,
  options: HeaderDocOptions,
): Promise<MapDocument> {
  const dir = await realEffortDir(storage, effort);
  const path = await headerDocPath(storage, effort, MAP_FILE);
  const current = await currentRevision(path);
  const handle = `map:${effort}`;
  assertNoSectionBreaks(edit);

  if (current === undefined) {
    // createEffort only guards starting a new Effort. An Effort that already
    // holds a Spec or issues/ must be able to gain a Map without that flag —
    // that is wayfinder's handoff, not a mistyped slug.
    if (!(await isEffort(storage, effort)) && !options.createEffort) {
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
async function refreshMapDerived(storage: string, effort: string): Promise<void> {
  return refreshMapDerivedOnce(storage, effort, DERIVED_REFRESH_ATTEMPTS);
}

async function refreshMapDerivedOnce(
  storage: string,
  effort: string,
  remaining: number,
): Promise<void> {
  // A linked Map refuses here, and the caller reports it as stale blocks.
  const path = await headerDocPath(storage, effort, MAP_FILE);
  const revision = await currentRevision(path);
  if (revision === undefined) return;

  const contents = await readFile(path, 'utf8');
  const entries = await readTicketFiles(await realEffortDir(storage, effort), effort);
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
    return refreshMapDerivedOnce(storage, effort, remaining - 1);
  }
}

/** Internal signal: another writer changed the Map while we held its guard. */
class DerivedRefreshLost extends Error {
  constructor() {
    super('Map revision changed during derived refresh');
    this.name = 'DerivedRefreshLost';
  }
}

async function loadSpec(storage: string, effort: string): Promise<SpecDocument> {
  const path = await headerDocPath(storage, effort, SPEC_FILE);
  const revision = await currentRevision(path);
  if (revision === undefined) throw new NoSuchSpec(effort);
  return { body: await readFile(path, 'utf8'), revision };
}

async function saveSpec(
  storage: string,
  effort: string,
  body: string,
  expectedRevision: string | undefined,
  options: HeaderDocOptions,
): Promise<SpecDocument> {
  const dir = await realEffortDir(storage, effort);
  const path = await headerDocPath(storage, effort, SPEC_FILE);
  const current = await currentRevision(path);
  const handle = `spec:${effort}`;
  // Opaque bytes — store what the caller sent. No BOM strip, no trailing
  // newline inject, no frontmatter reshape (ADR 0001; Spec has no typed body).

  if (current === undefined) {
    // Same rule as Maps: createEffort starts an Effort; putting a Spec onto an
    // Effort that already has a Map needs no flag.
    if (!(await isEffort(storage, effort)) && !options.createEffort) {
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
    if (ticket.status !== status) return [];
    const gist = status === 'resolved' ? ticket.answerGist : ticket.droppedReason;
    return [
      {
        id: ticket.name,
        title: ticket.title,
        link: `${ISSUES_DIR}/${filename}`,
        gist: gist ?? '',
      },
    ];
  });
}

/**
 * Find the file backing a Ticket, by whatever names it: an id, a full name, or
 * a bare name only one Effort has.
 */
async function locate(
  storage: string,
  handle: string,
): Promise<{ dir: string; effort: string; filename: string; ticket: TicketSummary } | undefined> {
  const slugs = await readDirectories(storage);
  const perEffort = await Promise.all(
    slugs.map(async slug => ({ slug, entries: await readTicketFiles(join(storage, slug), slug) })),
  );

  const files = perEffort.flatMap(({ slug, entries }) =>
    entries.map(entry => ({
      dir: join(storage, slug),
      effort: slug,
      filename: entry.filename,
      ticket: entry.ticket,
    })),
  );
  const byTicket = new Map(files.map(file => [file.ticket, file]));
  const found = indexNames(files.map(file => file.ticket))
    .input(handle)
    .map(ticket => byTicket.get(ticket))
    .filter(file => file !== undefined);

  if (found.length > 1) {
    throw new DuplicateId(
      handle,
      found.map(entry => relativeFile(entry.effort, entry.filename)),
      duplicateKindOf(found.map(entry => entry.ticket)),
    );
  }
  return found[0];
}

function relativeFile(effort: string, filename: string): string {
  return `${effort}/${ISSUES_DIR}/${filename}`;
}

/** One duplicated id or name: how it is spelled, and every file claiming it. */
interface DuplicateClaim {
  readonly label: string;
  readonly files: readonly string[];
}

interface DuplicateClaims {
  /** Sets whose claimants all carry one id. */
  readonly ids: readonly DuplicateClaim[];
  /** Every other set: Tickets that share a full name, not all by carrying one id. */
  readonly names: readonly DuplicateClaim[];
}

/** Each scanned Ticket's file, and the name index that says which of them are duplicates. */
function filesByTicket(scanned: readonly ScannedEffort[]) {
  const fileOf = new Map<TicketSummary, string>();
  for (const { effort, entries } of scanned) {
    for (const { filename, ticket } of entries) {
      fileOf.set(ticket, relativeFile(effort.slug, filename));
    }
  }
  return { fileOf, names: indexNames(scanned.flatMap(summariesOf)) };
}

/** What `Names.duplicates` finds in a scan, with the file behind every claimant. */
function duplicateClaims(scanned: readonly ScannedEffort[]): DuplicateClaims {
  const { fileOf, names } = filesByTicket(scanned);
  const ids: DuplicateClaim[] = [];
  const named: DuplicateClaim[] = [];
  for (const claimants of names.duplicates()) {
    const [first] = claimants;
    if (first === undefined) continue;
    (duplicateKindOf(claimants) === 'id' ? ids : named).push({
      label: fullNameOf(first),
      files: claimants.map(claimant => fileOf.get(claimant) ?? ''),
    });
  }
  return { ids, names: named };
}

// Reported, never repaired: renumbering cannot reach the commit messages and
// PR bodies that already name the id, so the fix stays a human act.
// Capped because it rides every Board: the first few ids name their files, the
// next few are named bare, and the rest are counted. The count stays exact.
const DUPLICATES_WITH_FILES = 3;
const DUPLICATES_NAMED = 10;

const DUPLICATE_IDS = {
  what: 'duplicate ids, each carried by more than one Ticket file',
  fix: 'renumber all but one by hand',
};
const DUPLICATE_NAMES = {
  what: 'duplicate names, each the full name of more than one Ticket file',
  fix: 'rename all but one file by hand',
};

function duplicateWarning(
  duplicates: readonly DuplicateClaim[],
  wording: { readonly what: string; readonly fix: string },
): string {
  const sorted = duplicates.toSorted((a, b) => a.label.localeCompare(b.label));
  const withFiles = sorted
    .slice(0, DUPLICATES_WITH_FILES)
    .map(({ label, files }) => `${label} (${files.join(', ')})`);
  const named = sorted
    .slice(DUPLICATES_WITH_FILES, DUPLICATES_WITH_FILES + DUPLICATES_NAMED)
    .map(({ label }) => label);
  const rest = sorted.length - DUPLICATES_WITH_FILES - named.length;

  let listed = withFiles.join('; ');
  if (named.length > 0) listed += `; also ${named.join(' ')}`;
  if (rest > 0) listed += ` and ${String(rest)} more`;
  return (
    `${wording.what} (${String(duplicates.length)}): ` +
    `${listed} — writes to them are refused; ${wording.fix}`
  );
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

/** Every diagnosed file's Diagnostics, keyed by each handle that would name it. */
function diagnosticsIn(
  scanned: readonly ScannedEffort[],
  handles: readonly string[],
): ReadonlyMap<string, readonly Diagnostic[]> {
  const byName = new Map<string, Diagnostic[]>();
  for (const { effort, excluded } of scanned) {
    for (const file of excluded) {
      const keys = new Set(
        file.names.flatMap(name => [name, `${effort.slug}.${name}`]).map(n => n.toLowerCase()),
      );
      for (const key of keys) {
        byName.set(key, [...(byName.get(key) ?? []), ...file.diagnostics]);
      }
    }
  }
  return new Map(handles.map(handle => [handle, byName.get(handle.toLowerCase()) ?? []]));
}

interface ScannedEffort {
  readonly effort: Effort;
  /**
   * A directory with no Header doc and no `issues/` that holds a marked `.md`:
   * scanned only so that file is diagnosed `ticket-outside-issues`. It is not
   * an Effort — never listed, never a Board, never a target for a write.
   */
  readonly diagnosticOnly: boolean;
  /**
   * The Effort's Ticket files by filename prefix, then by name. A scan keeps
   * the filename beside each summary because that is what a body fetch opens —
   * the pairing stays below the seam, where paths live.
   */
  readonly entries: readonly TicketFileEntry[];
  /** Files diagnosed rather than served — excluded or suggested — by the names each would have. */
  readonly excluded: readonly ExcludedFile[];
}

interface TicketFileEntry {
  readonly filename: string;
  readonly ticket: TicketSummary;
}

/** A file diagnosed in place of being a Ticket, by every name it would answer to. */
interface ExcludedFile {
  /** Its id when its fence parsed and carried one, and its stem name. */
  readonly names: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}

interface IssuesListing {
  readonly entries: TicketFileEntry[];
  readonly excluded: ExcludedFile[];
  readonly diagnostics: Diagnostic[];
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
  storage: string,
  scanned: readonly ScannedEffort[],
  handles: readonly string[],
): Promise<readonly Ticket[]> {
  const names = indexNames(scanned.flatMap(summariesOf));
  const wanted = new Set(handles.flatMap(handle => names.input(handle)));

  const found = scanned.flatMap(entry =>
    entry.entries
      .filter(({ ticket }) => wanted.has(ticket))
      .map(({ filename, ticket }) => ({
        ticket,
        path: join(storage, entry.effort.slug, ISSUES_DIR, filename),
      })),
  );

  return Promise.all(found.map(async ({ ticket, path }) => withBody(ticket, await readText(path))));
}

function withBody(ticket: TicketSummary, contents: string): Ticket {
  const body = ticketBody(contents);
  const unimported = unimportedFrontmatter(contents);
  return unimported === undefined ? { ...ticket, body } : { ...ticket, body, unimported };
}

/**
 * Every Ticket in one Effort with the file behind it, by filename prefix and
 * then by name — never by Edges, which only a Board orders by — each read
 * for its fields and not for its prose. Paths never cross the driver interface,
 * so this pairing stays inside the driver — it is how a write finds the file a
 * Ticket came from, and how a body fetch finds the one it must open.
 */
async function readTicketFiles(dir: string, effort: string): Promise<TicketFileEntry[]> {
  return (await readIssues(dir, effort, '')).entries;
}

/**
 * One `issues/` listing, classified file by file (ADR 0009). A directory in it
 * is noticed from its entry and never entered. `prefix` is the Effort
 * directory relative to the workspace root, for the Diagnostics' paths.
 */
async function readIssues(dir: string, effort: string, prefix: string): Promise<IssuesListing> {
  const issues = join(dir, ISSUES_DIR);
  const relative = `${prefix}${ISSUES_DIR}/`;
  // Not followed: a link would serve, and let writes land in, a directory
  // outside the storage root. Only the storage directory itself may be a link.
  if (await isSymlink(issues)) {
    return {
      entries: [],
      excluded: [],
      diagnostics: [
        diagnostic('symlinked-issues', {
          file: `${prefix}${ISSUES_DIR}`,
          expected: 'a directory, not a symbolic link',
          fix: `replace the link with the directory itself by hand; nothing through it is read`,
        }),
      ],
    };
  }
  const listing = await readDir(issues);
  const diagnostics: Diagnostic[] = listing
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .toSorted()
    .map(name =>
      diagnostic('directory-in-issues', {
        file: `${relative}${name}/`,
        expected: `Ticket files directly in ${relative}`,
        fix: `move any Ticket in it up into ${relative} by hand; nothing below ${relative} is read`,
      }),
    );
  const filenames = listing
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name)
    .toSorted();

  const read = await Promise.all(
    filenames.map(async filename => {
      const path = join(issues, filename);
      let contents: string;
      let revision: string | undefined;
      try {
        [contents, revision] = await Promise.all([readFile(path, 'utf8'), currentRevision(path)]);
      } catch (error) {
        // Listed and then gone: another process took back a batch it could not
        // complete. It is not a Ticket of this Effort, and never was.
        if (isMissing(error)) return undefined;
        // Unopenable is diagnosed, never read as unmarked: a Ticket at mode 000
        // must not vanish from a Board that otherwise looks complete.
        if (isUnreadable(error)) return { filename, unreadable: true as const };
        throw error;
      }
      return {
        filename,
        contents,
        classified: classifySafely(effort, filename, contents, revision ?? ''),
      };
    }),
  );

  const entries: TicketFileEntry[] = [];
  const excluded: ExcludedFile[] = [];
  for (const file of read) {
    if (file === undefined) continue;
    if ('unreadable' in file) {
      const unreadable: Diagnostic = diagnostic('unreadable', {
        file: `${relative}${file.filename}`,
        expected: 'a file the server can read',
        fix: 'fix its permissions by hand so the server can read it',
      });
      diagnostics.push(unreadable);
      excluded.push({ names: diagnosedNames(file.filename, ''), diagnostics: [unreadable] });
      continue;
    }
    const { filename, contents, classified } = file;
    const path = `${relative}${filename}`;
    if (classified.kind === 'ticket') entries.push({ filename, ticket: classified.ticket });
    else if (classified.kind === 'excluded') {
      const found = classified.problems.map(problem => excludedAt(path, problem));
      diagnostics.push(...found);
      excluded.push({ names: classified.names, diagnostics: found });
    } else if (classified.kind === 'unmarked-ticket-like') {
      const suggestion: Diagnostic = diagnostic('unmarked-ticket-like', {
        file: path,
        key: 'frontier',
        expected: 'ticket',
        fix: 'if this is a Ticket, add `frontier: ticket` to its frontmatter by hand',
      });
      diagnostics.push(suggestion);
      excluded.push({ names: diagnosedNames(filename, contents), diagnostics: [suggestion] });
    }
  }
  // Stable over the sorted filenames, so two files tying on prefix and name
  // still come out in one order on every machine.
  entries.sort((a, b) => compareByOrderHint(a.ticket, b.ticket));
  return { entries, excluded, diagnostics };
}

/**
 * One file's classification, never a failure of the scan: a value the
 * validator cannot handle excludes that file and nothing else.
 */
function classifySafely(effort: string, filename: string, contents: string, revision: string) {
  try {
    return classifyTicketFile(effort, { filename, contents }, revision);
  } catch {
    return {
      kind: 'excluded' as const,
      names: diagnosedNames(filename, contents),
      problems: [
        {
          code: 'yaml-unparseable' as const,
          expected: 'a YAML mapping of plain values',
          fix: 'repair the frontmatter by hand so it parses as a YAML mapping',
        },
      ],
    };
  }
}

function excludedAt(file: string, { code, ...rest }: Problem): Diagnostic {
  return diagnostic(code, { ...rest, file });
}

/**
 * A directory under the storage directory is an Effort only once it holds
 * something the schema recognizes — a Header doc or an `issues/` directory.
 * That directory is also where these repos keep loose scratch output, and a
 * directory of research notes is not an empty Effort.
 *
 * Its own `.md` files beside the Header docs are read for the marker alone: a
 * marked one is a Ticket in the wrong place, diagnosed and never moved. A
 * directory holding one but nothing the schema recognizes is scanned as
 * `diagnosticOnly`, for that diagnostic alone.
 */
async function readEffort(
  storage: string,
  slug: string,
  relativeStorage = '',
): Promise<ScannedEffort | undefined> {
  const dir = join(storage, slug);
  const listing = await readDir(dir);

  const files = new Set(listing.filter(entry => entry.isFile()).map(entry => entry.name));
  const headerDocs = HEADER_DOCS.filter(([, filename]) => files.has(filename)).map(([doc]) => doc);
  const prefix = `${relativeStorage === '' ? '' : `${relativeStorage}/`}${slug}/`;
  // Never read through: a linked Header doc would serve, and let writes replace,
  // a file outside the storage root. It still makes the Effort, diagnosed.
  const linkedDocs: Diagnostic[] = HEADER_DOCS.filter(([, filename]) =>
    listing.some(entry => entry.name === filename && entry.isSymbolicLink()),
  ).map(([, filename]) =>
    diagnostic('symlinked-header-doc', {
      file: `${prefix}${filename}`,
      expected: 'a file, not a symbolic link',
      fix: 'replace the link with the file itself by hand; nothing through it is read or written',
    }),
  );

  // A linked issues/ still makes an Effort, so the link is diagnosed rather than unseen.
  const hasIssues = listing.some(
    entry => entry.name === ISSUES_DIR && (entry.isDirectory() || entry.isSymbolicLink()),
  );
  const loose = [...files]
    .filter(name => name.endsWith('.md') && name !== MAP_FILE && name !== SPEC_FILE)
    .toSorted();

  const [issues, destination, specOpening, misplaced] = await Promise.all([
    readIssues(dir, slug, prefix),
    headerDocs.includes('map')
      ? readText(join(dir, 'map.md')).then(contents =>
          readSection(contents, SECTION_HEADINGS.destination),
        )
      : undefined,
    headerDocs.includes('spec') ? readText(join(dir, 'spec.md')).then(readSpecOpening) : undefined,
    Promise.all(
      loose.map(async name => {
        // A probe, not a read of tracker data: a file it cannot open is not
        // marked, and never aborts the scan of every other Effort.
        const contents = await readFile(join(dir, name), 'utf8').catch((error: unknown) => {
          if (isMissing(error) || isUnreadable(error)) return '';
          throw error;
        });
        return isMarked(contents) ? { name, contents } : undefined;
      }),
    ),
  ]);

  const strays = misplaced
    .filter(stray => stray !== undefined)
    .map(({ name, contents }) => ({
      names: diagnosedNames(name, contents),
      diagnostics: [
        diagnostic('ticket-outside-issues', {
          file: `${prefix}${name}`,
          expected: `${prefix}${ISSUES_DIR}/${name}`,
          fix: `move it into ${prefix}${ISSUES_DIR}/ by hand to make it a Ticket`,
        }),
      ],
    }));
  const outside = strays.flatMap(stray => stray.diagnostics);
  const recognized = headerDocs.length > 0 || linkedDocs.length > 0 || hasIssues;
  if (!recognized && strays.length === 0) return undefined;

  return {
    diagnosticOnly: !recognized,
    effort: {
      slug,
      headerDocs,
      ticketCount: issues.entries.length,
      destination,
      specOpening,
      diagnostics: [...linkedDocs, ...outside, ...issues.diagnostics],
    },
    entries: issues.entries,
    excluded: [...strays, ...issues.excluded],
  };
}

async function isEffort(storage: string, slug: string): Promise<boolean> {
  const scanned = await readEffort(storage, slug);
  return scanned !== undefined && !scanned.diagnosticOnly;
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

/** The directories under the storage directory that can be Efforts: hidden ones are skipped. */
async function readDirectories(dir: string): Promise<string[]> {
  const entries = await readDir(dir);
  return entries
    .filter(entry => entry.isDirectory() && isEffortSlug(entry.name))
    .map(entry => entry.name);
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

/**
 * The directory of an Effort a caller named. Every Effort-addressed call builds
 * its paths from here, so a slug is checked once: it is one directory name
 * under the storage directory, and anything that could step out of it, or
 * reach into another Effort, is refused before a path exists. Slugs the scan
 * found on disk are directory names already and do not pass through.
 */
function effortDir(storage: string, slug: string): string {
  // `\p{Cc}` is every control character: C0 with NUL, DEL, and C1.
  if (!isEffortSlug(slug)) {
    throw new InvalidEffortSlug(slug);
  }
  return join(storage, slug);
}

/** {@link effortDir}, refused when it is a symbolic link: no read or write follows one. */
async function realEffortDir(storage: string, slug: string): Promise<string> {
  const dir = effortDir(storage, slug);
  if (await isSymlink(dir)) throw new SymlinkedEffort(slug);
  return dir;
}

/** A Header doc's path in a real Effort directory, refused when the doc itself is a link. */
async function headerDocPath(storage: string, slug: string, filename: string): Promise<string> {
  const path = join(await realEffortDir(storage, slug), filename);
  if (await isSymlink(path)) throw new SymlinkedHeaderDoc(slug, filename);
  return path;
}

/**
 * The symbolic links in the storage directory that lead to a directory: each
 * is what an Effort would look like, and none is followed, so each is named on
 * every Board rather than left unseen.
 */
async function readLinkedDirectories(storage: string): Promise<string[]> {
  const linked = (await readDir(storage)).filter(
    entry => entry.isSymbolicLink() && isEffortSlug(entry.name),
  );
  const isDir = await Promise.all(
    linked.map(entry =>
      stat(join(storage, entry.name)).then(
        found => found.isDirectory(),
        () => false,
      ),
    ),
  );
  return linked
    .filter((_, index) => isDir[index])
    .map(entry => entry.name)
    .toSorted();
}

function symlinkedEffortWarning(slugs: readonly string[], relativeStorage: string): string {
  const files = slugs.map(slug => (relativeStorage === '' ? slug : `${relativeStorage}/${slug}`));
  const rest = files.length - 3;
  const listed = files.slice(0, 3).join(' ') + (rest > 0 ? ` and ${String(rest)} more` : '');
  return (
    `symlinked-effort: Effort directories that are symbolic links, never followed ` +
    `(${String(files.length)}): ${listed}; replace each link with the directory itself by hand`
  );
}

async function isSymlink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function isUnreadable(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'EACCES' || code === 'EPERM';
}

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** Follows symlinks, as the root walk does: a linked `.scratch` is still the tracker. */
/** Only a path with nothing at it: a file where the directory belongs is present, and unusable. */
function isAbsent(path: string): boolean {
  try {
    statSync(path);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT';
  }
}
