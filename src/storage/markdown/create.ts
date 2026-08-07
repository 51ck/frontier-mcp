import { mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Ticket, TicketDraft } from '../../domain.ts';
import { MINTED_ID } from '../../domain.ts';
import { resolveDraftEdges } from '../../edges.ts';
import { serializeNew } from './serialize.ts';
import { stage, unstage } from './write.ts';

/**
 * How many times the batch will re-scan and start over when a parallel session
 * lands an id between our scan and our guard. Each retry needs a real collision,
 * so more than a couple means something other than contention.
 */
const MAX_ATTEMPTS = 8;

/**
 * A ceiling on how far a single batch will walk looking for free ids. Reached
 * only when a workspace has collected a guard per candidate from crashed
 * sessions, which is a broken state rather than a busy one.
 */
const CANDIDATE_HEADROOM = 1000;

interface Reservation {
  readonly id: string;
  readonly guard: string;
}

/** Every Ticket in the workspace, re-read rather than served from any cache. */
export type Rescan = () => Promise<readonly Ticket[]>;

export interface CreateRequest {
  readonly scratch: string;
  readonly effort: string;
  readonly drafts: readonly TicketDraft[];
  /** Re-read the workspace. Called under the guards, so it must not be cached. */
  readonly rescan: Rescan;
  /**
   * The last check, run with the reserved ids and the workspace as it looks
   * under the guards. Throwing abandons the batch before anything is written.
   */
  readonly validate: (ids: readonly string[], tickets: readonly Ticket[]) => void;
  /** Whether the Effort's directory has to be made, and unmade if nothing lands. */
  readonly createEffort: boolean;
}

/**
 * Create every Ticket in the batch, or none, and return the filenames written in
 * the order asked for.
 *
 * Ids are `max + 1` over the whole workspace — derived, so there is no counter
 * file to drift — and made safe against a parallel session by an exclusive
 * create: `open(..., 'wx')` on a guard named for the candidate id, bumping to the
 * next candidate on collision. The filesystem provides the mutual exclusion.
 *
 * The guard alone is not compare-and-set. A session that scanned before ours and
 * finished writing after would hand us an id it has already used, so the batch
 * re-scans *while holding every guard* and starts over if any candidate has
 * turned up on disk. That is what makes the invariant hold: a file carrying id X
 * is only ever written while X's guard is held, and the guard is only kept when a
 * scan taken after acquiring it shows X unused — so two sessions can never both
 * write X. See ADR 0005.
 */
export async function createTicketFiles(request: CreateRequest): Promise<readonly string[]> {
  const { scratch, effort, drafts, rescan, validate, createEffort } = request;
  const { reservations, tickets } = await reserve(scratch, drafts.length, rescan);

  try {
    const ids = reservations.map(entry => entry.id);
    // The last rule that can only be checked now: the ids are real, and nothing
    // has been written or even created, so a refusal leaves no trace at all.
    validate(ids, tickets);

    const files = filesFor(effort, drafts, ids, tickets);
    const issues = join(scratch, effort, 'issues');

    // After validation, so a refused batch never leaves an empty Effort behind —
    // a bare `issues/` directory is enough to make one show up in list_efforts.
    await mkdir(issues, { recursive: true });
    try {
      await writeAll(issues, files);
    } catch (error) {
      if (createEffort) await discardEffort(join(scratch, effort));
      throw error;
    }

    return files.map(file => file.filename);
  } finally {
    // Released only once every file is on disk. A guard held across the write is
    // the whole guarantee; releasing early would reopen the window it closes.
    await release(reservations);
  }
}

/**
 * Remove an Effort this call made and then failed to fill. `rm` is not recursive
 * on purpose: it refuses a directory holding anything, which is exactly the
 * wanted behaviour if a concurrent session has already put something there.
 */
async function discardEffort(dir: string): Promise<void> {
  await rm(join(dir, 'issues'), { recursive: false }).catch(() => {});
  await rm(dir, { recursive: false }).catch(() => {});
}

interface NewFile {
  readonly filename: string;
  readonly contents: string;
}

/**
 * Turn the drafts into files. Temporary keys resolve here, against the ids the
 * batch just reserved — the same resolution the cycle check validated, so the
 * graph that was approved is the graph that gets written.
 */
