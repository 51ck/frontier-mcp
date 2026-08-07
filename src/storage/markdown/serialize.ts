import { Document, parseDocument, type Scalar } from 'yaml';

import type { TicketEdit } from '../driver.ts';
import { splitFrontmatter } from './frontmatter.ts';

/**
 * Field order for frontmatter this driver creates. An existing file keeps the
 * order its author chose — this only decides where a field that was never there
 * is inserted.
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
];

/** The one body section a write in T3 may touch. */
const ANSWER_HEADING = '## Answer';

/**
 * Apply an edit to a Ticket file, returning the new contents.
 *
 * Per ADR 0003 the frontmatter is mutated as a parsed YAML document rather than
 * rebuilt from an object, so comments, key order and quoting style survive on
 * every field the edit did not name. The body is a string this only ever
 * appends to.
 */
export function applyEdit(contents: string, edit: TicketEdit, defaults: Defaults): string {
  const { fields, body } = splitFrontmatter(contents);
  const document = fields === undefined ? normalize(contents, defaults) : parseExisting(contents);

  for (const [field, value] of fieldsOf(edit)) {
    if (value === null) document.delete(field);
    else setOrdered(document, field, value);
  }

  const frontmatter = document.toString({ lineWidth: 0 }).trimEnd();
  const prose = fields === undefined ? bodyOfLegacy(contents) : body;

  return `---\n${frontmatter}\n---\n\n${withAnswer(prose.trim(), edit.answer)}\n`;
}

export interface Defaults {
  readonly id: string | undefined;
  readonly title: string;
  readonly kind: string;
  readonly type: string | undefined;
  readonly status: string;
  readonly triage: string | undefined;
  readonly blockedBy: readonly string[];
}

function fieldsOf(edit: TicketEdit): Array<[string, string | null]> {
  const pairs: Array<[string, string | null]> = [];

  if (edit.status !== undefined) pairs.push(['status', edit.status]);
  if (edit.claimedBy !== undefined) pairs.push(['claimed_by', edit.claimedBy]);
  if (edit.claimedAt !== undefined) pairs.push(['claimed_at', edit.claimedAt]);
  if (edit.answerGist !== undefined) pairs.push(['answer_gist', edit.answerGist]);
  if (edit.droppedReason !== undefined) pairs.push(['dropped_reason', edit.droppedReason]);

  return pairs;
}

function parseExisting(contents: string): Document {
  const fence = /^---\r?\n([\s\S]*?)\r?\n---/.exec(contents);
  return parseDocument(fence?.[1] ?? '');
}

/**
 * A Legacy file has no frontmatter, so a write is where it gets one — this is
 * the "strict on write" half of the contract: the tracker converts itself as it
 * is worked rather than in one risky pass.
 */
function normalize(contents: string, defaults: Defaults): Document {
  const document = new Document({});

  if (defaults.id !== undefined) setOrdered(document, 'id', defaults.id);
  setOrdered(document, 'title', defaults.title);
  setOrdered(document, 'kind', defaults.kind);
  if (defaults.type !== undefined) setOrdered(document, 'type', defaults.type);
  setOrdered(document, 'status', defaults.status);
  if (defaults.triage !== undefined) setOrdered(document, 'triage', defaults.triage);
  document.set('blocked_by', defaults.blockedBy);

  void contents;
  return document;
}

/** A Legacy file's whole text is its body — there was never a fence to strip. */
function bodyOfLegacy(contents: string): string {
  return contents;
}

/**
 * Keep created files in the schema's field order. An existing key is updated in
 * place, so a file whose author ordered things differently is left as it is.
 */
function setOrdered(document: Document, field: string, value: string | readonly string[]): void {
  if (document.has(field)) {
    document.set(field, value);
    return;
  }

  document.set(field, value);

  const contents = document.contents as { items?: Array<{ key?: Scalar }> } | null;
  const items = contents?.items;
  if (items === undefined) return;

  items.sort((a, b) => rank(String(a.key?.value ?? '')) - rank(String(b.key?.value ?? '')));
}

function rank(field: string): number {
  const index = FIELD_ORDER.indexOf(field);
  return index === -1 ? FIELD_ORDER.length : index;
}

/**
 * The answer is appended under its own heading, or replaces what is already
 * there. Everything else in the body is left exactly as the author wrote it.
 */
function withAnswer(body: string, answer: string | undefined): string {
  if (answer === undefined) return body;

  const heading = body.indexOf(`\n${ANSWER_HEADING}`);
  const trimmed = heading === -1 ? body : body.slice(0, heading).trimEnd();

  return `${trimmed}\n\n${ANSWER_HEADING}\n\n${answer.trim()}`;
}
