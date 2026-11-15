import { join } from 'node:path';

import type { MigrationChange, MigrationReport, TicketSummary } from '../../domain.ts';
import { withIdReservations, type MintingPlan, type Rescan } from './create.ts';
import { normalizeTicket, type Defaults } from './serialize.ts';
import { writeAtomically } from './write.ts';

export interface TicketFileEntry {
  readonly filename: string;
  readonly ticket: TicketSummary;
}

export interface MigrateFilesRequest {
  readonly storage: string;
  readonly minting: MintingPlan;
  readonly effort: string;
  readonly issues: string;
  /** `issues` relative to the workspace root, for the report. */
  readonly directory: string;
  readonly entries: readonly TicketFileEntry[];
  /** Every Ticket in the workspace as scanned, to tell which Effort a written Edge lands on. */
  readonly allTickets: readonly TicketSummary[];
  readonly preview: boolean;
  /** Preview only, by filename: every file claiming the same id or name as that Ticket. */
  readonly conflicts: ReadonlyMap<string, readonly string[]>;
  readonly rescan: Rescan;
  readonly readContents: (filename: string) => Promise<string>;
}

interface PlannedFile {
  readonly filename: string;
  readonly defaults: Defaults;
  readonly change: MigrationChange;
  readonly keptSubSlices: readonly string[];
}

/**
 * Normalize Foreign Tickets in one Effort and mint ids for those without.
 * Filenames never change: another Effort's prose may link them by path.
 *
 * A real run mints through `withIdReservations`, so the pattern decides the
 * strategy — a `<N>` pattern holds its guards until every file is on disk, a
 * random one draws against a fresh scan (T62). A preview takes no guards and
 * predicts no ids: an unminted Ticket keeps its name, everywhere it appears, so
 * two previews of unchanged files are identical.
 *
 * Bare sort-order Edges (`Blocked by: 01`) are rewritten to the id the target
 * Ticket carries after this call — preserved or newly minted — so migration
 * does not leave a Board full of unresolvable `01` references. An Edge naming a
 * Ticket this call mints is rewritten the same way: minting replaces the name
 * the Edge was resolving by.
 */
export async function migrateEffortFiles(request: MigrateFilesRequest): Promise<MigrationReport> {
  const { effort, entries, preview, directory } = request;
  const candidates = entries.filter(entry => entry.ticket.foreign || entry.ticket.id === undefined);

  if (candidates.length === 0) {
    return { effort, preview, directory, changes: [], crossEffortEdges: [], keptSubSlices: [] };
  }

  const needMint = candidates.filter(entry => entry.ticket.id === undefined).length;

  if (preview) {
    const plan = planChanges(effort, candidates, undefined, entries, request.conflicts);
    return {
      effort,
      preview: true,
      directory,
      changes: plan.map(file => file.change),
      ...edgeNotes(plan, request),
    };
  }

  return withIdReservations(
    request.minting,
    request.storage,
    needMint,
    request.rescan,
    async minted => {
      const plan = planChanges(effort, candidates, minted, entries);
      await applyPlan(request, plan);
      return {
        effort,
        preview: false,
        directory,
        changes: plan.map(file => file.change),
        ...edgeNotes(plan, request),
      };
    },
  );
}

