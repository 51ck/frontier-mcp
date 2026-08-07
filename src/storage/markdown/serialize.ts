import { Document, isSeq, parseDocument } from 'yaml';

import type { TicketEdit } from '../../domain.ts';
import { splitFrontmatter } from './frontmatter.ts';

/**
 * Field order for frontmatter this driver *creates*. An existing file is never
 * reordered — a new field is appended, because moving keys a write did not name
 * is exactly the reformatting ADR 0003 forbids.
 */
const FIELD_ORDER = [
  'id',
  'title',
  'kind',
  'type',
  'status',
  'triage',
  'blocked_by',
  'claimed_by',
  'claimed_at',
  'answer_gist',
  'dropped_reason',
] as const;

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
}

/**
 * Normalize a Ticket file to schema frontmatter. A Legacy file with no fence
 * gets a full block from {@link defaults}; a file that already has frontmatter
 * keeps key order and only gains a missing id plus an updated Edge list (so a
 * bare sort-order Edge can become the id migration just minted). Body prose is
 * kept verbatim either way.
 */
export function normalizeTicket(contents: string, defaults: Defaults): string {
  const split = splitFrontmatter(contents);
  if (!split.hasFence) return applyEdit(contents, {}, defaults);

  const document = existingDocument(split.raw);
  if (document === undefined) return applyEdit(contents, {}, defaults);

  if (defaults.id !== undefined) {
    const existing = document.get('id');
    if (existing === undefined || existing === null || String(existing).trim() === '') {
      document.set('id', defaults.id);
    }
  }
  setEdges(document, defaults.blockedBy);

  const body = split.body.replace(/^\s+/, '').replace(/\n+$/, '');
  return `---\n${render(document)}\n---\n\n${body}\n`;
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
  const document = existingDocument(split.hasFence ? split.raw : undefined) ?? schemaFor(defaults);

  for (const [field, value] of fieldsOf(edit)) {
    if (value === null) document.delete(field);
    else document.set(field, value);
  }
  if (edit.blockedBy !== undefined) setEdges(document, edit.blockedBy);

  const frontmatter = render(document);

  // Only the outer edges are trimmed, and only newlines at the end — trailing
  // spaces on the last line of a comment are part of what the author wrote.
  let body = split.body.replace(/^\s+/, '').replace(/\n+$/, '');
  body = withTicks(body, edit.tick);
  // The answer goes in before the comment log so the log stays at the bottom,
  // which is where the skills append and where a reader looks for it.
  body = withAnswer(body, edit.answer);
  body = withComment(body, edit.comment);

  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

/**
 * The Edge list, replaced whole rather than merged — a caller changing Edges
 * knows which ones it wants, and a merge would leave no way to remove one.
 *
 * The existing collection style survives: a Ticket written `blocked_by: [T3]`
 * must not come back as a block list just because its Edges changed. That is the
 * same rule as the rest of ADR 0003, applied to the one field being named.
 */
function setEdges(document: Document, blockedBy: readonly string[]): void {
  const existing: unknown = document.get('blocked_by', true);
  const flow = isSeq(existing) ? existing.flow === true : true;

  document.set('blocked_by', document.createNode([...blockedBy], { flow }));
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
 * it.
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
  readonly line: number;
  readonly text: string;
}

/** Checkbox lines outside any code fence — the ones that are really criteria. */
function findCriteria(lines: readonly string[]): Criterion[] {
  const criteria: Criterion[] = [];
  let fenced = false;

  lines.forEach((line, index) => {
    if (FENCE_LINE.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;

    const box = CHECKBOX.exec(line);
    if (box !== null) criteria.push({ line: index, text: (box[4] ?? '').trim().toLowerCase() });
  });

  return criteria;
}

/**
 * Exact text wins. Otherwise a substring is accepted only when it names exactly
 * one criterion — a reference that fits several is a question, not an
 * instruction, and ticking all of them would be answering it on the caller's
 * behalf.
 */
function resolveCriterion(asked: string, criteria: readonly Criterion[]): number {
  const target = asked.trim().toLowerCase();

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
 * The existing frontmatter, or undefined when there is none to preserve. A fence
 * whose YAML does not parse cannot be round-tripped — `yaml` refuses to
 * stringify a document carrying errors — so it is rebuilt from the schema
 * instead, which is what "strict on write" means for a file this broken.
 */
function existingDocument(raw: string | undefined): Document | undefined {
  if (raw === undefined) return undefined;

  const parsed = parseDocument(raw);
  return parsed.errors.length > 0 ? undefined : parsed;
}

function fieldsOf(edit: TicketEdit): Array<[string, string | null]> {
  const pairs: Array<[string, string | null]> = [];

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
 * A Legacy file has no frontmatter, so a write is where it gets one — the
 * "strict on write" half of the contract: the tracker converts itself as it is
 * worked rather than in one risky pass. Only a created block gets to be in the
 * schema's field order.
 */
function schemaFor(defaults: Defaults): Document {
  const document = new Document({});
  const values: Partial<Record<(typeof FIELD_ORDER)[number], unknown>> = {
    ...(defaults.id === undefined ? {} : { id: defaults.id }),
    title: defaults.title,
    kind: defaults.kind,
    ...(defaults.type === undefined ? {} : { type: defaults.type }),
    status: defaults.status,
    ...(defaults.triage === undefined ? {} : { triage: defaults.triage }),
    // Flow, because that is how every Ticket in these repos is written by hand
    // and a normalized file should not stand out from the ones beside it.
    blocked_by: document.createNode([...defaults.blockedBy], { flow: true }),
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
