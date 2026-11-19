import { isDeepStrictEqual } from 'node:util';

import {
  Document,
  isAlias,
  isMap,
  isNode,
  isScalar,
  isSeq,
  parse,
  parseDocument,
  Scalar,
  visit,
} from 'yaml';

import type { TicketEdit } from '../../domain.ts';
import { AliasedValue } from '../driver.ts';
import {
  KeyNotCleanlyDroppable,
  NoFrontmatterToDrop,
  NoSuchKey,
  SchemaKeyNotDroppable,
} from '../driver.ts';
import { splitFrontmatter } from './frontmatter.ts';
import { FIELD_ORDER, MARKER_KEY, MARKER_VALUE, SCHEMA_KEYS } from './schema.ts';

/** The body sections a write may touch. Everything else is opaque prose. */
const ANSWER_HEADING = '## Answer';
const COMMENTS_HEADING = '## Comments';
/** Any `##` heading, so replacing the answer stops at the next section. */
const NEXT_SECTION = /^##[ \t]/m;

export interface Defaults {
  readonly id: string | undefined;
  readonly title: string;
  readonly kind: string;
  readonly type: string | undefined;
  readonly status: string;
  readonly triage: string | undefined;
  readonly blockedBy: readonly string[];
  readonly tags: readonly string[];
}

/**
 * Apply an edit to a Ticket file, returning the new contents.
 *
 * Per ADR 0003 the frontmatter is mutated as a parsed YAML document rather than
 * rebuilt from an object, so comments, key order and quoting style survive on
 * every field the edit did not name. The body is a string this only ever
 * appends to or replaces one known section of.
 */
export function applyEdit(contents: string, edit: TicketEdit, defaults: Defaults): string {
  const split = splitFrontmatter(contents);
  const raw = withoutKeys(split.hasFence ? split.raw : undefined, edit.dropKeys);
  const document = existingDocument(raw) ?? schemaFor(defaults);
  const touchesFields =
    fieldsOf(edit).length > 0 || edit.blockedBy !== undefined || edit.tags !== undefined;

  for (const [field, value] of fieldsOf(edit)) {
    if (value === null) {
      refuseIfAliased(document, field);
      document.delete(field);
    } else document.set(field, value);
  }
  if (edit.blockedBy !== undefined) setList(document, 'blocked_by', edit.blockedBy);
  if (edit.tags !== undefined) {
    if (edit.tags.length === 0) {
      refuseIfAliased(document, 'tags');
      document.delete('tags');
    } else setList(document, 'tags', edit.tags);
  }

  // A drop alone keeps the fence as text, so what remains is byte-identical
  // rather than whatever a re-render would make of it.
  const frontmatter =
    edit.dropKeys !== undefined && raw !== undefined && !touchesFields
      ? raw.replace(/(?:\r?\n)+$/, '')
      : render(document);

  // Only the outer edges are trimmed, and only newlines at the end — trailing
  // spaces on the last line of a comment are part of what the author wrote.
  let body = split.body.replace(/^\s+/, '').replace(/\n+$/, '');
  body = withTicks(body, edit.tick);
  // The answer goes in before the comment log so the log stays at the bottom,
  // which is where the skills append and where a reader looks for it.
  body = withAnswer(body, edit.answer);
  body = withComment(body, edit.comment);

  // A BOM the file opened with stays: the fence is read past it, so it was never content.
  const bom = contents.startsWith('\uFEFF') ? '\uFEFF' : '';
  return `${bom}---\n${frontmatter}\n---\n\n${body}\n`;
}

