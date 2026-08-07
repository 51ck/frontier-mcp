import { rename, stat, writeFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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

export async function writeAtomically(path: string, contents: string): Promise<void> {
  sequence += 1;
  const temporary = join(dirname(path), `.frontier-${String(process.pid)}-${String(sequence)}.tmp`);

  try {
    await writeFile(temporary, contents, 'utf8');
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
