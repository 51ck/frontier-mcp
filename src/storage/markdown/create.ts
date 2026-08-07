import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Ticket, TicketDraft } from '../../domain.ts';
import { serializeNew } from './serialize.ts';
import { breakIfStale, writeAtomically } from './write.ts';

/** `T<n>` — the only id shape the counter mints, and the only one it counts. */
const MINTED_ID = /^T(\d+)$/;

/**
 * How many times the batch will re-scan and start over when a parallel session
 * lands an id between our scan and our guard. Each retry needs a real collision,
 * so more than a couple means something other than contention.
 */
const MAX_ATTEMPTS = 8;

/**
 * A ceiling on how far a single batch will walk looking for free ids. Reached
 * only if a workspace is carpeted with guards, which is a broken state, not a
 * busy one.
 */
const CANDIDATE_HEADROOM = 1000;

interface Reservation {
  readonly id: string;
  readonly guard: string;
}

/** Every Ticket in the workspace, re-read rather than served from any cache. */
export type Rescan = () => Promise<readonly Ticket[]>;

/**
 * Create every Ticket in the batch, or none, and return the filenames written in
 * the order asked for.
 *
 * Ids are `max + 1` over the whole workspace — derived, so there is no counter
 * file to drift — and made safe against a parallel session by an exclusive
 * create: `open(..., 'wx')` on a guard named for the candidate id, bumping and
 * retrying on collision. The filesystem provides the mutual exclusion.
 *
 * The guard alone is not compare-and-set. A session that scanned before ours and
 * finished writing after would hand us an id it has already used, so the batch
 * re-scans *while holding every guard* and starts over if any candidate has
 * turned up on disk. That is what makes the invariant hold: a file carrying id X
 * is only ever written while X's guard is held, and the guard is only kept when a
 * scan taken after acquiring it shows X unused — so two sessions can never both
 * write X.
 */
export async function createTicketFiles(
  scratch: string,
  effort: string,
  drafts: readonly TicketDraft[],
  rescan: Rescan,
): Promise<readonly string[]> {
  const { reservations, tickets } = await reserve(scratch, drafts.length, rescan);

  try {
    const ids = reservations.map(entry => entry.id);
    const files = plan(effort, drafts, ids, tickets);
    await writeAll(join(scratch, effort, 'issues'), files);
    return files.map(file => file.filename);
  } finally {
    // Released only once every file is on disk. A guard held across the write is
    // the whole guarantee; releasing early would reopen the window it closes.
    await Promise.all(reservations.map(entry => unlink(entry.guard).catch(() => {})));
  }
}

interface PlannedFile {
  readonly filename: string;
  readonly contents: string;
}

/**
 * Turn the drafts into files. Temporary keys resolve here, against the ids the
 * batch just reserved — nothing is written until every one of them resolves, so
 * an Edge naming a key that was never declared refuses the whole call.
 */
function plan(
  effort: string,
  drafts: readonly TicketDraft[],
  ids: readonly string[],
  tickets: readonly Ticket[],
): readonly PlannedFile[] {
  const byKey = new Map<string, string>();
  drafts.forEach((draft, index) => {
    if (draft.key !== undefined) byKey.set(draft.key, ids[index] ?? '');
  });

  const firstOrder = nextOrder(tickets, effort);

  return drafts.map((draft, index) => {
    const id = ids[index] ?? '';
    const order = firstOrder + index;
    const contents = serializeNew(
      {
        id,
        title: draft.title,
        kind: draft.kind,
        type: draft.type,
        status: 'open',
        triage: draft.triage,
        blockedBy: draft.blockedBy.map(edge => byKey.get(edge) ?? edge),
      },
      draft.body,
    );

    return { filename: `${pad(order)}-${id}-${slugify(draft.title)}.md`, contents };
  });
}

/**
 * Stage every file beside its target, then rename them all into place. A rename
 * within a directory is atomic and cannot half-succeed, so staging first is what
 * makes "all or none" true of the batch rather than only of each file: whatever
 * did land is removed if a later one fails.
 */
async function writeAll(issues: string, files: readonly PlannedFile[]): Promise<void> {
  const landed: string[] = [];

  try {
    await Promise.all(
      files.map(async file => {
        // Two batches racing on one Effort can pick the same sort order, which
        // is cosmetic — but the id in the name is unique, so a target that
        // already exists is a Ticket we would be destroying.
        await writeAtomically(join(issues, file.filename), file.contents, { replace: false });
        landed.push(join(issues, file.filename));
      }),
    );
  } catch (error) {
    await Promise.all(landed.map(path => unlink(path).catch(() => {})));
    throw error;
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
  const scanned = await rescan();
  const used = idsOf(scanned);
  const reservations = await claim(scratch, used, count, highestMinted(used) + 1, []);

  const settled = await rescan();
  const taken = idsOf(settled);
  if (reservations.every(entry => !taken.has(entry.id))) {
    return { reservations, tickets: settled };
  }

  await Promise.all(reservations.map(entry => unlink(entry.guard).catch(() => {})));
  if (attempt >= MAX_ATTEMPTS) {
    throw new Error(
      `Could not reserve ${String(count)} Ticket ids after ${String(MAX_ATTEMPTS)} attempts — ` +
        'another session is creating Tickets continuously. Retry in a moment.',
    );
  }

  return reserve(scratch, count, rescan, attempt + 1);
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
    await Promise.all(taken.map(entry => unlink(entry.guard).catch(() => {})));
    throw new Error(
      `No free Ticket id within ${String(CANDIDATE_HEADROOM)} of the highest in use. ` +
        'Sweep the stale .frontier-id-*.guard files under .scratch/.',
    );
  }

  const id = `T${String(candidate)}`;
  if (used.has(id)) return claim(scratch, used, count, candidate + 1, taken);

  const guard = guardFor(scratch, id);
  // A guard we cannot take belongs to a live session mid-allocation. Bump rather
  // than wait: an id may be skipped, never reused.
  if (!(await hold(guard))) return claim(scratch, used, count, candidate + 1, taken);

  return claim(scratch, used, count, candidate + 1, [...taken, { id, guard }]);
}

async function hold(guard: string): Promise<boolean> {
  try {
    await writeFile(guard, `${String(process.pid)}\n`, { flag: 'wx' });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code !== 'EEXIST') throw error;
    // A guard that outlived its process would otherwise burn its id forever.
    return (await breakIfStale(guard)) ? hold(guard) : false;
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
