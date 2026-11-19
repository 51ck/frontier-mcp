import { isDeepStrictEqual } from 'node:util';

import {
  Document,
  isAlias,
  isMap,
  isNode,
  isPair,
  isScalar,
  isSeq,
  parse,
  parseDocument,
  Scalar,
  visit,
} from 'yaml';

import type { TicketEdit } from '../../domain.ts';
import {
  AliasedValue,
  ExtraDoesNotReadBack,
  ExtraKeyReserved,
  FenceNotCleanlyEditable,
} from '../driver.ts';
import {
  KeyNotCleanlyDroppable,
  NoFrontmatterToDrop,
  NoSuchKey,
  SchemaKeyNotDroppable,
} from '../driver.ts';
import { fenceBounds, readerKey, splitFrontmatter } from './frontmatter.ts';
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
 * Per ADR 0003 the fence is never re-rendered whole: each entry the edit names
 * has its own text replaced, a new one is appended, and a removed one is cut,
 * so every other entry, comment, blank line and line ending stays
 * byte-identical — an `id: +02` stays `+02`, and the Edges naming it still
 * resolve. The result is read back and refused unless every entry reads as it
 * did, or as the edit set it. The body is a string this only ever appends to or
 * replaces one known section of, and is kept verbatim when no section is named.
 */
export function applyEdit(contents: string, edit: TicketEdit, defaults: Defaults): string {
  const split = splitFrontmatter(contents);
  const bounds = fenceBounds(contents);
  // The fence's text with the line ending that closes its last line, so every
  // line — the last included — carries its own ending and nothing is guessed.
  const closeStart =
    bounds === undefined ? 0 : bounds.rawEnd + (contents.startsWith('\r\n', bounds.rawEnd) ? 2 : 1);
  const fenceText =
    split.hasFence && bounds !== undefined
      ? contents.slice(bounds.rawStart, closeStart)
      : undefined;
  const text = withoutKeys(fenceText, edit.dropKeys);
  const raw = text === undefined ? undefined : unended(text);
  const document = existingDocument(raw);

  const writes: Write[] = [];
  const removals: string[] = [];
  const target = document ?? schemaFor(defaults);
  for (const [field, value] of fieldsOf(edit)) {
    refuseIfAliased(target, field);
    if (value === null) removals.push(field);
    else writes.push({ key: field, value, node: probe => probe.createNode(value) });
  }
  if (edit.blockedBy !== undefined) writes.push(listWrite(target, 'blocked_by', edit.blockedBy));
  if (edit.tags !== undefined) {
    if (edit.tags.length === 0) {
      refuseIfAliased(target, 'tags');
      removals.push('tags');
    } else writes.push(listWrite(target, 'tags', edit.tags));
  }
  for (const [key, value] of Object.entries(edit.extra ?? {})) {
    refuseReserved(key);
    refuseIfAliased(target, key);
    writes.push({
      key,
      value,
      node: probe => probe.createNode(value, { aliasDuplicateObjects: false }),
    });
  }

  const bodyEdited =
    edit.tick !== undefined || edit.answer !== undefined || edit.comment !== undefined;
  let body = split.body;
  if (bodyEdited) {
    // A body written uniformly in CRLF is edited as LF and written back in CRLF,
    // so a tick matches its line and an append keeps every existing ending. A
    // body mixing both is edited as it stands.
    const crlf = /\r\n/.test(body) && !/(?<!\r)\n/.test(body);
    if (crlf) body = body.replaceAll('\r\n', '\n');
    // Only the outer edges are trimmed, and only newlines at the end — trailing
    // spaces on the last line of a comment are part of what the author wrote.
    body = body.replace(/^\s+/, '').replace(/(?:\r?\n)+$/, '');
    body = withTicks(body, edit.tick);
    // The answer goes in before the comment log so the log stays at the bottom,
    // which is where the skills append and where a reader looks for it.
    body = withAnswer(body, edit.answer);
    body = withComment(body, edit.comment);
    if (crlf) body = body.replaceAll('\n', '\r\n');
  }

  let updated: string;
  if (text === undefined || raw === undefined || document === undefined || bounds === undefined) {
    // No fence to keep: every field is one this driver writes, in schema order.
    for (const key of removals) target.delete(key);
    for (const write of writes) target.set(write.key, write.node(target));
    const bom = contents.startsWith('\uFEFF') ? '\uFEFF' : '';
    updated = `${bom}---\n${render(target)}\n---\n\n${body.replace(/^\s+/, '').replace(/\n+$/, '')}\n`;
  } else {
    const fence =
      writes.length === 0 && removals.length === 0
        ? text
        : spliced(text, document, writes, removals);
    const head =
      contents.slice(0, bounds.rawStart) + fence + contents.slice(closeStart, bounds.bodyStart);
    if (!bodyEdited) updated = head + body;
    else {
      const eol = lineEnding(raw);
      updated = `${head.endsWith('\n') ? head : head + eol}${eol}${body}${eol}`;
    }
  }
  assertExtraReadsBack(updated, edit.extra);
  return updated;
}