function filesFor(
  effort: string,
  drafts: readonly TicketDraft[],
  ids: readonly string[],
  tickets: readonly Ticket[],
): readonly NewFile[] {
  const resolve = resolveDraftEdges(drafts, ids);
  const firstOrder = nextOrder(tickets, effort);

  return drafts.map((draft, index) => {
    const id = ids[index];
    if (id === undefined) throw new Error('Reserved fewer ids than there are Tickets to create.');

    const contents = serializeNew(
      {
        id,
        title: draft.title,
        kind: draft.kind,
        type: draft.type,
        status: 'open',
        triage: draft.triage,
        blockedBy: draft.blockedBy.map(resolve),
      },
      draft.body,
    );

    return { filename: `${pad(firstOrder + index)}-${id}-${slugify(draft.title)}.md`, contents };
  });
}

/**
 * Stage every file beside its target, then rename them all into place. Both
 * phases settle in full before the next begins, because a `Promise.all` that
 * rejects on the first failure leaves its siblings running — and a rename
 * landing after the cleanup ran is the orphan this is trying to prevent.
 *
 * Splitting the phases is what makes "all or none" true of the batch rather than
 * only of each file. Everything that can fail — a full disk, a bad path — fails
 * in the staging phase, where nothing is visible yet. By the time the renames
 * start, every file exists in the directory it is going into, and a rename
 * within one directory is atomic and essentially cannot fail.
 */
async function writeAll(issues: string, files: readonly NewFile[]): Promise<void> {
  const staged = await Promise.allSettled(
    files.map(async file => ({
      temporary: await stage(join(issues, file.filename), file.contents),
      target: join(issues, file.filename),
    })),
  );

  const ready = staged.filter(entry => entry.status === 'fulfilled').map(entry => entry.value);
  const failed = staged.find(entry => entry.status === 'rejected');
  if (failed !== undefined) {
    await Promise.allSettled(ready.map(entry => unstage(entry.temporary)));
    throw failed.reason as Error;
  }

  const renamed = await Promise.allSettled(
    ready.map(async entry => {
      // Two batches racing on one Effort can pick the same sort order, which is
      // cosmetic — the id beside it still differs, so the names cannot actually
      // collide. This is the assertion of that rather than a case with a path to
      // it: a target that exists would be a Ticket this write was about to
      // destroy.
      await rename(entry.temporary, entry.target);
      return entry.target;
    }),
  );

  const landed = renamed.filter(entry => entry.status === 'fulfilled').map(entry => entry.value);
  const lost = renamed.find(entry => entry.status === 'rejected');
  if (lost !== undefined) {
    await Promise.allSettled([
      ...landed.map(path => unlink(path).catch(() => {})),
      ...ready.map(entry => unstage(entry.temporary)),
    ]);
    throw lost.reason as Error;
  }
}

interface Reserved {
  readonly reservations: readonly Reservation[];
  /** The workspace as it looked under the guards — the state this batch appends to. */
  readonly tickets: readonly Ticket[];
}

async function reserve(
  scratch: string,
  count: number,
  rescan: Rescan,
  attempt = 1,
): Promise<Reserved> {
  const used = idsOf(await rescan());
  const reservations = await claim(scratch, used, count, highestMinted(used) + 1, []);

  let settled: readonly Ticket[];
  try {
    settled = await rescan();
  } catch (error) {
    await release(reservations);
    throw error;
  }

  const taken = idsOf(settled);
  const redundant = reservations.filter(entry => taken.has(entry.id));
  if (redundant.length === 0) return { reservations, tickets: settled };

  await release(reservations);
  if (attempt >= MAX_ATTEMPTS) {
    throw new Error(
      `Could not reserve ${String(count)} Ticket ids after ${String(MAX_ATTEMPTS)} attempts — ` +
        'another session is creating Tickets continuously. Retry in a moment.',
    );
  }

  return reserve(scratch, count, rescan, attempt + 1);
}

function release(reservations: readonly Reservation[]): Promise<unknown> {
  return Promise.allSettled(reservations.map(entry => unlink(entry.guard).catch(() => {})));
}

/**
 * Walk candidates, taking a guard on each. Recursive rather than a loop because
 * each attempt depends on the one before it, and a bumped candidate is the
 * normal case rather than an error.
 */
