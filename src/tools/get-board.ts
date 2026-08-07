import { z } from 'zod';

import type { Effort, TicketSummary } from '../domain.ts';
import { frontierOf, indexById } from '../frontier.ts';

export const getBoardInputSchema = {
  effort: z.string().describe('Effort slug, as reported by list_efforts.'),
  root: z.string().optional().describe('Workspace directory. Defaults to the session workspace.'),
};

export const getBoardDescription =
  "An Effort's Destination, then one line per Ticket — id, title, kind, status, Edges — with the " +
  'Frontier marked. Never returns bodies; fetch those with get_tickets.';

export interface Board {
  readonly effort: Effort;
  readonly tickets: readonly TicketSummary[];
  /** The Tickets takeable right now. Computed repo-wide; never read from a file. */
  readonly frontier: ReadonlySet<TicketSummary>;
  /** Every Ticket in the workspace, because Edges resolve repo-wide. */
  readonly byId: ReadonlyMap<string, TicketSummary>;
}

/**
 * A Board is three views of one array — the Effort's slice of it, the Frontier
 * over all of it, and an id lookup across all of it. Building them here keeps
 * the identity relationship they depend on in one place: `frontier.has(ticket)`
 * only works because every view derives from the same objects.
 */
export function boardFor(effort: Effort, all: readonly TicketSummary[]): Board {
  return {
    effort,
    tickets: all.filter(ticket => ticket.effort === effort.slug),
    frontier: frontierOf(all),
    byId: indexById(all),
  };
}

/**
 * One line per Ticket, and nothing an agent has to open a file to interpret.
 * The whole point is that this costs a fraction of reading the Effort, so every
 * character here is spent deliberately.
 */
export function renderBoard(board: Board): string {
  const { effort, tickets, frontier } = board;
  const lines = [`effort: ${effort.slug}`];

  // Header-doc prose is the author's, wrapped however they wrote it. Indenting
  // continuation lines keeps a multi-paragraph Destination from being read as
  // more Ticket lines, which are strictly one per line.
  if (effort.destination !== undefined) lines.push(labelled('destination', effort.destination));
  else if (effort.specOpening !== undefined) lines.push(labelled('spec', effort.specOpening));

  if (tickets.length === 0) {
    lines.push('', '(no tickets)');
    return lines.join('\n');
  }

  const takeable = tickets.filter(ticket => frontier.has(ticket));
  lines.push(
    takeable.length === 0
      ? 'frontier: none takeable in this Effort'
      : `frontier: ${takeable.length} marked >`,
    '',
  );

  for (const ticket of tickets) {
    const line = renderLine(ticket, board);
    lines.push(frontier.has(ticket) ? `> ${line}` : line);
  }

  const warnings = collectWarnings(board);
  if (warnings.length > 0) lines.push('', 'warnings:', ...warnings.map(entry => `  ${entry}`));

  return lines.join('\n');
}

/**
 * How long a claim may sit before it looks abandoned. Long enough that an agent
 * working steadily is never flagged, short enough that a session which died
 * overnight is visible the next morning.
 */
const STALE_AFTER_HOURS = 24;

/**
 * A claim held past the threshold is reported and nothing more. Auto-expiry is
 * explicitly out of scope: a long-running agent must never be silently robbed
 * of its Ticket, so releasing one stays a human decision.
 */
function isStaleClaim(ticket: TicketSummary): boolean {
  if (ticket.status !== 'claimed' || ticket.claimedAt === undefined) return false;

  const taken = Date.parse(ticket.claimedAt);
  if (Number.isNaN(taken)) return false;

  return Date.now() - taken > STALE_AFTER_HOURS * 60 * 60 * 1000;
}

function labelled(label: string, prose: string): string {
  return `${label}: ${prose.split('\n').join('\n  ')}`;
}

/**
 * Fields are separated by two spaces, so any author-written value has its own
 * whitespace collapsed first — a title containing a double space would
 * otherwise forge a field boundary that is not there.
 */
function flat(prose: string): string {
  return prose.replace(/\s+/g, ' ').trim();
}

function renderLine(ticket: TicketSummary, board: Board): string {
  const parts = [
    ticket.handle,
    flat(ticket.title),
    `${ticket.kind}/${ticket.status}`,
    ticket.triage === undefined ? undefined : `triage=${ticket.triage}`,
    ticket.blockedBy.length > 0
      ? `blocked_by=${ticket.blockedBy.map(id => renderEdge(id, ticket, board)).join(',')}`
      : undefined,
    ticket.answerGist === undefined ? undefined : `gist=${flat(ticket.answerGist)}`,
    ticket.droppedReason === undefined ? undefined : `dropped=${flat(ticket.droppedReason)}`,
    ticket.claimedBy === undefined ? undefined : `claimed_by=${flat(ticket.claimedBy)}`,
  ].filter(part => part !== undefined);

  return parts.join('  ');
}