/**
 * The fence's text with the named top-level keys cut out. Each entry goes from
 * the start of its key's line to the end of its value, so a block scalar, a
 * nested map or a sequence goes whole, and a comment on the entry's own line
 * goes with it. A comment on its own line above stays: nothing says it was
 * about this key rather than a heading for what follows, and it is prose the
 * caller did not name. Every name is resolved before anything is cut.
 *
 * The cut is text surgery, so its result is read back the way the reader reads
 * a fence and refused unless exactly the other entries survive with the values
 * they had: an alias left without its anchor, a flow mapping sharing the
 * dropped entry's line, or an alias that falls back to an earlier anchor of the
 * same name would otherwise land a fence that no longer parses, or one whose
 * `status` quietly changed.
 * The marker, `title` and `status` are schema keys and never dropped, so a
 * fence always survives a drop.
 */
function withoutKeys(
  raw: string | undefined,
  dropKeys: readonly string[] | undefined,
): string | undefined {
  if (dropKeys === undefined || dropKeys.length === 0) return raw;

  const document = existingDocument(raw);
  if (raw === undefined || document === undefined || !isMap(document.contents)) {
    throw new NoFrontmatterToDrop();
  }

  const refused = dropKeys.filter(key => SCHEMA_KEYS.has(key));
  if (refused.length > 0) throw new SchemaKeyNotDroppable(refused);

  const spans = new Map<string, [number, number]>();
  for (const pair of document.contents.items) {
    if (!isScalar(pair.key) || pair.key.range == null) continue;
    const name = String(pair.key.value);
    if (!dropKeys.includes(name)) continue;
    const value = pair.value as { range?: [number, number, number] } | null;
    const start = raw.lastIndexOf('\n', pair.key.range[0] - 1) + 1;
    let end = value?.range?.[2] ?? pair.key.range[2];
    if (raw[end - 1] !== '\n') {
      const eol = raw.indexOf('\n', end);
      end = eol === -1 ? raw.length : eol + 1;
    }
    spans.set(name, [start, end]);
  }

  const missing = [...new Set(dropKeys)].filter(key => !spans.has(key));
  if (missing.length > 0) throw new NoSuchKey(missing);

  let cut = raw;
  for (const [start, end] of [...spans.values()].toSorted((a, b) => b[0] - a[0])) {
    cut = cut.slice(0, start) + cut.slice(end);
  }

  // Compared on the text that will be written, trimming included: a `|+`
  // scalar left as the last entry would otherwise lose its trailing blank lines.
  const written = cut.replace(/(?:\r?\n)+$/, '');
  const expected = withoutEntries(valueOf(document), spans);
  if (expected === undefined) throw new NoFrontmatterToDrop();
  const surviving = plainValue(written);
  if (
    surviving === undefined ||
    !isDeepStrictEqual(surviving, expected) ||
    Object.keys(surviving).join('\0') !== Object.keys(expected).join('\0')
  ) {
    throw new KeyNotCleanlyDroppable([...spans.keys()]);
  }
  return written;
}

type PlainMap = Record<string, unknown>;

/** A fence the reader would refuse — an alias with no anchor — has no values to compare. */
function valueOf(document: Document): PlainMap | undefined {
  try {
    return asPlainMap(document.toJS());
  } catch {
    return undefined;
  }
}

function plainValue(text: string): PlainMap | undefined {
  try {
    const value: unknown = parse(text);
    return value === null || value === undefined ? {} : asPlainMap(value);
  } catch {
    return undefined;
  }
}

function asPlainMap(value: unknown): PlainMap | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as PlainMap)
    : undefined;
}

function withoutEntries(
  value: PlainMap | undefined,
  dropped: ReadonlyMap<string, unknown>,
): PlainMap | undefined {
  if (value === undefined) return undefined;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !dropped.has(key)));
}

/**
 * A list — Edges or tags — replaced whole rather than merged: a caller changing
 * it knows which entries it wants, and a merge would leave no way to remove one.
 *
 * The existing collection style survives: a Ticket written `blocked_by: [T3]`
 * must not come back as a block list just because its Edges changed. That is the
 * same rule as the rest of ADR 0003, applied to the one field being named.
 */
function setList(document: Document, key: string, entries: readonly string[]): void {
  const existing: unknown = document.get(key, true);
  const flow = isSeq(existing) ? existing.flow === true : true;

  refuseIfAliased(document, key);
  document.set(key, listNode(document, entries, flow));
}

