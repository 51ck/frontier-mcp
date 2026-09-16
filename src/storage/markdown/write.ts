import { rename, stat, writeFile, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/**
 * A revision token: the file's modification time and size as read. Opaque above
 * the seam — only this module builds one or compares two.
 */
export function revisionOf(mtimeMs: number, size: number): string {
  return `${String(mtimeMs)}:${String(size)}`;
}

export async function currentRevision(path: string): Promise<string | undefined> {
  try {
    const info = await stat(path);
    return revisionOf(info.mtimeMs, info.size);
  } catch {
    return undefined;
  }
}

/**
 * Write to a temporary file in the same directory, then rename over the target.
 * Rename within a directory is atomic, so a reader sees either the old file or
 * the new one and an interrupted write cannot leave a partial Ticket.
 *
 * The temporary name carries the process id and a counter rather than a random
 * suffix, so a crashed write leaves something identifiable rather than a name
 * nobody can attribute. There is no lock file: a crashed session must never be
 * able to wedge the tracker.
 */
let sequence = 0;

/** Short enough to keep a claim responsive; long enough for a Windows file handle to close. */
const EPERM_RETRY_DELAYS_MS = [10, 20, 40, 80] as const;

/**
 * How long a guard may sit before it is assumed to belong to a crashed process.
 * Only ever consulted for a guard whose revision is still current, which is a
 * window of milliseconds in practice.
 */
const GUARD_STALE_MS = 30_000;

/**
 * Take an exclusive guard on one revision of one file, or fail.
 *
 * `open(..., 'wx')` is an atomic create-if-absent — the same primitive the spec
 * names for id allocation. Racing processes all read the same revision, so they
 * all derive the same guard name and exactly one creation succeeds. That is the
 * compare-and-set an optimistic mtime check cannot provide across processes:
 * without it, two sessions genuinely do both come away believing they hold the
 * same Ticket.
 *
 * The guard is keyed to the revision it guards, so it cannot wedge anything. Any
 * successful write changes the revision, which changes the name, so a guard left
 * behind by a crash names a revision that will never be current again. It is
 * swept on sight anyway once it is older than {@link GUARD_STALE_MS}.
 *
 * See ADR 0004 for why this is a guard rather than a lock file.
 */
export async function withGuard<T>(
  path: string,
  revision: string,
  write: () => Promise<T>,
): Promise<T> {
  const guard = guardPath(path, revision);

  try {
    await writeFile(guard, `${String(process.pid)}\n`, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code !== 'EEXIST') throw error;
    if (!(await breakIfStale(guard))) return Promise.reject(new GuardHeld());
    return withGuard(path, revision, write);
  }

  try {
    return await write();
  } finally {
    await unlink(guard).catch(() => {});
  }
}

/** Raised when another process holds the guard for this exact revision. */
export class GuardHeld extends Error {
  constructor() {
    super('another session is writing this Ticket right now');
    this.name = 'GuardHeld';
  }
}

/** Raised when an atomic replace retry discovers that its target moved underneath it. */
export class AtomicWriteConflict extends Error {
  constructor() {
    super('the target changed while waiting to replace it');
    this.name = 'AtomicWriteConflict';
  }
}

async function breakIfStale(guard: string): Promise<boolean> {
  try {
    const info = await stat(guard);
    if (Date.now() - info.mtimeMs < GUARD_STALE_MS) return false;
    await unlink(guard);
    return true;
  } catch {
    // It vanished under us, which means the holder finished. Retrying is right.
    return true;
  }
}

/**
 * Beside the file, hidden, and not `.md`, so no scan ever mistakes it for a
 * Ticket. The revision is sanitized because it goes into a filename.
 */
function guardPath(path: string, revision: string): string {
  return join(dirname(path), `.${basename(path)}.${revision.replace(/[^\w.-]/g, '_')}.guard`);
}

export async function writeAtomically(
  path: string,
  contents: string,
  expectedRevision?: string,
): Promise<void> {
  const temporary = await stage(path, contents);

  try {
    await replaceStaged(temporary, path, expectedRevision);
  } catch (error) {
    await unstage(temporary);
    throw error;
  }
}

async function replaceStaged(
  temporary: string,
  target: string,
  expectedRevision: string | undefined,
  attempt = 0,
): Promise<void> {
  try {
    await rename(temporary, target);
  } catch (error) {
    const delay = EPERM_RETRY_DELAYS_MS[attempt];
    if (
      (error as NodeJS.ErrnoException | null)?.code !== 'EPERM' ||
      delay === undefined ||
      expectedRevision === undefined
    ) {
      throw error;
    }

    // Windows can hold the destination open for a moment after a reader closes
    // it. Wait that out, then preserve compare-and-set by checking for a hand
    // edit immediately before trying the same filesystem operation again.
    await new Promise(resolve => setTimeout(resolve, delay));
    if ((await currentRevision(target)) !== expectedRevision) {
      throw new AtomicWriteConflict();
    }
    await replaceStaged(temporary, target, expectedRevision, attempt + 1);
  }
}

/**
 * The first half of {@link writeAtomically}, for a caller that has several files
 * to land together: write the contents beside the target and hand back the
 * temporary path, leaving the rename to the caller.
 *
 * Everything that can fail — a full disk, a bad path, a name too long — fails
 * here, where nothing is visible yet. That is what lets a batch stage every file
 * before renaming any, and so be all-or-none rather than merely per-file atomic.
 */
export async function stage(path: string, contents: string): Promise<string> {
  sequence += 1;
  const temporary = join(dirname(path), `.frontier-${String(process.pid)}-${String(sequence)}.tmp`);

  try {
    await writeFile(temporary, contents, 'utf8');
    return temporary;
  } catch (error) {
    await unstage(temporary);
    throw error;
  }
}

/** Discard a staged file. Never throws: it runs on the path where something already went wrong. */
export async function unstage(temporary: string): Promise<void> {
  await unlink(temporary).catch(() => {});
}
