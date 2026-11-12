---
id: T101
title: When a fenced Foreign Ticket stops being Foreign, and what happens to its unimported keys
kind: decision
type: grilling
status: resolved
triage: ready-for-human
blocked_by: []
answer_gist: Foreign stays about adoption (no id + a key outside the schema); Unimported keys are surfaced by get_tickets regardless of id until an agent removes them with update_ticket drop_keys; an ordinary write never normalizes a foreign fence.
---

Found building [[T74]] on 2026-11-12. [[T57]] and [[T73]] disagree for a Ticket whose frontmatter fence is foreign, and T74's fourth criterion cannot be met as written.

## What the code does

- [[T57]] says a write to a Foreign Ticket normalizes it lazily and drops it out of the Foreign set. That holds for an unfenced Legacy file: a claim writes a full schema block.
- It does not hold for a foreign *fence*. `applyEdit` reuses the existing fence document and sets only the fields being edited, by ADR 0003's design. A comment adds nothing to the fence; `title` and `kind` add just those keys.
- [[T73]]'s predicate is "no `id`, plus a key outside the schema". So a fenced Ticket leaves the Foreign set only when it gains an id, and per T57 only `migrate_effort` mints one.
- So the `get_tickets` foreign-frontmatter block stays after every ordinary write and disappears only after `migrate_effort`. T74's tests and `AGENTS.md` record exactly that.

## The part that loses information

After `migrate_effort` the file has an id, so it is no longer Foreign and the block goes. The foreign keys (`labels`, `milestone`, whatever the source tracker wrote) are still in the fence on disk, and nothing surfaces them any more. T57's aim was to surface what was never imported until an agent decides; here it becomes invisible at the moment of migration.

Separately, and predating T74: the Board says "inferred from prose" for a foreign-fenced Ticket whose fields were in fact read from its fence.

## To decide

1. What makes a fenced Ticket conforming: gaining an id, or carrying no key outside the schema?
2. Whether unimported keys stay surfaced after migration, and if so until what: an explicit agent write that removes them, or never.
3. Whether an ordinary write to a foreign fence should normalize more than the fields it edits, given ADR 0003.

[[T77]] renames Legacy to Foreign and [[T80]] is the ADR for lazy conversion and the Foreign predicate; T80 should not be written before this is settled.

## Answer

Decided by the user in grilling, 2026-11-12.

1. **What makes a fenced Ticket conforming.** The Foreign predicate stays about adoption: no `id`, plus a key outside the schema. A Ticket the server created that someone hand-annotates with an extra key is not Foreign.
2. **Whether unimported keys stay surfaced.** Yes, as a rule independent of id. `get_tickets` shows keys outside the schema whenever they exist, so they do not vanish when `migrate_effort` mints the id. They stay shown until an agent removes them; nothing removes them on its own.
3. **Who removes one.** One optional `update_ticket` argument, `drop_keys: [...]`. The agent decides key by key. A schema key is refused, an absent name fails the call, and it is not a ninth tool.
4. **Whether an ordinary write normalizes a foreign fence.** No. ADR 0003 holds. T57's "a write normalizes it lazily" is true for an unfenced file only and is to be corrected. T74's fourth criterion is reworded, not built.
5. **Naming.** One term, **Unimported keys**, now in `CONTEXT.md`. One heading for both cases, `## Unimported frontmatter`: the whole fence byte for byte for a Foreign Ticket, only the unimported entries for a Ticket with an id. "Foreign" keeps one meaning: not yet adopted. The user accepted this naming without a strong view ("idk, ok"), so it is the cheapest of these to revisit.

Build: [[T102]] (surfacing and heading), [[T103]] (`drop_keys`), [[T104]] (the Board's "inferred from prose" wording). [[T80]] can now be written.

## Comments

Grilling round 1, 2026-11-12, decided by the user:

1. The Foreign predicate stays about adoption: no `id`, plus a key outside the schema. A Ticket the server created that someone hand-annotates with an extra key is not Foreign.
2. Surfacing unimported keys is a separate rule, independent of id: `get_tickets` shows keys outside the schema whenever they exist, so they do not vanish when `migrate_effort` mints the id.
3. An ordinary write does not normalize a foreign fence. ADR 0003 holds. T57's "a write normalizes it lazily" is true for an unfenced file only and is to be corrected; T74's fourth criterion is reworded, not built.

Still open: until when the keys are surfaced, and whether anything removes them.
