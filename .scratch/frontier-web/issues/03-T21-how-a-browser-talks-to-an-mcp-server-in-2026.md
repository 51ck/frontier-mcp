---
id: T21
title: How a browser talks to an MCP server in 2026
kind: decision
type: research
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: "The browser should not speak MCP: serve a loopback HTTP+SSE read-only app off the ADR 0001 driver seam, beside the tool layer, keeping MCP stdio-only"
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

## Answer

Findings: `docs/research/browser-transport.md` on branch `research/browser-transport` (commit `ce3cf13`), 510 lines with primary sources dated.

**Recommendation — the browser does not speak MCP.** One long-lived process constructs the driver, index and watcher once, and serves two front doors over that single instance: the existing `StdioServerTransport`, unchanged, and a loopback HTTP listener serving the SPA, a small read-only JSON API, and one SSE endpoint fired when the watcher invalidates. The browser holds no MCP client — it fetches JSON and listens to one `EventSource`. Behind a separate entry point; the stdio path never grows a listening socket.

**The four load-bearing reasons:**

1. *The MCP tool surface is deliberately the wrong shape for a human.* `AGENTS.md:135-136` fixes the tool count at eight permanently, and every rendering rule at `AGENTS.md:224-241` is a token-saving compromise — Boards carry no bodies, warnings are grouped, output is pre-rendered prose. A human UI wants the opposite. Serving the browser through MCP means a forbidden ninth tool, or an optional argument whose schema text every agent session then pays for, or a browser parsing text rendered for an LLM.

2. *The driver seam is already the right seam, and it is not the tool seam.* `src/storage/driver.ts:64-141` offers exactly `listEfforts` + `listTickets` + `readMap` + `readSpec`. `AGENTS.md:222` forbids `src/tools/` importing `src/storage/`, so an HTTP layer reading the driver sits **beside** the tool layer at the same altitude, rather than making the tool layer a load-bearing dependency of the UI.

3. *MCP's live-update story is worse than SSE's here.* `subscriptions/listen` assumes Tickets modelled as MCP resources with URIs — a burden this repo does not otherwise carry (it has exactly one resource, `tracker-doc`, which is packaging, not tracker data). Revision `2026-07-28` **removed** stream resumability, so MCP now promises less than a bare `EventSource`, which at least auto-reconnects.

4. *MCP-as-wire drags in an SDK migration nothing else needs.* Verified locally: the pin is `^1.30.0` and the installed `LATEST_PROTOCOL_VERSION` is `2025-11-25`. Speaking `2026-07-28` requires the v2 scoped family (`@modelcontextprotocol/server`/`client`/`node`@2.0.0, GA 2026-07-27), whose HTTP story is the express/hono adapters that `AGENTS.md:169-170` chose `tsc`-alone specifically to avoid.

**Decisive prior art.** The official MCP Inspector — the MCP project's own human-facing UI — does not let the browser speak MCP either. Its browser talks to a Hono backend over HTTP+SSE and the backend holds the MCP connection. Its security posture is directly copyable: loopback-only bind, a start-up-minted session token injected into the page, and an `Origin` allow-list against DNS rebinding. Our case is stronger than theirs: they bridge to arbitrary third-party stdio servers, we own both ends and only need the seam.

**Security note carried forward.** The SDK's own browser-client CORS example ships `origin: '*'`, contradicting the spec's MUST on `Origin` validation. Harmless in an example; a real vulnerability on a loopback server reading someone's repository. Whatever T22 chooses, `Origin` validation and loopback-only binding are not optional.

**What this costs.** `spec.md:399` needs reopening either way, since the process now listens on a socket. What the recommendation preserves is the narrower and more valuable half of that line: **MCP stays stdio-only**, one server process per client session, no MCP-over-HTTP surface to secure or version. The amending ADR must say so explicitly or the next reader will read the whole line as overturned.

It also answers one of the Map's fog patches — whether a human reading a Board changes what `get_board` returns to agents. Implied answer: **no**. The human path absorbs the divergence so the agent path does not have to.

**Bearing on T22.** This does not decide A/B/C, but it constrains it: the web process is a reader on the seam, so option A (peer) is its natural fit, and nothing here requires a broker. T22 still needs the T19 scan measurement.

## Comments

Resolving via a /research subagent on branch research/browser-transport, per /wayfinder step 5. Findings land at docs/research/browser-transport.md on that branch.
