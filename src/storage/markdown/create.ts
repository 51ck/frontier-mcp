import { link, mkdir, readdir, rmdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import type { TicketDraft, TicketSummary } from '../../domain.ts';
import { BatchNotUndone, TicketAlreadyExists, TicketStorageUnusable } from '../driver.ts';
import { serializeNew } from './serialize.ts';
import { stage, unstage } from './write.ts';

/** Every Ticket in the workspace, re-read rather than served from any cache. */
type Rescan = () => Promise<readonly TicketSummary[]>;

export interface CreateRequest {
  readonly effort: string;
  /** The Effort's directory, and the directory its Tickets go in. Both owned by the driver. */
  readonly dir: string;
  readonly issues: string;
  /** Re-read the workspace. It feeds the last check before the write, so it must not be cached. */
  readonly rescan: Rescan;
  /**
   * The last check, run on that re-read, giving the drafts to write. Throwing
   * abandons the batch before anything is written.
   */
  readonly settle: (tickets: readonly TicketSummary[]) => readonly TicketDraft[];
  /** Whether the Effort's directory has to be made, and unmade if nothing lands. */
  readonly createEffort: boolean;
  /** Throws for a file the scan would not read back as a Ticket. Run on every file before any is staged. */
  readonly validate: (name: string, filename: string, contents: string) => void;
}

/** A Ticket file this call wrote, with the text it was given. */
export interface WrittenFile {
  readonly filename: string;
  readonly contents: string;
}

/**
 * Create every Ticket in the batch, or none, and return the files written in
 * the order asked for.
 *
 * A Ticket is stored at `<name>.md` (ADR 0008), so the path is the identity and
 * the exclusive create sits on the Ticket file itself. Nothing else is written,
 * so nothing but a Ticket can be left behind.
 */
export async function createTicketFiles(request: CreateRequest): Promise<readonly WrittenFile[]> {
  const { effort, dir, issues, rescan, settle, createEffort, validate } = request;

  // Nothing has been written or even created, so a refusal leaves no trace.
  const drafts = settle(await rescan());

  const files = drafts.map(draft => ({
    name: draft.name,
    filename: `${draft.name}.md`,
    contents: serializeNew(
      {
        id: undefined,
        title: draft.title,
        kind: draft.kind,
        type: draft.type,
        status: 'open',
        triage: draft.triage,
        blockedBy: draft.blockedBy,
      },
      draft.body,
    ),
  }));

  for (const file of files) validate(file.name, file.filename, file.contents);

  // A path already held is refused here, before anything is staged or linked:
  // found at the link instead, the files linked before it would be visible to
  // a reader until they were taken back. A name can be free while its path is
  // not — a file there may carry an id, which is then what names it.
  const held = await filenamesIn(issues);
  const blocked = files.find(file => held.has(file.filename.toLowerCase()));
  if (blocked !== undefined) throw new TicketAlreadyExists(effort, blocked.name);

  // After validation, so a refused batch never leaves an empty Effort behind —
  // a bare issues/ directory is enough to make one show up in list_efforts.
  try {
    await mkdir(issues, { recursive: true });
  } catch (error) {
    throw notADirectory(error) ? new TicketStorageUnusable(fileInTheWay(issues)) : error;
  }
  try {
    await writeAll(effort, issues, files);
  } catch (error) {
    if (createEffort) await discardEffort(dir, issues);
    throw error;
  }

  return files;
}

function notADirectory(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'EEXIST' || code === 'ENOTDIR';
}

function fileInTheWay(issues: string): string {
  return `${issues} cannot hold Tickets: it, or a directory above it, exists as a file.`;
}

/** What the directory holds, folded: names compare without regard to case, as the common filesystems do. */
async function filenamesIn(issues: string): Promise<ReadonlySet<string>> {
  try {
    return new Set((await readdir(issues)).map(name => name.toLowerCase()));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === 'ENOENT') return new Set();
    throw code === 'ENOTDIR' ? new TicketStorageUnusable(fileInTheWay(issues)) : error;
  }
}

