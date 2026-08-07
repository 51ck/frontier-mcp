import { rename as renameFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import type { MigrationChange, MigrationReport, Ticket } from '../../domain.ts';
import { peekMintedIds, ticketFilename, withIdReservations, type Rescan } from './create.ts';
import { normalizeTicket, type Defaults } from './serialize.ts';
import { stage, unstage, writeAtomically } from './write.ts';

export interface TicketFileEntry {
  readonly filename: string;
  readonly ticket: Ticket;
}

export interface MigrateFilesRequest {
  readonly scratch: string;
  readonly effort: string;
  readonly issues: string;
  readonly entries: readonly TicketFileEntry[];
  readonly allTickets: readonly Ticket[];
  readonly preview: boolean;
  readonly rename: boolean;
  readonly rescan: Rescan;
  readonly readContents: (filename: string) => Promise<string>;
}

interface PlannedFile {
  readonly from: string;
  readonly to: string;
  readonly defaults: Defaults;
  readonly change: MigrationChange;
}

/**
 * Normalize Legacy Tickets in one Effort, mint ids for those without, and
 * optionally rename. Preview plans mint ids from the scan and writes nothing.
 *
 * Bare sort-order Edges (`Blocked by: 01`) are rewritten to the id the target
 * Ticket carries after this call — preserved or newly minted — so migration
 * does not leave a Board full of unresolvable `01` references.
 */
export async function migrateEffortFiles(request: MigrateFilesRequest): Promise<MigrationReport> {
  const { effort, entries, preview, rename } = request;
  const candidates = entries.filter(entry => entry.ticket.legacy || entry.ticket.id === undefined);

  if (candidates.length === 0) {
    return { effort, preview, renamed: rename, changes: [] };
  }

  const needMint = candidates.filter(entry => entry.ticket.id === undefined).length;
  const used = idsOf(request.allTickets);

  if (preview) {
    const plan = planChanges(candidates, peekMintedIds(used, needMint), entries, rename);
    return { effort, preview: true, renamed: rename, changes: plan.map(file => file.change) };
  }

  return withIdReservations(request.scratch, needMint, request.rescan, async minted => {
    const plan = planChanges(candidates, minted, entries, rename);
    await applyPlan(request, plan);
    return {
      effort,
      preview: false,
      renamed: rename,
      changes: plan.map(file => file.change),
    };
  });
}

function planChanges(
  candidates: readonly TicketFileEntry[],
  minted: readonly string[],
  entries: readonly TicketFileEntry[],
  rename: boolean,
): readonly PlannedFile[] {
  let mintAt = 0;
  const idByOrder = new Map<number, string>();

  // Every Ticket in the Effort contributes to Edge remapping — a blocker that
  // already had an id must still be findable by its sort order.
  for (const entry of entries) {
    if (entry.ticket.id !== undefined) idByOrder.set(entry.ticket.order, entry.ticket.id);
  }

  const assigned = new Map<string, string>();
  for (const entry of candidates) {
    if (entry.ticket.id !== undefined) {
      assigned.set(entry.ticket.handle, entry.ticket.id);
      idByOrder.set(entry.ticket.order, entry.ticket.id);
      continue;
    }
    const id = minted[mintAt++];
    if (id === undefined) throw new Error('Reserved fewer ids than Tickets needing one.');
    assigned.set(entry.ticket.handle, id);
    idByOrder.set(entry.ticket.order, id);
  }

  return candidates.map(entry => {
    const id = assigned.get(entry.ticket.handle);
    if (id === undefined) throw new Error(`No id planned for ${entry.ticket.handle}.`);

    const to = rename ? ticketFilename(entry.ticket.order, id, entry.ticket.title) : entry.filename;
    const blockedBy = remapEdges(entry.ticket.blockedBy, idByOrder);

    return {
      from: entry.filename,
      to,
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
        beforeHandle: entry.ticket.handle,
        id,
        title: entry.ticket.title,
        minted: entry.ticket.id === undefined,
        normalized: entry.ticket.legacy,
        fromName: to === entry.filename ? undefined : entry.filename,
        toName: to === entry.filename ? undefined : to,
        blockedBy,
      },
    };
  });
}

async function applyPlan(
  request: MigrateFilesRequest,
  plan: readonly PlannedFile[],
): Promise<void> {
  const targets = new Set(plan.map(file => file.to));
  const sources = new Set(plan.map(file => file.from));
  for (const file of plan) {
    if (file.to !== file.from && !sources.has(file.to)) {
      // A name that already exists and is not being vacated would destroy a Ticket.
      const clash = request.entries.some(entry => entry.filename === file.to);
      if (clash) {
        throw new Error(
          `Cannot rename to ${file.to}: that name is already taken in ${request.effort}.`,
        );
      }
    }
  }

  // Detect two Tickets collapsing onto one target name.
  if (targets.size !== plan.length) {
    throw new Error(`Rename would collide on a filename inside Effort '${request.effort}'.`);
  }

  const prepared = await Promise.all(
    plan.map(async file => ({
      ...file,
      contents: normalizeTicket(await request.readContents(file.from), file.defaults),
    })),
  );

  // Same-name updates are per-file atomic. Renames stage every new file first,
  // land them, then remove the vacated names — so a failure mid-batch never
  // deletes a source whose replacement did not land.
  const inPlace = prepared.filter(file => file.from === file.to);
  const moved = prepared.filter(file => file.from !== file.to);

  await Promise.all(
    inPlace.map(file => writeAtomically(join(request.issues, file.to), file.contents)),
  );

  if (moved.length === 0) return;

  const staged = await Promise.allSettled(
    moved.map(async file => ({
      temporary: await stage(join(request.issues, file.to), file.contents),
      target: join(request.issues, file.to),
      from: join(request.issues, file.from),
    })),
  );

  const ready = staged.filter(entry => entry.status === 'fulfilled').map(entry => entry.value);
  const failed = staged.find(entry => entry.status === 'rejected');
  if (failed !== undefined) {
    await Promise.allSettled(ready.map(entry => unstage(entry.temporary)));
    throw failed.reason as Error;
  }

  const landed = await Promise.allSettled(
    ready.map(async entry => {
      await renameFile(entry.temporary, entry.target);
      return entry;
    }),
  );

  const written = landed.filter(entry => entry.status === 'fulfilled').map(entry => entry.value);
  const lost = landed.find(entry => entry.status === 'rejected');
  if (lost !== undefined) {
    await Promise.allSettled([
      ...written.map(entry => unlink(entry.target).catch(() => {})),
      ...ready.map(entry => unstage(entry.temporary)),
    ]);
    throw lost.reason as Error;
  }

  await Promise.all(written.map(entry => unlink(entry.from)));
}

/**
 * A bare sort-order Edge becomes the id of the Ticket at that order. Real ids
 * and anything else pass through unchanged — dangling Edges stay Board warnings.
 */
function remapEdges(edges: readonly string[], idByOrder: ReadonlyMap<number, string>): string[] {
  return edges.map(edge => {
    if (!/^\d+$/.test(edge)) return edge;
    return idByOrder.get(Number(edge)) ?? edge;
  });
}

function idsOf(tickets: readonly Ticket[]): ReadonlySet<string> {
  return new Set(tickets.map(entry => entry.id).filter(id => id !== undefined));
}
