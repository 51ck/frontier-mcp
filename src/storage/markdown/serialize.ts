import { Document, parseDocument } from 'yaml';

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

  const frontmatter = document
    // `lineWidth: 0` stops long values being re-wrapped, and without
    // `flowCollectionPadding: false` an untouched `[a, b]` comes back `[ a, b ]`
    // — both would be reformatting a field the edit never named.
    .toString({ lineWidth: 0, flowCollectionPadding: false })
    .trimEnd();

  let body = split.body.trim();
  body = withTicks(body, edit.tick);
  body = withAnswer(body, edit.answer);
  body = withComment(body, edit.comment);

  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

/**
 * Tick acceptance criteria by their text. Only the checkbox marker changes —
 * the line keeps its own indentation and wording, and every other line of the
 * body is untouched, so progress is visible without rewriting the body around
 * it.
 */
function withTicks(body: string, tick: readonly string[] | undefined): string {
  if (tick === undefined || tick.length === 0) return body;

  // Matched case-insensitively on the criterion's own text, but reported back in
  // the caller's words — an error that echoes a lowercased version of what you
  // typed reads as though it found something and changed it.
  const wanted = tick.map(text => ({ asked: text, target: text.trim().toLowerCase() }));
  const unmatched = new Set(wanted.map(entry => entry.asked));

  const ticked = body.split('\n').map(line => {
    const box = /^(\s*[-*]\s*\[)( |x|X)(\]\s*)(.*)$/.exec(line);
    if (box === null) return line;

    const text = (box[4] ?? '').trim().toLowerCase();
    const match = wanted.find(entry => text === entry.target || text.includes(entry.target));
    if (match === undefined) return line;

    unmatched.delete(match.asked);
    return `${box[1] ?? ''}x${box[3] ?? ''}${box[4] ?? ''}`;
  });

  if (unmatched.size > 0) {
    throw new Error(
      `No acceptance criterion matches: ${[...unmatched].map(text => `"${text}"`).join(', ')}`,
    );
  }

  return ticked.join('\n');
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

  return `${body}\n\n${comment}`;
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
 * A Legacy file has no frontmatter, so a write is where it gets one — the
 * "strict on write" half of the contract: the tracker converts itself as it is
 * worked rather than in one risky pass. Only a created block gets to be in the
 * schema's field order.
 */
function schemaFor(defaults: Defaults): Document {
  const document = new Document({});
  const values: Partial<Record<(typeof FIELD_ORDER)[number], string | readonly string[]>> = {
    ...(defaults.id === undefined ? {} : { id: defaults.id }),
    title: defaults.title,
    kind: defaults.kind,
    ...(defaults.type === undefined ? {} : { type: defaults.type }),
    status: defaults.status,
    ...(defaults.triage === undefined ? {} : { triage: defaults.triage }),
    blocked_by: defaults.blockedBy,
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

  const start = findAnswerHeading(body);
  if (start === -1) return `${body}\n\n${ANSWER_HEADING}\n\n${answer.trim()}`;

  const after = body.slice(start + ANSWER_HEADING.length);
  const next = NEXT_SECTION.exec(after);
  const rest = next === null ? '' : after.slice(next.index);

  const replaced = `${body.slice(0, start).trimEnd()}\n\n${ANSWER_HEADING}\n\n${answer.trim()}`;
  return rest === '' ? replaced : `${replaced}\n\n${rest.trimEnd()}`;
}

/** `## Answer` at the start of a line, and not the start of `## Answerable`. */
function findAnswerHeading(body: string): number {
  const match = /^##[ \t]+Answer[ \t]*$/m.exec(body);
  return match?.index ?? -1;
}
