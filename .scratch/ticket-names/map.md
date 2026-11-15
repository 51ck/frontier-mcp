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
- [Td5xifi — The id pattern, its guards and its warnings are removed](issues/06-Td5xifi-the-id-pattern-its-guards-and-its-warnings-are-r.md) — The pattern language, both minting plans, the counter, reservations and guards are deleted, with `isId`, `mergeCollidingIdPattern` and `InvalidWorkspaceConfig` off the seam. `frontier.yml` only produces one Board warning and never refuses a write. Ids of every shape 1.x minted still resolve.
- [Tjgohfq — migrate_effort normalizes without minting](issues/07-Tjgohfq-migrate-effort-normalizes-without-minting.md) — `migrate_effort` mints nothing. It gives a fenceless file its schema frontmatter and rewrites a bare sort-order Edge to the name of the one Ticket carrying that prefix. Both verbatim fixture Efforts keep the same Edges and Frontier as under minting, with every body byte-identical.
- [To7zwid — Foreign means no parseable fence; a key outside the schema is only Unimported](issues/10-To7zwid-foreign-means-no-parseable-fence-a-key-outside-t.md) — Foreign now means only a file with no parseable fence. A key outside the schema is an Unimported key on any Ticket, shown and dropped the same way with or without an `id`, and the Board counts such Tickets in one line. No Board in this repo changes.
- [Tijope9 — The packaged runtime check creates Tickets by name](issues/11-Tijope9-the-packaged-runtime-check-creates-tickets-by-na.md) — The packaged runtime check creates by name, asserts the file path and the absence of `id`, and races four server processes for one name expecting one winner and no leftover file. It passes locally on Node 24.15.0; the other eight CI legs are unverified until the branch is pushed.
<!-- /GENERATED -->

## Not yet specified

## Out of scope

- Claims visible across worktrees and a session-start digest: agreed as the next two steps, decided and built outside this Effort.

<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
<!-- /GENERATED -->
