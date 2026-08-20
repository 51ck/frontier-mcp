---
id: T69
title: migrate_effort mints under both strategies, drops rename, previews by handle
kind: build
status: open
triage: ready-for-agent
blocked_by: [T65, T62, T58]
---

**What to build:** the mechanical floor of [[T40]], as reconciled by [[T62]].

**Minting.** `migrateEffortFiles` computes `used` from `request.allTickets`
(`src/storage/markdown/migrate.ts:50`) before it plans a change, so under a random pattern it mints
inline against a scan it already takes. Under a derived pattern it does not — migration is the
largest batch mint the product performs, and T62 settles what it holds and for how long. Do not write
this Ticket from T40's text alone; T40 is written under the assumption that the guards are gone.

**An existing id is preserved, never re-minted.** `parseLegacyBody` reads it out of the heading
(`legacy.ts:14-15`). Re-minting would break every prose reference in another Effort's Map, in commit
messages and in merged PR bodies, none of which the server can rewrite. If the inferred id already
exists elsewhere in the repo, migration refuses and names both files — [[T38]]'s rule, reused.

**`rename: true` is deleted.** Renaming a Ticket in one Effort breaks a path link held in another
Effort's hand-written prose, outside any GENERATED marker, and the first Effort's migration never
reads the second. `test/fixtures/legacy/tag-customizer-ship-0-5-0/map.md` links
`../three-app-backlog/issues/17-...md` — the server cannot see it, fix it, or warn about it.
`migrate-effort.ts:11-16` already defaults the flag off for that reason; this removes the way to turn
it on. `fromName`/`toName` go with it, and `MigrationChange` gains a plain `filename`.

**Preview names an unminted Ticket by its handle, not by a predicted id.** Under randomness the two
id sources stop agreeing: preview writes nothing, so every id it draws is discarded — run it twice
against unchanged files and read two different reports. `remapEdges` (`migrate.ts:211`) points a
sibling's Edge at a predicted id, so the graph is provisional in every position, not just the column
the reader was checking. `beforeHandle` is already on the change record (`domain.ts:228`).

The report links every Ticket reference-style from one definition block — inline `[handle](path)`
collapses inside `blocked_by=`, where three Edges would put three full paths on one line. Paths are
workspace-root-relative: the tool takes `root`, and the reader's working directory is not knowable.
The `minted` flag survives, because "this Ticket will get an id" is knowable while *which* is not.

**One defect to fix while here:** T40's worked example prints handles zero-padded as
`ship-0-5-0#01`, but `handleFor` (`ticket.ts:106-108`) emits no padding — the filename pads
(`create.ts:379-380`), the handle does not. A builder copying that example renders a handle nothing
resolves.

**Blocked by:** the minting strategy; T62, which decides what T40 still means under a derived
pattern; and T58, which decides the handle separator this report is written in.

**Status:** ready-for-agent

- [ ] Migration mints correctly under both strategies, per T62
- [ ] An existing id is always preserved; a collision with an id elsewhere refuses and names both
      files
- [ ] `rename` is gone, with `fromName`/`toName`; `MigrationChange` carries `filename`
- [ ] Preview names unminted Tickets by handle, inside `blocked_by=` too, with one reference-style
      definition block and workspace-root-relative paths
- [ ] Preview run twice against unchanged files produces the same report
- [ ] Handles render unpadded, matching `handleFor`