/**
 * A list node whose every entry reads back as the string given. An entry the
 * `yaml` package would write plain but that parses as something else — a
 * multi-line value holding `---`, say — is double-quoted; every other entry
 * keeps the style the package picks, so a list that already round-trips is
 * written byte for byte as before.
 */
function listNode(document: Document, entries: readonly string[], flow: boolean) {
  const node = document.createNode([...entries], { flow });
  for (const item of node.items) {
    if (isScalar(item) && !readsBack(item.value as string, flow)) item.type = Scalar.QUOTE_DOUBLE;
  }
  return node;
}

function readsBack(entry: string, flow: boolean): boolean {
  const probe = new Document({});
  probe.set('k', probe.createNode([entry], { flow }));
  try {
    const value: unknown = parse(probe.toString({ lineWidth: 0, flowCollectionPadding: false }));
    return isDeepStrictEqual(value, { k: [entry] });
  } catch {
    return false;
  }
}

/**
 * A value about to be replaced or removed that holds an anchor another part of
 * the fence aliases is refused, not rewritten: copying it into the aliases was
 * tried and changed values outside the edit (a number's spelling, a later
 * anchor of the same name shadowed). The caller edits the file by hand.
 */
function refuseIfAliased(document: Document, key: string): void {
  const target: unknown = document.get(key, true);
  if (!isNode(target)) return;

  const anchored = new Map<unknown, string>();
  visit(target, {
    Node(_, node) {
      if (node.anchor !== undefined) anchored.set(node, node.anchor);
    },
  });
  if (anchored.size === 0) return;

  visit(document, {
    Node(_, node) {
      if (node === target) return visit.SKIP;
      if (!isAlias(node)) return undefined;
      const anchor = anchored.get(node.resolve(document));
      if (anchor !== undefined) throw new AliasedValue(key, anchor);
      return undefined;
    },
  });
}

/** Where a `##` section ends: the next `##` heading, or the end of the body. */
function endOfSection(body: string, from: number): number {
  const after = body.slice(from);
  const next = NEXT_SECTION.exec(after);
  return next === null ? body.length : from + next.index;
}

/**
 * Tick acceptance criteria by their text. Only the checkbox marker changes —
 * the line keeps its own indentation and wording, and every other line of the
 * body is untouched, so progress is visible without rewriting the body around
 * it. Wrapped criteria match both as `get_tickets` returns them and re-joined
 * onto one line; comparison collapses whitespace so neither form needs special
 * casing.
 */
function withTicks(body: string, tick: readonly string[] | undefined): string {
  if (tick === undefined || tick.length === 0) return body;

  const lines = body.split('\n');
  const criteria = findCriteria(lines);

  // Resolve every reference before changing anything, so an ambiguous or
  // unmatched one leaves the file exactly as it was.
  const targets = tick.map(asked => ({ asked, line: resolveCriterion(asked, criteria) }));

  const ticked = [...lines];
  for (const { line } of targets) {
    const box = CHECKBOX.exec(ticked[line] ?? '');
    if (box !== null) ticked[line] = `${box[1]}x${box[3]}${box[4]}`;
  }

  return ticked.join('\n');
}

