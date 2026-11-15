import { join } from 'node:path';

import type { MigrationChange, MigrationReport, TicketSummary } from '../../domain.ts';
import type { Names } from '../../names.ts';
import { normalizeTicket, type Defaults } from './serialize.ts';
import { writeAtomically } from './write.ts';

interface TicketFileEntry {
  readonly filename: string;
  readonly ticket: TicketSummary;
}

export interface MigrateFilesRequest {
  readonly effort: string;
  readonly issues: string;
  /** `issues` relative to the workspace root, for the report. */
  readonly directory: string;
  /** The Effort's Tickets, as scanned with the rest of the workspace. */
  readonly entries: readonly TicketFileEntry[];
  /** The index over that same scan, so an Edge resolves here as it does on a Board. */
  readonly names: Names;
  readonly preview: boolean;
  /** Preview only, by filename: what a Ticket shares with another, and every file claiming it. */
  readonly conflicts: ReadonlyMap<string, NonNullable<MigrationChange['duplicate']>>;
  readonly readContents: (filename: string) => Promise<string>;
}

interface PlannedFile {
  readonly filename: string;
  /** False for a Ticket reported only for its conflict. */
  readonly write: boolean;
  readonly defaults: Defaults;
  readonly change: MigrationChange;
  readonly keptSubSlices: readonly string[];
}

/**
 * Normalize one Effort at once. A file with no parseable fence gains schema
 * frontmatter, exactly as a write to it would give it, and a bare sort-order
 * Edge (`Blocked by: 01`) becomes the name of the Ticket whose filename carries
 * that prefix — the one Edge only migration can resolve, since the prefix is a
 * fact about a file and never crosses the seam.
 *
 * Nothing is minted and no file is renamed (ADR 0008): every Ticket keeps the
 * name it is read by, so a preview and a real run plan the same thing and
 * another Effort's Edge into this one resolves afterwards as it did before. A
 * Ticket needing neither change is left alone, byte for byte.
 */
export async function migrateEffortFiles(request: MigrateFilesRequest): Promise<MigrationReport> {
  const { effort, entries, preview, directory } = request;
  const plan = planChanges(request);

  if (!preview) await applyPlan(request, plan);

  return {
    effort,
    preview,
    directory,
    changes: plan.map(file => file.change),
    unchanged: entries.length - plan.filter(file => file.write).length,
    ...edgeNotes(plan, request),
  };
}

function planChanges(request: MigrateFilesRequest): readonly PlannedFile[] {
  const { effort, entries, names, conflicts } = request;

  const byOrder = new Map<number, TicketSummary[]>();
  for (const { ticket } of entries) {
    if (ticket.orderHint === undefined) continue;
    const carrying = byOrder.get(ticket.orderHint);
    if (carrying === undefined) byOrder.set(ticket.orderHint, [ticket]);
    else carrying.push(ticket);
  }

  // Only an Edge that resolves to nothing is a sort order: digits that name a
  // Ticket already are that Ticket's name. A prefix two files carry, a target
  // whose name is not its alone, or the Ticket's own prefix — which would
  // write an Edge to itself — says nothing usable and is left to dangle.
  const resolved = (edge: string, from: TicketSummary): string => {
    if (!isUnresolvedSortOrder(edge, request)) return edge;
    const carrying = byOrder.get(Number(edge)) ?? [];
    const [target] = carrying;
    if (target === undefined || carrying.length > 1 || target === from) return edge;
    const named = names.edge(target.name, effort);
    return named.length === 1 && named[0] === target ? target.name : edge;
  };

  return entries.flatMap(({ filename, ticket }): PlannedFile[] => {
    const mapped = ticket.blockedBy.map(edge => resolved(edge, ticket));
    const edgesResolved = mapped.some((edge, index) => edge !== ticket.blockedBy[index]);
    const blockedBy = [...new Set(mapped)];
    const write = ticket.foreign || edgesResolved;
    const duplicate = conflicts.get(filename);
    if (!write && duplicate === undefined) return [];

    return [
      {
        filename,
        write,
        keptSubSlices: ticket.keptSubSlices,
        defaults: {
          id: ticket.id,
          title: ticket.title,
          kind: ticket.kind,
          type: ticket.type,
          status: ticket.status,
          triage: ticket.triage,
          blockedBy,
        },
        change: {
          name: ticket.name,
          title: ticket.title,
          normalized: ticket.foreign,
          edgesResolved,
          filename,
          blockedBy,
          duplicate,
        },
      },
    ];
  });
}

async function applyPlan(
  request: MigrateFilesRequest,
  plan: readonly PlannedFile[],
): Promise<void> {
  const prepared = await Promise.all(
    plan
      .filter(file => file.write)
      .map(async file => ({
        filename: file.filename,
        contents: normalizeTicket(await request.readContents(file.filename), file.defaults),
      })),
  );

  // Settled, not raced: a rejection must not leave sibling writes running
  // after the call has already reported its failure.
  const written = await Promise.allSettled(
    prepared.map(file => writeAtomically(join(request.issues, file.filename), file.contents)),
  );
  const failed = written.find(result => result.status === 'rejected');
  if (failed !== undefined) throw failed.reason;
}

/** Grouped, never per Ticket: what a reader must check by hand after this call. */
function edgeNotes(
  plan: readonly PlannedFile[],
  request: MigrateFilesRequest,
): Pick<MigrationReport, 'crossEffortEdges' | 'keptSubSlices' | 'unresolvedSortOrders'> {
  // An id is the one reference that crosses Efforts without saying so; a full
  // name written out is its author's intent and is not second-guessed.
  const cross = new Set<string>();
  for (const file of plan) {
    for (const edge of file.change.blockedBy) {
      const [target] = request.names.edge(edge, request.effort);
      if (target === undefined || target.effort === request.effort) continue;
      if (target.id?.toLowerCase() === edge.toLowerCase()) {
        cross.add(`${target.id}@${target.effort}`);
      }
    }
  }
  // What the scan kept, not a pattern over what is written: a `T7.2` copied
  // from a fence was never a prose sub-slice.
  const kept = new Set(plan.flatMap(file => file.keptSubSlices));

  // Over the whole Effort, not the plan: a Ticket whose only sort-order Edge
  // could not be resolved is not written, and is exactly the one to name.
  const rewritten = new Map(plan.map(file => [file.filename, file.change.blockedBy]));
  const unresolved = new Set(
    request.entries.flatMap(({ filename, ticket }) =>
      (rewritten.get(filename) ?? ticket.blockedBy).filter(edge =>
        isUnresolvedSortOrder(edge, request),
      ),
    ),
  );

  return {
    crossEffortEdges: [...cross].toSorted(),
    keptSubSlices: [...kept].toSorted(),
    unresolvedSortOrders: [...unresolved].toSorted(),
  };
}

function isUnresolvedSortOrder(edge: string, request: MigrateFilesRequest): boolean {
  return /^\d+$/.test(edge) && request.names.edge(edge, request.effort).length === 0;
}
