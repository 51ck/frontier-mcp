import { randomInt } from 'node:crypto';
import { link, mkdir, readdir, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { TicketDraft, TicketSummary } from '../../domain.ts';
import { BatchNotUndone, TicketAlreadyExists, TicketStorageUnusable } from '../driver.ts';
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
  readonly effort: string;
  /** The Effort's directory, and the directory its Tickets go in. Both owned by the driver. */
  readonly dir: string;
  readonly issues: string;
  readonly drafts: readonly TicketDraft[];
  /** Re-read the workspace. It feeds the last check before the write, so it must not be cached. */
  readonly rescan: Rescan;
  /** The last check, run on that re-read. Throwing abandons the batch before anything is written. */
  readonly validate: (tickets: readonly TicketSummary[]) => void;
  /** Whether the Effort's directory has to be made, and unmade if nothing lands. */
  readonly createEffort: boolean;
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
 * Nothing is minted (ADR 0008): a Ticket is stored at `<name>.md`, so the path
 * is the identity and the exclusive create sits on the Ticket file itself. No
 * guard file is involved, and none can be left behind.
 */
export async function createTicketFiles(request: CreateRequest): Promise<readonly WrittenFile[]> {
  const { effort, dir, issues, drafts, rescan, validate, createEffort } = request;

  // Nothing has been written or even created, so a refusal leaves no trace.
  validate(await rescan());

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
