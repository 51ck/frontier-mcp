---
id: T103
title: update_ticket drop_keys removes named Unimported keys
kind: build
status: open
triage: ready-for-agent
blocked_by: [T102]
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

- [ ] `drop_keys` deletes exactly the named keys and leaves the rest of the fence byte-identical
- [ ] A schema key is refused with a message naming it
- [ ] An absent key fails the call and leaves the file untouched
- [ ] After the last unimported key is dropped, `get_tickets` shows no `## Unimported frontmatter` block
- [ ] The tool description and `docs/agents/issue-tracker.md` name the argument; the tracker doc revision is raised
- [ ] Still eight tools, pinned in `test/ship.test.ts`