interface Write {
  readonly key: string;
  /** What the reader must get back for this key. */
  readonly value: unknown;
  readonly node: (probe: Document) => unknown;
}

/**
 * A list — Edges or tags — replaced whole rather than merged: a caller changing
 * it knows which entries it wants, and a merge would leave no way to remove one.
 * The existing collection style survives: `blocked_by: [T3]` must not come back
 * as a block list just because its Edges changed.
 */
function listWrite(document: Document, key: string, entries: readonly string[]): Write {
  const existing: unknown = document.get(key, true);
  const flow = isSeq(existing) ? existing.flow === true : true;
  refuseIfAliased(document, key);
  return { key, value: [...entries], node: probe => listNode(probe, entries, flow) };
}

function lineEnding(raw: string): string {
  return raw.includes('\r\n') ? '\r\n' : '\n';
}

/** The fence's text as the reader parses it: without the line ending closing its last line. */
function unended(text: string): string {
  return text.replace(/\r?\n$/, '');
}

/** The ending of the line that stops at `at`, or the fence's dominant one when there is none. */
function endingBefore(text: string, at: number): string {
  if (text[at - 1] === '\n') return text[at - 2] === '\r' ? '\r\n' : '\n';
  return dominantEnding(text);
}

function dominantEnding(text: string): string {
  const crlf = text.split('\r\n').length - 1;
  const lf = text.split('\n').length - 1 - crlf;
  return crlf > lf ? '\r\n' : '\n';
}

