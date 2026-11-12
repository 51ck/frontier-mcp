---
id: T99
title: On Linux a recent Node 24 watcher throw kills the server
kind: build
status: open
triage: needs-triage
blocked_by: []
---

Observed 2026-11-12 in the `Release` workflow run 43210696884 on `ubuntu-latest`, Node 24.22.2. Not reproduced locally: macOS uses FSEvents and never runs this code.

## What happened

`pnpm test` ended with two uncaught exceptions:

```
Error: ENOTDIR: not a directory, lstat '/tmp/frontier-PH5AsN/.scratch/alpha/map.md/map.md'
  lstatSync node:fs:1770:25
  FSWatcher.#onFolderEvent node:internal/fs/recursive_watch:268:21
```

The test is `test/edit-map.test.ts`, "resolve succeeds with a warning when Map derived refresh fails" (T12). It puts a directory at `map.md`, then removes it and writes a file at the same path while the server is watching.

## Why

Node 24.22.2 carries a rewritten `lib/internal/fs/recursive_watch.js`. `#onFolderEvent` calls `lstatSync(file, { throwIfNoEntry: false })`, which swallows `ENOENT` and nothing else. An event from the watcher of the removed directory resolves to `map.md/map.md`, and `map.md` is by then a file, so the call throws `ENOTDIR`.

The throw happens inside Node's own event callback. The `error` listener in `src/storage/markdown/watcher.ts` never sees it, so in a running server it is an uncaught exception and the process dies.

`runtime.yml` pins 24.15.0, which has the older implementation and passes. `engines.node` admits 24.22.2.

## Not known

- Whether it fails on every run on 24.22.2 or only sometimes.
- Which 24.x release introduced the rewrite, and whether 22.x or 20.x received it.
- Whether upstream has a report or a fix.

## What to build

A server on Linux survives a directory under `.scratch/` being replaced by a same-named file, on every Node the package claims to support. `release.yml` was pinned to 24.15.0 as the stopgap; that hides the problem from the release and fixes nothing.

## Acceptance criteria

- [ ] The crash is reproduced on Linux with the Node version named, and it is known whether it is deterministic
- [ ] The runtime gate runs the suite or an equivalent check on the newest Node 24 as well as the 24.15.0 floor
- [ ] A running server survives the directory-to-file swap on that Node
- [ ] If the cause is upstream, it is reported or the existing report is linked here
