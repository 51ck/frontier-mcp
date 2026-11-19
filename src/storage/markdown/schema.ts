import type {
  Diagnostic,
  DiagnosticCode,
  FieldDefinition,
  LayoutPath,
  TrackerContract,
} from '../../domain.ts';
import { DIAGNOSTIC_EFFECTS, KINDS, STATUSES, TRIAGE_ROLES } from '../../domain.ts';

/** The marker key, and the one value it may hold. */
export const MARKER_KEY = 'frontier';
export const MARKER_VALUE = 'ticket';

export const ISSUES_DIR = 'issues';
export const MAP_FILE = 'map.md';
export const SPEC_FILE = 'spec.md';

/**
 * A directory under the storage directory whose name starts with this is never
 * an Effort: the scan skips it and no call accepts it as a slug.
 */
export const HIDDEN_PREFIX = '.';

export function isHiddenName(name: string): boolean {
  return name.startsWith(HIDDEN_PREFIX);
}

/** The slug rule, one place: one directory name, not hidden, no separator, no control character (`\p{Cc}`: C0 with NUL, DEL, C1). */
export const SLUG_RULE = `one directory name: not empty, not starting ${HIDDEN_PREFIX}, no / or \\, no control character`;

export function isEffortSlug(name: string): boolean {
  return name !== '' && !isHiddenName(name) && !/[/\\\p{Cc}]/u.test(name);
}

/** A Diagnostic with its effect taken from the one table, so the scan and the contract cannot disagree. */
export function diagnostic<C extends DiagnosticCode>(
  code: C,
  rest: Omit<Diagnostic, 'code' | 'effect'>,
): Diagnostic {
  return { code, effect: DIAGNOSTIC_EFFECTS[code], ...rest };
}

/**
 * The frontmatter keys a schema Ticket may carry, in the order a block this
 * driver *creates* is written. The one list: validation checks each key by
 * its `type`, `required` and `values`; parse reads it to tell imported keys
 * from unimported ones; serialize writes in its order; `drop_keys` refuses
 * anything in it; and `check_tracker` shows it, with the example built from
 * each `example`. A new key is one entry here.
 */
const SCALAR = 'a scalar as YAML reads it (02 is 2)';
/** id and blocked_by entries keep their source spelling. */
const AS_WRITTEN = 'a scalar kept as written (02 stays 02)';
/** Blank covers the empty string. */
const UNSET = 'null or blank is unset';

export const FIELDS: readonly FieldDefinition[] = [
  {
    key: MARKER_KEY,
    type: 'marker',
    required: true,
    values: [MARKER_VALUE],
    checked: `exactly the string ${MARKER_VALUE}; detected as a top-level line at column 0`,
    convention: 'written first',
    example: MARKER_VALUE,
  },
  {
    key: 'id',
    type: 'text',
    required: false,
    checked: `${AS_WRITTEN}; ${UNSET}; when set it is the Ticket's name`,
    convention: 'only where a file already carries one; never add or change it',
  },
  {
    key: 'title',
    type: 'text',
    required: true,
    checked: `${SCALAR}; absent, null or blank is missing-key`,
    convention: 'one line',
    example: 'Cache the auth token',
  },
  {
    key: 'kind',
    type: 'enum',
    required: false,
    values: KINDS,
    checked:
      'absent or null is unset, read as build; a blank string is invalid-value; spaces trimmed',
    example: 'build',
  },
  {
    key: 'type',
    type: 'text',
    required: false,
    checked: `${SCALAR}; ${UNSET}`,
    convention: 'decision only: research | prototype | grilling | task',
  },
  {
    key: 'status',
    type: 'enum',
    required: true,
    values: STATUSES,
    checked: 'absent, null or blank is missing-key; spaces trimmed',
    convention: 'new Tickets are open',
    example: 'open',
  },
  {
    key: 'triage',
    type: 'enum',
    required: false,
    values: TRIAGE_ROLES,
    checked: 'absent or null is unset; a blank string is invalid-value; spaces trimmed',
    convention: 'a /triage role, never a Status',
    example: 'ready-for-agent',
  },
  {
    key: 'blocked_by',
    type: 'list',
    required: false,
    items: 'Ticket names',
    checked:
      'absent, null or [] is no Edges; a mapping or list entry is invalid-value; a null or blank entry is dropped; any other scalar entry is as written',
    convention: 'each a name in this Effort, <effort>.<name>, or an id',
    example: ['token-store'],
  },
  {
    key: 'tags',
    type: 'list',
    required: false,
    items: 'tags',
    nonBlankEntries: true,
    checked:
      'absent, null or [] is no tags; else a list of non-blank scalars, or invalid-value; entries kept as written, never folded, trimmed or deduplicated',
    convention: 'no effect on Status, Edges or the Frontier',
    example: ['auth'],
  },
  {
    key: 'claimed_by',
    type: 'text',
    required: false,
    checked: `${SCALAR}; ${UNSET}`,
    convention: 'set with status: claimed',
  },
  {
    key: 'claimed_at',
    type: 'text',
    required: false,
    checked: `${SCALAR}; ${UNSET}`,
    convention: 'an ISO timestamp, set with claimed_by',
  },
  {
    key: 'answer_gist',
    type: 'text',
    required: false,
    checked: `${SCALAR}; ${UNSET}`,
    convention: 'one line, set with status: resolved',
  },
  {
    key: 'dropped_reason',
    type: 'text',
    required: false,
    checked: `${SCALAR}; ${UNSET}`,
    convention: 'set with status: dropped',
  },
];

