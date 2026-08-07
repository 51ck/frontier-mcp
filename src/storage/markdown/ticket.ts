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
export function parseTicket(effort: string, file: TicketFile): Ticket {
  const { fields, body } = splitFrontmatter(file.contents);
  const order = readOrder(file.filename);

  if (fields === undefined) return parseLegacy(effort, order, file.contents);

  return {
    id: text(fields['id']),
    title: text(fields['title']) ?? '(untitled)',
    kind: readKind(fields['kind']),
    status: readStatus(text(fields['status'])) ?? 'open',
    triage: text(fields['triage']),
    blockedBy: readEdgeList(fields['blocked_by']),
    effort,
    order,
    legacy: false,
    unrecognizedStatus: undefined,
    body: body.trim(),
  };
}

function parseLegacy(effort: string, order: number, contents: string): Ticket {
  const inferred = parseLegacyBody(contents);

  return {
    id: inferred.id,
    title: inferred.title,
    kind: inferred.kind,
    status: inferred.status,
    triage: inferred.triage,
    blockedBy: inferred.blockedBy,
    effort,
    order,
    legacy: true,
    unrecognizedStatus: inferred.unrecognizedStatus,
    body: contents.trim(),
  };
}

function readOrder(filename: string): number {
  const match = FILENAME_ORDER.exec(filename);
  return match?.[1] === undefined ? Number.MAX_SAFE_INTEGER : Number(match[1]);
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
