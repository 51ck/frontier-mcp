import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseDocument } from 'yaml';

export const CONFIG_FILE = 'frontier.yml';
export const DEFAULT_ID_PATTERN = 'T<b36{6}>';

const MAX_ID_LENGTH = 64;
const LITERAL = /^[A-Za-z0-9._-]$/;
const TOKEN = /^<(?:(N)|b(36|16)\{(\d+)\})>/;

export type IdToken =
  | { readonly kind: 'literal'; readonly text: string }
  | { readonly kind: 'counter' }
  | { readonly kind: 'random'; readonly base: 16 | 36; readonly length: number };

/** A legal pattern, compiled. Both axes are properties of the token list, decided here once. */
export interface IdPattern {
  readonly source: string;
  readonly tokens: readonly IdToken[];
  /** Minting needs coordination exactly when the pattern contains `<N>` (T53). */
  readonly needsCoordination: boolean;
  /** Identity survives a merge exactly when the pattern contains a random token (T53). */
  readonly survivesMerge: boolean;
}

export type IdPatternResult =
  | { readonly pattern: IdPattern; readonly problem?: undefined }
  | { readonly pattern?: undefined; readonly problem: string };

const EFFORT_REASON =
  '<effort> is not a token: an Effort slug is a directory name that a plain mv changes outside ' +
  'anything the product can observe, so an id derived from it would go stale unseen (T52). ' +
  'Use a literal prefix such as AUTH-<N> instead.';

const LEADING_LITERAL_REASON =
  'every pattern must begin with a literal letter or underscore: T55 rests on it, since it keeps ' +
  'every id predicate anchored and narrow, and T52 rule 3 keeps an id from being a YAML scalar ' +
  'with a normalising alternate spelling.';

function firstLine(message: string): string {
  return message.split('\n', 1)[0]?.trim() ?? '';
}

function fail(problem: string): IdPatternResult {
  return { problem };
}

export function compileIdPattern(source: string): IdPatternResult {
  const tokens: IdToken[] = [];
  let literal = '';
  const flush = () => {
    if (literal !== '') tokens.push({ kind: 'literal', text: literal });
    literal = '';
  };

  for (let at = 0; at < source.length;) {
    const char = source.charAt(at);

    if (char === '<') {
      const rest = source.slice(at);
      if (rest.startsWith('<effort>')) return fail(EFFORT_REASON);

      const match = TOKEN.exec(rest);
      if (match === null) {
        return fail(
          `${JSON.stringify(rest.slice(0, 12))} is not a token. The tokens are <N>, <b36{n}> and <b16{n}>.`,
        );
      }
      flush();
      if (match[1] !== undefined) {
        tokens.push({ kind: 'counter' });
      } else {
        const length = Number(match[3]);
        if (length < 1 || length > MAX_ID_LENGTH) {
          return fail(`${match[0]} must draw between 1 and ${String(MAX_ID_LENGTH)} characters.`);
        }
        tokens.push({ kind: 'random', base: match[2] === '16' ? 16 : 36, length });
      }
      at += match[0].length;
      continue;
    }

    if (!LITERAL.test(char)) {
      return fail(
        `${JSON.stringify(char)} is not a legal literal: literals are limited to A-Z a-z 0-9 . _ - so that an ` +
          'id is a valid filename on every platform (T52 rule 5).',
      );
    }
    literal += char;
    at += 1;
  }
  flush();

  const first = tokens[0];
  if (first?.kind !== 'literal' || !/^[A-Za-z_]/.test(first.text)) {
    return fail(
      `${JSON.stringify(source)} does not begin with a literal: ${LEADING_LITERAL_REASON}`,
    );
  }

  const counters = tokens.filter(token => token.kind === 'counter').length;
  const randoms = tokens.filter(token => token.kind === 'random').length;
  if (counters > 1) {
    return fail('at most one <N> per pattern: with two, "the next number" is undefined (T52).');
  }
  if (counters + randoms === 0) {
    return fail('a pattern needs a <N> or a random token, or every id it mints is the same (T52).');
  }

  const width = tokens.reduce((sum, token) => {
    if (token.kind === 'literal') return sum + token.text.length;
    return sum + (token.kind === 'random' ? token.length : 1);
  }, 0);
  if (width > MAX_ID_LENGTH) {
    return fail(`a minted id may be at most ${String(MAX_ID_LENGTH)} characters (T52 rule 4).`);
  }

  return {
    pattern: {
      source,
      tokens,
      needsCoordination: counters > 0,
      survivesMerge: randoms > 0,
    },
  };
}

/**
 * Read `<storageDir>/frontier.yml` once. An absent file or key is the default;
 * a file that cannot be read as a mapping, or a pattern that is illegal, is a
 * problem the caller surfaces — never a silent fallback to the default, since
 * minting in a format nobody asked for is permanent (T54).
 */
export function loadIdPattern(storage: string, storageDir: string): IdPatternResult {
  const label = `${storageDir}/${CONFIG_FILE}`;
  let contents: string;
  try {
    contents = readFileSync(join(storage, CONFIG_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return compileIdPattern(DEFAULT_ID_PATTERN);
    return fail(`${label} could not be read: ${firstLine((error as Error).message)}`);
  }

  const document = parseDocument(contents);
  if (document.errors.length > 0) {
    return fail(
      `${label} is not valid YAML: ${firstLine(document.errors[0]?.message ?? 'parse error')}`,
    );
  }

  const parsed: unknown = document.toJS();
  if (parsed === null) return compileIdPattern(DEFAULT_ID_PATTERN);
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fail(`${label} must be a YAML mapping holding id_pattern.`);
  }

  const value = (parsed as Record<string, unknown>)['id_pattern'];
  if (value === undefined) return compileIdPattern(DEFAULT_ID_PATTERN);
  if (typeof value !== 'string') {
    return fail(`id_pattern in ${label} must be a string.`);
  }

  const compiled = compileIdPattern(value);
  return compiled.problem === undefined
    ? compiled
    : fail(`id_pattern ${JSON.stringify(value)} in ${label} is illegal: ${compiled.problem}`);
}
