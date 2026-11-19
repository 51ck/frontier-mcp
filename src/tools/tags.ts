import { z } from 'zod';

/**
 * Tags as a tool takes them: each a non-blank string, otherwise kept exactly as
 * given — no folding, trimming or deduplication, which are search's to decide.
 */
export const tagsInput = z
  .array(z.string().refine(value => value.trim() !== '', 'a tag must not be blank'))
  .optional();

/**
 * A tag holding a comma, whitespace, a quote, a control character or a line or
 * paragraph separator is JSON-quoted with every such character escaped, so the
 * list reads back unambiguously and a tag never spans lines or reaches a
 * terminal raw. `JSON.stringify` escapes only C0, hence the second pass.
 */
export function renderTags(tags: readonly string[]): string {
  return tags.map(tag => (NEEDS_QUOTING.test(tag) ? quote(tag) : tag)).join(',');
}

const NEEDS_QUOTING = /[\s,"\p{Cc}\u2028\u2029]/u;

function quote(tag: string): string {
  return JSON.stringify(tag).replace(
    /[\p{Cc}\u2028\u2029]/gu,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
