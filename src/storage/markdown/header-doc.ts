import { splitFrontmatter } from './frontmatter.ts';

/**
 * The Map's typed sections live under `##` headings. Only this module knows
 * that — the driver interface carries the values, never the section names, so
 * a SQLite driver can hold them as columns.
 */
const DESTINATION = /^##[ \t]+Destination[ \t]*$/im;
const NEXT_HEADING = /^##[ \t]/m;

/**
 * The Effort's Destination: where this line of enquiry is going. Absent when
 * the Effort has no Map, or a Map that has not been given one yet.
 */
export function readDestination(contents: string): string | undefined {
  const { body } = splitFrontmatter(contents);

  const heading = DESTINATION.exec(body);
  if (heading === null) return undefined;

  const after = body.slice(heading.index + heading[0].length);
  const next = NEXT_HEADING.exec(after);
  const section = (next === null ? after : after.slice(0, next.index)).trim();

  return section === '' ? undefined : section;
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
 * A single `Key: value` line — `Status: ready-for-agent` and the like. These sit
 * under the title in several of these documents and say nothing about where the
 * Effort is going, which is the whole job of the text a Board opens with.
 */
function isFieldLine(block: string): boolean {
  return !block.includes('\n') && /^[A-Za-z][\w -]{0,24}:[ \t]*\S+$/.test(block);
}
