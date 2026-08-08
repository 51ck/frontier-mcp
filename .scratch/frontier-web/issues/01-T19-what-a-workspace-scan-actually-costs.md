---
id: T19
title: What a workspace scan actually costs
kind: decision
type: task
status: open
triage: ready-for-agent
blocked_by: []
---

## Question

The architecture decision rests on a number nobody has measured. What does a full workspace scan
cost, and how often does it actually happen when several sessions share one repo?

The index caches fully parsed Tickets **including their whole markdown bodies**
(`src/domain.ts:85-87`), invalidation is **wholesale** rather than per file
(`src/workspace-index.ts:19-26`, despite `spec.md:229` claiming otherwise), and every write from any
process trips every other process's watcher. So N sessions means N full re-scans per write, plus N
recursive `fs.watch` handles on one tree.

That may be 5ms and irrelevant, or 500ms and the whole argument. Measure it.

## Acceptance criteria

- [ ] Cold scan, warm (cached) call, and post-invalidation re-scan timed against `frontier-v1` (18
      Tickets) and against synthesized workspaces at roughly 200 and 1000 Tickets
- [ ] Resident memory per process recorded at each size, since whole bodies are cached
- [ ] The observed staleness window measured end to end: write in one process, until a second
      process returns fresh data — including the 50ms debounce (`src/workspace-watcher.ts:27`)
- [ ] A stated judgement on whether that window is visible to a human watching a browser
- [ ] Findings recorded on the Ticket; any throwaway benchmark harness linked, not pasted
