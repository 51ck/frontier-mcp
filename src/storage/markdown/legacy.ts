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

/**
 * `Status: resolved`, `**Status:** done`, or ``Status: resolved — **`0.5.0`
 * published**``. Bold is tolerated everywhere, because these files mark up
 * their field labels inconsistently and a bold label is still a label.
 */
const STATUS_LINE = /^\**Status\**:\**[ \t]*(.+?)[ \t]*$/im;
const TYPE_LINE = /^\**Type\**:\**[ \t]*(.+?)[ \t]*$/im;

/** `**Depends on:** T31 (...)` and `Blocked by: 01, 02`, bold or bare. */
const EDGE_LINE = /^\**(?:Depends on|Blocked by)\**:\**[ \t]*(.+?)[ \t]*$/gim;

/** A withdrawn Edge, struck through rather than deleted. */
const STRIKETHROUGH = /~~[\s\S]*?~~/g;
/**
 * Whole markdown links, label and target both, so a path never contributes a
 * false id. Verified against every Edge line in the fixtures: real
 * references are always written outside their link, so nothing is lost — and a
 * label like `[../T99/issues/01.md]` would otherwise mint an Edge to T99.
 */
const MARKDOWN_LINK = /\[[^\]]*\]\([^)]*\)/g;

/** `T31`, and `T38.1` — a sub-slice of T38, which is the Ticket that exists. */
const TICKET_REF = /\bT(\d+)(\.\d+)?\b/g;

/**
 * A bare `01` in `Blocked by: 01, 02` — this Effort's sort orders, written
 * before ids existed. Anything touching a `.` is excluded so a version string
 * like `0.5.0` never becomes an Edge.
 */
const BARE_ORDER = /(?:^|[\s,;])(\d{1,3})(?![.\d])(?=[\s,;]|$)/g;

/**
 * Status words seen in the wild, mapped to the four the schema has. `done` and
 * `fixed` are resolved by another name. `superseded` and `deferred` are closed
 * rather than open, which is the safe direction: a Ticket wrongly left off the
 * Frontier is a missed opportunity, one wrongly put on it is wasted work.
 */
const STATUS_WORDS = new Map<string, Status>([
  ['open', 'open'],
  ['claimed', 'claimed'],
  ['resolved', 'resolved'],
  ['done', 'resolved'],
  ['fixed', 'resolved'],
  ['dropped', 'dropped'],
  ['superseded', 'dropped'],
  ['deferred', 'dropped'],
]);

/**
 * Triage roles found in a `Status:` line, where they do not belong. These are
 * checked first: a triage role says nothing about lifecycle position, so
 * finding one means the Status field never held a Status at all.
 *
 * `wontfix` is here and deliberately not in {@link STATUS_WORDS} — it is a
 * Triage role, not a Status, and mapping it to `dropped` would make it
 * contagious, turning every dependent into a broken Edge.
 */
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
  /** Sub-slice references (`T38.1`) coarsened to the Ticket that exists. */
  readonly collapsedRefs: readonly string[];
  readonly type: string | undefined;
}

export function parseLegacyBody(contents: string): LegacyTicket {
  const { id, title } = readHeading(contents);
  const { status, triage, unrecognized } = readStatus(STATUS_LINE.exec(contents)?.[1]);
  const { edges, collapsed } = readEdges(contents);
  const type = TYPE_LINE.exec(contents)?.[1];

  return {
    id,
    title,
    // A `Type:` line is wayfinder's decision vocabulary; its presence is what
    // marks the Ticket as a question rather than a slice of work.
    kind: type === undefined ? 'build' : 'decision',
    type,
    status,
    triage,
    blockedBy: edges,
    unrecognizedStatus: unrecognized,
    collapsedRefs: collapsed,
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
  const word = (raw.split(/[—–]| - /)[0] ?? '').trim().toLowerCase();
  const first = (word.split(/\s+/)[0] ?? '').replace(/[.,]$/, '');

  // A Triage role is checked first, and leaves the lifecycle position alone —
  // it never described one.
  if (TRIAGE_WORDS.has(first)) return { status: 'open', triage: first, unrecognized: undefined };

  const status = STATUS_WORDS.get(first);
  if (status !== undefined) return { status, triage: undefined, unrecognized: undefined };

  return { status: 'open', triage: undefined, unrecognized: raw };
}

/**
 * Edges out of prose. Struck-through text is dropped because a withdrawn Edge
 * is not an Edge, and whole markdown links are stripped so a relative path
 * never contributes an id of its own.
 *
 * Bare numbers (`Blocked by: 01, 02`) are kept verbatim. They are this Effort's
 * sort orders, not ids, and are reported as unresolvable rather than guessed at
 * — resolving them would invent a repo-wide identity the file never had.
 */
function readEdges(contents: string): { edges: readonly string[]; collapsed: readonly string[] } {
  const edges = new Set<string>();
  const collapsed = new Set<string>();

  for (const line of contents.matchAll(EDGE_LINE)) {
    const declared = (line[1] ?? '').replace(STRIKETHROUGH, '').replace(MARKDOWN_LINK, '');
    if (/^\s*(?:—|–|-|none)\s*$/i.test(declared)) continue;

    for (const ref of declared.matchAll(TICKET_REF)) {
      const id = `T${ref[1] ?? ''}`;
      // `T38.1` names a slice of T38, and T38 is the Ticket that exists — but
      // the reader is told, because the Edge on the Board is then coarser than
      // the one the file declared.
      if (ref[2] !== undefined) collapsed.add(`${id}${ref[2]}`);
      edges.add(id);
    }

    for (const bare of declared.matchAll(BARE_ORDER)) edges.add(bare[1] ?? '');
  }

  edges.delete('');
  return { edges: [...edges], collapsed: [...collapsed] };
}
