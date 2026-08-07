import { parse } from 'yaml';

/**
 * The `---` fence split, which is all a frontmatter library would have given us.
 * Per ADR 0003 the writes in T3 mutate a parsed YAML document rather than
 * re-emitting an object, so this file deliberately stops at splitting.
 */
const FENCE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export interface Split {
  /**
   * Whether the file opened with a `---` fence at all. Distinct from
   * {@link Split.fields} being undefined, which also happens when a fence is
   * present but its YAML will not parse — a write must normalize that file
   * rather than treat the fence as body prose and duplicate it.
   */
  readonly hasFence: boolean;
  /** The fence's raw YAML, unparsed. Undefined when there was no fence. */
  readonly raw: string | undefined;
  /** The parsed frontmatter, or undefined when there is none or it is malformed. */
  readonly fields: Record<string, unknown> | undefined;
  /** Everything after the fence, verbatim. The whole file when there is none. */
  readonly body: string;
}

export function splitFrontmatter(contents: string): Split {
  const match = FENCE.exec(contents);
  if (match?.[1] === undefined) {
    return { hasFence: false, raw: undefined, fields: undefined, body: contents };
  }

  return {
    hasFence: true,
    raw: match[1],
    fields: parseFields(match[1]),
    body: contents.slice(match[0].length),
  };
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
