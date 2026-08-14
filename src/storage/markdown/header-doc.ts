import { splitFrontmatter } from './frontmatter.ts';
import { NoSuchFogPatch } from '../driver.ts';
import type { MapDocument, MapEdit } from '../../domain.ts';

/**
 * The Map's typed sections live under `##` headings. Only this module knows
 * that — the driver interface carries the values, never the section names, so
 * a SQLite driver can hold them as columns.
 */
const NEXT_HEADING = /^##[ \t]/m;

export const SECTION_HEADINGS = {
  destination: 'Destination',
  notes: 'Notes',
  decisions: 'Decisions so far',
  fog: 'Not yet specified',
  outOfScope: 'Out of scope',
} as const;

/** Markers stating that their contents are overwritten — ADR 0002. */
export const GENERATED_OPEN =
  '<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->';
export const GENERATED_CLOSE = '<!-- /GENERATED -->';

const GENERATED_BLOCK =
  /<!--[ \t]*GENERATED\b[^>]*-->\r?\n?([\s\S]*?)<!--[ \t]*\/GENERATED[ \t]*-->/i;

const BULLET = /^[ \t]*[-*][ \t]+(.+?)[ \t]*$/;

/**
 * One derived pointer line: a resolved or dropped Ticket as it appears in a
 * generated Map block. The link is relative to the Map file.
 */
export interface DerivedPointer {
  readonly id: string;
  readonly title: string;
  readonly link: string;
  readonly gist: string;
}

/**
 * The opening paragraph of a Spec — the first prose under its title. A Spec has
 * no Destination section, so this is the orienting text a Spec-only Effort has,
 * and a Board that opens with nothing leaves every Ticket line uninterpretable.
 */
export function readSpecOpening(contents: string): string | undefined {
  const { body } = splitFrontmatter(contents);

  return body
    .split(/\n{2,}/)
    .map(block => block.trim())
    .find(block => block !== '' && !block.startsWith('#') && !isFieldLine(block));
}

/**
 * Typed sections a caller can read without paying for the whole Map body —
 * Decisions-so-far is deliberately absent; it is never read from the file.
 */
export function readMapDocument(contents: string, revision: string): MapDocument {
  return {
    destination: readSection(contents, SECTION_HEADINGS.destination),
    notes: readSection(contents, SECTION_HEADINGS.notes),
    notYetSpecified: bulletsOutsideGenerated(readSectionRaw(contents, SECTION_HEADINGS.fog)),
    outOfScope: bulletsOutsideGenerated(readSectionRaw(contents, SECTION_HEADINGS.outOfScope)),
    revision,
  };
}

export interface ApplyMapEditOptions {
  /**
   * When true, invent the Decisions / Out-of-scope headings (with empty
   * GENERATED blocks) if absent. Used by resolve/drop refresh so a slim Map
   * still gets a truthful derived cache. Ordinary edit_map section edits leave
   * the Map shape alone — they never invent unrelated headings.
   */
  readonly ensureDerivedSections?: boolean;
}

/**
 * Apply a section edit and rewrite the derived blocks. Content outside the
 * GENERATED markers is left alone; the blocks themselves are replaced whole.
 * When Decisions has no markers, its whole body is replaced by a GENERATED
 * block (unfenced stale prose must not remain). Out of scope without markers
 * keeps unfenced bullets as hand-owned and installs the GENERATED block under
 * them. Missing headings are not invented unless
 * {@link ApplyMapEditOptions.ensureDerivedSections} is set.
 */
export function applyMapEdit(
  contents: string,
  edit: MapEdit,
  decisions: readonly DerivedPointer[],
  dropped: readonly DerivedPointer[],
  options: ApplyMapEditOptions = {},
): string {
  let next = contents;

  if (edit.destination !== undefined) {
    next = setSection(next, SECTION_HEADINGS.destination, edit.destination.trim());
  }
  if (edit.notes !== undefined) {
    next = setSection(next, SECTION_HEADINGS.notes, edit.notes.trim());
  }
  if (edit.addFog !== undefined) {
    next = appendBullet(next, SECTION_HEADINGS.fog, edit.addFog.trim());
  }
  if (edit.graduateFog !== undefined) {
    next = removeBullet(next, SECTION_HEADINGS.fog, edit.graduateFog.trim());
  }
  if (edit.ruleOut !== undefined) {
    next = appendBullet(next, SECTION_HEADINGS.outOfScope, edit.ruleOut.trim());
  }

  if (options.ensureDerivedSections) {
    next = ensureDerivedHeading(next, SECTION_HEADINGS.decisions);
    next = ensureDerivedHeading(next, SECTION_HEADINGS.outOfScope);
  }

  // Decisions is wholly derived: unfenced prose is stale cache, not hand-owned.
  next = replaceGenerated(next, SECTION_HEADINGS.decisions, renderPointers(decisions), {
    wipeUnfenced: true,
  });
  // Out of scope mixes hand-ruled bullets (outside) with dropped Tickets (inside).
  next = replaceGenerated(next, SECTION_HEADINGS.outOfScope, renderPointers(dropped));

  return next;
}

