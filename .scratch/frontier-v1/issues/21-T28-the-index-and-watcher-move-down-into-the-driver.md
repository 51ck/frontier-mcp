---
id: T28
title: The index and watcher move down into the driver
kind: build
status: open
triage: ready-for-agent
blocked_by: [T27]
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

- [ ] `WorkspaceIndex` no longer exists as a layer above `StorageDriver`; caching and change
      notification belong to the driver
- [ ] `src/workspace-watcher.ts` no longer names `.scratch`; the directory arrives as a driver
      construction parameter
- [ ] `src/storage/markdown/driver.ts:49` takes that same parameter rather than a module constant
- [ ] `src/workspace.ts`'s `ROOT_MARKERS` is untouched, and the reason is recorded
- [ ] Nothing above the seam imports `node:fs`
- [ ] The `AGENTS.md` module table and the ADR 0001 description match the shape that now exists
- [ ] T8's watcher harness tests pass against the relocated watcher
