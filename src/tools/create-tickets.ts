import { z } from 'zod';

import type { Kind, TicketDraft, TicketSummary, TriageRole } from '../domain.ts';
import { MINTED_ID, TRIAGE_ROLES } from '../domain.ts';
import { cycleThrough, renderCycle, resolveDraftEdges, type EdgesOf } from '../edges.ts';
import { indexById } from '../frontier.ts';

export const createTicketsInputSchema = {
  effort: z.string().describe('Effort slug to create them in.'),
  create: z
    .boolean()
    .optional()
    .describe(
      'Start the Effort if the workspace does not hold it. Otherwise an unknown slug fails.',
    ),
  tickets: z
    .array(
      z.object({
        key: z
          .string()
          .min(1)
          .optional()
          .describe(
            'Your own temporary name for this Ticket, so siblings can declare Edges on it ' +
              'before it has an id. Never stored. May not look like T<n>.',
          ),
        title: z.string().min(1),
        kind: z.enum(['build', 'decision']).optional().describe('Defaults to build.'),
        type: z
          .string()
          .min(1)
          .optional()
          .describe('research / prototype / grilling / task. Only on a decision Ticket.'),
        triage: z.enum(TRIAGE_ROLES).optional(),
        blocked_by: z
          .array(z.string().min(1))
          .optional()
          .describe(
            'Edges: a real Ticket id from anywhere in the repo, or a key declared in this call.',
          ),
        body: z.string().optional().describe('The prose, written verbatim.'),
      }),
    )
    .min(1)
    .describe('The whole set, in the order they should be numbered.'),
  root: z.string().optional().describe('Workspace directory. Defaults to the session workspace.'),
};

export const createTicketsDescription =
  'Publish a whole breakdown in one call. Edges may name a sibling by a temporary key you choose; ' +
  'the server mints repo-unique ids, numbers the files, and resolves the keys atomically — a ' +
  'partial failure creates nothing. Cycles are refused. An unknown Effort needs create.';

export interface DraftRequest {
  readonly key?: string | undefined;
  readonly title: string;
  readonly kind?: Kind | undefined;
  readonly type?: string | undefined;
  readonly triage?: TriageRole | undefined;
  readonly blocked_by?: readonly string[] | undefined;
  readonly body?: string | undefined;
}

export interface PlannedBatch {
  readonly drafts: readonly TicketDraft[];
  /**
   * The cycle check, re-run against the ids the batch is actually given and the
   * workspace as it looks under the driver's reservations. A Ticket already on
   * disk can declare an Edge on an id nobody has minted yet, and minting exactly
   * that id is the moment that dangling Edge becomes a loop — which is invisible
   * until the ids are real.
   *
   * It takes the Tickets rather than closing over the ones read here, because
   * the read that produced those came before the reservations and may have
   * missed the very Ticket whose dangling Edge is about to close.
   */
  readonly validate: (ids: readonly string[], tickets: readonly TicketSummary[]) => void;
}

/**
 * Turn the request into drafts, refusing anything the schema or the graph does
 * not allow. Everything resolvable without an id is settled here, so by the time
 * the driver mints one the only rule left to check is the one that needed it.
 */
export function planBatch(
  requests: readonly DraftRequest[],
  existing: readonly TicketSummary[],
): PlannedBatch {
  const drafts = requests.map(request => toDraft(request));
  const keys = declaredKeys(drafts);
  const provisional = drafts.map((draft, index) => draft.key ?? placeholderFor(index, keys));

  checkEdges(drafts, keys, existing);
  // Named by their keys, so a loop between two drafts reads in the caller's own
  // vocabulary rather than in ids they have not seen yet.
  checkCycles(drafts, provisional, existing);

  return {
    drafts,
    validate: (ids, tickets) => {
      checkCycles(drafts, ids, tickets, resolveDraftEdges(drafts, ids));
    },
  };
}

function toDraft(request: DraftRequest): TicketDraft {
  if (request.type !== undefined && (request.kind ?? 'build') !== 'decision') {
    throw new Error(
      `"${request.title}" is a build Ticket, so it has no type — that field records which ` +
        'wayfinder shape a decision Ticket is.',
    );
  }

  return {
    key: request.key,
    title: request.title,
    kind: request.kind ?? 'build',
    type: request.type,
    triage: request.triage,
    blockedBy: request.blocked_by ?? [],
    body: request.body,
  };
}