/** `minted` undefined is a preview: unminted Tickets keep their names. */
function planChanges(
  effort: string,
  candidates: readonly TicketFileEntry[],
  minted: readonly string[] | undefined,
  entries: readonly TicketFileEntry[],
  conflicts: ReadonlyMap<string, readonly string[]> = new Map(),
): readonly PlannedFile[] {
  let mintAt = 0;
  const nameByOrder = new Map<number, string>();

  // Every Ticket in the Effort contributes to Edge remapping — a blocker that
  // already had an id must still be findable by its filename's prefix.
  const atOrder = (entry: TicketFileEntry, name: string): void => {
    if (entry.ticket.orderHint !== undefined) nameByOrder.set(entry.ticket.orderHint, name);
  };
  for (const entry of entries) {
    if (entry.ticket.id !== undefined) atOrder(entry, entry.ticket.id);
  }

  // Keyed by file, which an Effort cannot repeat; two files may share a name.
  const assigned = new Map<string, string | undefined>();
  const idByName = new Map<string, string>();
  for (const entry of candidates) {
    if (entry.ticket.id !== undefined) {
      assigned.set(entry.filename, entry.ticket.id);
      continue;
    }
    if (minted === undefined) {
      assigned.set(entry.filename, undefined);
      atOrder(entry, entry.ticket.name);
      continue;
    }
    const id = minted[mintAt++];
    if (id === undefined) throw new Error('Reserved fewer ids than Tickets needing one.');
    assigned.set(entry.filename, id);
    atOrder(entry, id);
    const name = entry.ticket.name.toLowerCase();
    idByName.set(name, id);
    idByName.set(`${effort.toLowerCase()}.${name}`, id);
  }

  return candidates.map(entry => {
    const id = assigned.get(entry.filename);
    const blockedBy = remapEdges(entry.ticket.blockedBy, nameByOrder, idByName);

    return {
      filename: entry.filename,
      keptSubSlices: entry.ticket.keptSubSlices,
      defaults: {
        id,
        title: entry.ticket.title,
        kind: entry.ticket.kind,
        type: entry.ticket.type,
        status: entry.ticket.status,
        triage: entry.ticket.triage,
        blockedBy,
      },
      change: {
        beforeName: entry.ticket.name,
        id,
        title: entry.ticket.title,
        minted: entry.ticket.id === undefined,
        normalized: entry.ticket.foreign,
        filename: entry.filename,
        blockedBy,
        duplicateFiles: conflicts.get(entry.filename),
      },
    };
  });
}

async function applyPlan(
  request: MigrateFilesRequest,
  plan: readonly PlannedFile[],
): Promise<void> {
  const prepared = await Promise.all(
    plan.map(async file => ({
      filename: file.filename,
      contents: normalizeTicket(await request.readContents(file.filename), file.defaults),
    })),
  );

  // Settled, not raced: the caller releases its `<N>` guards when this returns
  // or throws, and they must stay held until every write has finished (T62).
  const written = await Promise.allSettled(
    prepared.map(file => writeAtomically(join(request.issues, file.filename), file.contents)),
  );
  const failed = written.find(result => result.status === 'rejected');
  if (failed !== undefined) throw failed.reason;
}

/**
 * A bare sort-order Edge becomes the id of the Ticket whose filename carries
 * that prefix, and the name of a Ticket minted here becomes its id. Real ids
 * and anything else pass through unchanged — dangling Edges stay Board warnings.
 */
function remapEdges(
  edges: readonly string[],
  idByOrder: ReadonlyMap<number, string>,
  idByName: ReadonlyMap<string, string>,
): string[] {
  return edges.map(edge => {
    if (!/^\d+$/.test(edge)) return idByName.get(edge.toLowerCase()) ?? edge;
    return idByOrder.get(Number(edge)) ?? edge;
  });
}

/** Grouped, never per Ticket: what a reader must check by hand after this call. */
function edgeNotes(
  plan: readonly PlannedFile[],
  request: MigrateFilesRequest,
): Pick<MigrationReport, 'crossEffortEdges' | 'keptSubSlices'> {
  const effortOf = new Map<string, string>();
  for (const ticket of request.allTickets) {
    if (ticket.id !== undefined && ticket.effort !== request.effort) {
      effortOf.set(ticket.id, ticket.effort);
    }
  }
  const local = new Set(plan.map(file => file.change.id));
  const cross = new Set<string>();
  for (const file of plan) {
    for (const edge of file.change.blockedBy) {
      const foreign = effortOf.get(edge);
      if (foreign !== undefined && !local.has(edge)) cross.add(`${edge}@${foreign}`);
    }
  }
  // What the scan kept, not a pattern over what is written: a `T7.2` copied
  // from a fence was never a prose sub-slice.
  const kept = new Set(plan.flatMap(file => file.keptSubSlices));
  return { crossEffortEdges: [...cross].toSorted(), keptSubSlices: [...kept].toSorted() };
}
