import type { Kind, Status } from '../../domain.ts';

/**
 * The best-effort parser for Ticket files that predate the schema. Every field
 * it produces is an inference, which is why a Legacy Ticket is flagged: an
 * agent needs to know which values to distrust.
 *
 * The shapes here are the ones the real repos actually contain, not the ones a
 * schema would have liked. Reads never write, so a file parsed badly is only
 * ever reported badly — it is never corrected on disk.
 */

/** `# T30 — Grammy group boot`, or `# 01 — Is the fix a latent bug?` with no id. */
const HEADING = /^#[ \t]+(.+?)[ \t]*$/m;
const HEADING_ID = /^(T\d+)[ \t]*[—–-][ \t]*(.*)$/;
const HEADING_ORDER = /^\d+[ \t]*[—–-][ \t]*(.*)$/;

/** `Status: resolved`, or `Status: resolved — **`0.5.0` published**`. */
const STATUS_LINE = /^Status:[ \t]*(.+?)[ \t]*$/m;
const TYPE_LINE = /^Type:[ \t]*(.+?)[ \t]*$/m;

/** `**Depends on:** T31 (...)` and `Blocked by: 01, 02`, bold or bare. */
const EDGE_LINE = /^\**(?:Depends on|Blocked by)\**:\**[ \t]*(.+?)[ \t]*$/gim;

/** A withdrawn dependency, struck through rather than deleted. */
const STRIKETHROUGH = /~~[\s\S]*?~~/g;
/** Link targets, so a path never contributes a false id. */
const LINK_TARGET = /\]\([^)]*\)/g;

const TICKET_REF = /\bT(\d+)(?:\.\d+)?\b/g;

/**
 * Status words seen in the wild, mapped to the four the schema has. `done` and
 * `fixed` are resolved by another name. `superseded` and `deferred` are closed
 * rather than open, which is the safe direction: a Ticket wrongly left off the
 * Frontier is a missed opportunity, one wrongly put on it is wasted work.
 */
const STATUS_WORDS: Readonly<Record<string, Status>> = {
  open: 'open',
  claimed: 'claimed',
  resolved: 'resolved',
  done: 'resolved',
  fixed: 'resolved',
  dropped: 'dropped',
  superseded: 'dropped',
  deferred: 'dropped',
  wontfix: 'dropped',
};

/** Triage roles found in a `Status:` line, where they do not belong. */
const TRIAGE_WORDS = new Set([
  'needs-triage',
  'needs-info',
  'ready-for-agent',
  'ready-for-human',
  'wontfix',
]);

export interface LegacyTicket {
  readonly id: string | undefined;
  readonly title: string;
  readonly kind: Kind;
  readonly status: Status;
  readonly triage: string | undefined;
  readonly blockedBy: readonly string[];
  /** The raw `Status:` text when it did not map to a known Status. */
  readonly unrecognizedStatus: string | undefined;
}

export function parseLegacyBody(contents: string): LegacyTicket {
  const { id, title } = readHeading(contents);
  const rawStatus = STATUS_LINE.exec(contents)?.[1];
  const { status, triage, unrecognized } = readStatus(rawStatus);

  return {
    id,
    title,
    // A `Type:` line is wayfinder's decision vocabulary; its presence is what
    // marks the Ticket as a question rather than a slice of work.
    kind: TYPE_LINE.test(contents) ? 'decision' : 'build',
    status,
    triage,
    blockedBy: readEdges(contents),
    unrecognizedStatus: unrecognized,
  };
}

function readHeading(contents: string): { id: string | undefined; title: string } {
  const heading = HEADING.exec(contents)?.[1]?.trim();
  if (heading === undefined || heading === '') return { id: undefined, title: '(untitled)' };

  const withId = HEADING_ID.exec(heading);
  if (withId?.[1] !== undefined) return { id: withId[1], title: (withId[2] ?? '').trim() };

  // `# 01 — Title`: the number is this Effort's sort order, never an id. A
  // per-Effort `01` is not unique repo-wide, so minting one is migration's job.
  const withOrder = HEADING_ORDER.exec(heading);
  if (withOrder?.[1] !== undefined) return { id: undefined, title: withOrder[1].trim() };

  return { id: undefined, title: heading };
}

function readStatus(raw: string | undefined): {
  status: Status;
  triage: string | undefined;
  unrecognized: string | undefined;
} {
  if (raw === undefined) return { status: 'open', triage: undefined, unrecognized: undefined };

  // `resolved — 2026-08-04` and `deferred to 0.6.0` both carry their meaning in
  // the first word; everything after it is a note for a human.
  const word = (raw.split(/[—–]/)[0] ?? '').trim().toLowerCase();
  const first = (word.split(/\s+/)[0] ?? '').replace(/[.,]$/, '');

  const triage = TRIAGE_WORDS.has(first) ? first : undefined;
  const status = STATUS_WORDS[first];

  if (status !== undefined) return { status, triage, unrecognized: undefined };
  // A triage role in the Status field says nothing about lifecycle position.
  if (triage !== undefined) return { status: 'open', triage, unrecognized: undefined };

  return { status: 'open', triage: undefined, unrecognized: raw };
}

/**
 * Edges out of prose. Struck-through text is dropped because a withdrawn
 * dependency is not a dependency, and link targets are stripped so a relative
 * path never contributes an id of its own.
 *
 * Bare numbers (`Blocked by: 01, 02`) are kept verbatim. They are this Effort's
 * sort orders, not ids, and are reported as unresolvable rather than guessed at
 * — resolving them would invent a repo-wide identity the file never had.
 */
function readEdges(contents: string): readonly string[] {
  const edges = new Set<string>();
  EDGE_LINE.lastIndex = 0;

  for (const line of contents.matchAll(EDGE_LINE)) {
    const declared = (line[1] ?? '').replace(STRIKETHROUGH, '').replace(LINK_TARGET, '');
    if (/^\s*(?:—|–|-|none)\s*$/i.test(declared)) continue;

    for (const ref of declared.matchAll(TICKET_REF)) edges.add(`T${ref[1] ?? ''}`);

    for (const bare of declared.matchAll(/(?:^|[\s,;])(\d{1,3})(?=[\s,;.]|$)/g)) {
      edges.add(bare[1] ?? '');
    }
  }

  edges.delete('');
  return [...edges];
}
