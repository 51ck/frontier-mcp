/**
 * How a string names a Ticket. Above the storage seam and shared by everything
 * that follows a reference — the Frontier, cycle checks, the Board, the tool
 * lookups and the driver's own file lookup — so the resolution order is written
 * down once (ADR 0008).
 */

import type { TicketSummary } from './domain.ts';

/** Thrown when tool input is a bare name that Tickets of several Efforts have. */
export class AmbiguousName extends Error {
  constructor(name: string, candidates: readonly string[]) {
    super(
      `'${name}' names ${String(candidates.length)} Tickets: ${candidates.join(', ')}. ` +
        'Name the one meant in full.',
    );
    this.name = 'AmbiguousName';
  }
}

const STILL_TO_WRITE =
  'is still to be written, declare it in the same create_tickets call or create it first. ' +
  'Nothing was written.';

/** Thrown when an Edge supplied on a write resolves to nothing and is a near miss of a name that does. */
export class ProbableTypo extends Error {
  constructor(reference: string, nearest: string) {
    super(
      `'${reference}' names no Ticket and is close to '${nearest}'. Write '${nearest}' if that ` +
        `is the Ticket meant. If a Ticket named '${reference}' ${STILL_TO_WRITE}`,
    );
    this.name = 'ProbableTypo';
  }
}

/** Thrown when a bare Edge supplied on a write is a Ticket's name only in another Effort. */
export class NameInAnotherEffort extends Error {
  constructor(reference: string, effort: string, candidates: readonly string[]) {
    super(
      `'${reference}' names no Ticket of ${effort}, and is the name of ${candidates.join(', ')}. ` +
        `Write that full name if it is the Ticket meant. If a Ticket of ${effort} named ` +
        `'${reference}' ${STILL_TO_WRITE}`,
    );
    this.name = 'NameInAnotherEffort';
  }
}

/** Thrown when an Edge supplied on a write is the Board's rendering of one, which is never input. */
export class BoardFormAsEdge extends Error {
  constructor(reference: string, write: string) {
    super(
      `'${reference}' is how a Board shows an Edge into another Effort, not a name. ` +
        `Write '${write}'. Nothing was written.`,
    );
    this.name = 'BoardFormAsEdge';
  }
}

/**
 * A Ticket's name where there is no Effort to resolve against: its id, which is
 * global, or `<effort>.<name>` for a name that is local to its Effort.
 */
export function fullNameOf(ticket: TicketSummary): string {
  return ticket.id ?? `${ticket.effort}.${ticket.name}`;
}

/**
 * What a set of duplicate claimants shares: one id, which a person renumbers,
 * or one name, which a person fixes by renaming a file.
 */
export function duplicateKindOf(claimants: readonly TicketSummary[]): 'id' | 'name' {
  const id = claimants[0]?.id;
  return id !== undefined &&
    claimants.every(ticket => ticket.id?.toLowerCase() === id.toLowerCase())
    ? 'id'
    : 'name';
}

const NEW_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+){0,2}$/;
const MAX_NEW_NAME = 24;

const YAML_WORDS = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off']);
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

function reservedBecause(name: string): string | undefined {
  if (name === 'lock') return 'a git ref may not end in .lock';
  if (YAML_WORDS.has(name)) return 'a hand-written Edge list would read it as a YAML value';
  if (WINDOWS_DEVICE.test(name)) return 'it is a Windows device name';
  return undefined;
}

/**
 * Why `name` may not be given to a new Ticket, or undefined when it may. Asked
 * on creation only: reading is lenient, and any stem already on disk is a name.
 */
export function newNameProblem(name: string): string | undefined {
  const reserved = reservedBecause(fold(name));
  if (reserved !== undefined) return `is reserved: ${reserved}`;
  if (!NEW_NAME.test(name) || name.length > MAX_NEW_NAME) {
    return (
      'is not a Ticket name: one to three words of lowercase letters and digits joined by ' +
      `hyphens, starting with a letter, at most ${String(MAX_NEW_NAME)} characters`
    );
  }
  return undefined;
}