function declaredKeys(drafts: readonly TicketDraft[]): ReadonlySet<string> {
  const keys = new Set<string>();

  for (const draft of drafts) {
    if (draft.key === undefined) continue;

    // A key shaped like an id is ambiguous: an Edge naming `T8` could mean the
    // sibling draft or the Ticket already answering to it, and the server would
    // have to guess which.
    if (MINTED_ID.test(draft.key)) {
      throw new Error(
        `Temporary key "${draft.key}" looks like a Ticket id. Pick a name that does not, ` +
          'so an Edge naming it is never ambiguous.',
      );
    }
    if (keys.has(draft.key)) throw new Error(`Temporary key "${draft.key}" is used twice.`);
    keys.add(draft.key);
  }

  return keys;
}

/**
 * An Edge is either a real id — which may point at nothing yet, since a dangling
 * Edge is a Board warning rather than a refusal — or a key declared in this same
 * call. Anything else is a typo, and letting it through would quietly turn a
 * mistyped key into a dangling Edge nobody notices.
 */
function checkEdges(
  drafts: readonly TicketDraft[],
  keys: ReadonlySet<string>,
  existing: readonly TicketSummary[],
): void {
  const ids = indexById(existing);

  for (const draft of drafts) {
    for (const edge of draft.blockedBy) {
      if (keys.has(edge) || ids.has(edge) || MINTED_ID.test(edge)) continue;

      throw new Error(
        `"${draft.title}" is blocked by "${edge}", which is neither a Ticket id nor a key ` +
          `declared in this call. Declared keys: ${[...keys].join(', ') || '(none)'}`,
      );
    }
  }
}

/**
 * The graph the batch would produce: existing Tickets by id, plus the drafts
 * under `names` — their temporary keys before allocation, their real ids after.
 *
 * A draft with no key is unreachable by any sibling, but still needs checking:
 * once it has an id, its own Edges can lead back to it through the Tickets
 * already on disk.
 */
function checkCycles(
  drafts: readonly TicketDraft[],
  names: readonly string[],
  existing: readonly TicketSummary[],
  resolve: (edge: string) => string = edge => edge,
): void {
  const ids = indexById(existing);
  const nodes = new Map<string, TicketDraft>();
  const edges = new Map<string, readonly string[]>();

  drafts.forEach((draft, index) => {
    const name = names[index] ?? '';
    nodes.set(name, draft);
    edges.set(name, draft.blockedBy.map(resolve));
  });

  const edgesOf: EdgesOf = id => edges.get(id) ?? ids.get(id)?.blockedBy ?? [];

  for (const [node, draft] of nodes) {
    const cycle = cycleThrough(node, edgesOf);
    if (cycle !== undefined) {
      throw new Error(
        `"${draft.title}" would close a cycle in the Edge graph: ${renderCycle(cycle)}. ` +
          'Nothing in a cycle is ever takeable, so nothing was created.',
      );
    }
  }
}

/** A name for a keyless draft that no Edge can collide with. */
function placeholderFor(index: number, keys: ReadonlySet<string>): string {
  let name = `#${String(index)}`;
  while (keys.has(name)) name = `${name}.`;
  return name;
}

/**
 * One line per Ticket: the id it was minted and the Edges as resolved — the two
 * things a caller cannot work out for itself. The filename is deliberately not
 * here: it is cosmetic, and the id is what everything addresses a Ticket by.
 */
export function renderCreated(effort: string, created: readonly TicketSummary[]): string {
  const lines = [`${effort}: ${String(created.length)} created`];

  for (const ticket of created) {
    lines.push(
      [
        ticket.id ?? ticket.handle,
        ticket.title,
        ticket.blockedBy.length === 0 ? undefined : `blocked_by=${ticket.blockedBy.join(',')}`,
      ]
        .filter(part => part !== undefined)
        .join('  '),
    );
  }

  return lines.join('\n');
}
