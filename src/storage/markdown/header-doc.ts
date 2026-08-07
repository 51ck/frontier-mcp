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
