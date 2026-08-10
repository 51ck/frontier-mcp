---
id: T19
title: What a workspace scan actually costs
kind: decision
type: task
status: open
triage: ready-for-agent
blocked_by: [T27, T28]
---

## Question

Two architecture questions rest on a number nobody has measured, and the codebase asserts an answer
to it in three places without citing one: `AGENTS.md:167-168` ("A full scan is single-digit
milliseconds at these volumes"), `src/workspace-index.ts:19-26`, which repeats it as the
justification for invalidating wholesale, and ADR 0005, which repeats it again for allocation cost.

What does a full workspace scan cost, and how often does it actually happen when several sessions
share one repo?

Invalidation is **wholesale** rather than per file (`src/workspace-index.ts:19-26`, despite
`spec.md:229` claiming otherwise), and every write from any process trips every other process's
watcher. So N sessions means N full re-scans per write, plus N recursive `fs.watch` handles on one
tree.

That may be 5ms and irrelevant, or 500ms and the whole argument. Measure it.

**Measure the shape that will exist, not the one that did.** This Ticket is blocked by T27 and T28
deliberately. T27 stops the index caching Ticket bodies, which removes the largest contributor to
resident memory; T28 moves the cache and the watcher into the driver. Measuring before those land
would report the cost of a shape already decided against, and would overstate the case for
centralizing reads.

**Who is waiting on this.** `frontier-hive` gates its entire go/no-go on the scan and memory numbers
below — if the assertion holds, the honest outcome there is closure. `frontier-web`'s T23 needs the
staleness window, to know whether a browser can be updated from the watcher at all.

## Acceptance criteria

- [ ] Cold scan, warm (cached) call, and post-invalidation re-scan timed against `frontier-v1` and
      against synthesized workspaces at roughly 200 and 1000 Tickets
- [ ] Resident memory per process recorded at each size, against the post-T27 shape where bodies are
      not cached
- [ ] Scan cost with N sessions sharing one repo, at N = 1, 2 and 4, since every write trips every
      watcher
- [ ] The observed staleness window measured end to end: write in one process, until a second
      process returns fresh data — including the 50ms debounce (`src/workspace-watcher.ts:27`)
- [ ] A stated judgement on whether that window is visible to a human watching a browser
- [ ] A stated judgement on whether the numbers justify centralizing reads across processes, which is
      the input `frontier-hive` is blocked on
- [ ] `AGENTS.md:167-168` either cites the measurement or is corrected
- [ ] Findings recorded on the Ticket; any throwaway benchmark harness linked, not pasted
