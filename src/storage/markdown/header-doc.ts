import { splitFrontmatter } from './frontmatter.ts';
import { NoSuchFogPatch } from '../driver.ts';
import type { MapDocument, MapEdit } from '../../domain.ts';

/**
 * The Map's typed sections live under `##` headings. Only this module knows
 * that — the driver interface carries the values, never the section names, so
 * a SQLite driver can hold them as columns.
 */
const NEXT_HEADING = /^##[ \t]/m;

const SECTION_HEADINGS = {
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
 * The Effort's Destination: where this line of enquiry is going. Absent when
 * the Effort has no Map, or a Map that has not been given one yet.
 */
export function readDestination(contents: string): string | undefined {
  return readSection(contents, SECTION_HEADINGS.destination);
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

/**
 * Apply a section edit and rewrite the derived blocks. Content outside the
 * GENERATED markers is left alone; the blocks themselves are replaced whole.
 */
export function applyMapEdit(
  contents: string,
  edit: MapEdit,
  decisions: readonly DerivedPointer[],
  dropped: readonly DerivedPointer[],
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

  next = replaceGenerated(next, SECTION_HEADINGS.decisions, renderPointers(decisions));
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

function renderPointers(pointers: readonly DerivedPointer[]): string {
  if (pointers.length === 0) return '';
  return pointers
    .map(pointer => `- [${pointer.id} — ${pointer.title}](${pointer.link}) — ${pointer.gist}`)
    .join('\n');
}

function readSection(contents: string, heading: string): string | undefined {
  const raw = readSectionRaw(contents, heading);
  if (raw === undefined) return undefined;
  const trimmed = stripGenerated(raw).trim();
  return trimmed === '' ? undefined : trimmed;
}

function readSectionRaw(contents: string, heading: string): string | undefined {
  const { body } = splitFrontmatter(contents);
  const pattern = new RegExp(`^##[ \\t]+${escapeRegExp(heading)}[ \\t]*$`, 'im');
  const match = pattern.exec(body);
  if (match === null) return undefined;

  const after = body.slice(match.index + match[0].length);
  const next = NEXT_HEADING.exec(after);
  return next === null ? after : after.slice(0, next.index);
}

function setSection(contents: string, heading: string, value: string): string {
  const { hasFence, raw, body } = splitFrontmatter(contents);
  const pattern = new RegExp(`^##[ \\t]+${escapeRegExp(heading)}[ \\t]*$`, 'im');
  const match = pattern.exec(body);

  const sectionBody = value === '' ? '\n\n' : `\n\n${value}\n\n`;

  let nextBody: string;
  if (match === null) {
    nextBody = ensureTrailingNewline(body) + `\n## ${heading}\n${sectionBody}`;
  } else {
    const start = match.index + match[0].length;
    const after = body.slice(start);
    const next = NEXT_HEADING.exec(after);
    const end = next === null ? body.length : start + next.index;
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

function replaceGenerated(contents: string, heading: string, inner: string): string {
  const raw = readSectionRaw(contents, heading);
  const block =
    inner === ''
      ? `${GENERATED_OPEN}\n${GENERATED_CLOSE}\n`
      : `${GENERATED_OPEN}\n${inner}\n${GENERATED_CLOSE}\n`;

  if (raw === undefined) {
    return setSection(contents, heading, block.trimEnd());
  }

  const { hasFence, raw: fence, body } = splitFrontmatter(contents);
  const pattern = new RegExp(`^##[ \\t]+${escapeRegExp(heading)}[ \\t]*$`, 'im');
  const match = pattern.exec(body);
  if (match === null) return contents;

  const start = match.index + match[0].length;
  const after = body.slice(start);
  const next = NEXT_HEADING.exec(after);
  const end = next === null ? body.length : start + next.index;
  const section = body.slice(start, end);

  let replacement: string;
  if (GENERATED_BLOCK.test(section)) {
    replacement = section.replace(GENERATED_BLOCK, block.trimEnd());
    if (!replacement.endsWith('\n')) replacement += '\n';
  } else {
    const outside = section.replace(/\s+$/, '');
    replacement = outside === '' ? `\n${block}` : `${outside}\n\n${block}`;
  }

  return reassemble(hasFence, fence, body.slice(0, start) + replacement + body.slice(end));
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
  const trimmed = body.replace(/^\n+/, '').replace(/\n+$/, '\n');
  if (!hasFence || raw === undefined) return trimmed;
  return `---\n${raw}\n---\n\n${trimmed}`;
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
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
