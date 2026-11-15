---
header: map
---

# Map

## Destination

FrontierMCP 2.0 names a Ticket by its path, `<effort>.<name>`, and mints nothing. Existing ids keep resolving with no migration. The rules are ADR 0008; the evidence is `docs/research/2026-11-15-name-fidelity.md` and `docs/research/2026-11-15-ticket-id-sigil.md`.

## Notes

## Decisions so far

<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
- [Ti75suj — What makes a fence Foreign once no new Ticket carries an id](issues/01-Ti75suj-what-makes-a-fence-foreign-once-no-new-ticket-ca.md) — The predicate keeps its wording: a parsed fence is Foreign when it carries no `id` and a key outside the schema. A schema fence with no `id` is now simply a named Ticket, so the `no id (N)` warning is removed. Dropping its Unimported keys is the only way a foreign-fenced Ticket leaves the set.
- [T7idjze — A Ticket with no id is read, shown and addressed by its name](issues/02-T7idjze-a-ticket-with-no-id-is-read-shown-and-addressed.md) — Every Ticket is read, shown and addressed by name: the id when it has one, else its file stem. One resolver (`src/names.ts`) serves the Frontier, the Board, cycle checks, tool input and the driver. Id-carrying workspaces are byte-identical. Uncommitted on `feat/ticket-names`.
- [Tz2cgzr — create_tickets takes a name and writes the file that name implies](issues/03-Tz2cgzr-create-tickets-takes-a-name-and-writes-the-file.md) — `create_tickets` takes `name`, refuses `key`, and writes `<name>.md` with no prefix and no id. The exclusive create sits on the Ticket file through a hard link; nothing is minted and no guard file exists. Effort slugs are now checked before they become a path. Uncommitted on `feat/ticket-names`.
- [Tyughqp — An Edge to a name that almost exists is refused; one that plainly does not, dangles](issues/04-Tyughqp-an-edge-to-a-name-that-almost-exists-is-refused.md) — A supplied Edge that resolves to nothing is refused when it is a near miss of an existing name, an exact name in another Effort, or a Board-rendered `x@effort`; otherwise it dangles. Resolving Edges are stored once, in the shortest form, settled against the files on disk.
- [Tk2s74f — Board order comes from the Edges, with the old prefix as a hint](issues/05-Tk2s74f-board-order-comes-from-the-edges-with-the-old-pr.md) — A Board lists each Ticket below the same-Effort Tickets blocking it; ties break by the old `NN-` prefix, then name. Derived on every Board in about 1ms at 1000 Tickets on a slow core. In this repo only `T80` moved, below `T101` which blocks it.
- [To7zwid — Foreign means no parseable fence; a key outside the schema is only Unimported](issues/10-To7zwid-foreign-means-no-parseable-fence-a-key-outside-t.md) — Foreign now means only a file with no parseable fence. A key outside the schema is an Unimported key on any Ticket, shown and dropped the same way with or without an `id`, and the Board counts such Tickets in one line. No Board in this repo changes.
<!-- /GENERATED -->

## Not yet specified

## Out of scope

- Claims visible across worktrees and a session-start digest: agreed as the next two steps, decided and built outside this Effort.

<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
<!-- /GENERATED -->