/**
 * Remove an Effort this call made and then failed to fill. `rmdir` rather than a
 * recursive delete: it fails with ENOTEMPTY on a directory holding anything,
 * which is exactly right if a concurrent session has already put something
 * there. Never a recursive `rm` — this runs on a failure path, where being wrong
 * about which directory it is would destroy somebody's work.
 */
async function discardEffort(dir: string, issues: string): Promise<void> {
  await rmdir(issues).catch(() => {});
  await rmdir(dir).catch(() => {});
}

interface NewFile {
  readonly name: string;
  readonly filename: string;
  readonly contents: string;
}

/**
 * Stage every file beside its target, then link each into place. Everything a
 * disk can refuse — no space, a bad path — fails in the staging phase, where
 * nothing is visible yet; staging settles in full first, because a `Promise.all`
 * that rejects on the first failure leaves its siblings running.
 *
 * A hard link rather than a rename, because a rename replaces its target and a
 * link refuses one that exists. That refusal is the compare-and-set: of two
 * processes creating one name, exactly one link succeeds, and it publishes the
 * whole file at once, which an exclusive open followed by a write would not.
 *
 * The links are taken one at a time in name order and stop at the first one
 * lost. Two batches sharing several names then contend for the same name first,
 * so one of them wins it and every name after it, rather than each taking one
 * and both giving up.
 */
async function writeAll(effort: string, issues: string, files: readonly NewFile[]): Promise<void> {
  const staged = await Promise.allSettled(
    files.map(async file => ({
      name: file.name,
      temporary: await stage(join(issues, file.filename), file.contents),
      target: join(issues, file.filename),
    })),
  );

  const ready = staged.filter(entry => entry.status === 'fulfilled').map(entry => entry.value);
  const landed: Staged[] = [];
  try {
    const failed = staged.find(entry => entry.status === 'rejected');
    if (failed !== undefined) throw failed.reason as Error;

    // A chain rather than a loop: each link is only attempted once the one
    // before it is held, and the first one lost stops the rest.
    await ready
      .toSorted((a, b) => (a.name < b.name ? -1 : 1))
      .reduce(async (before, entry) => {
        await before;
        try {
          await link(entry.temporary, entry.target);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException | null)?.code;
          if (code === 'EEXIST') throw new TicketAlreadyExists(effort, entry.name);
          throw new TicketStorageUnusable(
            `Ticket creation needs a filesystem that supports hard links, and linking a new ` +
              `Ticket into ${issues} failed (${code ?? String(error)}).`,
          );
        }
        landed.push(entry);
      }, Promise.resolve());
  } catch (error) {
    const kept = (await Promise.all(landed.map(takeBack))).filter(name => name !== undefined);
    throw kept.length === 0
      ? error
      : new BatchNotUndone(
          error as Error,
          kept.map(name => `${effort}.${name}`),
        );
  } finally {
    await Promise.allSettled(ready.map(entry => unstage(entry.temporary)));
  }
}

interface Staged {
  readonly name: string;
  readonly temporary: string;
  readonly target: string;
}

/**
 * Remove a file this call linked, unless the path no longer holds it. Every
 * write to a Ticket renames a new file over its path, so a target that is not
 * the staged file's own inode is another session's write — a claim taken the
 * moment the Ticket appeared — and is left alone. Returns the name of a Ticket
 * left behind, undefined when it was removed or is already gone.
 */
async function takeBack(entry: Staged): Promise<string | undefined> {
  try {
    const [ours, theirs] = await Promise.all([
      stat(entry.temporary, { bigint: true }),
      stat(entry.target, { bigint: true }),
    ]);
    if (ours.dev !== theirs.dev || ours.ino !== theirs.ino) return entry.name;
    await unlink(entry.target);
    return undefined;
  } catch (error) {
    return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT' ? undefined : entry.name;
  }
}