/** Replace `[start, end)` of the old text with `text`. */
interface Piece {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** The text with each piece applied, and where each piece's text now sits. */
function applyPieces(
  text: string,
  pieces: readonly Piece[],
): { readonly text: string; readonly inserted: ReadonlyArray<readonly [number, number]> } {
  let out = '';
  let from = 0;
  const inserted: Array<readonly [number, number]> = [];
  for (const piece of pieces.toSorted((a, b) => a.start - b.start || a.end - b.end)) {
    out += text.slice(from, piece.start);
    inserted.push([out.length, out.length + piece.text.length]);
    out += piece.text;
    from = piece.end;
  }
  return { text: out + text.slice(from), inserted };
}

/**
 * The fence's text with each write and removal applied to its own entry. An
 * entry is found by the key the reader gives it ({@link readerKey}), so
 * `extra: { "12": … }` replaces a stored `12:` rather than adding a second
 * entry, while `extra: { "null": … }` beside a stored `null:` — which the
 * reader names `""` — adds a quoted `"null":`. A replaced entry keeps its
 * key's spelling, except that an explicit `? key` is rewritten as a plain key,
 * and keeps the line ending of its last line. A new entry goes at the end of
 * the fence, before a closing `...`, in the ending of the line it follows.
 */
function spliced(
  text: string,
  document: Document,
  writes: readonly Write[],
  removals: readonly string[],
): string {
  const regions = entryRegions(text, document);
  const pieces: Piece[] = [];
  const appended: Write[] = [];
  for (const write of writes) {
    const region = regions.get(write.key);
    if (region === undefined) appended.push(write);
    else {
      const eol = endingBefore(text, region.end);
      const kept = explicitKeyComment(text, region);
      pieces.push({
        ...region,
        text: kept + entryText(write.key, region.keyText, write, eol),
      });
    }
  }
  for (const key of removals) {
    const region = regions.get(key);
    if (region !== undefined) pieces.push({ ...region, text: '' });
  }
  if (appended.length > 0) {
    const at = insertionPoint(text);
    const eol = endingBefore(text, at);
    pieces.push({
      start: at,
      end: at,
      text: appended.map(write => entryText(write.key, undefined, write, eol)).join(''),
    });
  }

  const expected = { ...plainValue(unended(text)) };
  for (const key of removals) delete expected[key];
  for (const write of writes) expected[write.key] = write.value;

  const named = [...writes.map(write => write.key), ...removals];
  const candidate = finished(text, document, pieces, expected, new Set(named));
  if (candidate !== undefined) return candidate;
  const extraKeys = new Set(writes.filter(write => !SCHEMA_KEYS.has(write.key)).map(w => w.key));
  const wrong = mismatched(unended(applyPieces(text, pieces).text), expected);
  const extraWrong = wrong.find(key => extraKeys.has(key));
  if (extraWrong !== undefined) throw new ExtraDoesNotReadBack(extraWrong);
  throw new FenceNotCleanlyEditable(wrong.length > 0 ? wrong : named);
}

/**
 * The edited text, when it reads as `expected` and keeps every untouched byte.
 * A piece ending the fence whose text is a kept-chomped block scalar needs one
 * more line ending, or its last newline would be read as the delimiter's; that
 * line ending is part of the piece written, so it is tried second.
 */
function finished(
  text: string,
  document: Document,
  pieces: readonly Piece[],
  expected: PlainMap,
  touched: ReadonlySet<string>,
): string | undefined {
  const variants = [pieces];
  const last = pieces.find(piece => piece.end === text.length && piece.text !== '');
  if (last !== undefined) {
    const eol = last.text.endsWith('\r\n') ? '\r\n' : '\n';
    variants.push(
      pieces.map(piece => (piece === last ? { ...piece, text: piece.text + eol } : piece)),
    );
  }
  for (const variant of variants) {
    const applied = applyPieces(text, variant);
    if (!readsAs(unended(applied.text), expected)) continue;
    if (keepsUntouched(text, document, touched, variant, applied)) return applied.text;
  }
  return undefined;
}

/**
 * Where a new entry goes: before a `...` document-end line closing the fence
 * (with only blank and comment lines after it), else at the end.
 */
function insertionPoint(text: string): number {
  let end = text.length;
  while (end > 0) {
    const start = text.lastIndexOf('\n', end - 2) + 1;
    const line = text.slice(start, end).replace(/\r?\n$/, '');
    if (/^\.\.\.(?:[ \t]|$)/.test(line)) return start;
    if (!/^[ \t]*(?:#.*)?$/.test(line)) return text.length;
    end = start;
  }
  return text.length;
}

/**
 * The untouched-bytes guard, exact: no line ending is normalized and no scalar
 * style is excused. Every byte outside the pieces written is the same byte in
 * the same order before and after; and the reader, parsing the result, finds
 * every untouched entry as the very same text, in the same order — so no
 * written text was absorbed into a neighbour, nor a neighbour into it.
 */
function keepsUntouched(
  before: string,
  beforeDocument: Document,
  touched: ReadonlySet<string>,
  pieces: readonly Piece[],
  applied: { readonly text: string; readonly inserted: ReadonlyArray<readonly [number, number]> },
): boolean {
  const cutBefore = pieces.map(piece => [piece.start, piece.end] as const);
  if (outside(before, cutBefore) !== outside(applied.text, applied.inserted)) return false;

  const afterDocument = parseDocument(unended(applied.text));
  if (afterDocument.errors.length > 0) return false;
  if (!keepsComments(before, beforeDocument, pieces, applied.text)) return false;
  const was = [...entryRegions(before, beforeDocument)].filter(([key]) => !touched.has(key));
  const now = [...entryRegions(applied.text, afterDocument)].filter(([key]) => !touched.has(key));
  return (
    was.length === now.length &&
    was.every(([key, region], index) => {
      const [nowKey, nowRegion] = now[index] ?? [];
      return (
        nowKey === key &&
        nowRegion !== undefined &&
        applied.text.slice(nowRegion.start, nowRegion.end) ===
          before.slice(region.start, region.end)
      );
    })
  );
}

/**
 * Every own-line comment of the old fence is in the new one, byte for byte and
 * in order, unless a piece replaced it from inside an entry — with a line of
 * that entry's content after it in the piece. Judged on lines alone, not on the
 * entry regions the pieces came from, so a region that wrongly ran on over a
 * comment below its entry cannot also excuse losing that comment. A line within
 * a scalar's text — a block scalar's `# …` line — is content, not a comment.
 */
function keepsComments(
  before: string,
  document: Document,
  pieces: readonly Piece[],
  after: string,
): boolean {
  const scalars: Array<readonly [number, number]> = [];
  visit(document, {
    Scalar(_, node) {
      if (node.range != null && node.range[1] > node.range[0]) {
        scalars.push([node.range[0], node.range[1]]);
      }
    },
  });
  const lines = linesOf(before);
  const isComment = (line: Line): boolean =>
    /^[ \t]*#/.test(line.text) &&
    !scalars.some(([start, end]) => start < line.end && end > line.start);
  const isContent = (line: Line): boolean => !/^[ \t]*$/.test(line.text) && !isComment(line);
  const kept = lines.filter((line, index) => {
    if (!isComment(line)) return false;
    const piece = pieces.find(p => p.start <= line.start && line.end <= p.end);
    if (piece === undefined) return true;
    return !lines.slice(index + 1).some(next => next.end <= piece.end && isContent(next));
  });
  const now = linesOf(after).map(line => line.text);
  let at = 0;
  for (const line of kept) {
    while (at < now.length && now[at] !== line.text) at += 1;
    if (at === now.length) return false;
    at += 1;
  }
  return true;
}

interface Line {
  readonly start: number;
  readonly end: number;
  /** The line without its ending. */
  readonly text: string;
}

function linesOf(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf('\n', start);
    const end = newline === -1 ? text.length : newline + 1;
    lines.push({ start, end, text: text.slice(start, end).replace(/\r?\n$/, '') });
    start = end;
  }
  return lines;
}

/** The text with the given ranges cut out. */
function outside(text: string, ranges: ReadonlyArray<readonly [number, number]>): string {
  let kept = '';
  let from = 0;
  for (const [start, end] of ranges.toSorted((a, b) => a[0] - b[0])) {
    kept += text.slice(from, start);
    from = end;
  }
  return kept + text.slice(from);
}

function readsAs(text: string, expected: PlainMap): boolean {
  const read = plainValue(text);
  return (
    read !== undefined &&
    isDeepStrictEqual(read, expected) &&
    Object.keys(read).join('\0') === Object.keys(expected).join('\0')
  );
}

function mismatched(text: string, expected: PlainMap): string[] {
  const read = plainValue(text);
  if (read === undefined) return Object.keys(expected);
  const keys = new Set([...Object.keys(read), ...Object.keys(expected)]);
  return [...keys].filter(
    key =>
      Object.hasOwn(read, key) !== Object.hasOwn(expected, key) ||
      !isDeepStrictEqual(read[key], expected[key]),
  );
}

/** One entry as the `yaml` package renders it alone, under the key spelling given. */
function entryText(key: string, keyText: string | undefined, write: Write, eol: string): string {
  const probe = new Document({});
  probe.set(keyText === undefined ? key : 'k', write.node(probe));
  let rendered = probe.toString({ lineWidth: 0, flowCollectionPadding: false });
  if (keyText !== undefined) rendered = keyText + rendered.slice(1);
  return eol === '\n' ? rendered : rendered.replace(/\n/g, eol);
}

interface Region {
  readonly start: number;
  readonly end: number;
  readonly keyText: string | undefined;
  readonly keyEnd: number;
}

/**
 * Each top-level entry's text, by the key the reader gives it, in fence order:
 * from the start of its key's line — its `?`'s, for an explicit key — to the
 * end of the line holding the last non-blank character of its value, so a
 * block scalar, a nested map or a sequence is one region, and a comment on the
 * entry's last line goes with it. Blank lines and comment lines after the
 * value belong to no entry, even where the reader counts a kept-chomped
 * scalar's blank lines as its value: they are bytes a write never takes. An
 * explicit key is given no spelling to keep, so it is rewritten plain.
 */
function entryRegions(text: string, document: Document): Map<string, Region> {
  const regions = new Map<string, Region>();
  if (!isMap(document.contents)) return regions;
  for (const pair of document.contents.items) {
    const key = readerKey(document, pair);
    if (key === undefined || !isScalar(pair.key) || pair.key.range == null) continue;
    const keyEnd = pair.key.range[1];
    let last = Math.max(contentEnd(pair.value) ?? keyEnd, keyEnd);
    while (last > keyEnd && /\s/.test(text[last - 1] ?? '')) last -= 1;
    const eol = text.indexOf('\n', last);
    const from = entryStart(text, pair.key.range[0]);
    regions.set(key, {
      start: lineStart(text, from),
      end: eol === -1 ? text.length : eol + 1,
      keyText: from === pair.key.range[0] ? text.slice(pair.key.range[0], keyEnd) : undefined,
      keyEnd,
    });
  }
  return regions;
}

/**
 * Where a value's last non-comment character ends. A block collection's own
 * range runs on over the comment lines after it — after an empty final `-`
 * item, say — so only its items are asked; a scalar's, an alias's and a flow
 * collection's ranges stop at their text, a block scalar's lines included.
 */
function contentEnd(node: unknown): number | undefined {
  if (isScalar(node) || isAlias(node)) return node.range?.[1];
  if (isSeq(node) || isMap(node)) {
    if (node.flow === true) return node.range?.[1];
    let end: number | undefined;
    for (const item of node.items) {
      const parts: unknown[] = isPair(item) ? [item.key, item.value] : [item];
      for (const part of parts) {
        const at = contentEnd(part);
        if (at !== undefined && (end === undefined || at > end)) end = at;
      }
    }
    return end;
  }
  return undefined;
}

/**
 * Where an entry starts: its key, or the `?` opening an explicit key at the
 * start of a line — on the key's own line, or alone on a line above it, a
 * comment after the `?` allowed.
 */
function entryStart(text: string, keyStart: number): number {
  let at = keyStart;
  while (at > 0 && /[ \t]/.test(text[at - 1] ?? '')) at -= 1;
  if (text[at - 1] === '?') {
    const mark = at - 1;
    return text.slice(lineStart(text, mark), mark).trim() === '' ? mark : keyStart;
  }
  if (at !== lineStart(text, at) || at === 0) return keyStart;
  const above = lineStart(text, at - 1);
  const line = text.slice(above, at).replace(/\r?\n$/, '');
  const mark = /^([ \t]*)\?(?:[ \t]+#.*|[ \t]*)$/.exec(line);
  return mark === null ? keyStart : above + (mark[1]?.length ?? 0);
}

/**
 * The comment on an explicit key's `?` line, with that line's ending, kept as
 * its own line above the plain entry the key is rewritten as.
 */
function explicitKeyComment(text: string, region: Region): string {
  if (region.keyText !== undefined || text[region.start] !== '?') return '';
  const end = text.indexOf('\n', region.start);
  const lineEnd = end === -1 ? text.length : end + 1;
  // The comment follows the `?` itself, or the key when the key shares its line.
  const from = region.keyEnd < lineEnd ? region.keyEnd : region.start + 1;
  const comment = /^[ \t]+(#.*)$/s.exec(text.slice(from, lineEnd));
  if (comment === null) return '';
  const body = comment[1] ?? '';
  return /\r?\n$/.test(body) ? body : body + endingBefore(text, region.end);
}

function lineStart(text: string, at: number): number {
  return text.lastIndexOf('\n', at - 1) + 1;
}

/** `extra` never writes a schema key, nor one named `extra`: that is the argument, not a key. */
function refuseReserved(key: string): void {
  if (SCHEMA_KEYS.has(key) || key === 'extra') throw new ExtraKeyReserved(key);
}

/**
 * Each extra value, read back the way the scan reads the file, is the value
 * given. A value the `yaml` package would render as something else, or one
 * that would end the fence early, is refused rather than landed changed.
 */
function assertExtraReadsBack(
  contents: string,
  extra: Readonly<Record<string, unknown>> | undefined,
): void {
  if (extra === undefined) return;
  const split = splitFrontmatter(contents);
  const read = split.raw === undefined ? undefined : plainValue(split.raw);
  for (const [key, value] of Object.entries(extra)) {
    if (read === undefined || !Object.hasOwn(read, key) || !isDeepStrictEqual(read[key], value)) {
      throw new ExtraDoesNotReadBack(key);
    }
  }
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
  text: string | undefined,
  dropKeys: readonly string[] | undefined,
): string | undefined {
  if (dropKeys === undefined || dropKeys.length === 0) return text;

  const document = existingDocument(text === undefined ? undefined : unended(text));
  if (text === undefined || document === undefined || !isMap(document.contents)) {
    throw new NoFrontmatterToDrop();
  }

  const refused = dropKeys.filter(key => SCHEMA_KEYS.has(key));
  if (refused.length > 0) throw new SchemaKeyNotDroppable(refused);

  const all = entryRegions(text, document);
  const regions = new Map<string, Region>();
  for (const key of dropKeys) {
    const region = all.get(key);
    if (region !== undefined) regions.set(key, region);
  }

  const missing = [...new Set(dropKeys)].filter(key => !regions.has(key));
  if (missing.length > 0) throw new NoSuchKey(missing);

  // Exactly the dropped regions go; everything else stays, its blank lines and
  // line endings included.
  const pieces = [...regions.values()].map(({ start, end }) => ({ start, end, text: '' }));
  const expected = withoutEntries(valueOf(document), regions);
  if (expected === undefined) throw new NoFrontmatterToDrop();
  const written = finished(text, document, pieces, expected, new Set(regions.keys()));
  if (written === undefined) throw new KeyNotCleanlyDroppable([...regions.keys()]);
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
export function serializeNew(
  fields: Defaults,
  body: string | undefined,
  extra: Readonly<Record<string, unknown>> = {},
): string {
  const document = schemaFor(fields);
  // After every schema field: the extra keys are the caller's, in the caller's order.
  for (const [key, value] of Object.entries(extra)) {
    refuseReserved(key);
    document.set(key, document.createNode(value, { aliasDuplicateObjects: false }));
  }
  const prose = body?.trim() ?? '';
  const rendered = document.toString({ lineWidth: 0, flowCollectionPadding: false });
  const build = (frontmatter: string) =>
    prose === '' ? `---\n${frontmatter}---\n` : `---\n${frontmatter}---\n\n${prose}\n`;

  // A kept-chomped block scalar ending the fence needs one more newline, or its
  // last would be read as the closing delimiter's.
  const contents = build(rendered);
  try {
    assertExtraReadsBack(contents, extra);
    return contents;
  } catch (error) {
    const padded = build(`${rendered}\n`);
    try {
      assertExtraReadsBack(padded, extra);
    } catch {
      throw error;
    }
    return padded;
  }
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
