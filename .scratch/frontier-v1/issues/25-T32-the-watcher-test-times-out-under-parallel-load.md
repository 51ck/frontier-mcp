---
id: T32
title: The watcher test times out under parallel load
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: A recursive fs.watch drops changes made while it is still warming up, so the watcher now settles after every attach.
---

**The defect:** `test/watcher.test.ts` > "reflects a Ticket added or deleted on disk" fails roughly
one run in three under `pnpm test`, and passes every time the file runs alone. It fails as a
`waitFor` timeout at the full 15s budget, not as a content mismatch.

The file already anticipates this: `WAIT_MS` is 15s with a comment saying a debounced `fs.watch` is
"the first thing to lose the event loop" when test files run in parallel. The headroom is evidently
not the fix — 15s is a long time to lose an event loop, which suggests the event is dropped rather
than delayed, and that more waiting will not find it.

Observed while working T11, on a change that touches neither the watcher nor `get_board`, which is
all this test calls. Pre-existing.

Worth knowing before choosing a fix: `AGENTS.md` warns that a watcher must never write, and
[T28](21-T28-the-index-and-watcher-move-down-into-the-driver.md) moves the index and watcher down
into the driver — if that lands first, this test moves with them and the fix may want to wait for it.

- [x] The cause is identified as a dropped event or a delayed one, with evidence
- [x] The test passes repeatedly under full-suite parallelism, without simply raising the budget
- [x] If the fault is in `src/workspace-watcher.ts` rather than the test, it is fixed there

## Answer

**The event was dropped, not delayed.** Instrumenting the watcher and the driver's cache through a failing full-suite run showed the second watcher test attaching its watch, then serving cache hits for the whole 15s budget with no filesystem event ever arriving. The scan was never invalidated because nothing ever told it to.

**Why.** A recursive `fs.watch` is not delivering events the moment `watch()` returns. On macOS libuv registers the FSEvents stream off-thread and multiplexes every watch in the process onto one stream, which it tears down and rebuilds whenever a handle is added or removed. A change landing in that gap is dropped outright rather than replayed, so no amount of waiting recovers it — which is exactly why the failure was always a full-budget timeout and never a content mismatch.

**Measured**, twelve concurrent probe processes on a 12-core machine, 180 samples per bucket:

| write lands after `watch()` returns | events lost |
| --- | --- |
| 0ms | 25/180 (14%) |
| 1ms | 12/180 (7%) |
| 5ms | 2/180 (1%) |
| 25ms, 100ms, 500ms | 0/180 |

An established watcher lost nothing under the same load — 0/480 — unless another watcher opened or closed nearby, which cost it 41/480 (8.5%). The failing test writes about 5ms after its driver's watcher attaches, squarely inside the window; `afterEach` closing the previous test's watcher and the next test opening its own is the churn that widens it.

This was never only a test defect: a server started and hand-edited immediately would have served a stale Board until the *next* edit.

**The fix**, in `src/storage/markdown/watcher.ts` — the watcher stops trusting a window it cannot observe. Every successful attach schedules unconditional invalidations at `[50, 250, 1000]`ms, on the assumption that it missed something while warming up, and each pass retries the attach as well: the event a root watch stands to lose is "the storage directory appeared", and losing that one would leave the recursive watch never attached and every later change unseen forever. Two tests pin it, one for each path, both bite-checked in the failing direction.

**Two things fell out.** The test file's 15s budget was built on the wrong theory — a debounced watch losing the event loop — so it came down to 5s, which is about thirty times the slowest delivery the probe measured. And `lifecycle.test.ts`'s optimistic-check test turned out to arrange its stale cache by outrunning the watcher, which the settle made it lose once in twenty runs; it now switches the watcher's recovery off and holds the view stale by construction.

25 consecutive full-suite runs, 214 tests, no failures. The rate before was roughly two in five.

## Comments

Second failure mode observed in the same file, on a later run: "leaves the working tree byte-identical after many files change at once" timed out the same way, while "reflects a Ticket added or deleted on disk" passed. So it is the file, not one test — which points at the watcher or the harness rather than at a single assertion's budget.

Rough rate across five full-suite runs during T11: three clean, two with one timeout each, never the same test twice. Both pass when `test/watcher.test.ts` runs alone.

T28 landed (PR #18), so the third criterion's path is stale: the watcher is now `src/storage/markdown/watcher.ts`, below the seam, and takes its directory as a driver construction parameter rather than naming `.scratch` itself. Both failure modes recorded above reproduced on this branch — a cold `pnpm test` fails one watcher test, a warm one passes, and it was never the same test twice — against an `fs.watch` call byte-identical to the one before the move. So T28 neither caused nor fixed this, and the test file it lives in is unchanged apart from one added case. The suggestion to wait for T28 is now discharged: this is takeable.