export interface Names {
  /**
   * The Tickets a stored Edge on a Ticket of `effort` means, nearest first: a
   * full `<effort>.<name>`, then a name within `effort`, then an id anywhere.
   * Empty when it resolves to nothing; more than one is a duplicate, and every
   * claimant is returned.
   */
  edge(edge: string, effort: string): readonly TicketSummary[];
  /**
   * The Tickets tool input means, with no Effort to resolve against: a full
   * name outright, else an id or a bare name. Throws {@link AmbiguousName} when
   * the string is a bare name in several Efforts, or an id and another Ticket's
   * bare name at once.
   */
  input(name: string): readonly TicketSummary[];
  /**
   * Every Ticket answering to this one's full name, itself included, in scan
   * order. More than one is a duplicate — the only definition of one there is.
   */
  claimants(ticket: TicketSummary): readonly TicketSummary[];
  /**
   * Input that {@link input} resolves to this Ticket and never refuses as
   * ambiguous: its full name, or `<effort>.<id>` for an id that is also
   * another Ticket's bare name.
   */
  addressOf(ticket: TicketSummary): string;
  /**
   * The Edges supplied on a write to `from`, as they are stored. One that
   * resolves is put in the shortest form resolving to the same Ticket, in the
   * Ticket's own spelling: bare within the Effort, an id, or the full name. Two
   * that mean one Ticket are stored once, where the first stood.
   *
   * One that resolves to nothing is kept as written, to dangle — unless it is
   * a near miss of a name it could have meant ({@link ProbableTypo}), is
   * exactly a name in another Effort ({@link NameInAnotherEffort}), or is a
   * Board's `<name>@<effort>` ({@link BoardFormAsEdge}). An Edge in `kept`,
   * those `from` already stored, is never refused.
   */
  stored(
    references: readonly string[],
    from: TicketSummary,
    kept?: readonly string[],
  ): readonly string[];
  /** Every set of duplicate claimants in the workspace, each set once. */
  duplicates(): readonly (readonly TicketSummary[])[];
  /** The graph node a Ticket is: one per name, however many files claim it. */
  nodeOf(ticket: TicketSummary): string;
  /** The node an Edge leads to. An Edge resolving to nothing is its own node. */
  node(edge: string, effort: string): string;
  /** The nodes the Edges of every claimant of `node` lead to. */
  edgesFrom(node: string): readonly string[];
}

/** Names and ids compare without regard to case; what is shown is the stored spelling. */
function fold(name: string): string {
  return name.toLowerCase();
}

const MAX_EDITS = 2;

/**
 * How many edits a slip may be for two strings this long. Scaled by the shorter
 * one, so that `T1` beside `T2` or `api` beside `cli` are two names rather than
 * one mistyped, and `parse` is not taken for `purge`: none at length 1–3, one
 * at 4–6, two from 7 up.
 */
function editsAllowed(a: string, b: string): number {
  return Math.min(MAX_EDITS, Math.floor((Math.min(a.length, b.length) - 1) / 3));
}

function at(row: readonly number[], index: number): number {
  return row[index] ?? Infinity;
}

/**
 * Edits between two strings: a substitution, an insertion, a deletion, or two
 * adjacent characters swapped, one each. Lengths further apart than any slip
 * is allowed are not measured.
 */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > MAX_EDITS) return MAX_EDITS + 1;

  let twoBack: readonly number[] = [];
  let previous: readonly number[] = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const same = a[i - 1] === b[j - 1];
      const swapped = i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1];
      current.push(
        Math.min(
          at(previous, j) + 1,
          at(current, j - 1) + 1,
          at(previous, j - 1) + (same ? 0 : 1),
          swapped ? at(twoBack, j - 2) + 1 : Infinity,
        ),
      );
    }
    twoBack = previous;
    previous = current;
  }

  return at(previous, b.length);
}

/** The distance between two folded strings when one reads as a slip of the other. */
function nearMiss(a: string, b: string): number | undefined {
  const allowed = editsAllowed(a, b);
  if (allowed < 1) return undefined;
  const distance = editDistance(a, b);
  return distance >= 1 && distance <= allowed ? distance : undefined;
}

/**
 * Every full name a Ticket answers to, folded: its id or `<effort>.<name>`, and
 * for a Ticket with an id the `<effort>.<id>` its Effort also knows it by. Two
 * Tickets sharing one are duplicates, wherever they live.
 */
