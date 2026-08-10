---
id: T32
title: The watcher test times out under parallel load
kind: build
status: open
triage: ready-for-agent
blocked_by: []
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

- [ ] The cause is identified as a dropped event or a delayed one, with evidence
- [ ] The test passes repeatedly under full-suite parallelism, without simply raising the budget
- [ ] If the fault is in `src/workspace-watcher.ts` rather than the test, it is fixed there

## Comments

Second failure mode observed in the same file, on a later run: "leaves the working tree byte-identical after many files change at once" timed out the same way, while "reflects a Ticket added or deleted on disk" passed. So it is the file, not one test — which points at the watcher or the harness rather than at a single assertion's budget.

Rough rate across five full-suite runs during T11: three clean, two with one timeout each, never the same test twice. Both pass when `test/watcher.test.ts` runs alone.

T28 landed (PR #18), so the third criterion's path is stale: the watcher is now `src/storage/markdown/watcher.ts`, below the seam, and takes its directory as a driver construction parameter rather than naming `.scratch` itself. Both failure modes recorded above reproduced on this branch — a cold `pnpm test` fails one watcher test, a warm one passes, and it was never the same test twice — against an `fs.watch` call byte-identical to the one before the move. So T28 neither caused nor fixed this, and the test file it lives in is unchanged apart from one added case. The suggestion to wait for T28 is now discharged: this is takeable.
