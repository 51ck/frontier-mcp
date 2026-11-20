import { z } from 'zod';

import type { Kind, TicketDraft, TicketSummary, TriageRole } from '../domain.ts';
import { TRIAGE_ROLES } from '../domain.ts';
import { cycleThrough, renderCycle } from '../edges.ts';
import { fullNameOf, indexNames, newNameProblem, type Names } from '../names.ts';
import { renderEdge } from './get-board.ts';
import { CREATE_ARGUMENTS, extraInput, extraProblems } from './extra.ts';
import { tagsInput } from './tags.ts';

export const createTicketsInputSchema = z.strictObject({
  effort: z.string().describe('Effort slug to create them in.'),
  create: z
    .boolean()
    .optional()
    .describe(
      'Start the Effort if the workspace does not hold it. Otherwise an unknown slug fails.',
    ),
  tickets: z
    .array(
      z.strictObject({
        name: z
          .string()
          .min(1)
          .describe(
            'One to three lowercase words joined by hyphens, e.g. token-cache. Becomes the ' +
              'filename, and how Edges name this Ticket.',
          ),
        key: z.never({ error: '`key` was replaced by `name`.' }).optional(),
        title: z.string().refine(value => value.trim() !== '', 'title must not be blank'),
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
            'Edges: a name from this call or this Effort, <effort>.<name>, or an existing id.',
          ),
        tags: tagsInput.describe('Tags, kept exactly as given. No effect on what is takeable.'),
        extra: extraInput.describe(
          'Keys outside the schema, each written at the top level of the frontmatter to its ' +
            'JSON value. A schema key fails the whole call. No effect on what is takeable.',
        ),
        body: z.string().optional().describe('The prose, written verbatim.'),
      }),
    )
    .min(1),
  root: z.string().optional().describe('Workspace directory. Defaults to the session workspace.'),
});

export const createTicketsDescription =
  'Publish a whole breakdown in one call. You name each Ticket; Edges may name a sibling from the ' +
  'same call. All are written or none — a partial failure creates nothing. Cycles are refused. ' +
  'An unknown Effort needs create.';

export interface DraftRequest {
  readonly name: string;
  readonly title: string;
  readonly kind?: Kind | undefined;
  readonly type?: string | undefined;
  readonly triage?: TriageRole | undefined;
  readonly blocked_by?: readonly string[] | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly extra?: Readonly<Record<string, unknown>> | undefined;
  readonly body?: string | undefined;
}

export interface PlannedBatch {
  readonly drafts: readonly TicketDraft[];
  /**
   * Every rule again, against the workspace as the driver reads it immediately
   * before writing, giving the drafts as they are to be written. The read
   * behind the first pass may be a cached scan, taken before another session
   * added the Ticket a name now collides with, an Edge now closes a loop
   * through, or a shortened Edge would now mean instead.
   */
  readonly settle: (tickets: readonly TicketSummary[]) => readonly TicketDraft[];
}

/**
 * Turn the request into drafts, refusing anything the schema, the naming rules
 * or the graph do not allow, with every Edge in the form it is stored in. An
 * Edge that resolves to nothing is refused only when it reads as a slip of a
 * name that exists: pointing at a Ticket not yet written is how a breakdown
 * gets built.
 */
export function planBatch(
  requests: readonly DraftRequest[],
  existing: readonly TicketSummary[],
  effort: string,
  reserved: ReadonlySet<string>,
): PlannedBatch {
  requests.forEach((request, index) => {
    if (request.extra === undefined) return;
    const subject = `Ticket ${String(index + 1)} of this call, name "${request.name}"`;
    const problem = extraProblems(subject, request.extra, reserved, CREATE_ARGUMENTS);
    if (problem !== undefined) throw new Error(`${problem} No Ticket of the batch was created.`);
  });
  const requested = requests.map(request => toDraft(request));
  const settle = (tickets: readonly TicketSummary[]): readonly TicketDraft[] => {
    checkNames(requested, tickets, effort);
    const drafts = withStoredEdges(requested, tickets, effort);
    checkCycles(drafts, tickets, effort);
    return drafts;
  };

  return { drafts: settle(existing), settle };
}

/**
 * The drafts stand in the index beside the Tickets on disk, so an Edge to a
 * sibling of the same call resolves, and a slip of a sibling's name is caught,
 * exactly as it would be once the files exist.
 */
function withStoredEdges(
  drafts: readonly TicketDraft[],
  existing: readonly TicketSummary[],
  effort: string,
): readonly TicketDraft[] {
  const planned = drafts.map(draft => asWritten(draft, effort));
  const names = indexNames([...existing, ...planned]);

  return drafts.map((draft, index) => {
    const from = planned[index];
    if (from === undefined) return draft;
    return { ...draft, blockedBy: names.stored(draft.blockedBy, from) };
  });
}

