---
id: T67
title: A duplicate id warns on read and refuses on write
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T66]
answer_gist: A duplicated id shows as one capped Board warning naming claimant files, every write addressed to it refuses with `DuplicateId` naming both files, both claimants keep the real id with no handle reaching one, and the graph weighs every claimant so a duplicate never enlarges the Frontier
---

**What to build:** [[T38]], which is not built at all today and has nothing to lean on.

`indexById()` (`src/frontier.ts:17`) keeps the first id it sees and drops the rest silently.
`collectWarnings()` (`src/tools/get-board.ts:150`) emits six warning classes and none of them is a
duplicate id. The write path resolves a handle by first match (`src/storage/markdown/driver.ts:577`).
So two Tickets answering to one id is currently invisible in every direction.

**Split by direction.** A read warns and shows every claimant. A write refuses and names both files.
Nothing repairs a duplicate automatically — renumbering cannot reach the commit messages and PR
bodies that already name the id, and T38 ruled the CI repair tool out of scope because the format
change removes the case it was for.

This is the complementary half of [[T53]]'s guards, and the two do not substitute for each other:
guards prevent same-tree duplicates, this detects cross-tree ones that arrived by merge, which no
guard can prevent because the two writers were never in the same tree. A derived pattern needs both.

T53 also settled why the refusal cannot replace a guard: detection needs a scan, the race is between
that scan and the write, and the write's path is `<NN>-<id>-<slug>.md` inside an Effort directory
(`create.ts:137`) — not a function of the id, so exclusive create excludes nothing.

**Blocked by:** which strings count as one id is the driver's question now.


- [x] A read warns on a duplicate id and names every claimant file, not the first
- [x] A write refuses and names both files
- [x] Handle resolution no longer silently takes the first match
- [x] Nothing renumbers, and the reason is recorded at the code
- [x] `migrate_effort` reuses this rule unchanged when an inferred id already exists elsewhere

## Answer

Read: the markdown driver computes duplicates from the cached scan and adds one line to `workspaceWarnings()`: at most 3 ids with files, 10 more by name, then a count. Under a counted pattern it names the pattern as the likely cause (T56's one-way cross-reference). `get_tickets` shows every claimant once.

Write: `locate()` collects every match and throws `DuplicateId`. `StorageDriver.assertAddressable()` lets `update_ticket` surface it before any status rule judges one claimant, without writing. `migrate_effort` refuses on an inferred duplicate; its preview reports the conflict beside the rest of the plan.

Graph: an Edge to a duplicated id is satisfied only when every claimant is resolved, cycle checks follow every claimant's Edges, and a Ticket whose own id is duplicated is never takeable.

Nothing renumbers: a new id cannot reach the commit messages and PR bodies that already name the old one.

Review found and fixed: a same-Effort duplicate was getting a fake `T5.2` handle that wrote successfully; the first duplicate probe was an empty edit that rewrote the file; the warning was unbounded.

Left as is: `renderEdge` and the "blocked by a dropped Ticket" warning in `get-board.ts` still read the first claimant, so with one resolved and one dropped claimant the orphan warning depends on scan order. The duplicate warning is present either way.
