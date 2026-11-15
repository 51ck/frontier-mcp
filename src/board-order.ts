/**
 * The order a Board lists an Effort's Tickets in. Derived on every Board and
 * never stored: a new Ticket's file carries no sort-order prefix, so the Edges
 * are the only order a breakdown still has (ADR 0008).
 */

import type { TicketSummary } from './domain.ts';
import type { Names } from './names.ts';

/**
 * The tie-break, and the order of anything that lists an Effort without regard
 * to its Edges: a filename's numeric prefix where it has one, a prefixed file
 * before an unprefixed one, then the name. Names compare case-folded by code
 * unit rather than by locale, so two machines never disagree.
 */
export function compareByOrderHint(a: TicketSummary, b: TicketSummary): number {
  if (a.orderHint !== b.orderHint) {
    if (a.orderHint === undefined) return 1;
    if (b.orderHint === undefined) return -1;
    return a.orderHint - b.orderHint;
  }
  const left = a.name.toLowerCase();
  const right = b.name.toLowerCase();
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * One Effort's Tickets, each below every Ticket of that Effort it is blocked
 * by. Among those whose blockers are all listed, the smallest by
 * {@link compareByOrderHint} comes next, so an Effort whose Edges agree with
 * its prefixes lists by prefix.
 *
 * Only an Edge resolving to exactly one Ticket of the same Effort orders
 * anything: one into another Effort, a dangling one, and one to a duplicated
 * name do not. A cycle is somebody's hand edit and must still list whole, so
 * when every remaining Ticket waits on another, the smallest that is itself on
 * a cycle is listed. Never merely the smallest remaining: a Ticket downstream
 * of a cycle would then be listed above its blocker.
 *
 * Tickets are handled as positions in tie-break order. Without a cycle the
 * cost is a sort and one heap operation per Ticket and per Edge. Each time a
 * cycle has to be broken, the strongly connected component broken into is
 * walked once more, so a single ring of any size costs one extra pass and only
 * a densely knotted component approaches quadratic.
 */
export function boardOrder(
  tickets: readonly TicketSummary[],
  names: Names,
): readonly TicketSummary[] {
  const sorted = tickets.toSorted(compareByOrderHint);
  const positionOf = new Map(sorted.map((ticket, position) => [ticket, position]));

  const blockers: number[][] = sorted.map(() => []);
  const dependents: number[][] = sorted.map(() => []);
  sorted.forEach((ticket, position) => {
    const seen = new Set<number>();
    for (const edge of ticket.blockedBy) {
      const resolved = names.edge(edge, ticket.effort);
      const blocker =
        resolved.length === 1 ? positionOf.get(resolved[0] as TicketSummary) : undefined;
      if (blocker === undefined || blocker === position || seen.has(blocker)) continue;
      seen.add(blocker);
      blockers[position]?.push(blocker);
      dependents[blocker]?.push(position);
    }
  });

  const waiting = blockers.map(held => held.length);
  const isListed = sorted.map(() => false);
  const free: number[] = [];
  waiting.forEach((count, position) => {
    if (count === 0) free.push(position);
  });

  // Which strongly connected component of the unlisted Tickets a position is
  // in, or NOT_CYCLIC for one that is on no cycle. Filled in only once the
  // listing first sticks; removing a Ticket that is on no cycle changes no
  // cycle, so it stays true between one break and the next.
  const component = sorted.map(() => NOT_CYCLIC);
  const membersOf = new Map<number, readonly number[]>();
  const onCycle: number[] = [];
  let nextComponent = 0;
  let cyclesKnown = false;

  const split = (members: readonly number[], within: number): void => {
    for (const group of stronglyConnected(members, blockers, position => {
      return !isListed[position] && component[position] === within;
    })) {
      if (group.length === 1) {
        component[group[0] as number] = NOT_CYCLIC;
        continue;
      }
      const id = nextComponent++;
      membersOf.set(id, group);
      for (const position of group) component[position] = id;
    }
  };

  const breakCycle = (): number | undefined => {
    if (!cyclesKnown) {
      cyclesKnown = true;
      const unlisted = sorted.map((_, position) => position).filter(at => !isListed[at]);
      split(unlisted, NOT_CYCLIC);
      for (const position of unlisted) {
        if (component[position] !== NOT_CYCLIC) heapPush(onCycle, position);
      }
    }
    for (;;) {
      const position = heapPop(onCycle);
      if (position === undefined) return undefined;
      const broken = component[position];
      if (isListed[position] || broken === undefined || broken === NOT_CYCLIC) continue;
      isListed[position] = true;
      const rest = (membersOf.get(broken) ?? []).filter(member => member !== position);
      membersOf.delete(broken);
      split(rest, broken);
      return position;
    }
  };

  const listed: TicketSummary[] = [];
  while (listed.length < sorted.length) {
    const next = heapPop(free) ?? breakCycle();
    if (next === undefined) break;
    isListed[next] = true;
    listed.push(sorted[next] as TicketSummary);
    for (const dependent of dependents[next] ?? []) {
      const left = (waiting[dependent] ?? 0) - 1;
      waiting[dependent] = left;
      if (left === 0 && !isListed[dependent]) heapPush(free, dependent);
    }
  }
  return listed;
}

const NOT_CYCLIC = -1;

/**
 * Tarjan's strongly connected components over `members`, following only Edges
 * to positions `within` accepts. Iterative: a chain of a few thousand Tickets
 * must not be a few thousand stack frames.
 */
function stronglyConnected(
  members: readonly number[],
  edges: readonly (readonly number[])[],
  within: (position: number) => boolean,
): number[][] {
  const index = new Map<number, number>();
  const low = new Map<number, number>();
  const onStack = new Set<number>();
  const stack: number[] = [];
  const groups: number[][] = [];
  let counter = 0;

  for (const root of members) {
    if (index.has(root)) continue;
    const frames: { node: number; edge: number }[] = [{ node: root, edge: 0 }];
    index.set(root, counter);
    low.set(root, counter++);
    stack.push(root);
    onStack.add(root);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1] as { node: number; edge: number };
      const { node } = frame;
      const next = edges[node]?.[frame.edge];
      if (next !== undefined) {
        frame.edge++;
        if (!within(next)) continue;
        if (!index.has(next)) {
          index.set(next, counter);
          low.set(next, counter++);
          stack.push(next);
          onStack.add(next);
          frames.push({ node: next, edge: 0 });
        } else if (onStack.has(next)) {
          low.set(node, Math.min(low.get(node) ?? 0, index.get(next) ?? 0));
        }
        continue;
      }

      frames.pop();
      const parent = frames[frames.length - 1]?.node;
      if (parent !== undefined) {
        low.set(parent, Math.min(low.get(parent) ?? 0, low.get(node) ?? 0));
      }
      if (low.get(node) !== index.get(node)) continue;
      const group: number[] = [];
      for (;;) {
        const member = stack.pop();
        if (member === undefined) break;
        onStack.delete(member);
        group.push(member);
        if (member === node) break;
      }
      groups.push(group);
    }
  }
  return groups;
}

function heapPush(heap: number[], value: number): void {
  let at = heap.length;
  heap.push(value);
  while (at > 0) {
    const parent = (at - 1) >> 1;
    const above = heap[parent] as number;
    if (above <= value) break;
    heap[at] = above;
    at = parent;
  }
  heap[at] = value;
}

function heapPop(heap: number[]): number | undefined {
  const top = heap[0];
  const last = heap.pop();
  if (top === undefined || last === undefined || heap.length === 0) return top;
  let at = 0;
  for (;;) {
    let child = 2 * at + 1;
    if (child >= heap.length) break;
    const right = heap[child + 1];
    if (right !== undefined && right < (heap[child] as number)) child++;
    const below = heap[child] as number;
    if (below >= last) break;
    heap[at] = below;
    at = child;
  }
  heap[at] = last;
  return top;
}
