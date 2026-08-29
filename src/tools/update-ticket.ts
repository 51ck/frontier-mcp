import { z } from 'zod';

import type { Kind, TicketEdit, TicketSummary } from '../domain.ts';
import { STATUSES, TRIAGE_ROLES } from '../domain.ts';
import type { TriageRole } from '../domain.ts';
import { cycleThrough, renderCycle, type EdgesOf } from '../edges.ts';
import { indexById } from '../frontier.ts';

export const updateTicketInputSchema = z.object({
  id: z.string().describe('Ticket id, or the <effort>#<order> handle of a Legacy Ticket.'),
  claim: z
    .object({ by: z.string().min(1).describe('Who is taking it.') })
    .optional()
    .describe('Take the Ticket. Fails if another holder already has it.'),
  resolve: z
    .object({
      answer_gist: z.string().min(1).describe('One line: what landed, or what was decided.'),
      answer: z.string().optional().describe('The full answer, written into the body verbatim.'),
    })
    .optional()
    .describe('Close the Ticket as a step on the route.'),
  drop: z
    .object({ reason: z.string().min(1).describe('Why it is beyond the destination.') })
    .optional()
    .describe('Close the Ticket as work ruled out of scope.'),
  reopen: z
    .object({ reason: z.string().min(1).describe('Why it is being reopened.') })
    .optional()
    .describe('Return a resolved or dropped Ticket to open.'),
  release: z
    .literal(true)
    .optional()
    .describe(
      'Release the claim on a claimed Ticket and return it to open. Pass { release: true }.',
    ),
  status: z
    .enum(STATUSES)
    .optional()
    .describe(
      'Not settable directly — use claim, resolve, drop, reopen, or release. Named here to say so.',
    ),
  triage: z
    .enum(TRIAGE_ROLES)
    .optional()
    .describe('Set the triage role. A separate field from status; neither touches the other.'),
  blocked_by: z
    .array(z.string().min(1))
    .optional()
    .describe(
      'Replace the Edges outright, each a plain Ticket id resolved repo-wide. An empty list ' +
        'clears them. A cycle is refused.',
    ),
  comment: z
    .string()
    .min(1)
    .optional()
    .describe('Append to the comment log, stored exactly as written.'),
  tick: z
    .array(z.string().min(1))
    .optional()
    .describe(
      'Acceptance criteria to check off, matched on their text. Wrapped criteria match both ' +
        'as get_tickets returns them and re-joined onto one line. All references resolve before ' +
        'anything is written — one unmatched name fails the whole call and leaves the file untouched.',
    ),
  title: z.string().min(1).optional().describe('Replace the Ticket title.'),
  kind: z.enum(['build', 'decision']).optional().describe('Replace the Ticket kind.'),
  type: z
    .string()
    .min(1)
    .optional()
    .describe('Replace the decision type — research, prototype, grilling, or task.'),
  root: z.string().optional().describe('Workspace directory. Defaults to the session workspace.'),
});

export const updateTicketDescription =
  'Change one Ticket. Lifecycle: claim, resolve with a one-line gist, drop with a reason, reopen ' +
  'with a reason, or release a claim — at most one of those per call. Graph: replace the Edges, ' +
  'refused if they close a cycle. Identity: title, kind, and type. Annotations: triage role, a ' +
  'comment, ticking acceptance criteria; these touch no part of the graph. Any of the four groups ' +
  'may accompany the others or stand alone.';

export interface UpdateRequest {
  readonly claim?: { by: string } | undefined;
  readonly resolve?: { answer_gist: string; answer?: string | undefined } | undefined;
  readonly drop?: { reason: string } | undefined;
  readonly reopen?: { reason: string } | undefined;
  readonly release?: true | undefined;
  readonly triage?: TriageRole | undefined;
  readonly status?: string | undefined;
  readonly blocked_by?: readonly string[] | undefined;
  readonly comment?: string | undefined;
  readonly tick?: readonly string[] | undefined;
  readonly title?: string | undefined;
  readonly kind?: Kind | undefined;
  readonly type?: string | undefined;
}

