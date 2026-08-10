---
id: T30
title: Should the server move to the v2 scoped SDK family
kind: decision
type: research
status: open
triage: ready-for-agent
blocked_by: []
---

## Question

Surfaced by T21 while researching how a browser reaches the tracker, and graduated out of
`frontier-web`'s fog because it concerns the server itself rather than anything a browser sees.

`package.json:42` pins `@modelcontextprotocol/sdk: ^1.30.0`; `1.30.0` is what is installed. That
line tops out at protocol revision `2025-11-25` while the published spec is at `2026-07-28`. The
SDK has since split into a scoped family — `@modelcontextprotocol/server`, `/client` and `/node` at
`2.0.0`, GA 2026-07-27.

`AGENTS.md:160-163` records the stack decision and is **accurate but now under-descriptive**. It
says the only feature we cared about in `2026-07-28` is Roots, which we deliberately do not use.
That is still true, and T21 found nothing in that revision this server needs: the removals (sessions
and `Mcp-Session-Id`, the `initialize` handshake, the standalone GET SSE stream, SSE resumability)
and the deprecations (Roots per SEP-2577, Sampling, Logging) all touch surfaces a stdio server with
eight tools does not have. What the note does not say is that a **whole package family** now exists
alongside the one we pin, which is the part a future reader will trip over.

So the question is not "are we behind" — we are, knowingly, and it costs nothing today. It is
whether staying on `^1.30.0` has a horizon, and what the migration would cost when it arrives.

Specifically:

- Is `@modelcontextprotocol/sdk@1.x` maintained, or is it in a deprecation window with a date?
- Does the v2 family change the stdio server surface this repo actually uses — `Server`,
  `StdioServerTransport`, tool registration, zod input schemas — or only the transports and client
  surfaces we do not touch?
- What does v2 do to `AGENTS.md:169-170`, the `tsc`-alone build with no bundler? The stated reason
  is that the SDK is the only heavy dependency and bundling would inline express and hono for a
  stdio server needing neither. A scoped `/node` package may change that calculus in either
  direction.
- Does anything in v2 interact with the peer-reader web listener T22 settled on, which does not
  speak MCP at all?

**Out of scope:** adopting protocol `2026-07-28` features. T21 established we want none of them.
This is a dependency-line question, not a capability one.

Invoke `/research`. AFK — this is reading primary sources, not a conversation.

## Acceptance criteria

- [ ] The maintenance status of `@modelcontextprotocol/sdk@1.x` is established from a primary
      source, with a deprecation date if one exists
- [ ] Whether the v2 family touches the server surface this repo uses is answered concretely, naming
      the imports that would change
- [ ] The effect on the `tsc`-alone build is stated, either way
- [ ] A decision is recorded: migrate now, migrate on a named trigger, or stay pinned — and
      `AGENTS.md:160-163` is updated to say the scoped family exists, whichever way it goes