/**
 * An Edge is a plain id. A blocker living in another Effort is annotated with
 * its owning Effort so it stays followable — there is no compound reference
 * form to carry that, and without it a foreign blocker is a dead end.
 */
function renderEdge(id: string, from: TicketSummary, board: Board): string {
  const blocker = board.byId.get(id);
  if (blocker === undefined) return `${id}?`;

  return blocker.effort === from.effort ? id : `${id}@${blocker.effort}`;
}

/**
 * Broken Edges surface here rather than through a separate validation tool,
 * because a validation tool nobody calls is a validator that does not exist.
 *
 * Every warning is grouped, never itemized per Ticket. An Effort of Legacy
 * Tickets can carry a dangling Edge on nearly every one of them, and a warnings
 * block longer than the Board it annotates would undo the saving the Board
 * exists to deliver.
 */
function collectWarnings(board: Board): string[] {
  const warnings: string[] = [];
  const dangling = new Set<string>();
  const orphaned = new Set<string>();
  const unrecognized = new Set<string>();
  const collapsed = new Set<string>();
  const declined = new Set<string>();
  const stale = new Set<string>();

  for (const ticket of board.tickets) {
    for (const edge of ticket.blockedBy) {
      const blocker = board.byId.get(edge);

      if (blocker === undefined) dangling.add(edge);
      else if (blocker.status === 'dropped') orphaned.add(ticket.handle);
    }

    if (ticket.unrecognizedStatus !== undefined) {
      unrecognized.add(`${ticket.handle} "${ticket.unrecognizedStatus}"`);
    }
    // Still takeable as far as the graph is concerned — a Triage role never
    // moves the Frontier — but somebody has declined it, which is worth saying
    // before an agent picks it up.
    if (ticket.status === 'open' && ticket.triage === 'wontfix') declined.add(ticket.handle);
    for (const ref of ticket.collapsedRefs) collapsed.add(ref);
    if (isStaleClaim(ticket)) stale.add(`${ticket.handle} (${ticket.claimedBy ?? '?'})`);
  }

  if (dangling.size > 0) {
    warnings.push(
      `dangling Edges (${String(dangling.size)}), pointing at no Ticket in this workspace: ` +
        [...dangling].toSorted().join(' '),
    );
  }
  if (orphaned.size > 0) {
    warnings.push(
      `blocked by a dropped Ticket, which never unblocks (${String(orphaned.size)}): ` +
        [...orphaned].toSorted().join(' '),
    );
  }
  if (unrecognized.size > 0) {
    warnings.push(
      `unrecognized status, read as open (${String(unrecognized.size)}): ` +
        [...unrecognized].toSorted().join(' '),
    );
  }
  if (collapsed.size > 0) {
    warnings.push(
      `sub-slice Edges coarsened to their parent Ticket (${String(collapsed.size)}): ` +
        [...collapsed].toSorted().join(' '),
    );
  }
  if (declined.size > 0) {
    warnings.push(
      `takeable but triaged wontfix — somebody declined these (${String(declined.size)}): ` +
        [...declined].toSorted().join(' '),
    );
  }
  if (stale.size > 0) {
    warnings.push(
      `stale claim, held longer than ${String(STALE_AFTER_HOURS)}h (${String(stale.size)}): ` +
        `${[...stale].toSorted().join(' ')} — flagged only, never released; ask the holder`,
    );
  }

  const legacy = board.tickets.filter(ticket => ticket.legacy);
  if (legacy.length > 0) {
    warnings.push(
      `${String(legacy.length)}/${String(board.tickets.length)} Tickets are Legacy — title, ` +
        'status and Edges are inferred from prose. Run migrate_effort to normalize.',
    );
  }

  // Tracked separately from Legacy, because normalizing a Legacy file gives it
  // frontmatter without giving it an id. It would otherwise leave the Legacy
  // count and take its need for migration silently with it, while still being
  // unaddressable by anything but its handle.
  const unidentified = board.tickets.filter(ticket => ticket.id === undefined);
  if (unidentified.length > 0) {
    warnings.push(
      `no id (${String(unidentified.length)}): ` +
        `${unidentified.map(ticket => ticket.handle).join(' ')} — fetch by the handle shown; ` +
        'nothing can declare an Edge on them until migrate_effort mints one.',
    );
  }

  return warnings;
}
