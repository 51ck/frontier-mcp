import { z } from 'zod';

import type { Ticket } from '../domain.ts';
import type { TicketEdit } from '../storage/driver.ts';

export const updateTicketInputSchema = {
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
  root: z.string().optional().describe('Workspace directory. Defaults to the session workspace.'),
};

export const updateTicketDescription =
  'Move a Ticket through its lifecycle: claim it, resolve it with a one-line gist, or drop it ' +
  'with a reason. Exactly one of claim/resolve/drop per call.';

export interface UpdateRequest {
  readonly claim?: { by: string } | undefined;
  readonly resolve?: { answer_gist: string; answer?: string | undefined } | undefined;
  readonly drop?: { reason: string } | undefined;
}

/**
 * Turn a request into the edit the driver applies, refusing anything the Status
 * model does not allow. Validation lives here rather than in the driver because
 * it is a rule about the domain, not about storage.
 */
export function editFor(ticket: Ticket, request: UpdateRequest, now: string): TicketEdit {
  const actions = [request.claim, request.resolve, request.drop].filter(
    action => action !== undefined,
  );
  if (actions.length !== 1) {
    throw new Error('Pass exactly one of claim, resolve, or drop.');
  }

  if (request.claim !== undefined) return claimEdit(ticket, request.claim.by, now);

  if (request.resolve !== undefined) {
    // Required on every kind, build included: a build Ticket's one line of what
    // landed is what makes a Board of finished work readable.
    return {
      status: 'resolved',
      answerGist: request.resolve.answer_gist,
      claimedBy: null,
      claimedAt: null,
      ...(request.resolve.answer === undefined ? {} : { answer: request.resolve.answer }),
    };
  }

  if (request.drop !== undefined) {
    return {
      status: 'dropped',
      droppedReason: request.drop.reason,
      claimedBy: null,
      claimedAt: null,
    };
  }

  throw new Error('Pass exactly one of claim, resolve, or drop.');
}

/**
 * Claiming is compare-and-set. A Ticket someone else holds is refused rather
 * than taken, so two parallel sessions can never both believe they hold it.
 * Re-claiming your own is allowed — it refreshes the timestamp.
 */
function claimEdit(ticket: Ticket, by: string, now: string): TicketEdit {
  if (ticket.claimedBy !== undefined && ticket.claimedBy !== by) {
    throw new Error(
      `${ticket.handle} is already claimed by ${ticket.claimedBy}` +
        `${ticket.claimedAt === undefined ? '' : ` since ${ticket.claimedAt}`}. ` +
        'Claims are never auto-released; take it up with the holder.',
    );
  }
  if (ticket.status === 'resolved' || ticket.status === 'dropped') {
    throw new Error(`${ticket.handle} is already ${ticket.status}, so there is nothing to claim.`);
  }

  return { status: 'claimed', claimedBy: by, claimedAt: now };
}

export function renderUpdate(ticket: Ticket): string {
  const fields = [
    `status=${ticket.status}`,
    ticket.claimedBy === undefined ? undefined : `claimed_by=${ticket.claimedBy}`,
    ticket.claimedAt === undefined ? undefined : `claimed_at=${ticket.claimedAt}`,
    ticket.answerGist === undefined ? undefined : `answer_gist=${ticket.answerGist}`,
    ticket.droppedReason === undefined ? undefined : `dropped_reason=${ticket.droppedReason}`,
  ].filter(field => field !== undefined);

  return `${ticket.handle} updated\n${fields.join('  ')}`;
}