/** A brand-new Map file, with empty generated blocks ready for the first write. */
export function scaffoldMap(edit: MapEdit): string {
  const destination = edit.destination?.trim() ?? '';
  const notes = edit.notes?.trim() ?? '';
  const fog = edit.addFog !== undefined ? `- ${edit.addFog.trim()}` : '';
  const ruled = edit.ruleOut !== undefined ? `- ${edit.ruleOut.trim()}` : '';

  if (edit.graduateFog !== undefined) throw new NoSuchFogPatch(edit.graduateFog);

  return [
    '---',
    'header: map',
    '---',
    '',
    '# Map',
    '',
    `## ${SECTION_HEADINGS.destination}`,
    '',
    destination,
    '',
    `## ${SECTION_HEADINGS.notes}`,
    '',
    notes,
    '',
    `## ${SECTION_HEADINGS.decisions}`,
    '',
    GENERATED_OPEN,
    GENERATED_CLOSE,
    '',
    `## ${SECTION_HEADINGS.fog}`,
    '',
    fog,
    '',
    `## ${SECTION_HEADINGS.outOfScope}`,
    '',
    ruled,
    '',
    GENERATED_OPEN,
    GENERATED_CLOSE,
    '',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

function renderPointers(pointers: readonly DerivedPointer[]): string {
  if (pointers.length === 0) return '';
  return pointers
    .map(pointer => {
      const head = `- [${pointer.id} — ${pointer.title}](${pointer.link})`;
      return pointer.gist === '' ? head : `${head} — ${pointer.gist}`;
    })
    .join('\n');
}

export function readSection(contents: string, heading: string): string | undefined {
  const raw = readSectionRaw(contents, heading);
  if (raw === undefined) return undefined;
  const trimmed = stripGenerated(raw).trim();
  return trimmed === '' ? undefined : trimmed;
}

function readSectionRaw(contents: string, heading: string): string | undefined {
  const { body } = splitFrontmatter(contents);
  const located = locateSection(body, heading);
  if (located === undefined) return undefined;
  return body.slice(located.start, located.end);
}

function setSection(contents: string, heading: string, value: string): string {
  const { hasFence, raw, body } = splitFrontmatter(contents);
  const located = locateSection(body, heading);
  const sectionBody = value === '' ? '\n\n' : `\n\n${value}\n\n`;

  let nextBody: string;
  if (located === undefined) {
    nextBody = ensureTrailingNewline(body) + `\n## ${heading}\n${sectionBody}`;
  } else {
    const { start, end } = located;
    // Keep any GENERATED block that lives in this section (Out of scope).
    const existing = body.slice(start, end);
    const generated = existing.match(GENERATED_BLOCK)?.[0];
    const replacement =
      generated === undefined
        ? sectionBody
        : `${sectionBody}\n${generated.endsWith('\n') ? generated : `${generated}\n`}`;
    nextBody = body.slice(0, start) + replacement + body.slice(end);
  }

  return reassemble(hasFence, raw, nextBody);
}

function appendBullet(contents: string, heading: string, text: string): string {
  const raw = readSectionRaw(contents, heading);
  if (raw === undefined) {
    return setSection(contents, heading, `- ${text}`);
  }

  const outside = stripGenerated(raw).replace(/\s+$/, '');
  const bullet = `- ${text}`;
  const combined = outside === '' ? bullet : `${outside}\n${bullet}`;
  return setSection(contents, heading, combined.trim());
}

function removeBullet(contents: string, heading: string, text: string): string {
  const raw = readSectionRaw(contents, heading);
  if (raw === undefined) throw new NoSuchFogPatch(text);

  const lines = stripGenerated(raw).split('\n');
  const index = lines.findIndex(line => {
    const match = BULLET.exec(line);
    return match?.[1] === text;
  });
  if (index < 0) throw new NoSuchFogPatch(text);

  const next = [...lines.slice(0, index), ...lines.slice(index + 1)]
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
  return setSection(contents, heading, next);
}

/**
 * Append a server-owned heading with an empty GENERATED block when the Map
 * never grew one. Only the resolve/drop refresh path asks for this — typed
 * section edits must not reshape an unrelated Map.
 */
function ensureDerivedHeading(contents: string, heading: string): string {
  if (readSectionRaw(contents, heading) !== undefined) return contents;
  const block = `${GENERATED_OPEN}\n${GENERATED_CLOSE}\n`;
  const { hasFence, raw, body } = splitFrontmatter(contents);
  const addition = `\n## ${heading}\n\n${block}`;
  return reassemble(hasFence, raw, ensureTrailingNewline(body) + addition);
}

function replaceGenerated(
  contents: string,
  heading: string,
  inner: string,
  options: { readonly wipeUnfenced?: boolean } = {},
): string {
  const raw = readSectionRaw(contents, heading);
  // Content outside the markers is never touched — inventing a missing section
  // would rewrite the Map shape on an unrelated edit.
  if (raw === undefined) return contents;

  const block =
    inner === ''
      ? `${GENERATED_OPEN}\n${GENERATED_CLOSE}\n`
      : `${GENERATED_OPEN}\n${inner}\n${GENERATED_CLOSE}\n`;

  const { hasFence, raw: fence, body } = splitFrontmatter(contents);
  const { start, end } = locateSection(body, heading)!;
  const section = body.slice(start, end);

  let replacement: string;
  if (GENERATED_BLOCK.test(section)) {
    // A function, not a string: `String.replace` reads `$&`, `` $` ``, `$'` and
    // `$1` in a replacement *string*, and this one is Ticket prose. A gist
    // quoting a regex — `^T[0-9a-z]+$` followed by a backtick — silently became
    // the text preceding the match, corrupting the very line it was rendering.
    replacement = section.replace(GENERATED_BLOCK, () => block.trimEnd());
    if (!replacement.endsWith('\n')) replacement += '\n';
  } else if (options.wipeUnfenced) {
    // No markers: the whole section body is the derived cache the server owns.
    // Replacing (not appending) clears hand-typed stale Decisions that would
    // otherwise lie next to a fresh GENERATED block — ADR 0002.
    replacement = `\n${block}`;
  } else {
    // Mixed sections (Out of scope): keep unfenced bullets as hand-owned and
    // install the GENERATED dropped-Ticket block beneath them.
    const outside = section.replace(/\s+$/, '');
    replacement = outside === '' ? `\n${block}` : `${outside}\n\n${block}`;
  }

  return reassemble(hasFence, fence, body.slice(0, start) + replacement + body.slice(end));
}

/** Byte range of a section's body inside `body` (after the heading line). */
function locateSection(
  body: string,
  heading: string,
): { readonly start: number; readonly end: number } | undefined {
  const pattern = new RegExp(`^##[ \\t]+${escapeRegExp(heading)}[ \\t]*$`, 'im');
  const match = pattern.exec(body);
  if (match === null) return undefined;

  const start = match.index + match[0].length;
  const after = body.slice(start);
  const next = NEXT_HEADING.exec(after);
  const end = next === null ? body.length : start + next.index;
  return { start, end };
}

function bulletsOutsideGenerated(raw: string | undefined): readonly string[] {
  if (raw === undefined) return [];
  return stripGenerated(raw)
    .split('\n')
    .map(line => BULLET.exec(line)?.[1])
    .filter((item): item is string => item !== undefined);
}

function stripGenerated(raw: string): string {
  return raw.replace(GENERATED_BLOCK, '');
}

function reassemble(hasFence: boolean, raw: string | undefined, body: string): string {
  // Preserve leading newlines in the body; only guarantee a trailing newline.
  const next = ensureTrailingNewline(body);
  if (!hasFence || raw === undefined) return next;
  return `---\n${raw}\n---\n\n${next.replace(/^\n+/, '')}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A single `Key: value` line — `Status: ready-for-agent` and the like. These sit
 * under the title in several of these documents and say nothing about where the
 * Effort is going, which is the whole job of the text a Board opens with.
 */
function isFieldLine(block: string): boolean {
  return !block.includes('\n') && /^[A-Za-z][\w -]{0,24}:[ \t]*\S+$/.test(block);
}
