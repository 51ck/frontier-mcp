---
id: T19
title: What a workspace scan actually costs
kind: decision
type: task
status: resolved
triage: ready-for-agent
blocked_by: [T27, T28]
answer_gist: A re-scan is 12.94ms median at this repo's size, not single-digit; the claim was wrong at every one of its five sites but the conclusions survive, the staleness window is invisible to a human at real volumes, and neither CPU nor retained memory justifies centralizing reads — frontier-hive should close as no-go
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

- [x] Cold scan, warm (cached) call, and post-invalidation re-scan timed against `frontier-v1` and
      against synthesized workspaces at roughly 200 and 1000 Tickets
- [x] Resident memory per process recorded at each size, against the post-T27 shape where bodies are
      not cached
- [x] Scan cost with N sessions sharing one repo, at N = 1, 2 and 4, since every write trips every
      watcher
- [x] The observed staleness window measured end to end: write in one process, until a second
      process returns fresh data — including the 50ms debounce (`src/workspace-watcher.ts:27`)
- [x] A stated judgement on whether that window is visible to a human watching a browser
- [x] A stated judgement on whether the numbers justify centralizing reads across processes, which is
      the input `frontier-hive` is blocked on
- [x] `AGENTS.md:167-168` either cites the measurement or is corrected
- [x] Findings recorded on the Ticket; any throwaway benchmark harness linked, not pasted

## Answer

Harness: [`bench/scan-cost.ts`](../../../bench/scan-cost.ts), `pnpm run bench:scan`. Numbers and machine attribution live in the scan-cost paragraph of [AGENTS.md](../../../AGENTS.md), which is now the only place they are written down; the four other sites cite it. Node v24.15.0, darwin arm64, Apple M4 Pro, 12 cores, 24GB, n=30 per group.

### The number

Against this repo's own `.scratch/` — 33 Tickets, 3 Efforts, 102KB — a cold scan is **8.91ms median / 14.97ms p95**, the re-scan an invalidation provokes is **12.94ms / 17.28ms**, and a warm read off the cache is **0.01ms**. Synthesized at the same mean Ticket size: 18.80ms cold / 31.96ms re-scan at 200 Tickets, **78.73ms / 100.88ms at 1000**. Roughly linear in Ticket count above a ~7ms floor.

So "single-digit milliseconds" is **wrong**. It is true only of the median of the *cold* case at current size, and the operative number for anything reacting to a write is the re-scan, which is not single-digit even here and is an order of magnitude out at 1000 Tickets. It was wrong in five places, not the three this Ticket named: `AGENTS.md`, both doc comments in `watcher.ts`, ADR 0005, and ADR 0001. ADR 0005's was the worst — allocation takes *two* scans per batch, so 18–26ms here and 158–202ms at 1000, never single-digit at any volume.

The conclusions the claim was propping up all survive, for reasons the numbers now actually support. The settle schedule is bounded by three re-scans, ~39ms, and costs that only for a caller reading between every pair of them — an invalidation drops the scan rather than taking one, so a session that first reads after the schedule has run out pays a single 12.94ms re-scan. Per-file event granularity still buys nothing against a 13ms wholesale drop. Creation is genuinely the rarest call on the surface, so allocation pays its two scans where a read would pay on every call.

### Memory

A completed scan retains **1.2MB of heap here, 5.2MB at 1000 Tickets**. The RSS deltas are much larger — 5.5MB, 12.0MB, 96.5MB — but that is transient scan buffers Node has not handed back to the OS, not retained cost. Quoting RSS here would overstate the resident footprint by roughly twentyfold at 1000 Tickets. The post-T27 shape is doing its job: bodies are never cached, so what stays resident is summaries.

### N sessions, and the staleness window

At this repo's size one write costs all watching sessions **12.95ms combined at N=1, 23.30ms at N=2, 64.95ms at N=4** — real separate processes, each with its own driver and its own recursive watch. At 1000 Tickets, N=4, that is 597.40ms combined. Staleness end to end, write completed until another process returns fresh data, is **76.56ms median / 88.06ms p95 at N=1** and **80.99ms / 88.60ms at N=4**; at 1000 Tickets with four sessions, 212.91ms / 244.99ms.

**Judgement — is the window visible to a human watching a browser?** No, not at any volume these repos are near. 77ms sits under the ~100ms at which a UI stops reading as instantaneous, and it barely moves as sessions are added. The floor is the debounce, not the scan: 50ms of that 77ms is `DEFAULT_DEBOUNCE_MS`, so shrinking the scan cannot buy much and the number degrades with Ticket count rather than with session count. At 1000 Tickets with four sessions it becomes perceptible lag at ~213ms, still far below the ~1s that breaks flow. **`frontier-web`'s T23 is unblocked: a browser can be driven from the watcher.**

**Judgement — do the numbers justify centralizing reads across processes?** No, and not marginally. At real volumes four sessions between them pay 65ms per write and retain 1.2MB each, against writes that arrive at human pace. Neither figure is within an order of magnitude of paying for a shared read process, its IPC, or its failure modes. The crossover is around 1000 Tickets — thirty times every Ticket this repo holds, forty times its largest single Effort — and even there the cost is ~150ms per session per write and 5.2MB retained. **`frontier-hive` should close as a no-go on these numbers**, which was the honest outcome its own Map named if the assertion held. The assertion did not hold, and it still does not justify the work: what was wrong about it was off by 4ms at this size, not by the factor centralization would need.

### What would make these numbers wrong

No scan here is OS-cold — dropping the page cache needs root — so every figure is the optimistic end by an unknown margin. The re-scan is consistently slower than the cold scan at every size, because `invalidate()` drops the previous scan just as an equally sized one is allocated and both are briefly live; production does exactly that, so the number is representative rather than an artifact, but it means cold and re-scan bracket one operation rather than naming two. In groups 3 and 4 the writer is the harness rather than one of the N sessions, so this measures N watchers plus an external writer — a session doing its own write invalidates through `moved()` and pays no debounce, which is strictly cheaper than what is reported.
