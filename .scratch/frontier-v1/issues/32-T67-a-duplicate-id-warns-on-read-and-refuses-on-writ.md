---
id: T67
title: A duplicate id warns on read and refuses on write
kind: build
status: open
triage: ready-for-agent
blocked_by: [T66]
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


- [ ] A read warns on a duplicate id and names every claimant file, not the first
- [ ] A write refuses and names both files
- [ ] Handle resolution no longer silently takes the first match
- [ ] Nothing renumbers, and the reason is recorded at the code
- [ ] `migrate_effort` reuses this rule unchanged when an inferred id already exists elsewhere