function fullNamesOf(ticket: TicketSummary): readonly string[] {
  const local = fold(`${ticket.effort}.${ticket.name}`);
  return ticket.id === undefined ? [local] : [fold(ticket.id), local];
}

function push(into: Map<string, TicketSummary[]>, key: string, ticket: TicketSummary): void {
  const held = into.get(key);
  if (held === undefined) into.set(key, [ticket]);
  else held.push(ticket);
}

export function indexNames(all: readonly TicketSummary[]): Names {
  const position = new Map(all.map((ticket, index) => [ticket, index]));
  const byId = new Map<string, TicketSummary[]>();
  const byFullName = new Map<string, TicketSummary[]>();
  const byEffort = new Map<string, Map<string, TicketSummary[]>>();
  const bare = new Map<string, TicketSummary[]>();

  for (const ticket of all) {
    let local = byEffort.get(ticket.effort);
    if (local === undefined) {
      local = new Map();
      byEffort.set(ticket.effort, local);
    }
    push(local, fold(ticket.name), ticket);
    for (const key of fullNamesOf(ticket)) push(byFullName, key, ticket);
    if (ticket.id === undefined) push(bare, fold(ticket.name), ticket);
    else push(byId, fold(ticket.id), ticket);
  }

  // Longest first, so a slug that itself contains a dot is matched whole.
  const prefixes = [...byEffort.keys()]
    .toSorted((a, b) => b.length - a.length)
    .map(slug => [slug, `${fold(slug)}.`] as const);

  const inOrder = (tickets: readonly TicketSummary[]): readonly TicketSummary[] =>
    [...new Set(tickets)].toSorted((a, b) => (position.get(a) ?? 0) - (position.get(b) ?? 0));

  const claimants = (ticket: TicketSummary): readonly TicketSummary[] => {
    const sharing = fullNamesOf(ticket).map(key => byFullName.get(key) ?? []);
    if (sharing.every(tickets => tickets.length <= 1)) return [ticket];
    return inOrder(sharing.flat());
  };

  const duplicates = (): readonly (readonly TicketSummary[])[] =>
    all.map(claimants).filter((group, index) => group.length > 1 && group[0] === all[index]);

  const everyClaimant = (matches: readonly TicketSummary[]): readonly TicketSummary[] => {
    const [first] = matches;
    if (first === undefined) return matches;
    return matches.length === 1 ? claimants(first) : inOrder(matches.flatMap(claimants));
  };

  // A full name whose Effort holds no such Ticket falls through, so an id that
  // happens to open with an Effort's slug and a dot still resolves as an id.
  const full = (name: string): readonly TicketSummary[] => {
    if (!name.includes('.')) return [];
    const folded = fold(name);
    for (const [slug, prefix] of prefixes) {
      if (!folded.startsWith(prefix)) continue;
      const found = byEffort.get(slug)?.get(folded.slice(prefix.length));
      if (found !== undefined) return found;
    }
    return [];
  };

  const firstMatch = (
    ...steps: readonly (() => readonly TicketSummary[] | undefined)[]
  ): readonly TicketSummary[] => {
    for (const step of steps) {
      const found = step();
      if (found !== undefined && found.length > 0) return everyClaimant(found);
    }
    return [];
  };

  const edge = (name: string, effort: string): readonly TicketSummary[] =>
    firstMatch(
      () => full(name),
      () => byEffort.get(effort)?.get(fold(name)),
      () => byId.get(fold(name)),
    );

  const input = (name: string): readonly TicketSummary[] =>
    firstMatch(
      () => full(name),
      () => {
        const carried = everyClaimant(byId.get(fold(name)) ?? []);
        const named = (bare.get(fold(name)) ?? []).filter(ticket => !carried.includes(ticket));
        const candidates = [...carried, ...named];
        // One Effort's bare name is one Ticket, or one duplicate; an id beside
        // it, or the same name in a second Effort, is a choice only the caller can make.
        const places =
          new Set(named.map(ticket => ticket.effort)).size + (carried.length > 0 ? 1 : 0);
        if (named.length > 0 && places > 1) {
          throw new AmbiguousName(name, [...new Set(inOrder(candidates).map(fullNameOf))]);
        }
        return candidates;
      },
    );

  const addressOf = (ticket: TicketSummary): string => {
    if (ticket.id === undefined) return fullNameOf(ticket);
    const group = claimants(ticket);
    const shadowed = (bare.get(fold(ticket.id)) ?? []).some(other => !group.includes(other));
    return shadowed ? `${ticket.effort}.${ticket.id}` : ticket.id;
  };

  const nodeOf = (ticket: TicketSummary): string => fullNameOf(claimants(ticket)[0] ?? ticket);

  const node = (name: string, effort: string): string => {
    const [first] = edge(name, effort);
    return first === undefined ? name : fullNameOf(first);
  };

  const shortest = (target: TicketSummary, effort: string): string | undefined =>
    [
      target.effort === effort ? target.name : undefined,
      target.id,
      `${target.effort}.${target.name}`,
    ].find(form => form !== undefined && node(form, effort) === nodeOf(target));

  const boardForm = (folded: string): TicketSummary | undefined => {
    const mark = folded.lastIndexOf('@');
    if (mark < 0) return undefined;
    const slug = folded.slice(mark + 1);
    for (const [known, tickets] of byEffort) {
      if (fold(known) === slug) return tickets.get(folded.slice(0, mark))?.[0];
    }
    return undefined;
  };

  const storedOne = (reference: string, from: TicketSummary, kept: readonly string[]): string => {
    const effort = from.effort;
    const found = edge(reference, effort);
    const target = found.find(ticket => ticket.effort === effort) ?? found[0];
    if (target !== undefined) return shortest(target, effort) ?? reference;

    const folded = fold(reference);
    if (kept.some(held => fold(held) === folded)) return reference;

    const shown = boardForm(folded);
    if (shown !== undefined) {
      throw new BoardFormAsEdge(reference, shortest(shown, effort) ?? fullNameOf(shown));
    }

    const elsewhere = bare.get(folded) ?? [];
    if (elsewhere.length > 0) {
      throw new NameInAnotherEffort(reference, effort, [...new Set(elsewhere.map(fullNameOf))]);
    }

    // What the reference could have meant, each beside the text it is a slip
    // of. The Ticket being written is left out: an Edge to itself is a cycle,
    // so its own name is never what a caller reached for.
    const self = new Set(claimants(from));
    const meant: { text: string; name: string; ticket: TicketSummary }[] = [];
    const offer = (text: string, known: ReadonlyMap<string, readonly TicketSummary[]>): void => {
      for (const [name, tickets] of known) {
        const [ticket] = tickets;
        if (ticket !== undefined && !tickets.some(one => self.has(one))) {
          meant.push({ text, name, ticket });
        }
      }
    };
    offer(folded, byEffort.get(effort) ?? new Map());
    for (const [slug, prefix] of prefixes) {
      if (folded.startsWith(prefix)) {
        offer(folded.slice(prefix.length), byEffort.get(slug) ?? new Map());
      }
    }
    offer(folded, byId);

    let nearest: TicketSummary | undefined;
    let fewest = Infinity;
    for (const { text, name, ticket } of meant) {
      const distance = nearMiss(text, name);
      if (distance !== undefined && distance < fewest) {
        nearest = ticket;
        fewest = distance;
      }
    }
    if (nearest !== undefined) {
      throw new ProbableTypo(reference, shortest(nearest, effort) ?? fullNameOf(nearest));
    }
    return reference;
  };

  const stored = (
    references: readonly string[],
    from: TicketSummary,
    kept: readonly string[] = [],
  ): readonly string[] => {
    const seen = new Set<string>();
    return references
      .map(reference => storedOne(reference, from, kept))
      .filter(form => {
        const key = fold(node(form, from.effort));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  let groups: Map<string, readonly TicketSummary[]> | undefined;
  const edgesFrom = (from: string): readonly string[] => {
    if (groups === undefined) {
      groups = new Map();
      for (const ticket of all) {
        const group = claimants(ticket);
        const key = fullNameOf(group[0] ?? ticket);
        if (!groups.has(key)) groups.set(key, group);
      }
    }
    return (groups.get(from) ?? []).flatMap(ticket =>
      ticket.blockedBy.map(name => node(name, ticket.effort)),
    );
  };

  return { edge, input, claimants, addressOf, stored, duplicates, nodeOf, node, edgesFrom };
}
