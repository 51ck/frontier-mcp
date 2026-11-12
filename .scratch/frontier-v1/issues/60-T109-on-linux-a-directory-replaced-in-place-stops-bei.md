---
id: T109
title: On Linux a directory replaced in place stops being watched
kind: build
status: open
triage: needs-triage
blocked_by: []
---

Found 2026-11-12 by the review of T99's fix. Both gaps predate that fix: the same probes against master's watcher on Linux, Node 24.15.0, give the same results. macOS passes all of them.

## What happens

Reproduced by calling `watchStorage` directly on Linux, Node 24.22.3.

1. **A directory swapped for another directory.** `rm -rf alpha/issues && mkdir alpha/issues` inside one debounce window, then a write to `alpha/issues/02.md`: no invalidation. Likewise `mv alpha old && mv other alpha`, then a write to `alpha/issues/03.md`. A `git checkout` or a restore from backup does exactly this.
2. **The storage directory removed and recreated.** After `.scratch/` is removed and made again, no later change is seen.

In both cases the Board stays stale until the server restarts.

## Why

1. `resync` in `src/storage/markdown/watcher.ts` keys watchers by path, and `watchers.has(path)` keeps the old `FSWatcher`. That watcher points at an inode the kernel has already dropped the watch for.
2. `visit(dir)` always marks the root as seen, so the root's stale watcher is never closed and `resync()` keeps returning true. Even if it returned false, nothing re-attaches the root watch, so the storage directory reappearing would go unseen.

## What to build

On Linux, a write under a directory that replaced a watched one invalidates the scan, and so does a write under a storage directory that was removed and recreated.

The reviewer's suggested routes, not yet weighed: close and drop a per-directory watcher when an event names the watched directory itself or is a `rename`, so the next resync re-adds it, or key watchers by inode. For the root, return false from the resync when reading the root fails, and re-run the root-watch setup when the storage watch is torn down.

## Acceptance criteria

- [ ] A test through the harness fails on Linux before the change for the directory-for-directory swap, and passes after
- [ ] A test through the harness fails on Linux before the change for the storage directory removed and recreated, and passes after
- [ ] inotify watch counts stay flat across repeated swaps and reach zero after close
- [ ] macOS and Windows behaviour is unchanged

## Also noted by the same review

The second half of T99's test waits `DEBOUNCE_MS * 4` before writing into the new directory. On a slow runner the write can land before the resync and still be picked up by the scan that follows, so the test can pass without exercising the new directory's watch. Waiting for the Board to show a marker file first would close that.
