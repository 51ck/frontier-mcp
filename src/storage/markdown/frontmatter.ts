import { parse } from 'yaml';

/**
 * The `---` fence split, which is all a frontmatter library would have given us.
 * Per ADR 0003 the writes in T3 mutate a parsed YAML document rather than
 * re-emitting an object, so this file deliberately stops at splitting.
 */
// A leading UTF-8 BOM is what some editors save; it is not content.
const FENCE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export interface Split {
  /**
   * Whether the file opened with a `---` fence at all. Distinct from
   * {@link Split.fields} being undefined, which also happens when a fence is
   * present but its YAML will not parse.
   */
  readonly hasFence: boolean;
  /** The fence's raw YAML, unparsed. Undefined when there was no fence. */
  readonly raw: string | undefined;
  /** The parsed frontmatter, or undefined when there is none or it is malformed. */
  readonly fields: Record<string, unknown> | undefined;
  /** Everything after the fence, verbatim. The whole file when there is none. */
  readonly body: string;
}

/** The fence's raw YAML without parsing it, or undefined when the file opens with none. */
export function fenceText(contents: string): string | undefined {
  return FENCE.exec(contents)?.[1];
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
 * Frontmatter that is not a YAML mapping — malformed, or a scalar, or a list —
 * reads as no fields rather than failing the whole scan. Whether that excludes
 * a file is the marker's question (ADR 0009), answered on the raw text.
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