function toDraft(request: DraftRequest): TicketDraft {
  if (request.type !== undefined && (request.kind ?? 'build') !== 'decision') {
    throw new Error(
      `"${request.title}" is a build Ticket, so it has no type — that field records which ` +
        'wayfinder shape a decision Ticket is.',
    );
  }

  return {
    name: request.name,
    title: request.title,
    kind: request.kind ?? 'build',
    type: request.type,
    triage: request.triage,
    blockedBy: request.blocked_by ?? [],
    tags: request.tags ?? [],
    extra: request.extra ?? {},
    body: request.body,
  };
}

/**
 * A new name is where the Ticket will live and what every Edge will call it, so
 * it is refused when it could not be a filename everywhere, or would answer to
 * a Ticket that already exists. Each refusal names the entry and the rule.
 */
function checkNames(
  drafts: readonly TicketDraft[],
  existing: readonly TicketSummary[],
  effort: string,
): void {
  const names = indexNames(existing);
  const seen = new Map<string, number>();

  drafts.forEach((draft, index) => {
    const refuse = (reason: string): never => {
      throw new Error(
        `Ticket ${String(index + 1)} of this call, name "${draft.name}", ${reason}. ` +
          'Nothing was created.',
      );
    };

    const problem = newNameProblem(draft.name);
    if (problem !== undefined) refuse(problem);

    const folded = draft.name.toLowerCase();
    const earlier = seen.get(folded);
    if (earlier !== undefined) refuse(`repeats the name of Ticket ${String(earlier + 1)}`);
    seen.set(folded, index);

    // Another Effort's dotted stem can already answer to this full name:
    // `a/issues/b.foo.md` and a new `foo` in `a.b` are both `a.b.foo`.
    const full = `${effort}.${draft.name}`.toLowerCase();
    const twin = existing.find(ticket => fullNameOf(ticket).toLowerCase() === full);
    if (twin !== undefined && (twin.effort !== effort || twin.id !== undefined)) {
      refuse(`would share the full name ${fullNameOf(twin)} with a Ticket of ${twin.effort}`);
    }

    const [taken] = names.edge(draft.name, effort);
    if (taken === undefined) return;
    refuse(
      taken.effort === effort && taken.name.toLowerCase() === folded
        ? `is already a Ticket of ${effort}`
        : `is the id of an existing Ticket, ${fullNameOf(taken)} in ${taken.effort}`,
    );
  });
}

/**
 * The graph the batch would produce, resolved exactly as it will be once the
 * files exist: the drafts stand in the index beside the Tickets on disk, so a
 * dangling Edge already naming one of them closes its loop here.
 */
function checkCycles(
  drafts: readonly TicketDraft[],
  existing: readonly TicketSummary[],
  effort: string,
): void {
  const planned = drafts.map(draft => asWritten(draft, effort));
  const names = indexNames([...existing, ...planned]);

  for (const ticket of planned) {
    const cycle = cycleThrough(names.nodeOf(ticket), node => names.edgesFrom(node));
    if (cycle !== undefined) {
      throw new Error(
        `"${ticket.title}" would close a cycle in the Edge graph: ${renderCycle(cycle)}. ` +
          'Nothing in a cycle is ever takeable, so nothing was created.',
      );
    }
  }
}

function asWritten(draft: TicketDraft, effort: string): TicketSummary {
  return {
    id: undefined,
    name: draft.name,
    title: draft.title,
    kind: draft.kind,
    type: draft.type,
    status: 'open',
    triage: draft.triage,
    answerGist: undefined,
    droppedReason: undefined,
    claimedBy: undefined,
    claimedAt: undefined,
    blockedBy: draft.blockedBy,
    tags: draft.tags,
    effort,
    orderHint: undefined,
    hasUnimportedKeys: false,
    revision: '',
  };
}

/**
 * One line per Ticket: its full name, which is valid input anywhere, and its
 * Edges as the Board renders them, so one that dangles shows here first.
 *
 * `names` is undefined when the workspace could not be read back after the
 * write. The Tickets exist all the same, so they are still listed, and the
 * Edges are left out rather than shown in a form the Board might not agree with.
 */
export function renderCreated(
  effort: string,
  created: readonly TicketSummary[],
  names: Names | undefined,
): string {
  const lines = [`${effort}: ${String(created.length)} created`];

  for (const ticket of created) {
    lines.push(
      [
        fullNameOf(ticket),
        ticket.title,
        ticket.blockedBy.length === 0 || names === undefined
          ? undefined
          : `blocked_by=${ticket.blockedBy.map(edge => renderEdge(edge, ticket, names)).join(',')}`,
      ]
        .filter(part => part !== undefined)
        .join('  '),
    );
  }

  if (names === undefined) {
    lines.push('note: every Ticket was created; their Edges could not be read back to render.');
  }
  return lines.join('\n');
}