/**
 * Turn a request into the edit the driver applies, refusing anything the Status
 * model or the Edge graph does not allow. Validation lives here rather than in
 * the driver because it is a rule about the domain, not about storage.
 *
 * `all` is every Ticket in the workspace, because Edges resolve repo-wide and a
 * cycle can run through an Effort this call never names.
 */
export function editFor(
  ticket: TicketSummary,
  all: readonly TicketSummary[],
  request: UpdateRequest,
  now: string,
): TicketEdit {
  // Identity and annotations are not graph operations. They carry no lifecycle
  // meaning, so they ride along with a transition or stand on their own. An Edge
  // change is a graph operation and rides along the same way, having been
  // validated first.
  const annotations: TicketEdit = {
    ...identityFor(ticket, request),
    ...(request.triage === undefined ? {} : { triage: request.triage }),
    ...(request.comment === undefined ? {} : { comment: request.comment }),
    ...(request.tick === undefined ? {} : { tick: request.tick }),
    ...(request.blocked_by === undefined ? {} : { blockedBy: edgesFor(ticket, all, request) }),
  };

  // Status is derived from the transition, never assigned. Saying so beats
  // silently dropping the field — and `wontfix` is a Triage role, so it is not
  // a Status this would have accepted either way.
  if (request.status !== undefined) {
    throw new Error(
      `status is not set directly. Use claim, resolve, drop, reopen, or release; ` +
        `'${request.status}' is a lifecycle position the server derives.`,
    );
  }

  const actions = [
    request.claim,
    request.resolve,
    request.drop,
    request.reopen,
    request.release,
  ].filter(action => action !== undefined);
  if (actions.length > 1) {
    throw new Error('Pass at most one of claim, resolve, drop, reopen, or release.');
  }

  if (actions.length === 0) {
    if (Object.keys(annotations).length === 0) {
      throw new Error(
        'Nothing to do: pass a lifecycle change, or title, kind, type, blocked_by, triage, comment, ' +
          'or tick.',
      );
    }
    return annotations;
  }

  if (request.claim !== undefined) {
    return { ...annotations, ...claimEdit(ticket, request.claim.by, now) };
  }

  if (request.resolve !== undefined) {
    // Required on every kind, build included: a build Ticket's one line of what
    // landed is what makes a Board of finished work readable.
    return {
      ...annotations,
      status: 'resolved',
      answerGist: request.resolve.answer_gist,
      claimedBy: null,
      claimedAt: null,
      ...(request.resolve.answer === undefined ? {} : { answer: request.resolve.answer }),
    };
  }

  if (request.drop !== undefined) {
    return {
      ...annotations,
      status: 'dropped',
      droppedReason: request.drop.reason,
      claimedBy: null,
      claimedAt: null,
    };
  }

  if (request.reopen !== undefined) {
    const reopen = reopenEdit(ticket, request.reopen.reason);
    const archiveComment = reopen.comment ?? '';
    const comment =
      request.comment === undefined ? archiveComment : `${archiveComment}\n\n${request.comment}`;
    const { comment: _ignored, ...rest } = annotations;
    return { ...rest, ...reopen, comment };
  }

  if (request.release !== undefined) {
    return { ...annotations, ...releaseEdit(ticket) };
  }

  throw new Error('Unreachable: an action was counted but none matched.');
}

function identityFor(ticket: TicketSummary, request: UpdateRequest): TicketEdit {
  const resultingKind = request.kind ?? ticket.kind;

  if (request.type !== undefined && resultingKind !== 'decision') {
    throw new Error(
      `"${request.title ?? ticket.title}" is a build Ticket, so it has no type — that field records which ` +
        'wayfinder shape a decision Ticket is.',
    );
  }

  const clearType = request.kind === 'build' && ticket.type !== undefined;

  return {
    ...(request.title === undefined ? {} : { title: request.title }),
    ...(request.kind === undefined ? {} : { kind: request.kind }),
    ...(request.type === undefined ? {} : { type: request.type }),
    ...(clearType ? { type: null } : {}),
  };
}

/**
 * The new Edge list, refused if it closes a cycle. This is the same check
 * `create_tickets` runs and the easier of the two ways to close a loop — a
 * breakdown published in one call is at least written down in one place, where
 * an Edge added later is not.
 *
 * A dangling Edge is not refused: it is a Board warning, and pointing at a
 * Ticket that has not been written yet is how a breakdown gets built up.
 */
