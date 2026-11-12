import { randomInt } from 'node:crypto';
import { mkdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { TicketDraft, TicketSummary } from '../../domain.ts';
import { resolveDraftEdges } from '../../edges.ts';
import type { IdPattern, IdToken } from './id-pattern.ts';
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
  readonly counter: number;
  readonly guard: string;
}

/** Every Ticket in the workspace, re-read rather than served from any cache. */
export type Rescan = () => Promise<readonly TicketSummary[]>;

export interface CreateRequest {
  /** Where the id guards live: one namespace for the whole workspace. */
  readonly storage: string;
  readonly minting: MintingPlan;
  readonly effort: string;
  /** The Effort's directory, and the directory its Tickets go in. Both owned by the driver. */
  readonly dir: string;
  readonly issues: string;
  readonly drafts: readonly TicketDraft[];
  /** Re-read the workspace. Called under the guards, so it must not be cached. */
  readonly rescan: Rescan;
  /**
   * The last check, run with the reserved ids and the workspace as it looks
   * under the guards. Throwing abandons the batch before anything is written.
   */
  readonly validate: (ids: readonly string[], tickets: readonly TicketSummary[]) => void;
  /** Whether the Effort's directory has to be made, and unmade if nothing lands. */
  readonly createEffort: boolean;
}

/**
 * Create every Ticket in the batch, or none, and return the filenames written in
 * the order asked for.
 *
 * A random pattern draws ids and checks them against the scan; nothing needs
 * coordinating. A pattern with `<N>` takes `max + 1` over the whole workspace —
 * derived, so there is no counter file to drift — made safe against a parallel
 * session by an exclusive create: `open(..., 'wx')` on a guard named for the
 * candidate counter, bumping to the next on collision.
 *
 * The guard alone is not compare-and-set. A session that scanned before ours and
 * finished writing after would hand us an id it has already used, so the batch
 * re-scans *while holding every guard* and starts over if any candidate has
 * turned up on disk. That is what makes the invariant hold: a file carrying id X
 * is only ever written while X's guard is held, and the guard is only kept when a
 * scan taken after acquiring it shows X unused — so two sessions can never both
 * write X. ADR 0006 decides which patterns take the guard; ADR 0005 argues why it
 * sits on its own file and is never reclaimed.
 */
export async function createTicketFiles(request: CreateRequest): Promise<readonly string[]> {
  const { storage, minting, effort, dir, issues, drafts, rescan, validate, createEffort } = request;
  // The first Effort has no storage directory yet, but allocation still starts
  // by exclusively creating its guards inside that shared namespace.
  await mkdir(storage, { recursive: true });
  const {
    ids,
    tickets,
    release: releaseIds,
  } = await minting.reserve(storage, drafts.length, rescan);

  try {
    // The last rule that can only be checked now: the ids are real, and nothing
    // has been written or even created, so a refusal leaves no trace at all.
    validate(ids, tickets);

    const files = filesFor(effort, drafts, ids, tickets);

    // After validation, so a refused batch never leaves an empty Effort behind —
    // a bare issues/ directory is enough to make one show up in list_efforts.
    await mkdir(issues, { recursive: true });
    try {
      await writeAll(issues, files);
    } catch (error) {
      if (createEffort) await discardEffort(dir, issues);
      throw error;
    }

    return files.map(file => file.filename);
  } finally {
    // Released only once every file is on disk. A guard held across the write is
    // the whole guarantee; releasing early would reopen the window it closes.
    await releaseIds();
  }
}

/**
 * Hold `count` fresh ids, run `use`, then release. Migration mints through
 * this so a parallel create_tickets cannot collide.
 */
export async function withIdReservations<T>(
  minting: MintingPlan,
  storage: string,
  count: number,
  rescan: Rescan,
  use: (ids: readonly string[]) => Promise<T>,
): Promise<T> {
  if (count === 0) return use([]);

  const { ids, release: releaseIds } = await minting.reserve(storage, count, rescan);
  try {
    return await use(ids);
  } finally {
    await releaseIds();
  }
}