export const FIELD_ORDER: readonly string[] = FIELDS.map(field => field.key);

export const SCHEMA_KEYS: ReadonlySet<string> = new Set(FIELD_ORDER);

/** Raise it whenever a path, a placement or a rule below changes meaning. */
export const LAYOUT_VERSION = 1;

/** Every placement the scan diagnoses. Keyed by code, so a new code fails the typecheck here. */
const UNSUPPORTED: Readonly<Record<DiagnosticCode, string>> = {
  'yaml-unparseable': 'a marked file whose frontmatter does not parse as a YAML mapping',
  'missing-key': 'a marked file whose required key is absent, null, empty or blank',
  'invalid-value':
    "a marked file with a value outside its key's type or values; a set kind or triage that is blank counts",
  'ticket-outside-issues': `a marked .md directly in an Effort directory, other than ${MAP_FILE} and ${SPEC_FILE}, or in another directory under the storage root`,
  'directory-in-issues': `a directory inside ${ISSUES_DIR}/, never entered`,
  'symlinked-issues': `an ${ISSUES_DIR} that is a symbolic link, never followed`,
  'symlinked-header-doc': `a ${MAP_FILE} or ${SPEC_FILE} that is a symbolic link, never read or written`,
  unreadable: `a .md in ${ISSUES_DIR}/ the server cannot open`,
  'unmarked-ticket-like': `an unmarked .md in ${ISSUES_DIR}/ whose frontmatter holds title and status`,
};

const EXAMPLE_NAME = 'token-cache';

const EXAMPLE_BODY = [
  '## What to build',
  '',
  'Keep the auth token in memory between requests.',
  '',
  '## Acceptance criteria',
  '',
  '- [ ] A second request reuses the token',
].join('\n');

/** A field's example as one YAML line. Lists are flow, as hand-written Tickets have them. */
function exampleLine(field: FieldDefinition): string | undefined {
  const { example } = field;
  if (example === undefined) return undefined;
  const value = typeof example === 'string' ? example : `[${example.join(', ')}]`;
  return `${field.key}: ${value}`;
}

/** The contract the driver enforces, with paths under `storage`, the storage directory as a reader names it. */
export function trackerContract(storage: string): TrackerContract {
  const effort = `${storage}/<effort>`;
  const paths: LayoutPath[] = [
    { path: `${storage}/`, role: 'storage root; holds Effort directories; may be a symbolic link' },
    {
      path: `${effort}/`,
      role: `an Effort once it holds ${MAP_FILE}, ${SPEC_FILE} or ${ISSUES_DIR}/; the slug is ${SLUG_RULE}, and a directory whose name breaks that is never one`,
    },
    { path: `${effort}/${MAP_FILE}`, role: 'the Map: typed sections, edited with edit_map' },
    { path: `${effort}/${SPEC_FILE}`, role: 'the Spec: one opaque document, written with spec' },
    { path: `${effort}/${ISSUES_DIR}/`, role: 'Ticket files, listed and never recursed' },
    {
      path: `${effort}/${ISSUES_DIR}/<name>.md`,
      role: `a Ticket when marked and valid; named by its id when set, else by the stem less any <digits>- prefix, unless that leaves nothing`,
    },
  ];
  const lines = FIELDS.map(exampleLine).filter(line => line !== undefined);
  return {
    fields: FIELDS,
    unimported:
      'any other top-level key is Unimported, not malformed: shown by get_tickets and left byte-identical by every write that does not name it; create_tickets or update_ticket extra sets one at the top level to a JSON value, replacing a stored value whole, never under a key named extra; update_ticket drop_keys removes one; a key is non-blank, one line, no control character, not __proto__; no schema key above, frontier and id included, is set or removed either way',
    layoutVersion: LAYOUT_VERSION,
    paths,
    unsupported: (Object.keys(UNSUPPORTED) as DiagnosticCode[]).map(code => ({
      code,
      effect: DIAGNOSTIC_EFFECTS[code],
      where: UNSUPPORTED[code],
    })),
    ignored: [
      `files directly in ${storage}/ but frontier.yml (read only for a Board warning), and every directory there whose name is not a slug, with all below it`,
      `unmarked Markdown without title and status keys, and every file not ending .md, in ${ISSUES_DIR}/`,
      `unmarked .md beside ${MAP_FILE} and ${SPEC_FILE}, and in other directories under ${storage}/`,
      `every directory of an Effort but ${ISSUES_DIR}/, and everything below a directory in ${ISSUES_DIR}/`,
    ],
    symlinks: `only ${storage}/ itself is followed; a linked Effort directory is no Effort (a symlinked-effort Board warning), and a linked ${ISSUES_DIR}, ${MAP_FILE}, ${SPEC_FILE} or frontier.yml is never read or written`,
    example: {
      path: `${effort}/${ISSUES_DIR}/${EXAMPLE_NAME}.md`,
      contents: `---\n${lines.join('\n')}\n---\n\n${EXAMPLE_BODY}\n`,
    },
  };
}
