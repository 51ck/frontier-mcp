---
id: T106
title: "Per-file invalidation: re-parse only the Tickets whose revision changed"
kind: build
status: open
triage: needs-info
blocked_by: []
---

Filed from [[T29]], 2026-11-12, as the one narrower change the evidence supports. **Not to be taken until a real repository shows re-scan cost.** That evidence is the missing info.

## Why it is parked

Today the watcher drops the driver's whole scan and the next read rebuilds it. A walk that only stats files, parsing nothing, costs about 1ms at this repo's size and about 3.5ms at 1000 Tickets (`docs/research/2026-11-12-markdowndb-as-driver-engine.md`). Re-parsing only files whose revision changed would cut a re-scan from tens of milliseconds to a few. At this repo's size the saving is about 12ms per write, which nobody feels. At 1000 Tickets it is about 60ms on a performance core and about 450ms on a slow one.

## What it addresses and what it leaves

- Addresses: the cost of each re-scan.
- Leaves: N processes each re-scanning on every write, resident memory per process, N recursive `fs.watch` handles.

## Constraints

- Stays inside the markdown driver. No external engine, no index on disk, no shared process (T29).
- The ADR 0004 and ADR 0006 guards are untouched: the revision check reads the file itself immediately before a write, never the model.
- `readTickets` keeps walking fresh, so `get_tickets` never serves prose another process rewrote.
- `.scratch/frontier-v1/spec.md:236` already says the index is "invalidated per file". It is not. Correct that line when this is built, or sooner if this is dropped.

## Acceptance criteria

- [ ] A measured re-scan cost from a repository other than this one is recorded on this Ticket before it is taken
- [ ] After a single-file change, only that file is re-parsed; a create, delete and rename are each handled
- [ ] `pnpm run bench:scan` shows the re-scan numbers before and after, slow cores included
- [ ] Both cross-process tests pass unchanged
