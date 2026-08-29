# Migration field report

Findings from migrating a real repo onto the FrontierMCP schema, filed as evidence rather than as
opinions. Everything here was observed, not predicted.

## Where it came from

`tag-customizer` (a pnpm workspace, private) adopted FrontierMCP on 2026-08-29 and migrated its
whole tracker in one session: **191 Tickets across 20 Efforts**, every one in the pre-schema format —
freeform `Status:` prose lines, `NN-<slug>.md` filenames, no frontmatter, no ids. `migrate_effort`
ran per Effort with `rename` left off; ids came out `T1`–`T191` with no gaps and no duplicates.

That repo's tracker had been in daily use for months, so its Tickets carry the wear a synthetic
fixture does not: seventeen distinct `Status:` values, milestone labels that predate ids, priority
markers living in the status field, and 249 markdown links between Ticket files.

## What this Effort is for

Five Tickets, each a thing the migration got wrong or could not express, with the concrete case
attached. They are independent — no Edges — and none is a proposal to reverse a decision already
taken on `frontier-ids`. Where one touches settled ground it says so and defers.

The unifying theme, if there is one: **the migration reported success on all 191.** Every failure
below is silent. A board can be wrong and clean at the same time, and a full-repo verification pass
across all twenty Efforts reported `ALL BOARDS CLEAN` while thirteen Tickets pointed at the wrong
board.

## Not in scope

Anything the uncoordinated-id work already answers. `rename` removal, lazy conversion, Legacy
becoming Foreign, and per-Ticket migration writes were read first on `frontier-ids` and are not
re-argued here.
