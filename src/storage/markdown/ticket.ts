import type { Kind, Status, Ticket } from '../../domain.ts';
import { STATUSES } from '../../domain.ts';
import { parseLegacyBody } from './legacy.ts';
import { splitFrontmatter } from './frontmatter.ts';

/** `<NN>-<rest>.md` — `NN` carries sort order and nothing else. */
const FILENAME_ORDER = /^(\d+)/;

export interface TicketFile {
  readonly filename: string;
  readonly contents: string;
}

/**
 * Parse one Ticket file. Schema-conformant files read from their frontmatter;
 * everything else falls through to the Legacy parser and is flagged, because a
 * server that is useless until its repo is migrated never gets installed.
 */
export function parseTicket(
  effort: string,
  file: TicketFile,
  fallbackOrder: number,
  revision: string,
): Ticket {
  const { fields, body } = splitFrontmatter(file.contents);
  const order = readOrder(file.filename) ?? fallbackOrder;

  if (fields === undefined) return parseLegacy(effort, order, file.contents, revision);

  const id = text(fields['id']);

  return {
    id,
    handle: handleFor(id, effort, order),
    title: text(fields['title']) ?? '(untitled)',
    kind: readKind(fields['kind']),
    type: text(fields['type']),
    status: readStatus(text(fields['status'])) ?? 'open',
    triage: text(fields['triage']),
    answerGist: text(fields['answer_gist']),
    droppedReason: text(fields['dropped_reason']),
    claimedBy: text(fields['claimed_by']),
    claimedAt: text(fields['claimed_at']),
    blockedBy: readEdgeList(fields['blocked_by']),
    effort,
    order,
    legacy: false,
    unrecognizedStatus: undefined,
    collapsedRefs: [],
    revision,
    body: body.trim(),
  };
}

function parseLegacy(effort: string, order: number, contents: string, revision: string): Ticket {
  const inferred = parseLegacyBody(contents);

  return {
    id: inferred.id,
    handle: handleFor(inferred.id, effort, order),
    title: inferred.title,
    kind: inferred.kind,
    type: inferred.type,
    status: inferred.status,
    triage: inferred.triage,
    // A Legacy file records its answer as prose in the body, not as a field.
    answerGist: undefined,
    droppedReason: undefined,
    claimedBy: undefined,
    claimedAt: undefined,
    blockedBy: inferred.blockedBy,
    effort,
    order,
    legacy: true,
    unrecognizedStatus: inferred.unrecognizedStatus,
    collapsedRefs: inferred.collapsedRefs,
    revision,
    body: contents.trim(),
  };
}

/**
 * A Ticket with no id still has to be nameable, or a whole Effort of Legacy Tickets
 * has no route to its own bodies. `<effort>#<order>` is that fallback — an
 * address, deliberately not an id: it is not repo-stable and never appears as
 * an Edge.
 */
function handleFor(id: string | undefined, effort: string, order: number): string {
  return id ?? `${effort}#${String(order)}`;
}

/** `<NN>-...` gives sort order. A file with no numeric prefix has none of its own. */
function readOrder(filename: string): number | undefined {
  const match = FILENAME_ORDER.exec(filename);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

function readKind(value: unknown): Kind {
  return text(value) === 'decision' ? 'decision' : 'build';
}

function readStatus(value: string | undefined): Status | undefined {
  return STATUSES.find(status => status === value);
}

/** A `blocked_by` list. Anything that is not a list of scalars reads as no Edges. */
function readEdgeList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.map(entry => text(entry)).filter((entry): entry is string => entry !== undefined);
}

/** YAML scalars arrive as numbers and booleans too; only non-empty strings count. */
function text(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const asText = String(value).trim();
  return asText === '' ? undefined : asText;
}