async function claim(
  scratch: string,
  used: ReadonlySet<string>,
  count: number,
  candidate: number,
  taken: readonly Reservation[],
): Promise<readonly Reservation[]> {
  if (taken.length === count) return taken;

  if (candidate > highestMinted(used) + CANDIDATE_HEADROOM + count) {
    await release(taken);
    throw new Error(
      `No free Ticket id within ${String(CANDIDATE_HEADROOM)} of the highest in use. ` +
        'Sweep the abandoned .frontier-id-*.guard files under .scratch/.',
    );
  }

  const id = `T${String(candidate)}`;
  if (used.has(id)) return claim(scratch, used, count, candidate + 1, taken);

  const guard = guardFor(scratch, id);
  // A guard we cannot take belongs to a session that is still allocating. Bump
  // rather than wait: an id may be skipped, never reused.
  if (!(await hold(guard))) return claim(scratch, used, count, candidate + 1, taken);

  return claim(scratch, used, count, candidate + 1, [...taken, { id, guard }]);
}

async function hold(guard: string): Promise<boolean> {
  try {
    await writeFile(guard, `${String(process.pid)}\n`, { flag: 'wx' });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code !== 'EEXIST') throw error;
    return (await breakIfAbandoned(guard)) ? hold(guard) : false;
  }
}

/**
 * Break a guard whose process is gone, so a crashed allocation cannot burn an id
 * permanently.
 *
 * Liveness, deliberately, rather than the age threshold the claim guard uses. A
 * claim guard has the revision check behind it, so breaking one early only costs
 * a retry; an id guard is the whole guarantee, and breaking one held by a session
 * that is merely slow — suspended, paging, mid-GC — would let two sessions write
 * the same id. There is no age at which that becomes safe, and there is no window
 * at all if the holder is asked whether it still exists.
 *
 * A recycled pid reads as alive and only costs a skipped id, which is the
 * direction this is allowed to be wrong in.
 */
async function breakIfAbandoned(guard: string): Promise<boolean> {
  let holder: number;
  try {
    holder = Number((await readFile(guard, 'utf8')).trim());
  } catch {
    // It vanished under us, which means the holder finished. Retrying is right.
    return true;
  }

  if (!Number.isInteger(holder) || holder <= 0 || isAlive(holder)) return false;

  await unlink(guard).catch(() => {});
  return true;
}

/** Signal 0 tests for a process without signalling it. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists and belongs to somebody else — alive either way.
    return (error as NodeJS.ErrnoException | null)?.code === 'EPERM';
  }
}

/**
 * Beside the Efforts rather than inside one, because the counter is repo-global:
 * two sessions creating into different Efforts must still collide here. Hidden
 * and not `.md`, so no scan mistakes it for a Ticket, and `.scratch/` yields it
 * no Effort because it is not a directory.
 */
function guardFor(scratch: string, id: string): string {
  return join(scratch, `.frontier-id-${id}.guard`);
}

function idsOf(tickets: readonly Ticket[]): ReadonlySet<string> {
  return new Set(tickets.map(entry => entry.id).filter(id => id !== undefined));
}

/**
 * The counter, derived. Ids preserved verbatim through migration need not look
 * like `T<n>` at all; those still occupy their name but contribute no number.
 */
function highestMinted(used: ReadonlySet<string>): number {
  let highest = 0;

  for (const id of used) {
    const digits = MINTED_ID.exec(id)?.[1];
    if (digits !== undefined) highest = Math.max(highest, Number(digits));
  }

  return highest;
}

/** `NN` is sort order within the Effort and nothing else, so it simply continues. */
function nextOrder(tickets: readonly Ticket[], effort: string): number {
  const orders = tickets.filter(entry => entry.effort === effort).map(entry => entry.order);
  return orders.length === 0 ? 1 : Math.max(...orders) + 1;
}

function pad(order: number): string {
  return String(order).padStart(2, '0');
}

/**
 * The cosmetic half of a filename. It exists so a directory listing reads, and
 * carries no identity — the id beside it does, and the frontmatter is the
 * authority over both.
 */
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');

  return slug === '' ? 'ticket' : slug;
}
