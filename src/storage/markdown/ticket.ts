import { type Document, isAlias, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type {
  Diagnostic,
  FieldDefinition,
  Status,
  TicketSummary,
  UnimportedFrontmatter,
} from '../../domain.ts';
import { STATUSES } from '../../domain.ts';
import { fenceText, splitFrontmatter } from './frontmatter.ts';
import { FIELDS, MARKER_KEY, SCHEMA_KEYS } from './schema.ts';

/**
 * `<NN>-<rest>.md` — `NN` is a hint for Board order and nothing else. Digits
 * then a hyphen, the shape {@link nameFromFilename} strips: `2fa.md` has none.
 */
const FILENAME_ORDER = /^(\d+)-/;

export interface TicketFile {
  readonly filename: string;
  readonly contents: string;
}

/**
 * What one file in a Ticket location is (ADR 0009): a Ticket, a marked file
 * excluded for its faults, an unmarked file worth a suggestion, or nothing the
 * tracker has a word for — a README, notes — which is ignored silently.
 */
export type Classified =
  | { readonly kind: 'ticket'; readonly ticket: TicketSummary }
  | {
      readonly kind: 'excluded';
      /** Every name the file would answer to: its id when the fence parsed and carried one, and its stem. */
      readonly names: readonly string[];
      readonly problems: readonly Problem[];
    }
  | { readonly kind: 'unmarked-ticket-like' }
  | { readonly kind: 'ignored' };

/** A {@link Diagnostic} before the driver knows which file it is about. */
export type Problem = Omit<Diagnostic, 'file' | 'effect'>;

/**
 * A top-level `frontier:` line, found on the fence's text before any YAML is
 * parsed, so a marked file whose YAML is broken is diagnosed rather than read
 * as unmarked. Only column 0 is top level; block scalars are always indented.
 */
const MARKER_LINE = new RegExp(`^(?:${MARKER_KEY}|'${MARKER_KEY}'|"${MARKER_KEY}")[ \\t]*:`, 'm');

/** Whether a file's fence carries the marker key at top level, whatever its value. */
export function isMarked(contents: string): boolean {
  const raw = fenceText(contents);
  return raw !== undefined && MARKER_LINE.test(raw);
}

/**
 * Classify one file of an `issues/` directory, reading everything but its
 * prose. The body is deliberately not returned: a scan reads every file in
 * the workspace, and almost nothing above the seam reads prose. {@link ticketBody}
 * takes it out of the same contents for the few Tickets actually being worked.
 */
export function classifyTicketFile(effort: string, file: TicketFile, revision: string): Classified {
  const { fields: parsedFields, raw } = splitFrontmatter(file.contents);
  if (raw === undefined || !MARKER_LINE.test(raw)) {
    // The keys being there is the resemblance; their values are the author's draft.
    return parsedFields !== undefined &&
      Object.hasOwn(parsedFields, 'title') &&
      Object.hasOwn(parsedFields, 'status')
      ? { kind: 'unmarked-ticket-like' }
      : { kind: 'ignored' };
  }

  const stemName = nameFromFilename(file.filename);
  if (parsedFields === undefined) {
    return {
      kind: 'excluded',
      names: [stemName],
      problems: [
        {
          code: 'yaml-unparseable',
          expected: 'a YAML mapping',
          fix: 'repair the frontmatter by hand so it parses as a YAML mapping',
        },
      ],
    };
  }

  let parsed: Document | undefined;
  const fence = (): Document => (parsed ??= parseDocument(raw ?? ''));
  const fields = scalarsAsWritten(parsedFields, fence);
  const id = readId(fields, fence);

  const problems = validate(fields);
  if (problems.length > 0) return { kind: 'excluded', names: namesWith(id, stemName), problems };

  const ticket: TicketSummary = {
    id,
    name: id ?? stemName,
    title: text(fields['title']) ?? '',
    kind: text(fields['kind']) === 'decision' ? 'decision' : 'build',
    type: text(fields['type']),
    status: readStatus(text(fields['status'])) ?? 'open',
    triage: text(fields['triage']),
    answerGist: text(fields['answer_gist']),
    droppedReason: text(fields['dropped_reason']),
    claimedBy: text(fields['claimed_by']),
    claimedAt: text(fields['claimed_at']),
    blockedBy: readEdgeList(fields['blocked_by'], fence),
    tags: readTags(fields['tags'], fence),
    effort,
    orderHint: readOrderHint(file.filename),
    hasUnimportedKeys: Object.keys(fields).some(key => !SCHEMA_KEYS.has(key)),
    revision,
  };
  return { kind: 'ticket', ticket };
}

function readId(fields: Record<string, unknown>, fence: () => Document): string | undefined {
  const value = fields['id'];
  return text(asWritten(value, readAsOther(value) ? fence().get('id', true) : undefined, fence));
}

function namesWith(id: string | undefined, stemName: string): string[] {
  return id === undefined || id.toLowerCase() === stemName.toLowerCase()
    ? [stemName]
    : [id, stemName];
}

/**
 * Every name a diagnosed file answers to: its id when its fence parses and
 * carries a readable one, and its stem. Never throws — a fence it cannot read
 * leaves the stem alone.
 */
export function diagnosedNames(filename: string, contents: string): string[] {
  const stemName = nameFromFilename(filename);
  try {
    const { fields, raw } = splitFrontmatter(contents);
    if (fields === undefined) return [stemName];
    let parsed: Document | undefined;
    return namesWith(
      readId(fields, () => (parsed ??= parseDocument(raw ?? ''))),
      stemName,
    );
  } catch {
    return [stemName];
  }
}

/** A field's values as a Diagnostic's `expected` shows them. */
function listed(field: FieldDefinition): string {
  return (field.values ?? []).join(' | ');
}

/**
 * The faults that exclude a marked file whose fence parses, one check per
 * {@link FIELDS} entry by its type. Every other field keeps its default when
 * missing — no `kind` reads as `build` — and a lifecycle gap such as
 * `resolved` without `answer_gist` is a Board warning, not a fault.
 */
function validate(fields: Record<string, unknown>): Problem[] {
  const problems: Problem[] = [];

  for (const field of FIELDS.filter(entry => entry.type === 'marker')) {
    const value = field.values?.[0];
    if (fields[field.key] !== value) {
      problems.push({
        code: 'invalid-value',
        key: field.key,
        expected: listed(field),
        found: found(fields[field.key]),
        fix: `set ${field.key}: ${String(value)}`,
      });
    }
  }
  // Scalars first, the required before the rest, so the key that keeps a file
  // off the Board is named first.
  const scalars = FIELDS.filter(
    field => field.type === 'text' || (field.type === 'enum' && field.required),
  ).toSorted((a, b) => Number(b.required) - Number(a.required));
  for (const field of scalars) {
    const value = fields[field.key];
    if (value !== undefined && value !== null && !isPlain(value)) {
      problems.push({
        code: 'invalid-value',
        key: field.key,
        expected: field.type === 'enum' ? listed(field) : 'text',
        found: found(value),
        fix: `write ${field.key} as plain text`,
      });
    } else if (field.required && text(value) === undefined) {
      problems.push({
        code: 'missing-key',
        key: field.key,
        expected: field.type === 'enum' ? listed(field) : 'non-empty text',
        fix: `add ${field.key} to the frontmatter`,
      });
    }
  }
  // A required enum absent, blank or not a scalar was reported above. An
  // optional one absent or null defaults; written but blank, it is a value
  // outside the enum.
  for (const field of FIELDS.filter(entry => entry.type === 'enum')) {
    const value = fields[field.key];
    const allowed = field.values ?? [];
    if (value === undefined || value === null) continue;
    if (field.required && (text(value) === undefined || !isPlain(value))) continue;
    if (typeof value === 'string' && allowed.includes(value.trim())) continue;
    problems.push({
      code: 'invalid-value',
      key: field.key,
      expected: listed(field),
      found: found(value),
      fix: `set ${field.key} to one of ${allowed.join(', ')}`,
    });
  }
  for (const field of FIELDS.filter(entry => entry.type === 'list')) {
    const value = fields[field.key];
    if (value === undefined || value === null) continue;
    const ok = field.nonBlankEntries
      ? (entry: unknown) => text(entry) !== undefined
      : (entry: unknown) => entry === null || typeof entry !== 'object';
    if (Array.isArray(value) && value.every(ok)) continue;
    const example = Array.isArray(field.example) ? `[${field.example.join(', ')}], ` : '';
    problems.push({
      code: 'invalid-value',
      key: field.key,
      expected: `a list of ${field.nonBlankEntries ? 'non-blank ' : ''}${field.items ?? 'scalars'}`,
      found: found(value),
      fix: `write ${field.key} as a list, e.g. ${example}or []`,
    });
  }
  return problems;
}

/** Long enough to recognize a value, short enough that a Diagnostic stays one line. */
const FOUND_LIMIT = 80;

/**
 * A value as a Diagnostic shows it: text as written, anything else as JSON,
 * cut to {@link FOUND_LIMIT}. YAML anchors can make a value circular, which
 * JSON cannot hold, so that falls back to a tag rather than throwing.
 */
function found(value: unknown): string {
  let shown: string;
  try {
    shown = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
  } catch {
    shown = Array.isArray(value) ? '[circular list]' : '{circular mapping}';
  }
  shown = shown.replace(/\s+/g, ' ');
  return shown.length > FOUND_LIMIT ? `${shown.slice(0, FOUND_LIMIT - 1)}…` : shown;
}

/**
 * A Ticket's prose: what sits below the frontmatter. Only a Ticket's body is
 * ever read, and a Ticket always has a fence.
 */
export function ticketBody(contents: string): string {
  return splitFrontmatter(contents).body.trim();
}

/**
 * The frontmatter keys this schema does not import, and the file's own text for
 * them: only the unimported entries, each sliced from the source rather than
 * re-serialized. Undefined for a conforming Ticket.
 */
export function unimportedFrontmatter(contents: string): UnimportedFrontmatter | undefined {
  const { fields, raw } = splitFrontmatter(contents);
  if (fields === undefined || raw === undefined) return undefined;
  const keys = Object.keys(fields).filter(key => !SCHEMA_KEYS.has(key));
  if (keys.length === 0) return undefined;
  const entries = unimportedEntries(raw);
  return entries === undefined
    ? { keys, yaml: raw, whole: true }
    : { keys, yaml: entries, whole: false };
}

/**
 * The unimported pairs cut from the fence's own text, or undefined when one of
 * them cannot be cut cleanly — a non-scalar or explicit (`? key`) key — in which
 * case the caller shows the whole fence rather than a block that disagrees with
 * the keys it names.
 */
function unimportedEntries(raw: string): string | undefined {
  const doc = parseDocument(raw);
  if (!isMap(doc.contents)) return undefined;
  const slices: string[] = [];
  for (const pair of doc.contents.items) {
    if (isScalar(pair.key) && SCHEMA_KEYS.has(String(pair.key.value))) continue;
    const start = isScalar(pair.key) ? pair.key.range?.[0] : undefined;
    const value = pair.value as { range?: [number, number, number] } | null;
    const end = value?.range?.[2] ?? (isScalar(pair.key) ? pair.key.range?.[2] : undefined);
    if (start === undefined || end === undefined) return undefined;
    if (raw.slice(raw.lastIndexOf('\n', start - 1) + 1, start).trim() !== '') return undefined;
    slices.push(raw.slice(start, end).replace(/\s+$/, ''));
  }
  return slices.join(raw.includes('\r\n') ? '\r\n' : '\n');
}

/**
 * A Ticket with no id is named by its file: the stem, less a leading `<digits>-`,
 * which is an order hint and never identity. One that is nothing but the
 * prefix is kept whole rather than left empty.
 */
export function nameFromFilename(filename: string): string {
  const stem = filename.replace(/\.md$/, '');
  return stem.replace(/^\d+-/, '') || stem;
}

/** `<NN>-...` gives the hint. A file with no numeric prefix has none. */
function readOrderHint(filename: string): number | undefined {
  const match = FILENAME_ORDER.exec(filename);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

function readStatus(value: string | undefined): Status | undefined {
  return STATUSES.find(status => status === value);
}

/**
 * A `blocked_by` list. Anything that is not a list reads as no Edges. An entry
 * YAML read as something other than a string is taken as written, by the rule
 * an `id` is read by, so the two always agree.
 */
function readEdgeList(value: unknown, fence: () => Document): readonly string[] {
  if (!Array.isArray(value)) return [];
  const nodes = value.some(readAsOther) ? listItems(fence(), 'blocked_by') : [];
  return value
    .map((entry, index) => text(asWritten(entry, nodes[index], fence)))
    .filter((entry): entry is string => entry !== undefined);
}

/**
 * The fields with every schema scalar YAML read as an object — a tagged
 * `!!timestamp` is a `Date` — taken as written, by the rule {@link asWritten}
 * reads a name by. Validation and the readers then see one value, so a scalar
 * a reader accepts is never excluded. Mappings and lists stay as they are.
 */
function scalarsAsWritten(
  fields: Record<string, unknown>,
  fence: () => Document,
): Record<string, unknown> {
  let out: Record<string, unknown> | undefined;
  for (const key of SCHEMA_KEYS) {
    const value = fields[key];
    if (key === 'blocked_by' || key === 'tags') {
      if (!Array.isArray(value) || !value.some(isObject)) continue;
      const nodes = listItems(fence(), key);
      out ??= { ...fields };
      out[key] = value.map((entry, index) =>
        isObject(entry) ? asWritten(entry, nodes[index], fence) : entry,
      );
    } else if (isObject(value) && !Array.isArray(value)) {
      out ??= { ...fields };
      out[key] = asWritten(value, fence().get(key, true), fence);
    }
  }
  return out ?? fields;
}

/**
 * Tags, validated non-blank, each as written: an unquoted `01` is the tag `01`.
 * Never trimmed or folded; comparing them is search's business.
 */
function readTags(value: unknown, fence: () => Document): readonly string[] {
  if (!Array.isArray(value)) return [];
  const nodes = value.some(readAsOther) ? listItems(fence(), 'tags') : [];
  return value.map((entry, index) => {
    const written = asWritten(entry, nodes[index], fence);
    return isPlain(written) ? String(written) : '';
  });
}

/** A list's nodes, an aliased list followed to its anchor first, so each entry is read as written. */
function listItems(doc: Document, key: string): readonly unknown[] {
  const node: unknown = doc.get(key, true);
  const list = isAlias(node) ? node.resolve(doc) : node;
  return isSeq(list) ? list.items : [];
}

function isObject(value: unknown): boolean {
  return value !== null && typeof value === 'object';
}

function readAsOther(value: unknown): boolean {
  return typeof value !== 'string' && value !== null && value !== undefined;
}

/**
 * A name is text, so a value YAML read as a number or a boolean is taken as the
 * text that was written: an unquoted `02` is the name `02`, not the number 2.
 * An alias is followed to the scalar it stands for. The fence is parsed a
 * second time only for such a value, which a fence of names never holds.
 */
function asWritten(value: unknown, node: unknown, fence: () => Document): unknown {
  if (!readAsOther(value)) return value;
  const target = isAlias(node) ? node.resolve(fence()) : node;
  return isScalar(target) && readAsOther(target.value) ? (target.source ?? value) : value;
}

/** A value YAML gave as a scalar, which alone converts to text without running anything. */
function isPlain(value: unknown): value is string | number | boolean | bigint {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  );
}

/** YAML scalars arrive as numbers and booleans too; only non-empty strings count. */
function text(value: unknown): string | undefined {
  if (!isPlain(value)) return undefined;
  const asText = String(value).trim();
  return asText === '' ? undefined : asText;
}
