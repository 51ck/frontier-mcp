---
id: T27
title: listTickets returns summaries; bodies are fetched by id
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: listTickets returns TicketSummary and bodies are fetched by id through readTickets; the index caches summaries only, so get_tickets reads fresh
---

# `listTickets` returns summaries; bodies are fetched by id

**What to build:** the index caches every Ticket body in the workspace in order to serve one call
site.

`src/domain.ts` already carries the split — `TicketSummary` holds every field, and
`Ticket extends TicketSummary` adds exactly one thing, `body`. But `StorageDriver.listTickets()`
returns `Ticket[]`, and `createWorkspaceIndex` caches that array whole (`src/workspace-index.ts:57-59`).

Count the consumers. Across `src/server.ts`, `src/tools/`, `src/frontier.ts` and `src/edges.ts`,
exactly one reads `ticket.body`: `src/tools/get-tickets.ts:66`. Board rendering, Frontier
computation, Edge resolution, create-batch validation and update all work from summary fields alone
— which is the `AGENTS.md` rule that a Board never carries a body, already load-bearing.

So: `listTickets()` yields `TicketSummary`, and a separate driver method fetches bodies for named
ids. `get_tickets` is its only caller.

**What this fixes and what it does not.** Retained memory per process drops by the size of every
body in the workspace. **Scan cost does not change** — the driver still opens and parses every file
to read its frontmatter, and dropping the body is only a matter of not keeping the string. Bodies
also stop being cached at all, so `get_tickets` reads fresh, which removes a staleness window rather
than adding one.

Why now: this is the strongest of the three arguments for centralizing reads across processes, and
it turns out to be answerable locally. T19 cannot honestly measure the resident memory of a shape we
have already decided to change, so this lands first.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `StorageDriver.listTickets` returns `TicketSummary`, and the markdown driver stops retaining
      bodies from its walk
- [x] A driver method fetches bodies for named ids, and `src/tools/get-tickets.ts` is its only caller
- [x] The index caches summaries; a body is never cached
- [x] Board, Frontier, Edge, create-validation and update paths are unchanged in behaviour, shown by
      the existing tests passing untouched
- [x] `get_tickets` returns a body written by another process without waiting for an invalidation
- [x] `spec.md` and `AGENTS.md` describe the read path as it now is
