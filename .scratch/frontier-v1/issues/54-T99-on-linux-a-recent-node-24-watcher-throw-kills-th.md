---
id: T99
title: On Linux a recent Node 24 watcher throw kills the server
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: On Linux the watcher keeps one non-recursive watch per directory instead of Node's emulated recursive watch, which from 24.22.0 throws ENOTDIR in its own callback (nodejs/node#66791); the gate runs the suite on the newest 24.x as well as the 24.15.0 floor
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

- [x] The crash is reproduced on Linux with the Node version named, and it is known whether it is deterministic
- [x] The runtime gate runs the suite or an equivalent check on the newest Node 24 as well as the 24.15.0 floor
- [x] A running server survives the directory-to-file swap on that Node
- [x] If the cause is upstream, it is reported or the existing report is linked here

## Answer

**Cause.** Upstream. On Linux `fs.watch` with `{ recursive: true }` is a JavaScript emulation, and nodejs/node#65486 rewrote it. The rewrite first shipped in 24.22.0. Its `#onFolderEvent` swallows only `ENOENT`, so a watched directory replaced by a same-named file throws `ENOTDIR` inside Node's own callback, where no `error` listener can catch it.

**Upstream.** Already reported as https://github.com/nodejs/node/issues/66791, which lists this case; the fix is open as https://github.com/nodejs/node/pull/66792. Nothing was filed from here.

**Versions.** Reproduced in Docker on the official `node:` images. A standalone script crashes on 24.22.0, 24.22.1, 24.22.2 and 24.22.3. It does not crash on 24.15.0, 24.16.0, 24.18.0, 24.20.0, 24.21.0, 22.17.1, 22.23.5 or 20.20.2.

**Determinism.** Deterministic when the removal and the write are back to back: 50 of 50 runs on 24.22.2. Timing-dependent when anything sits between them: the full suite on the old watcher hit `ENOTDIR` in 8 of 10 runs, and `test/edit-map.test.ts` alone passed 10 of 10. That the crash needs the replacement file to exist before Node handles the event is inferred, not verified.

**Fix.** `src/storage/markdown/watcher.ts`: on Linux, one non-recursive watch per directory under the storage directory, re-synced before each debounced invalidation. macOS and Windows keep the native recursive watch. No process-wide handler, no new dependency. The new test in `test/watcher.test.ts` fails 10 of 10 on the old watcher and passes 10 of 10 with the fix on 24.22.2; an independent review reproduced the failure 3 of 3 on 24.22.3 and saw the full suite pass there.

**Gate.** `runtime.yml`'s development job runs on 24.15.0 and on the newest 24.x. `release.yml` stays pinned to 24.15.0, the only Node the gate is sure to have tested.

**Not verified.** Windows at runtime, the 26.x line, and the new Linux path on Node 20 and 22 beyond the existing package jobs.

**Left open.** Review found two Linux gaps that predate this change and behave the same on master: a directory replaced in place by another directory stops being watched, and a storage directory removed and recreated is never seen again. Filed separately.