/** The cosmetic filename convention: `<NN>-T<n>-<slug>.md`. */
export function ticketFilename(order: number, id: string, title: string): string {
  return `${pad(order)}-${id}-${slugify(title)}.md`;
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
  tickets: readonly TicketSummary[],
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

    return { filename: ticketFilename(firstOrder + index, id, draft.title), contents };
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
      // cosmetic — the id beside it still differs. Under a counted pattern the
      // guards make that certain; under a random one two processes can draw the
      // same id, which nothing coordinates by design (T53) and the duplicate-id
      // report exists to surface.
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
  readonly ids: readonly string[];
  /** The workspace as it looked under the guards — the state this batch appends to. */
  readonly tickets: readonly TicketSummary[];
  readonly release: () => Promise<unknown>;
}

/**
 * How a compiled pattern mints, decided once when the driver is built (T53):
 * a pattern containing `<N>` counts under guards, any other draws at random.
 */
export interface MintingPlan {
  reserve(storage: string, count: number, rescan: Rescan): Promise<Reserved>;
}

export function mintingPlan(pattern: IdPattern): MintingPlan {
  return pattern.needsCoordination ? derivedPlan(pattern) : randomPlan(pattern);
}

/**
 * Redraws tolerated per id. Only a small random space gets near it —
 * `T<b36{1}>` is legal — and the budget is deep enough that the last free value
 * of such a space is still found: at one free in thirty-six, a thousand draws
 * miss it about once in 10^12.
 */
const MAX_REDRAWS = 1000;

function randomPlan(pattern: IdPattern): MintingPlan {
  const draw = (used: ReadonlySet<string>, count: number): readonly string[] => {
    const ids: string[] = [];
    let redraws = 0;
    while (ids.length < count) {
      const id = render(pattern.tokens, 0);
      if (!used.has(id) && !ids.includes(id)) {
        ids.push(id);
        redraws = 0;
        continue;
      }
      redraws += 1;
      if (redraws > MAX_REDRAWS) {
        throw new Error(
          `Could not draw an unused Ticket id from id_pattern ` +
            `${JSON.stringify(pattern.source)} in ${String(MAX_REDRAWS)} redraws — its random ` +
            'space is full or nearly full. Lengthen its random token in frontier.yml.',
        );
      }
    }
    return ids;
  };

  return {
    async reserve(_storage, count, rescan) {
      const tickets = await rescan();
      return { ids: draw(idsOf(tickets), count), tickets, release: () => Promise.resolve() };
    },
  };
}

function derivedPlan(pattern: IdPattern): MintingPlan {
  const matcher = counterMatcher(pattern.tokens);
  const countersOf = (tickets: Iterable<string>): ReadonlySet<number> => {
    const counters = new Set<number>();
    for (const id of tickets) {
      const digits = matcher.exec(id)?.[1];
      if (digits !== undefined) counters.add(Number(digits));
    }
    return counters;
  };

  const reserve = async (
    storage: string,
    count: number,
    rescan: Rescan,
    attempt: number,
  ): Promise<Reserved> => {
    const used = countersOf(idsOf(await rescan()));
    const reservations = await claim(storage, pattern, used, count, highest(used) + 1, []);
    const releaseAll = () => release(reservations);

    let settled: readonly TicketSummary[];
    try {
      settled = await rescan();
    } catch (error) {
      await releaseAll();
      throw error;
    }

    const taken = countersOf(idsOf(settled));
    if (!reservations.some(entry => taken.has(entry.counter))) {
      return { ids: reservations.map(entry => entry.id), tickets: settled, release: releaseAll };
    }

    await releaseAll();
    if (attempt >= MAX_ATTEMPTS) {
      throw new Error(
        `Could not reserve ${String(count)} Ticket ids after ${String(MAX_ATTEMPTS)} attempts — ` +
          'another session is creating Tickets continuously. Retry in a moment.',
      );
    }

    return reserve(storage, count, rescan, attempt + 1);
  };

  return {
    reserve: (storage, count, rescan) => reserve(storage, count, rescan, 1),
  };
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
  storage: string,
  pattern: IdPattern,
  used: ReadonlySet<number>,
  count: number,
  candidate: number,
  taken: readonly Reservation[],
): Promise<readonly Reservation[]> {
  if (taken.length === count) return taken;

  if (candidate > highest(used) + CANDIDATE_HEADROOM + count) {
    await release(taken);
    throw new Error(
      `No free Ticket id within ${String(CANDIDATE_HEADROOM)} of the highest in use. ` +
        `Sweep the abandoned .frontier-id-*.guard files under ${storage}.`,
    );
  }

  const next = (held: readonly Reservation[]) =>
    claim(storage, pattern, used, count, candidate + 1, held);
  if (used.has(candidate)) return next(taken);

  const guard = guardFor(storage, candidate);
  // A guard we cannot take belongs to a session that is still allocating. Bump
  // rather than wait: an id may be skipped, never reused.
  if (!(await hold(guard))) return next(taken);

  return next([...taken, { id: render(pattern.tokens, candidate), counter: candidate, guard }]);
}

