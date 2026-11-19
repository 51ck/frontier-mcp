import { z } from 'zod';

/** A key no JavaScript object holds as its own by assignment, so it is refused rather than lost. */
export const PROTO = '__proto__';
export const PROTO_REFUSED =
  'the key __proto__ is refused in extra and drop_keys: it cannot be carried as a key. Nothing was written.';
/**
 * What `__proto__` is carried as from the schema to {@link extraProblems}, which
 * names the Ticket. A control character, so no caller's key can collide with it.
 */
const PROTO_CARRIED = '\u0000__proto__';

/**
 * Extra keys as a tool takes them: an envelope whose every key becomes a
 * top-level frontmatter key. Values are checked by {@link extraProblems}
 * rather than in the schema, which would cost every session the JSON grammar.
 */
export const extraInput = z
  .preprocess(
    value => {
      // Renamed on the raw input: parsing into a record assigns each key, and
      // assigning `__proto__` sets a prototype rather than a key, so it vanished.
      // It is refused later, where the Ticket it was meant for can be named.
      if (typeof value !== 'object' || value === null || !Object.hasOwn(value, PROTO)) return value;
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key === PROTO ? PROTO_CARRIED : key, item]),
      );
    },
    z.record(z.string(), z.unknown()),
  )
  .optional();

/** The envelope's own name, never written: no key named `extra` is stored. */
const ENVELOPE = 'extra';

/**
 * The argument that sets each schema key, per tool. `undefined` means no
 * argument does. A schema key missing here still refuses, as set by none.
 */
export const UPDATE_ARGUMENTS: Readonly<Record<string, string | undefined>> = {
  frontier: undefined,
  id: undefined,
  title: 'title',
  kind: 'kind',
  type: 'type',
  status: 'claim, resolve, drop, reopen or release',
  triage: 'triage',
  blocked_by: 'blocked_by',
  tags: 'tags',
  claimed_by: 'claim or release',
  claimed_at: 'claim or release',
  answer_gist: 'resolve',
  dropped_reason: 'drop',
};

export const CREATE_ARGUMENTS: Readonly<Record<string, string | undefined>> = {
  frontier: undefined,
  id: undefined,
  title: 'title',
  kind: 'kind',
  type: 'type',
  status: 'update_ticket claim, resolve, drop, reopen or release, after creation',
  triage: 'triage',
  blocked_by: 'blocked_by',
  tags: 'tags',
  claimed_by: 'update_ticket claim, after creation',
  claimed_at: 'update_ticket claim, after creation',
  answer_gist: 'update_ticket resolve, after creation',
  dropped_reason: 'update_ticket drop, after creation',
};

/** Why `key` is reserved, and what to pass instead. */
export function reservedKeyMessage(
  subject: string,
  route: string,
  key: string,
  argumentsFor: Readonly<Record<string, string | undefined>>,
): string {
  if (key === ENVELOPE) {
    return (
      `${subject}: ${route} cannot hold a key named extra — extra is the argument, and its own ` +
      'keys are each written at the top level of the frontmatter. Nothing was written.'
    );
  }
  const argument = argumentsFor[key];
  return (
    `${subject}: ${key} is a schema key, reserved, so ${route} cannot set or remove it. ` +
    (argument === undefined ? 'No argument sets it.' : `Use ${argument}.`) +
    ' Nothing was written.'
  );
}

/**
 * Every reason the envelope cannot be written as given, each naming the key.
 * `reserved` is every schema key, from the tracker contract; `extra` itself is
 * refused too. A value is any JSON value that reads back from YAML as itself:
 * a non-finite number, -0, and a string or key holding an unpaired surrogate
 * do not, and a top-level key that is blank or holds a control character
 * would not survive as one line of frontmatter.
 */
export function extraProblems(
  subject: string,
  extra: Readonly<Record<string, unknown>>,
  reserved: ReadonlySet<string>,
  argumentsFor: Readonly<Record<string, string | undefined>>,
): string | undefined {
  for (const key of Object.keys(extra)) {
    if (key === PROTO_CARRIED || key === PROTO) return `${subject}: ${PROTO_REFUSED}`;
    if (reserved.has(key) || key === ENVELOPE) {
      return reservedKeyMessage(subject, 'extra', key, argumentsFor);
    }
    if (key.trim() === '' || /[\p{Cc}\u2028\u2029]/u.test(key) || !key.isWellFormed()) {
      return `${subject}: extra key ${JSON.stringify(key)} must be non-blank, one line, with no control character. Nothing was written.`;
    }
    const problem = valueProblem(extra[key]);
    if (problem !== undefined) {
      return `${subject}: extra.${key} ${problem}, which would not read back as written. Nothing was written.`;
    }
  }
  return undefined;
}

function valueProblem(value: unknown): string | undefined {
  if (value === null || typeof value === 'boolean') return undefined;
  if (typeof value === 'string') {
    return value.isWellFormed() ? undefined : 'holds an unpaired surrogate';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'is not a finite number';
    return Object.is(value, -0) ? 'is -0' : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const problem = valueProblem(item);
      if (problem !== undefined) return problem;
    }
    return undefined;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value)) {
      if (!key.isWellFormed()) return 'has a key holding an unpaired surrogate';
      if (key === PROTO) return 'has a key __proto__';
      const problem = valueProblem(item);
      if (problem !== undefined) return problem;
    }
    return undefined;
  }
  return 'is not a JSON value';
}
