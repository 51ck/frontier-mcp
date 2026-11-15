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
<!-- /GENERATED -->

## Not yet specified

## Out of scope

- Claims visible across worktrees and a session-start digest: agreed as the next two steps, decided and built outside this Effort.

<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
<!-- /GENERATED -->
