---
id: T30
title: Should the server move to the v2 scoped SDK family
kind: decision
type: research
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: "Migrate now: no deprecation date exists but v1 is practice-frozen, the surface is four import lines with no renames, and the scoped split takes the runtime tree from 91 packages to 3"
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

- [x] The maintenance status of `@modelcontextprotocol/sdk@1.x` is established from a primary
      source, with a deprecation date if one exists
- [x] Whether the v2 family touches the server surface this repo uses is answered concretely, naming
      the imports that would change
- [x] The effect on the `tsc`-alone build is stated, either way
- [x] A decision is recorded: migrate now, migrate on a named trigger, or stay pinned — and
      `AGENTS.md:160-163` is updated to say the scoped family exists, whichever way it goes

## Answer

**Migrate now.** `docs/research/sdk-v2-family.md` carries the evidence and its sources; T33 is the migration.

**Is 1.x maintained?** No deprecation date exists, and that is a checked negative rather than a gap: no npm `deprecated` field, `latest` still `1.30.0`, repo not archived, no banner on the `v1.x` branch README, no supported-versions table. The maintainers shipped `@modelcontextprotocol/server-legacy@2.0.0` *with* a deprecation flag on the same day, so they flagged what they meant to freeze and did not flag the SDK. The `main` README promises bug and security fixes "for at least 6 months after v2's release" — a floor of 2027-01-27, not an expiry.

The throughput signal is the one that decides it. `v1.x` HEAD is the 1.30.0 bump of 2026-07-27, sixteen days cold; 46 PRs are open against the branch, four filed in the last week; CI last ran the day of the bump. The README explains it — contributions are throttled "while v2 settles". v1 is policy-maintained and practice-frozen, and the `v1.x-2026-07-28` branch that would have taught it the new revision stalled on 2026-06-09 at a single CI commit. A v1 bug we hit has no visible path to a release.

**Does v2 touch our surface?** Four import lines, no renames, no signature changes. The Ticket said `Server`; this repo actually uses `McpServer`, which matters — the low-level `Server` is where v2's real breaks live, and `McpServer` is on the published Unchanged-APIs list. `McpServer` and `StdioServerTransport` move to `@modelcontextprotocol/server` (the latter under a `/stdio` subpath, and the class survives — T21's snapshot implied only a `serveStdio` function). `Client` moves to `@modelcontextprotocol/client`. `InMemoryTransport` is the single hazard: exported from both, so both halves of a linked pair must come from one package. Raw zod shapes still compile through `@deprecated` overloads, and our `zod@^4.4.3` clears the `>=4.2` floor.

This was verified rather than read. A minimal port of this repo's exact `McpServer` construction, `registerResource` call and raw-shape schema compiled clean under this repo's own tsconfig, and the round trip still negotiates `2025-11-25`, era `legacy` — byte-identical to today. Two observable deltas, both one-line: `$schema` moves draft-07 to 2020-12, and `resources.listChanged` now defaults to `true` for a notification we never send.

**Effect on the `tsc`-alone build:** the rationale inverts, and this is the strongest finding. `sdk@1.30.0` + zod installs 91 packages; `server@2.0.0` + zod installs 3. The 88 that vanish include express, hono, cors, body-parser, qs, path-to-regexp, jose and ajv. `AGENTS.md:175-176` justifies having no bundler by saying bundling "would inline express and hono" — under v2 there is neither to inline. The decision stands; its stated reason does not, so T33 rewrites it. Stated plainly against our own interest: the published tarball is slightly *larger* (6.2 MB against 5.9 MB, v2 pre-bundling ajv as a chunk loaded even on stdio), and the dev closure is 14 packages once `/client` is added. Package count and supply-chain surface are what matter for something that installs into other people's repositories, so 91 to 3 is the number that counts.

**Peer-reader web listener (T22):** no interaction, verified rather than assumed — nothing on our path imports `node:http`, and there are no top-level side effects or framework collisions. One future hazard is worth recording: express, hono and cors are *phantom-available* in `node_modules` today, so a listener written against them before the migration would break after it.

**Why not a named trigger.** "When 1.x is deprecated" may never fire, per the above. The 2027-01-27 floor is a floor — nothing happens on that date. "When we need `2026-07-28`" never fires by construction. "When a CVE lands" fires exactly when the migration is most expensive. The one defensible trigger is "before the `frontier-web` listener is written", because of the phantom-dependency hazard — and it fires soon enough that waiting for it buys nothing except a stale `AGENTS.md`, which is the specific harm this Ticket was opened to fix.

**The honest counterweight**, recorded rather than buried: v2 GA is seventeen days old with no 2.0.1 yet. That is the real risk. It is bounded by the wire output not changing — any regression would be internal to SDK paths a stdio server with eight tools barely exercises — and by the revert being one commit that touches no workspace or tracker file.

## Comments

Start from `docs/research/browser-transport.md`, T21's findings, dated 2026-08-08. Its §1 already tabulates the v1 monolith against the v2 scoped family with published dates and protocol ceilings, and §2 enumerates what revision `2026-07-28` changed. That is a head start on the first two criteria, not an answer to them — the doc is a dated snapshot and states so, and the maintenance-status question it does not cover at all. Re-fetch anything load-bearing before deciding.
