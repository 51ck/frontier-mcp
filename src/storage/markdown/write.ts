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

/**
 * Remove a guard old enough to have outlived its process, reporting whether the
 * caller may now try again. Shared with id allocation, which takes guards of the
 * same shape for the same reason.
 */
export async function breakIfStale(guard: string): Promise<boolean> {
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

export interface WriteOptions {
  /**
   * Whether an existing file at `path` may be replaced. Off for a creation,
   * where a target that already exists is a Ticket the write would destroy
   * rather than a previous version of the one being edited.
   */
  readonly replace: boolean;
}

export async function writeAtomically(
  path: string,
  contents: string,
  options: WriteOptions = { replace: true },
): Promise<void> {
  sequence += 1;
  const temporary = join(dirname(path), `.frontier-${String(process.pid)}-${String(sequence)}.tmp`);

  try {
    await writeFile(temporary, contents, 'utf8');
    // `rename` replaces silently, so a creation checks first. The gap between
    // the check and the rename is not a race worth closing: ids are unique, so
    // no other session can be writing this filename at all.
    if (!options.replace && (await currentRevision(path)) !== undefined) {
      throw new Error(`Refusing to overwrite ${basename(path)}, which already exists.`);
    }
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
