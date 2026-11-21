/**
 * How a Ticket body divides into `##` sections. One rule, shared by the writer
 * that places criteria and the reader that returns sections by heading, so a
 * section a read names is the section a write finds.
 */

const FENCE_OPEN = /^\s*(`{3,}|~{3,})(.*)/;
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/;
const HEADING = /^##[ \t]/;

/**
 * For each line, whether it belongs to a fenced code block, its fence lines
 * included — where a `##` or a `- [ ]` is illustration. A fence closes only on
 * a run of its own character at least as long with nothing after it, and a
 * backtick run whose info string holds a backtick opens none, so a prose line
 * quoting ```code``` stays prose.
 */
export function fencedLines(lines: readonly string[]): boolean[] {
  let open: { readonly char: string; readonly length: number } | undefined;
  return lines.map(line => {
    if (open === undefined) {
      const match = FENCE_OPEN.exec(line);
      const run = match?.[1];
      if (run === undefined || (run.startsWith('`') && (match?.[2] ?? '').includes('`'))) {
        return false;
      }
      open = { char: run.charAt(0), length: run.length };
      return true;
    }
    const close = FENCE_CLOSE.exec(line)?.[1];
    if (close !== undefined && close.startsWith(open.char) && close.length >= open.length) {
      open = undefined;
    }
    return true;
  });
}

/** For each line, whether it opens a `##` section; a `##` line inside a code fence does not. */
export function sectionStarts(lines: readonly string[]): boolean[] {
  const fenced = fencedLines(lines);
  return lines.map((line, index) => fenced[index] !== true && HEADING.test(line));
}

export interface BodySection {
  /** The heading as written, less its `##`, any closing `#` run and surrounding whitespace. */
  readonly heading: string;
  /** The heading line through the section's last non-blank line. */
  readonly text: string;
}

/** Every `##` section of a body, in file order. Text above the first heading is in none. */
export function sectionsOf(body: string): readonly BodySection[] {
  const lines = body.split('\n');
  const starts = sectionStarts(lines);
  const sections: BodySection[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (starts[index] !== true) continue;
    let end = index + 1;
    while (end < lines.length && starts[end] !== true) end += 1;
    sections.push({
      heading: headingOf(lines[index] ?? ''),
      text: lines.slice(index, end).join('\n').trimEnd(),
    });
  }
  return sections;
}

/** CommonMark's heading text: a closing `#` run counts only after whitespace, so `C#` keeps its `#`. */
function headingOf(line: string): string {
  return line
    .slice(2)
    .trim()
    .replace(/(?:^|[ \t]+)#+$/, '')
    .trim();
}
