/**
 * Edge-graph validation, above the storage seam because a cycle is a rule about
 * the domain rather than about storage — the same reason the Status model is
 * checked in the tool layer.
 */

import type { TicketDraft } from './domain.ts';

/**
 * How an Edge on a batch of drafts reads once the ids are real: a temporary key
 * becomes the id its draft was given, and anything else is already an id.
 *
 * Both sides of the seam need this and must agree — the tool layer resolves to
 * check for cycles, the driver resolves to write the frontmatter, and a graph
 * approved under one resolution and written under another would be neither.
 */
export function resolveDraftEdges(
  drafts: readonly TicketDraft[],
  ids: readonly string[],
): (edge: string) => string {
  const byKey = new Map<string, string>();

  drafts.forEach((draft, index) => {
    const id = ids[index];
    if (draft.key !== undefined && id !== undefined) byKey.set(draft.key, id);
  });

  return edge => byKey.get(edge) ?? edge;
}

/** The Edges leaving one node, by id. A node nothing knows about has none. */
export type EdgesOf = (id: string) => readonly string[];

/**
 * The cycle running through `node`, as the path back to itself, or undefined
 * when there is none.
 *
 * A cycle is rejected at write time because it makes the Frontier undefined:
 * nothing in one is ever takeable, and no reader can tell which Edge was the
 * mistake. It is checked on creation and on Edge updates alike, since the
 * second is the easier way to close a loop.
 *
 * Only a cycle through `node` counts. A cycle elsewhere in the workspace is
 * somebody's hand edit and not this caller's to answer for — refusing it here
 * would make an unrelated Effort unwritable, and the Board already reports the
 * graph damage it causes.
 */
export function cycleThrough(node: string, edgesOf: EdgesOf): readonly string[] | undefined {
  // Reachability is monotone, so a node explored once and found not to reach
  // `node` never will. That also stops a pre-existing cycle downstream from
  // spinning forever.
  const explored = new Set<string>([node]);

  const walk = (from: string, trail: readonly string[]): readonly string[] | undefined => {
    for (const next of edgesOf(from)) {
      if (next === node) return [...trail, node];
      if (explored.has(next)) continue;
      explored.add(next);

      const found = walk(next, [...trail, next]);
      if (found !== undefined) return found;
    }

    return undefined;
  };

  return walk(node, [node]);
}

/** How a refused cycle reads: the loop, in the direction the Edges point. */
export function renderCycle(cycle: readonly string[]): string {
  return cycle.join(' -> ');
}
