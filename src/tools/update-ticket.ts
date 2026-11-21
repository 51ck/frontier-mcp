import { z } from 'zod';

import type { Kind, TicketEdit, TicketSummary } from '../domain.ts';
import { STATUSES, TRIAGE_ROLES } from '../domain.ts';
import type { TriageRole } from '../domain.ts';
import { cycleThrough, renderCycle, type EdgesOf } from '../edges.ts';
import { frontierOf } from '../frontier.ts';
import { fullNameOf, indexNames } from '../names.ts';
import {
  extraInput,
  extraProblems,
  PROTO,
  PROTO_REFUSED,
  reservedKeyMessage,
  UPDATE_ARGUMENTS,
} from './extra.ts';
import { renderNamedFrom } from './get-board.ts';
import { tagsInput } from './tags.ts';

export const updateTicketInputSchema = z.strictObject({
  id: z.string().describe('Ticket id or name; <effort>.<name> when several Efforts have the name.'),
  claim: z
    .strictObject({ by: z.string().min(1).describe('Who is taking it.') })
    .optional()
    .describe('Take the Ticket. Fails if another holder already has it.'),
  resolve: z
    .strictObject({
      answer_gist: z.string().min(1).describe('One line: what landed, or what was decided.'),
      answer: z.string().optional().describe('The full answer, written into the body verbatim.'),
    })
    .optional()
    .describe('Close the Ticket as a step on the route.'),
  drop: z
    .strictObject({ reason: z.string().min(1).describe('Why it is beyond the destination.') })
    .optional()
    .describe('Close the Ticket as work ruled out of scope.'),
  reopen: z
    .strictObject({ reason: z.string().min(1).describe('Why it is being reopened.') })
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
      'Replace the Edges outright, each a Ticket id, a name in this Effort, or ' +
        '<effort>.<name>. An empty list clears them. A cycle is refused.',
    ),
  tags: tagsInput.describe(
    'Replace the tags outright, each kept exactly as given. An empty list removes them. ' +
      'No effect on what is takeable.',
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
  add_criteria: z
    .array(z.string().refine(value => value.trim() !== '', 'a criterion must not be blank'))
    .optional()
    .describe('Acceptance criteria to append unticked, one line each; tick may name them.'),
  drop_keys: z
    .array(z.string())
    .min(1)
    .optional()
    .describe(
      'Unimported frontmatter keys to delete, as get_tickets lists them. A schema key or an ' +
        'absent one fails the whole call; nothing else in the fence changes.',
    ),
  extra: extraInput.describe(
    'Keys outside the schema to set, each written at the top level of the frontmatter to its ' +
      'JSON value, replacing a stored value whole. Keys not named are untouched. A schema key ' +
      'fails the whole call. No effect on what is takeable.',
  ),
  title: z
    .string()
    .refine(value => value.trim() !== '', 'title must not be blank')
    .optional()
    .describe('Replace the Ticket title.'),
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
  'refused if they close a cycle. Identity: title, kind, and type. Annotations: triage role, tags, a ' +
  'comment, adding or ticking acceptance criteria, setting extra keys or dropping them; these touch no part of the graph. Any of the four groups ' +
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
  readonly tags?: readonly string[] | undefined;
  readonly comment?: string | undefined;
  readonly tick?: readonly string[] | undefined;
  readonly add_criteria?: readonly string[] | undefined;
  readonly drop_keys?: readonly string[] | undefined;
  readonly extra?: Readonly<Record<string, unknown>> | undefined;
  readonly title?: string | undefined;
  readonly kind?: Kind | undefined;
  readonly type?: string | undefined;
}

/**
 * Turn a request into the edit the driver applies, refusing anything the Status
 * model or the Edge graph does not allow. Validation lives here rather than in
 * the driver because it is a rule about the domain, not about storage.
 *
 * `all` is every Ticket in the workspace, because an Edge can lead into another
 * Effort and a cycle can run through one this call never names.
 */
export function editFor(
  ticket: TicketSummary,
  all: readonly TicketSummary[],
  request: UpdateRequest,
  now: string,
  reserved: ReadonlySet<string>,
): TicketEdit {
  refuseReserved(ticket, request, reserved);
  // Identity and annotations are not graph operations. They carry no lifecycle
  // meaning, so they ride along with a transition or stand on their own. An Edge
  // change is a graph operation and rides along the same way, having been
  // validated first.
  const annotations: TicketEdit = {
    ...identityFor(ticket, request),
    ...(request.triage === undefined ? {} : { triage: request.triage }),
    ...(request.tags === undefined ? {} : { tags: request.tags }),
    ...(request.comment === undefined ? {} : { comment: request.comment }),
    ...(request.tick === undefined ? {} : { tick: request.tick }),
    ...(request.add_criteria === undefined ? {} : { addCriteria: request.add_criteria }),
    ...(request.drop_keys === undefined ? {} : { dropKeys: request.drop_keys }),
    ...(request.extra === undefined || Object.keys(request.extra).length === 0
      ? {}
      : { extra: request.extra }),
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
        'Nothing to do: pass a lifecycle change, or title, kind, type, blocked_by, triage, tags, ' +
          'comment, tick, add_criteria, drop_keys, or extra.',
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

/**
 * A schema key, the marker and `id` among them, is reachable neither through
 * `extra` nor through `drop_keys`; the whole call is refused before any edit
 * is built, naming the argument that does set the field. A key both set and
 * dropped in one call is refused too: the call does not say which it means.
 */
function refuseReserved(
  ticket: TicketSummary,
  request: UpdateRequest,
  reserved: ReadonlySet<string>,
): void {
  const subject = fullNameOf(ticket);
  for (const key of request.drop_keys ?? []) {
    if (key === PROTO) throw new Error(`${subject}: ${PROTO_REFUSED}`);
    if (reserved.has(key)) {
      throw new Error(reservedKeyMessage(subject, 'drop_keys', key, UPDATE_ARGUMENTS));
    }
  }
  if (request.extra === undefined) return;
  const problem = extraProblems(subject, request.extra, reserved, UPDATE_ARGUMENTS);
  if (problem !== undefined) throw new Error(problem);
  const both = (request.drop_keys ?? []).find(key => Object.hasOwn(request.extra ?? {}, key));
  if (both !== undefined) {
    throw new Error(
      `${subject}: ${both} is in both extra and drop_keys; pass it in one. Nothing was written.`,
    );
  }
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
 * The new Edge list as it is stored, refused if it closes a cycle. This is the
 * same check `create_tickets` runs and the easier of the two ways to close a
 * loop — a breakdown published in one call is at least written down in one
 * place, where an Edge added later is not.
 *
 * An Edge that resolves to nothing dangles, a Board warning, unless it reads as
 * a slip of a name that exists. One the Ticket already carried is never judged.
 */
function edgesFor(
  ticket: TicketSummary,
  all: readonly TicketSummary[],
  request: UpdateRequest,
): readonly string[] {
  const names = indexNames(all);
  const blockedBy = names.stored(request.blocked_by ?? [], ticket, ticket.blockedBy);
  const self = names.nodeOf(ticket);
  const proposed = blockedBy.map(edge => names.node(edge, ticket.effort));
  const edgesOf: EdgesOf = node => (node === self ? proposed : names.edgesFrom(node));

  const cycle = cycleThrough(self, edgesOf);
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
      `${fullNameOf(ticket)} is already claimed by ${ticket.claimedBy}` +
        `${ticket.claimedAt === undefined ? '' : ` since ${ticket.claimedAt}`}. ` +
        'Claims are never auto-released; use release or take it up with the holder.',
    );
  }
  if (ticket.status === 'resolved' || ticket.status === 'dropped') {
    throw new Error(
      `${fullNameOf(ticket)} is already ${ticket.status}, so there is nothing to claim.`,
    );
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
      `${fullNameOf(ticket)} is ${ticket.status}, so it cannot be reopened — only resolved or ` +
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
      `${fullNameOf(ticket)} is ${ticket.status}, so its claim cannot be released — only claimed ` +
        'Tickets can.',
    );
  }

  return { status: 'open', claimedBy: null, claimedAt: null };
}

/**
 * What a resolve or a drop did to the Tickets naming this one, from the scan
 * the write was checked against with `written` in place of `read`, so the two
 * Frontiers compared differ by this write alone and no file is read for it.
 *
 * A resolve names the dependents it made takeable; one still held by another
 * blocker, a duplicate's other claimant included, is not. A dropped blocker
 * never satisfies an Edge, so a drop names the open and claimed dependents it
 * left waiting on it.
 */
export function graphEffect(
  scan: readonly TicketSummary[],
  read: TicketSummary,
  written: TicketSummary,
): string | undefined {
  const after = scan.map(ticket => (ticket === read ? written : ticket));
  const dependents = indexNames(after).dependents(written);

  let named: readonly TicketSummary[];
  let label: string;
  if (written.status === 'resolved') {
    const before = frontierOf(scan);
    const now = frontierOf(after);
    named = dependents.filter(ticket => now.has(ticket) && !before.has(ticket));
    label = 'now takeable';
  } else if (written.status === 'dropped' && read.status !== 'dropped') {
    named = dependents.filter(ticket => ticket.status === 'open' || ticket.status === 'claimed');
    label = 'now blocked by a dropped Ticket, which never unblocks';
  } else {
    return undefined;
  }
  return named.length === 0
    ? undefined
    : `${label}: ${renderNamedFrom(named, written.effort, ', ')}`;
}

export function renderUpdate(
  ticket: TicketSummary,
  warnings: readonly string[] = [],
  effect?: string,
): string {
  const fields = [
    `status=${ticket.status}`,
    ticket.claimedBy === undefined ? undefined : `claimed_by=${ticket.claimedBy}`,
    ticket.claimedAt === undefined ? undefined : `claimed_at=${ticket.claimedAt}`,
    ticket.answerGist === undefined ? undefined : `answer_gist=${ticket.answerGist}`,
    ticket.droppedReason === undefined ? undefined : `dropped_reason=${ticket.droppedReason}`,
  ].filter(field => field !== undefined);

  const body = [`${fullNameOf(ticket)} updated`, fields.join('  '), effect]
    .filter(line => line !== undefined)
    .join('\n');
  if (warnings.length === 0) return body;
  return `${body}\nwarnings:\n${warnings.map(warning => `- ${warning}`).join('\n')}`;
}
