import { parse } from 'yaml';

/**
 * The `---` fence split, which is all a frontmatter library would have given us.
 * Per ADR 0003 the writes in T3 mutate a parsed YAML document rather than
 * re-emitting an object, so this file deliberately stops at splitting.
 */
const FENCE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export interface Split {
  /** The parsed frontmatter, or undefined when the file carries no fence. */
  readonly fields: Record<string, unknown> | undefined;
  /** Everything after the fence, verbatim. The whole file when there is none. */
  readonly body: string;
}

export function splitFrontmatter(contents: string): Split {
  const match = FENCE.exec(contents);
  if (match?.[1] === undefined) return { fields: undefined, body: contents };

  return { fields: parseFields(match[1]), body: contents.slice(match[0].length) };
}

/**
 * Reads are lenient: frontmatter that is not a YAML mapping — malformed, or a
 * scalar, or a list — reads as no frontmatter at all, and the file falls through
 * to the Legacy parser rather than failing the whole scan.
 */
function parseFields(yaml: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = parse(yaml);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
