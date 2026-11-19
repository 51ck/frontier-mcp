/**
 * The frontmatter keys a schema Ticket may carry, in the order a block this
 * driver *creates* is written. The one list: parse reads it to tell imported
 * keys from unimported ones, serialize writes in its order, and `drop_keys`
 * refuses anything in it. `frontier` is the marker (ADR 0009), first in a
 * created block.
 */
export const FIELD_ORDER = [
  'frontier',
  'id',
  'title',
  'kind',
  'type',
  'status',
  'triage',
  'blocked_by',
  'claimed_by',
  'claimed_at',
  'answer_gist',
  'dropped_reason',
] as const;

export const SCHEMA_KEYS: ReadonlySet<string> = new Set(FIELD_ORDER);

/** The marker key, and the one value it may hold. */
export const MARKER_KEY = 'frontier';
export const MARKER_VALUE = 'ticket';
