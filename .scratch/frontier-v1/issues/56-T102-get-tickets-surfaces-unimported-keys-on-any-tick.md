---
id: T102
title: get_tickets surfaces Unimported keys on any Ticket, not only a Foreign one
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: "`get_tickets` shows keys outside the schema under `## Unimported frontmatter` on any Ticket — the whole fence byte for byte when it has no id, only the unimported entries cut from the file's own text otherwise, falling back to the whole fence when an entry cannot be cut cleanly; `Ticket.unimported { keys, yaml, whole }` replaces `foreignFence`"
---

Decided in [[T101]], 2026-11-12. Today `get_tickets` shows a foreign fence only while the Ticket has no `id`, so the keys a source tracker wrote (`labels`, `milestone`, ...) go invisible the moment `migrate_effort` mints the id, while staying in the file.

## What to build

- Surfacing is independent of id. `get_tickets` shows **Unimported keys** (frontmatter keys outside the schema, see `CONTEXT.md`) whenever a Ticket carries any.
- One heading for both cases: `## Unimported frontmatter`, replacing `## Foreign frontmatter (not imported; file unchanged)`.
  - Foreign-fenced Ticket (no `id`, a key outside the schema): the whole fence, byte for byte, as T74 built it.
  - Ticket with an `id` carrying stray keys: only the unimported entries, so id and status are not repeated.
- The Foreign predicate does not change: no `id`, plus a key outside the schema. A Ticket the server created that someone hand-annotates with an extra key is not Foreign; it only has Unimported keys.
- An ordinary write still does not normalize a foreign fence. ADR 0003 holds.
- A conforming Ticket gains nothing in its result.
- Body path only. A Board never carries these.

## Docs that go with it

- `AGENTS.md` rendering rule "A foreign fence is shown, never written" restated for both cases.
- [[T57]]'s "a write normalizes it lazily" is true for an unfenced file only; correct the text where it is restated.
- [[T74]]'s fourth criterion is reworded to what was decided, not built as written.

## Acceptance criteria

- [x] A migrated Ticket that still carries keys outside the schema shows them under `## Unimported frontmatter`, entries only
- [x] A foreign-fenced Ticket shows its whole fence under the same heading, byte for byte
- [x] A conforming Ticket's result is byte-identical to today
- [x] The block's delimiter outruns any backtick run inside it, as today
- [x] No read writes a file
- [x] `AGENTS.md` and the T74 criterion say what the code does

## Comments

Left for [[T103]], from the T102 review on 2026-11-12: the schema key list is written twice (`SCHEMA_KEYS` in `ticket.ts`, `FIELD_ORDER` in `serialize.ts`); `drop_keys` refusing a schema key would be a third reader, so single-source it first. A comment line above a stray entry is not shown in the entries-only view, and a `|+` scalar's trailing blank lines are trimmed; both are display only.
