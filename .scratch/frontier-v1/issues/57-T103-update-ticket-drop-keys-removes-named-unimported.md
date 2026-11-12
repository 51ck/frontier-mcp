---
id: T103
title: update_ticket drop_keys removes named Unimported keys
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T102]
answer_gist: "`update_ticket` `drop_keys` cuts named Unimported keys out of the fence's own text and leaves the rest byte-identical; a schema key, an absent key or an unfenced Ticket fails the whole call, and the cut is read back and refused unless every other entry survives with its value; it is allowed on an id-less foreign fence, where dropping the last key ends Foreign without minting an id"
---

Decided in [[T101]], 2026-11-12. Unimported keys stay shown by `get_tickets` until they are gone, and today only a hand edit removes one. The server owns writes, so there has to be a write for it. The agent decides key by key, which is the per-field judgement [[T57]] said the server must not make.

## What to build

- One optional argument on `update_ticket`: `drop_keys: string[]`, naming frontmatter keys to delete. Not a ninth tool.
- A schema key is refused.
- A name not present in the fence fails the whole call and writes nothing, like an unmatched `tick`.
- Every other key, and the order and formatting of what remains, is untouched (ADR 0003).
- It may accompany the other `update_ticket` groups or stand alone.
- Nothing removes a key on its own: not `migrate_effort`, not an ordinary write. Until an agent passes `drop_keys`, the keys stay shown.

## To settle while building

- Whether `drop_keys` on a Foreign-fenced Ticket (no `id`) is allowed or refused until `migrate_effort` has run. Dropping every unimported key from an id-less fence would change which Tickets are Foreign; say which, and pin it.

## Acceptance criteria

- [x] `drop_keys` deletes exactly the named keys and leaves the rest of the fence byte-identical
- [x] A schema key is refused with a message naming it
- [x] An absent key fails the call and leaves the file untouched
- [x] After the last unimported key is dropped, `get_tickets` shows no `## Unimported frontmatter` block
- [x] The tool description and `docs/agents/issue-tracker.md` name the argument; the tracker doc revision is raised
- [x] Still eight tools, pinned in `test/ship.test.ts`

## Answer

Settled while building: `drop_keys` is allowed on a foreign-fenced Ticket with no `id`, addressed by handle. [[T101]] says the keys are shown regardless of id until an agent removes them. Dropping the last one ends the Foreign predicate; the Ticket stays under the Board's `no id (N)` warning and no id is minted. A fence left with no key at all gets the schema block a fenceless file gets, never an empty fence.

The schema key list is single-sourced in `src/storage/markdown/schema.ts`.

Two reviews found the cut could corrupt a fence while reporting success: a dangling alias, a flow mapping sharing a line, an emptied fence, an alias falling back to an earlier anchor of the same name (which flipped `status`), and a `|+` scalar trimmed after the check. All refuse now with `KeyNotCleanlyDroppable`, through one deep comparison of the text to be written against the original values minus the dropped keys.

Known limits: a non-scalar key (`? [a, b]`) cannot be named and fails as absent; a CRLF file's fence delimiters come out LF, as on any write.
