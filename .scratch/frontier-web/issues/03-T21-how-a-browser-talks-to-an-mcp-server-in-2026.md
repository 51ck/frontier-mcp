---
id: T21
title: How a browser talks to an MCP server in 2026
kind: decision
type: research
status: open
triage: ready-for-agent
blocked_by: []
---

## Question

A browser cannot speak stdio, and `spec.md:399` currently rules HTTP transport out of scope. What
are the real options, and is MCP even the right wire for a human-facing client?

Find out:

- The current state of streamable HTTP transport and SSE in the MCP spec, and what the SDK supports
  today.
- What protocol revision `2026-07-28` changed beyond deprecating Roots via SEP-2577
  (`src/workspace.ts:23-25`).
- Whether a browser should speak MCP at all, versus a plain HTTP + SSE app sitting beside the server
  and sharing the ADR 0001 driver seam (`src/storage/driver.ts:64-141`) — which is already an
  interface of domain operations, not paths.
- How other MCP servers ship human-facing UIs, if any do.

AFK — resolve with a `/research` subagent on a throwaway `research/browser-transport` branch, with a
context pointer back to this Ticket.

## Acceptance criteria

- [ ] Transport options are named with their current support status, sourced from primary docs
- [ ] A recommendation on MCP-as-wire versus HTTP-app-beside-the-seam, with reasoning
- [ ] Findings captured as a markdown file on the research branch and linked here