function edgesFor(
  ticket: TicketSummary,
  all: readonly TicketSummary[],
  request: UpdateRequest,
): readonly string[] {
  const blockedBy = request.blocked_by ?? [];
  // Nothing can name an id-less Legacy Ticket, so no path leads back to it.
  if (ticket.id === undefined) return blockedBy;

  const byId = indexById(all);
  const edgesOf: EdgesOf = id => (id === ticket.id ? blockedBy : (byId.get(id)?.blockedBy ?? []));

  const cycle = cycleThrough(ticket.id, edgesOf);
  if (cycle !== undefined) {
    throw new Error(
      `Those Edges would close a cycle: ${renderCycle(cycle)}. Nothing in a cycle is ever ` +
        'takeable, so nothing was written.',
    );
  }

  return blockedBy;
}

/**
 * Claiming is compare-and-set. A Ticket someone else holds is refused rather
 * than taken, so two parallel sessions can never both believe they hold it.
 * Re-claiming your own is allowed — it refreshes the timestamp.
 */
function claimEdit(ticket: TicketSummary, by: string, now: string): TicketEdit {
  if (ticket.claimedBy !== undefined && ticket.claimedBy !== by) {
    throw new Error(
      `${ticket.handle} is already claimed by ${ticket.claimedBy}` +
        `${ticket.claimedAt === undefined ? '' : ` since ${ticket.claimedAt}`}. ` +
        'Claims are never auto-released; use release or take it up with the holder.',
    );
  }
  if (ticket.status === 'resolved' || ticket.status === 'dropped') {
    throw new Error(`${ticket.handle} is already ${ticket.status}, so there is nothing to claim.`);
  }

  return { status: 'claimed', claimedBy: by, claimedAt: now };
}

/**
 * Reopening archives what closed the Ticket in a server-authored comment, then
 * clears the fields that made it closed so the Frontier can take it again.
 */
function reopenEdit(ticket: TicketSummary, reason: string): TicketEdit {
  if (ticket.status !== 'resolved' && ticket.status !== 'dropped') {
    throw new Error(
      `${ticket.handle} is ${ticket.status}, so it cannot be reopened — only resolved or ` +
        'dropped Tickets can.',
    );
  }

  const archive = [`Reopened: ${reason}`];
  if (ticket.status === 'resolved' && ticket.answerGist !== undefined) {
    archive.push(`Previous answer_gist: ${ticket.answerGist}`);
  }
  if (ticket.status === 'dropped' && ticket.droppedReason !== undefined) {
    archive.push(`Previous dropped_reason: ${ticket.droppedReason}`);
  }

  return {
    status: 'open',
    answerGist: null,
    droppedReason: null,
    claimedBy: null,
    claimedAt: null,
    comment: archive.join('\n'),
  };
}

/** Release clears a claim without touching what closed the Ticket, if anything did. */
function releaseEdit(ticket: TicketSummary): TicketEdit {
  if (ticket.status !== 'claimed') {
    throw new Error(
      `${ticket.handle} is ${ticket.status}, so its claim cannot be released — only claimed ` +
        'Tickets can.',
    );
  }

  return { status: 'open', claimedBy: null, claimedAt: null };
}

export function renderUpdate(ticket: TicketSummary, warnings: readonly string[] = []): string {
  const fields = [
    `status=${ticket.status}`,
    ticket.claimedBy === undefined ? undefined : `claimed_by=${ticket.claimedBy}`,
    ticket.claimedAt === undefined ? undefined : `claimed_at=${ticket.claimedAt}`,
    ticket.answerGist === undefined ? undefined : `answer_gist=${ticket.answerGist}`,
    ticket.droppedReason === undefined ? undefined : `dropped_reason=${ticket.droppedReason}`,
  ].filter(field => field !== undefined);

  const body = `${ticket.handle} updated\n${fields.join('  ')}`;
  if (warnings.length === 0) return body;
  return `${body}\nwarnings:\n${warnings.map(warning => `- ${warning}`).join('\n')}`;
}
