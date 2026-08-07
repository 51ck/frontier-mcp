---
id: T8
title: Filesystem watcher — index invalidation, never writes
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T2]
answer_gist: Debounced fs.watch invalidates index on .scratch changes; never writes; six harness tests
---

# T8 — Filesystem watcher: index invalidation, never writes

**What to build:** A hand-edit in an editor, or a `git checkout` in another window, is reflected in the
very next Board — no stale reads, no restart. The watcher invalidates index entries and does nothing
else.

It must never write. Background writes to git-tracked files with no user action behind them appear as
unexplained diffs, and a branch switch touching forty files would fire forty of them. The generated
Decisions-so-far block therefore stays stale until the next mutation through the server, which is the
cheaper failure.

- [x] A Ticket edited on disk is reflected in the next Board without restarting the server
- [x] A file added or deleted on disk updates the index
- [x] A branch switch touching many files leaves the working tree byte-identical to what git produced
- [x] The watcher performs no writes under any circumstances
- [x] Watcher activity is confined to the resolved workspace
- [x] The index remains correct after a burst of rapid changes

## Answer

Added `src/workspace-watcher.ts`: recursive `fs.watch` on `.scratch/` with debounced wholesale index invalidation. Root-level watch attaches when `.scratch/` appears later. Watcher never writes. Six MCP-layer tests in `test/watcher.test.ts` cover edit/add/delete, branch-switch byte identity, burst coalescing, no-write idle path, and confinement outside `.scratch/`. `FrontierMCP.close()` tears down watchers.