/**
 * Take a guard, or report that somebody else has it.
 *
 * A guard is **never** broken, only bumped past, and that is the whole of the
 * concurrency story here. Every scheme for reclaiming one — an age threshold, a
 * liveness check on the pid inside it — has the same shape: read the guard,
 * decide it is abandoned, then remove it. The decision goes stale between those
 * two steps, and a session that removes a guard another session has just taken
 * hands both of them the same id. That is the exact defect this file exists to
 * prevent, so it is not reintroduced to tidy up after crashes.
 *
 * The cost is a guard left by a crashed session, which makes one id number
 * unusable. Ids are promised never to be *reused*, never to run without gaps, so
 * a skipped number costs nothing; the file is hidden, one line, and names the
 * process that left it. {@link CANDIDATE_HEADROOM} bounds how many can pile up
 * before allocation says so and points at them.
 */
async function hold(guard: string): Promise<boolean> {
  try {
    await writeFile(guard, `${String(process.pid)}\n`, { flag: 'wx' });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code !== 'EEXIST') throw error;
    return false;
  }
}

/**
 * Beside the Efforts rather than inside one, because the counter is repo-global:
 * two sessions creating into different Efforts must still collide here. Hidden
 * and not `.md`, so no scan mistakes it for a Ticket, and the storage scan
 * yields it no Effort because it is not a directory.
 *
 * Keyed on the `<N>` value, not the rendered id: under `T<N>-<b36{4}>` two
 * sessions reaching 35 render different ids, and only the number makes them
 * contend (T53).
 */
function guardFor(storage: string, counter: number): string {
  return join(storage, `.frontier-id-N-${String(counter)}.guard`);
}

function idsOf(tickets: readonly TicketSummary[]): ReadonlySet<string> {
  return new Set(tickets.map(entry => entry.id).filter(id => id !== undefined));
}

/**
 * The counter, derived from the ids in the pattern's own namespace. Ids that
 * do not match the pattern still occupy their name but contribute no number.
 */
function highest(used: ReadonlySet<number>): number {
  let max = 0;
  for (const counter of used) max = Math.max(max, counter);
  return max;
}

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

function render(tokens: readonly IdToken[], counter: number): string {
  return tokens
    .map(token => {
      if (token.kind === 'literal') return token.text;
      if (token.kind === 'counter') return String(counter);
      return Array.from({ length: token.length }, () => DIGITS.charAt(randomInt(token.base))).join(
        '',
      );
    })
    .join('');
}

/** Matches ids in the pattern's namespace, capturing the `<N>` value. */
function counterMatcher(tokens: readonly IdToken[]): RegExp {
  const source = tokens
    .map(token => {
      if (token.kind === 'literal') return token.text.replaceAll('.', '\\.');
      if (token.kind === 'counter') return '(\\d+)';
      return `[${token.base === 16 ? '0-9a-f' : '0-9a-z'}]{${String(token.length)}}`;
    })
    .join('');
  return new RegExp(`^${source}$`);
}

/** `NN` is sort order within the Effort and nothing else, so it simply continues. */
function nextOrder(tickets: readonly TicketSummary[], effort: string): number {
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
