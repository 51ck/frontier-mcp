---
id: T37
title: ADR 0005's allocation machinery is deleted, not kept
kind: decision
type: grilling
status: resolved
triage: ready-for-agent
blocked_by: [T35]
answer_gist: All of it goes — guards, the re-scan under guards, MAX_ATTEMPTS, CANDIDATE_HEADROOM and the never-reclaim rule exist only to serialize a derived counter, so creation drops from two full workspace scans to one and ADR 0005 is superseded rather than amended
---

## Question

Guards, the re-scan while holding every guard, `MAX_ATTEMPTS`, `CANDIDATE_HEADROOM`, the
never-reclaim-a-guard rule — all of it exists to serialize a derived counter. With no counter, does
any of it still earn its place as belt and braces?

## Acceptance criteria

- [x] Kept or deleted, decided
- [x] The cost change is stated against the measured numbers in ADR 0005
- [x] The disposition of ADR 0005 itself is settled — amended, or superseded by a new ADR

## Answer

**Deleted.** Every part of the machinery exists to serialize a *derived counter*, and there is no longer a counter. Nothing in it defends against anything else:

- the `.scratch/.frontier-id-T<n>.guard` exclusive create
- the re-scan taken **while holding every guard**, which was the compare-and-set
- `MAX_ATTEMPTS` (8) and `CANDIDATE_HEADROOM` (1000) in `src/storage/markdown/create.ts`
- the rule that a guard is never reclaimed, only bumped past — and with it the crashed-session id skip

What replaces it is one line of protocol: mint, check the candidates against the scan the batch was already going to take, re-mint on a hit. The re-mint branch is effectively dead code at 1 in 22 million per mint, but it costs nothing to keep and it is what makes same-tree duplicates impossible rather than merely unlikely.

**Cost.** ADR 0005 measures allocation at two full workspace scans per batch — 18–26ms at this repo's size and 158–202ms at 1000 Tickets, both figures doubled from single-scan timings. Dropping to one scan returns those to the measured single-scan numbers: roughly 9–13ms now and 79–101ms at 1000 Tickets. The benchmark is `bench/scan-cost.ts` and the machine is named in `AGENTS.md`; the new ADR should re-measure rather than halve on paper.

A second, unpriced win: `.scratch/` stops accumulating guard files that a crashed session strands. Those files are not gitignored, so today a crash leaves an untracked artefact in the tracker directory as well as an unusable id number.

**ADR 0005 is superseded, not amended.** Its reasoning is correct and worth keeping legible — the argument about why the exclusive create cannot sit on the Ticket file, and the argument about why no scheme for reclaiming a guard can be made safe, are both good and both stop applying. Editing them into a document about random ids would leave a text that argues for something it no longer does. A new ADR states the new mechanism and links back.

Three things in ADR 0005 survive it and must be re-homed rather than lost: the **two-phase all-or-none write** (stage every file, then rename), the **Effort directory created after validation** so a refused batch invents no Effort, and the **`validate` hook** that closes the dangling-Edge-becomes-a-cycle case at mint time. None of those are about counters.
