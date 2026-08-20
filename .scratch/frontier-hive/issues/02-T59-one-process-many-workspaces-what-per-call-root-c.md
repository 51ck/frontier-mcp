---
id: T59
title: One process, many workspaces — what per-call root commits us to
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: []
---

## Question

`resolveWorkspace` takes the workspace from an explicit `root` argument first, then `FRONTIER_ROOT`, then the working directory walked upward to a root marker (`src/workspace.ts:34-46`). `root` is a **per-call** argument, so one server process serves any number of workspaces without restarting, and the comment at `:41` states this as intent rather than accident — a client that moves to another worktree retargets a call rather than relaunching.

That model has never been argued on its own. It has been leaned on: [[T54]] used exactly this cardinality to kill the environment variable and the server argument as homes for the repo's id pattern, on the ground that one process-wide slot cannot answer a per-workspace question. The reasoning is sound and the conclusion is probably right, but a load-bearing property deserves a Ticket of its own rather than a supporting role in someone else's.

Three consequences worth arguing.

**Drivers accumulate and nothing evicts them.** `createDriverRegistry` (`src/driver-registry.ts:16-33`) keeps a `Map` from root to driver, creates on miss, and clears only in `closeAll()`. Each driver holds its own scan cache, its own write queue, and its own `fs.watch` on the storage directory (`src/storage/markdown/driver.ts:157`). A long-lived session that touches many workspaces therefore holds a watcher per workspace for the life of the process. Whether that is a real cost or a theoretical one is measurable, and this Effort already has the habit of measuring before deciding.

**Any directory on the machine is reachable.** `requireDirectory` checks only that the path resolves to a directory (`workspace.ts:92-97`); nothing constrains `root` to the session's own tree, and a workspace with no `.scratch/` is explicitly supported as "a fresh project" (`:50`). So a client that can call a tool can point the server at any directory the process can read. That may be exactly right for a local stdio server, and it is a different proposition over any other transport, which `frontier-web` will meet.

**MCP Roots was ruled out and the reason should be re-read, not re-argued.** `workspace.ts:44-47` records that Roots is deprecated as of protocol revision `2026-07-28` (SEP-2577), which directs implementations to pass directories through tool parameters or server configuration instead. That is the strongest single argument for the current design; this Ticket should confirm the citation still holds rather than reopen it.

This sits beside T29 rather than under it. T29 asks whether *separate processes* should share one driver; this asks what *one process* serving many workspaces already commits us to. Neither gates the other.

## Acceptance criteria

- [ ] Whether per-call `root` stays the workspace model is decided, with the SEP-2577 citation re-verified
- [ ] The unbounded driver registry is ruled on — evict, cap, or accept, with the reason stated
- [ ] What constrains a `root` argument, if anything, is decided for the stdio transport and flagged for any other
- [ ] The consequences [[T54]] drew from this property are confirmed or corrected
