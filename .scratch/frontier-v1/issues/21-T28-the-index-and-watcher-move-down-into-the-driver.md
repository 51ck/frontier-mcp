---
id: T28
title: The index and watcher move down into the driver
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T27]
answer_gist: The markdown driver holds its own scan and watcher; `WorkspaceIndex` is gone and the storage directory is a construction parameter.
---

# The index and watcher move down into the driver

**What to build:** `src/workspace-index.ts` presents itself as a driver-agnostic layer above the
ADR 0001 seam, and it is not one.

The evidence is in its imports. It pulls in `src/workspace-watcher.ts`, which hardcodes
`const SCRATCH = '.scratch'` (`:4`) and calls `node:fs.watch` — a filesystem watcher for a directory
name the seam exists to hide. Its caching strategy leaks the same way: it caches `listEfforts()` and
`listTickets()` wholesale because a full markdown scan is cheap and per-file invalidation is not
worth it (`:19-26`). A SQLite driver would want none of that. It would query, and let its own page
cache do the caching.

So the layer is markdown policy wearing a generic interface. Push it down. The driver becomes *the
workspace, cached and live* — physical model, revision semantics, guards, cache, and whatever
"something changed" means for that model. Above it sits tools, rendering and transport, and nothing
else.

**Scope of the `.scratch` de-hardcoding.** The driver's own constant
(`src/storage/markdown/driver.ts:49`) and the watcher's (`src/workspace-watcher.ts:4,28,63`) become
driver construction parameters. `src/workspace.ts:8`'s `ROOT_MARKERS` stays exactly as it is: the
upward walk is looking for "a repo this tool serves", which is a different question from "what does
this driver call its storage", and making it configurable would need the marker name before any
driver exists to be asked for it.

This stands on its own merits — the leaky watcher is a design defect today, whether or not anything
is ever centralized. It also blocks T19, and it is what makes the shared-driver question in
`frontier-hive` expressible in one sentence: share one driver instance across processes.

**Blocked by:** the body split — same files, and the smaller change should land first, against a
simpler shape.

**Status:** ready-for-agent

- [x] `WorkspaceIndex` no longer exists as a layer above `StorageDriver`; caching and change
      notification belong to the driver
- [x] `src/workspace-watcher.ts` no longer names `.scratch`; the directory arrives as a driver
      construction parameter
- [x] `src/storage/markdown/driver.ts:49` takes that same parameter rather than a module constant
- [x] `src/workspace.ts`'s `ROOT_MARKERS` is untouched, and the reason is recorded
- [x] Nothing above the seam imports `node:fs`
- [x] The `AGENTS.md` module table and the ADR 0001 description match the shape that now exists
- [x] T8's watcher harness tests pass against the relocated watcher

## Answer

`src/workspace-index.ts` is deleted. The markdown driver holds the scan a Board is built from, drops it on every write, and owns the watcher that drops it when another process writes — so the seam covers the physical model, its cache, and what "something changed" means for it. `StorageDriver` gained `close()`; `src/driver-registry.ts` replaces the index registry as a lookup that hands back the driver itself, with nothing passing through it.

`src/workspace-watcher.ts` moved to `src/storage/markdown/watcher.ts` and names no directory: `watchStorage(root, storageDir, invalidate, debounceMs)` takes it from the driver. `createMarkdownDriver(root, { storageDir, watcherDebounceMs })` defaults `storageDir` to `.scratch`. Below the seam the identifier for that path is `storage`, and the one error message that named `.scratch/` to a user now names the directory the driver was given.

`readTickets` keeps the fresh walk it always had rather than reading the cached scan, which is what makes `get_tickets` unable to serve prose another process has rewritten. `src/workspace.ts`'s `ROOT_MARKERS` is byte-identical, with the reason recorded at the constant.

Two harness tests were added: a driver constructed with `.tracker` serves Boards out of it while a decoy `.scratch/` goes unread, and the watcher watches the directory it was given.

## Comments

On "Nothing above the seam imports `node:fs`": ticked under the reading the ticket body itself implies, not literally. Two modules above the seam still import it, and both are ones this ticket protects: `src/workspace.ts`, whose upward walk is asked before any driver exists to be asked (the same paragraph that keeps `ROOT_MARKERS` a constant), and `src/tracker-doc.ts`, which reads a document shipped inside the installed package and never a served repository. Neither touches tracker storage, so neither is a route around the seam. AGENTS.md now records them as the only two, and says a third is a design signal rather than a third exception.