const CHECKBOX = /^(\s*[-*]\s*\[)( |x|X)(\]\s*)(.*)$/;
/** A fenced code block, where a `- [ ]` is illustration rather than a criterion. */
const FENCE_LINE = /^\s*(?:```|~~~)/;

interface Criterion {
  /** Index of the checkbox line — the only line a tick may rewrite. */
  readonly line: number;
  /** Whitespace-collapsed, lowercased prose, including wrapped continuations. */
  readonly text: string;
}

/**
 * Collapse runs of whitespace (including newlines and continuation indent) so
 * a wrapped criterion matches both the `get_tickets` form and a single-line
 * rejoin of the same words.
 */
function collapseCriterionText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * A continuation of the criterion above: indented prose that is not itself a
 * checkbox, heading, or fence. Blank lines end the wrap — house style never
 * leaves a hole inside a criterion.
 */
function isCriterionContinuation(line: string): boolean {
  if (line.trim() === '') return false;
  if (CHECKBOX.test(line)) return false;
  if (FENCE_LINE.test(line)) return false;
  if (/^#{1,6}\s/.test(line)) return false;
  return /^\s+\S/.test(line);
}

/** Checkbox lines outside any code fence — the ones that are really criteria. */
function findCriteria(lines: readonly string[]): Criterion[] {
  const criteria: Criterion[] = [];
  let fenced = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (FENCE_LINE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    const box = CHECKBOX.exec(line);
    if (box === null) continue;

    const checkboxLine = index;
    const parts = [box[4] ?? ''];
    while (index + 1 < lines.length && isCriterionContinuation(lines[index + 1] ?? '')) {
      index += 1;
      parts.push(lines[index] ?? '');
    }
    criteria.push({ line: checkboxLine, text: collapseCriterionText(parts.join('\n')) });
  }

  return criteria;
}

/**
 * Exact text wins. Otherwise a substring is accepted only when it names exactly
 * one criterion — a reference that fits several is a question, not an
 * instruction, and ticking all of them would be answering it on the caller's
 * behalf.
 */
function resolveCriterion(asked: string, criteria: readonly Criterion[]): number {
  const target = collapseCriterionText(asked);

  const exact = criteria.filter(criterion => criterion.text === target);
  if (exact.length === 1) return exact[0]?.line ?? -1;
  if (exact.length > 1) throw new Error(`"${asked}" matches ${String(exact.length)} criteria.`);

  const partial = criteria.filter(criterion => criterion.text.includes(target));
  if (partial.length === 1) return partial[0]?.line ?? -1;

  if (partial.length > 1) {
    throw new Error(
      `"${asked}" matches ${String(partial.length)} criteria — name one exactly: ` +
        partial.map(criterion => `"${criterion.text}"`).join(', '),
    );
  }

  throw new Error(`No acceptance criterion matches "${asked}".`);
}

/**
 * Append to the comment log, creating its heading the first time. The comment
 * is stored exactly as written — nothing is prepended, appended, or reformatted
 * around it, including `/triage`'s mandatory disclaimer, which is the skill's
 * own to write and not ours to inject.
 */
function withComment(body: string, comment: string | undefined): string {
  if (comment === undefined) return body;

  const heading = /^##[ \t]+Comments[ \t]*$/m.exec(body);
  if (heading === null) return `${body}\n\n${COMMENTS_HEADING}\n\n${comment}`;

  // At the end of the Comments section, not the end of the body — a Ticket
  // whose log is followed by another section would otherwise take the comment
  // into whichever section happens to come last.
  const end = endOfSection(body, heading.index + heading[0].length);
  const before = body.slice(0, end).replace(/\n+$/, '');
  const rest = body.slice(end);

  return rest === '' ? `${before}\n\n${comment}` : `${before}\n\n${comment}\n\n${rest}`;
}

/**
 * The existing frontmatter, or undefined when there is none. Only a valid
 * Ticket is ever written, and a valid Ticket's fence parses as a mapping, so
 * undefined here means a drop found nothing to drop from.
 */
function existingDocument(raw: string | undefined): Document | undefined {
  if (raw === undefined) return undefined;

  const parsed = parseDocument(raw);
  // An empty fence parses clean to a null document, which would render `null`.
  return parsed.errors.length > 0 || !isMap(parsed.contents) ? undefined : parsed;
}

function fieldsOf(edit: TicketEdit): Array<[string, string | null]> {
  const pairs: Array<[string, string | null]> = [];

  if (edit.title !== undefined) pairs.push(['title', edit.title]);
  if (edit.kind !== undefined) pairs.push(['kind', edit.kind]);
  if (edit.type !== undefined) pairs.push(['type', edit.type]);
  if (edit.status !== undefined) pairs.push(['status', edit.status]);
  if (edit.triage !== undefined) pairs.push(['triage', edit.triage]);
  if (edit.claimedBy !== undefined) pairs.push(['claimed_by', edit.claimedBy]);
  if (edit.claimedAt !== undefined) pairs.push(['claimed_at', edit.claimedAt]);
  if (edit.answerGist !== undefined) pairs.push(['answer_gist', edit.answerGist]);
  if (edit.droppedReason !== undefined) pairs.push(['dropped_reason', edit.droppedReason]);

  return pairs;
}

/**
 * A Ticket file as first written. Everything is a field this driver is creating,
 * so the whole block is in schema order — the one case where that is allowed,
 * since there is no author's ordering to preserve.
 *
 * The body is the caller's prose, stored verbatim. A draft with none produces a
 * Ticket with none rather than a heading nobody asked for.
 */
export function serializeNew(fields: Defaults, body: string | undefined): string {
  const frontmatter = render(schemaFor(fields));
  const prose = body?.trim() ?? '';

  return prose === '' ? `---\n${frontmatter}\n---\n` : `---\n${frontmatter}\n---\n\n${prose}\n`;
}

/**
 * `lineWidth: 0` stops long values being re-wrapped, and without
 * `flowCollectionPadding: false` an untouched `[a, b]` comes back `[ a, b ]` —
 * both would be reformatting a field the edit never named.
 */
function render(document: Document): string {
  return document.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd();
}

/**
 * The block {@link serializeNew} writes: the marker first (ADR 0009), then the
 * fields in schema order — the one case where that order is imposed, since
 * there is no author's ordering to preserve.
 */
function schemaFor(defaults: Defaults): Document {
  const document = new Document({});
  const values: Partial<Record<(typeof FIELD_ORDER)[number], unknown>> = {
    [MARKER_KEY]: MARKER_VALUE,
    ...(defaults.id === undefined ? {} : { id: defaults.id }),
    title: defaults.title,
    kind: defaults.kind,
    ...(defaults.type === undefined ? {} : { type: defaults.type }),
    status: defaults.status,
    ...(defaults.triage === undefined ? {} : { triage: defaults.triage }),
    // Flow, because that is how every Ticket in these repos is written by hand.
    blocked_by: listNode(document, defaults.blockedBy, true),
    ...(defaults.tags.length === 0 ? {} : { tags: listNode(document, defaults.tags, true) }),
  };

  for (const field of FIELD_ORDER) {
    const value = values[field];
    if (value !== undefined) document.set(field, value);
  }

  return document;
}

/**
 * The answer replaces the Answer section and nothing else. Slicing to the end of
 * the body would take the comment log with it — a Ticket body is opaque apart
 * from the three places the schema says are edited.
 */
function withAnswer(body: string, answer: string | undefined): string {
  if (answer === undefined) return body;

  const section = `${ANSWER_HEADING}\n\n${answer.trim()}`;
  const start = findAnswerHeading(body);

  if (start === -1) {
    // No Answer section yet. It goes above the comment log if there is one, so
    // the log stays at the bottom where it is appended and read.
    const comments = /^##[ \t]+Comments[ \t]*$/m.exec(body);
    if (comments === null) return `${body}\n\n${section}`;

    const head = body.slice(0, comments.index).replace(/\n+$/, '');
    return `${head}\n\n${section}\n\n${body.slice(comments.index)}`;
  }

  const end = endOfSection(body, start + ANSWER_HEADING.length);
  const head = body.slice(0, start).replace(/\n+$/, '');
  const rest = body.slice(end).replace(/^\n+/, '');

  return rest === '' ? `${head}\n\n${section}` : `${head}\n\n${section}\n\n${rest}`;
}

/** `## Answer` at the start of a line, and not the start of `## Answerable`. */
function findAnswerHeading(body: string): number {
  const match = /^##[ \t]+Answer[ \t]*$/m.exec(body);
  return match?.index ?? -1;
}
