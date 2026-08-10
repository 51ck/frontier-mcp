# How a browser talks to an MCP server in 2026

> **Dated snapshot — not a contract.** Researched **2026-08-08**, against a specification revision
> that was three weeks old at the time. Unlike `docs/adr/` and `docs/agents/`, this document is not
> current by construction and is never updated in place. It records what was true on its date, as
> evidence for a decision already taken. Do not cite it as authority against a live source: re-fetch
> and supersede it with a new dated document. The SDK and protocol facts in §1 and §2 are the parts
> that expire first — `frontier-v1` **T30** owns them going forward.

Research for **T21** (`.scratch/frontier-web/issues/03-T21-how-a-browser-talks-to-an-mcp-server-in-2026.md`),
on the `frontier-web` Effort. Read-only web UI for one workspace, live-updating, `spec.md:399`
currently rules HTTP transport out of scope.

Researched **2026-08-08**. Every claim below is from the MCP specification site, the official
TypeScript SDK repository, the npm registry, or the official Inspector repository. Where a secondary
source is the only one available it is labelled as such.

**Cutoff caveat.** The agent's training cutoff is May 2026 and the two most load-bearing facts here
post-date it — protocol revision `2026-07-28` and TypeScript SDK v2, both published in late July 2026.
Everything time-sensitive was re-fetched live rather than recalled; nothing in this document rests on
memory.

**Headline finding, before the detail.** The ticket's framing — "streamable HTTP versus SSE, and does
the SDK support it" — is a 2025 question. Revision `2026-07-28` reshaped Streamable HTTP badly enough
that it changes the answer: protocol sessions are gone, the standalone `GET` SSE stream is gone,
stream resumability is gone, and the `initialize` handshake is gone. Separately, the SDK this repo
pins (`@modelcontextprotocol/sdk@1.30.0`) cannot speak that revision at all — it tops out at
`2025-11-25`. Speaking MCP to a browser in 2026 means adopting an entirely new SDK package family.

---

## 1. Streamable HTTP and SSE in the current MCP spec

### Which revision replaced what

| Revision | Transport state |
| --- | --- |
| `2024-11-05` | **HTTP+SSE** transport: a `GET` SSE stream plus a separate POST endpoint discovered via an `endpoint` event. |
| `2025-03-26` | **Streamable HTTP** introduced "as a replacement for the HTTP+SSE transport from protocol version 2024-11-05". HTTP+SSE deprecated from this revision onward. |
| `2025-06-18` | Introduced the `MCP-Protocol-Version` header. |
| `2025-11-25` | Last revision of the handshake-based ("legacy") era. |
| `2026-07-28` | **Current.** Streamable HTTP retained but substantially redesigned; HTTP+SSE reclassified as formally Deprecated under the new feature-lifecycle policy (SEP-2596). |

The current protocol version is **`2026-07-28`**
([Versioning](https://modelcontextprotocol.io/specification/versioning), fetched 2026-08-08).

There are exactly two standard transports: **stdio** and **Streamable HTTP**
([Transports overview](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)).
"SSE" is no longer a transport in its own right — it is a *response content type* that Streamable
HTTP may use for an individual request. Framing the choice as "Streamable HTTP or SSE" is a category
error under the current spec; the only SSE-as-a-transport thing is the deprecated 2024-11-05 binding.

### What Streamable HTTP looks like today

From
[Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
(fetched 2026-08-08):

- The server **MUST** provide a single HTTP endpoint that supports **POST**. That is the whole
  surface. `GET` and `DELETE` to the MCP endpoint **SHOULD** now return `405 Method Not Allowed`.
- Every JSON-RPC message from the client is its own POST. The client **MUST** send
  `Accept: application/json, text/event-stream` and **MUST** support both response shapes.
- The server answers each request with either a single JSON object *or* an SSE stream **scoped to
  that request**, carrying request-related notifications and then the final response.
- Long-lived server-to-client notifications now come from a `subscriptions/listen` request, whose
  *response* is a long-lived SSE stream. Clients opt in to notification types
  (`toolsListChanged`, `promptsListChanged`, `resourcesListChanged`, `resourceSubscriptions`).
- "**Resumable SSE streams via `Last-Event-ID` are not supported.**" A broken stream loses the
  in-flight request and the client **MUST** re-issue it with a new request ID.
- Cancellation is transport-level: closing the SSE response stream **MUST** be treated as
  cancellation. `notifications/cancelled` is stdio-only now.
- Servers **SHOULD** send `X-Accel-Buffering: no` on SSE responses, and **are encouraged** to emit
  SSE comment keep-alives (`:\r\n`) on long-lived `subscriptions/listen` streams.
- Every POST **MUST** carry `MCP-Protocol-Version`, `Mcp-Method`, and (for `tools/call`,
  `resources/read`, `prompts/get`) `Mcp-Name` headers, mirroring body fields. A mismatch **MUST** be
  rejected with `400` and JSON-RPC error `-32020` (`HeaderMismatch`).

### What the official TypeScript SDK supports today

This is the part that has moved most, and the ticket's assumption is out of date.

**The SDK split into a package family on 2026-07-27.** `@modelcontextprotocol/sdk` (the monolith) is
now the v1 line; a set of scoped packages is v2.

| Package | Version | Published | Protocol support |
| --- | --- | --- | --- |
| `@modelcontextprotocol/sdk` | **1.30.0** (dist-tag `latest`) | 2026-07-27 | `LATEST_PROTOCOL_VERSION = "2025-11-25"`, `DEFAULT_NEGOTIATED_PROTOCOL_VERSION = "2025-03-26"`. **Cannot speak `2026-07-28`.** |
| `@modelcontextprotocol/core` | 2.0.0 | 2026-07-27 | shared schema graph |
| `@modelcontextprotocol/server` | 2.0.0 | 2026-07-27 | legacy era `2024-10-07`–`2025-11-25` **and** modern era `2026-07-28` |
| `@modelcontextprotocol/client` | 2.0.0 | 2026-07-27 | same two eras |
| `@modelcontextprotocol/node` | 2.0.0 | 2026-07-27 | Node `IncomingMessage`/`ServerResponse` adapter |
| `@modelcontextprotocol/express`, `/fastify`, `/hono` | 2.0.0 | 2026-07-27 | framework adapters |
| `@modelcontextprotocol/server-legacy` | 2.0.0 | 2026-07-27 | the old SSE transport, for old clients |
| `@modelcontextprotocol/codemod` | 2.0.0 | 2026-07-27 | v1→v2 import migration |

Sources: [npm registry for `@modelcontextprotocol/sdk`](https://registry.npmjs.org/@modelcontextprotocol/sdk),
[for `@modelcontextprotocol/server`](https://registry.npmjs.org/@modelcontextprotocol/server),
[for `@modelcontextprotocol/client`](https://registry.npmjs.org/@modelcontextprotocol/client);
[`unpkg.com/@modelcontextprotocol/sdk@1.30.0/dist/esm/types.d.ts`](https://unpkg.com/@modelcontextprotocol/sdk@1.30.0/dist/esm/types.d.ts);
[SDK release list](https://github.com/modelcontextprotocol/typescript-sdk/releases). All fetched
2026-08-08.

v2 is a **GA release, not a beta** — the GitHub release for `@modelcontextprotocol/server@2.0.0`
carries `prerelease: false`, published `2026-07-27T23:55:41Z`, and npm's `latest` dist-tag points at
plain `2.0.0` with no prerelease suffix. (Some accumulated release-note prose still reads "first beta
of SDK v2"; that is a stale changeset line, contradicted by both the dist-tag and the flag. Treating
it as GA is the defensible reading, but it *is* eleven days old as of writing, and a v2 GA that fresh
carries the usual early-adoption risk.)

**Concrete names.**

v1 (`@modelcontextprotocol/sdk@1.30.0`), which is what this repo pins today:

- `StreamableHTTPServerTransport` — `@modelcontextprotocol/sdk/server/streamableHttp.js`
- `WebStandardStreamableHTTPServerTransport` — `.../server/webStandardStreamableHttp.js`
- `SSEServerTransport` — `.../server/sse.js` (the deprecated 2024-11-05 binding)
- `StreamableHTTPClientTransport` — `.../client/streamableHttp.js`
- `SSEClientTransport` — `.../client/sse.js`
- `StdioServerTransport` — `.../server/stdio.js` (what `src/bin.ts` uses)

v1 transport options, from
[`webStandardStreamableHttp.d.ts`](https://unpkg.com/@modelcontextprotocol/sdk@1.30.0/dist/esm/server/webStandardStreamableHttp.d.ts):
`sessionIdGenerator`, `onsessioninitialized`, `onsessionclosed`, `enableJsonResponse`, `eventStore`
(resumability), `retryInterval`, `keepAliveMs` (default `15000`), and — **all three marked deprecated
in favour of external middleware** — `allowedHosts`, `allowedOrigins`, `enableDnsRebindingProtection`.

v2:

- `createMcpHandler(factory, options?)` from `@modelcontextprotocol/server`, returning
  `{ fetch, close, notify, bus }`, where `fetch` is web-standard `(Request) => Promise<Response>`.
- `toNodeHandler(handler)`, `localhostHostValidation()`, `localhostOriginValidation()` from
  `@modelcontextprotocol/node`; `hostHeaderValidationResponse`, `originValidationResponse` from
  `@modelcontextprotocol/server`.
- `createMcpExpressApp`, `createMcpHonoApp`, `createMcpFastifyApp` — these **arm host and origin
  checks by default**.
- `NodeStreamableHTTPServerTransport` (`@modelcontextprotocol/node`) — the v2 rename of v1's
  `StreamableHTTPServerTransport`, per the codemod's
  [`importMap.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/codemod/src/migrations/v1-to-v2/mappings/importMap.ts).
- `Client` and `StreamableHTTPClientTransport` from `@modelcontextprotocol/client`;
  `StdioClientTransport` from `@modelcontextprotocol/client/stdio`.
- `serveStdio(...)` for stdio servers.

Sources: [`docs/serving/http.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/http.md),
[`docs/clients/connect.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/connect.md),
[`docs/protocol-versions.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/protocol-versions.md).

Two v2 design points bear directly on us:

- **The handler is per-request and holds nothing between requests.** "The factory runs once per HTTP
  request: a fresh instance serves every request, and the handler holds nothing between requests."
  A long-lived derived index and an `fs.watch` watcher do not live inside it; they would have to live
  beside it and be closed over.
- **The handler validates nothing.** "The handler trusts its caller: it validates no `Host` header,
  no `Origin` header, and no token." Origin/host validation mounts *in front of* it.

---

## 2. What revision `2026-07-28` actually changed

`src/workspace.ts:23-25` cites SEP-2577 (Roots deprecation), and that citation is correct — but it is
a small part of the revision. From the
[2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
(fetched 2026-08-08), the major changes are:

1. **Protocol-level sessions removed**, along with the `Mcp-Session-Id` header (SEP-2567). List
   endpoints no longer vary per connection. Servers needing cross-call state use "explicit,
   server-minted handles passed as ordinary tool arguments".
2. **MCP is now stateless**: the `initialize` / `notifications/initialized` handshake is gone
   (SEP-2575). Every request carries `io.modelcontextprotocol/protocolVersion` and
   `io.modelcontextprotocol/clientCapabilities` in `_meta`; servers identify themselves in each
   result's `_meta` via `io.modelcontextprotocol/serverInfo`.
3. **`server/discover` added** — a mandatory RPC returning supported protocol versions, capabilities
   and identity in one request (SEP-2575).
4. **The `GET` stream and `resources/subscribe`/`unsubscribe` are replaced by `subscriptions/listen`**
   (SEP-2575) — a single long-lived POST-response SSE stream carrying opted-in change notifications,
   tagged with `io.modelcontextprotocol/subscriptionId`.
5. **`ping`, `logging/setLevel`, and `notifications/roots/list_changed` removed.** Log level is now
   per-request via `io.modelcontextprotocol/logLevel` in `_meta`.
6. **Tasks moved out of core** into the `io.modelcontextprotocol/tasks` extension (SEP-2663).
7. **Multi Round-Trip Requests (MRTR)** (SEP-2322) replaces server-initiated requests. Servers no
   longer send JSON-RPC *requests* at all; sampling, elicitation and roots become an
   `InputRequiredResult` the client answers by retrying with `inputResponses`.
8. **Every result carries a required `resultType`** — `"complete"` or `"input_required"` (SEP-2322).
9. **SSE resumability removed** — `Last-Event-ID` and SSE event IDs are gone from the transport
   (SEP-2575).

Relevant minor changes:

- `CacheableResult` (SEP-2549): `ttlMs` and `cacheScope` (`"public"` / `"private"`) are now **required**
  on results from `tools/list`, `prompts/list`, `resources/list`, `resources/read`, and
  `resources/templates/list`. A freshness hint, complementing `listChanged` notifications.
- Standard MCP request headers `Mcp-Method` / `Mcp-Name` are required, plus `x-mcp-header` tool-param
  mirroring (SEP-2243).
- `extensions` field added to `ClientCapabilities` / `ServerCapabilities`.
- OpenTelemetry trace-context conventions for `_meta` (`traceparent`, `tracestate`, `baggage`)
  (SEP-414).
- Servers **SHOULD** return `tools/list` in deterministic order, for client-side and prompt caching.
- Error-code allocation policy: `-32020`–`-32099` reserved for the spec; `HeaderMismatch` renumbered
  `-32001` → `-32020`.

**Deprecations in this revision** (they remain functional for at least twelve months under the new
[feature lifecycle policy](https://modelcontextprotocol.io/community/feature-lifecycle), SEP-2596):

- **Roots, Sampling, and Logging** (SEP-2577). The suggested migration for Roots is exactly what
  `src/workspace.ts` already does: "pass directories or files via tool parameters, resource URIs, or
  server configuration instead of Roots". Sampling → integrate with LLM provider APIs directly.
  Logging → `stderr` on stdio, or OpenTelemetry.
- **HTTP+SSE transport** reclassified as formally Deprecated (SEP-2596).
- **OAuth 2.0 Dynamic Client Registration** (RFC 7591) deprecated in favour of Client ID Metadata
  Documents.

**Auth changes** (all minor, all HTTP-only): `iss` in authorization responses per RFC 9207
(SEP-2468), required `application_type` in DCR (SEP-837), credentials keyed by issuer (SEP-2352).

**Session resumption, specifically:** there is now *none*. Both mechanisms that existed for it —
`Mcp-Session-Id` and `Last-Event-ID` replay — were removed in this revision. Anything wanting
resumable live updates must build it above MCP, or accept that a dropped stream means the client
re-requests from scratch.

**Relevance to a browser client:** mostly good. Statelessness and the death of sessions make an MCP
endpoint far easier to serve from a per-request handler, and remove the sticky-session problem
entirely. The loss of resumability is neutral for us — a browser reconnecting to a local server can
simply re-fetch a Board that is single-digit milliseconds to compute.

---

## 3. Can a browser be an MCP client directly?

**Yes, and this is now explicitly supported.** But "supported" and "advisable here" are different
questions; see §4.

### Evidence that browser is a first-class runtime

- Both `@modelcontextprotocol/client@2.0.0` and `@modelcontextprotocol/server@2.0.0` declare a
  `./_shims` export subpath with **`node` / `browser` / `workerd`** conditions (npm registry, fetched
  2026-08-08).
- [`packages/client/src/shimsBrowser.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/src/shimsBrowser.ts)
  exists solely for that condition and reads, verbatim:

  ```ts
  /**
   * Whether `fetch()` may throw `TypeError` due to CORS. Only true in browser contexts
   * (including Web Workers / Service Workers). In Node.js and Cloudflare Workers, a
   * `TypeError` from `fetch` is always a real network/configuration error.
   */
  export const CORS_IS_POSSIBLE = true;
  ```

  The SDK models CORS failure as a first-class runtime condition, which only makes sense if browsers
  are expected clients.

- The SDK's own examples ship what a comment calls a "Browser-client CORS recipe"
  ([`examples/legacy-routing/server.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/examples/legacy-routing/server.ts)):

  ```js
  cors({
      origin: '*',
      exposedHeaders: ['Mcp-Session-Id', 'WWW-Authenticate', 'Last-Event-Id', 'Mcp-Protocol-Version']
  })
  ```

  with an explicit warning to restrict `origin` in production. Note this is the *legacy* example —
  under `2026-07-28`, `Mcp-Session-Id` and `Last-Event-Id` no longer exist, so a modern equivalent
  would expose only `WWW-Authenticate` and `MCP-Protocol-Version`.

**There is no separate "browser transport" class.** `StreamableHTTPClientTransport` is the browser
transport; it is built on `fetch` and the standard `EventSource`-style SSE parsing, and runs
unmodified in a browser. That is a deliberate consequence of Streamable HTTP being plain
POST-with-two-response-shapes.

### CORS, in practice

The spec itself says nothing normative about CORS — it is left to deployment. But the mechanics are
forced by the transport:

- The client **MUST** send `MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` headers. All three are
  non-simple request headers, so **every** cross-origin MCP POST triggers a CORS preflight, and the
  server must answer `OPTIONS` with those names in `Access-Control-Allow-Headers`.
- `Accept: application/json, text/event-stream` is also non-simple.
- The server should expose `WWW-Authenticate` via `Access-Control-Expose-Headers` if auth is in play.

Serving the UI from the same origin as the MCP endpoint avoids all of this. That is worth weighing.

### Origin validation and DNS rebinding — the important bit for a local server

This is normative and unambiguous
([Streamable HTTP § Security & Endpoint](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)):

> 1. Servers **MUST** validate the `Origin` header on all incoming connections to prevent DNS
>    rebinding attacks.
>    - If the `Origin` header is present and invalid, servers **MUST** respond with HTTP 403
>      Forbidden. […]
> 2. When running locally, servers **SHOULD** bind only to localhost (127.0.0.1) rather than all
>    network interfaces (0.0.0.0).
> 3. Servers **SHOULD** implement proper authentication for all connections.
>
> Without these protections, attackers could use DNS rebinding to interact with local MCP servers
> from remote websites.

There is real tension between requirement 1 and the wildcard-`origin` CORS recipe above: a permissive
`Access-Control-Allow-Origin: *` is exactly what an `Origin` allow-list exists to prevent. The SDK's
example flags this ("restrict `origin` in production"), but shipping the naive recipe on a loopback
server that reads a developer's repository would be a real vulnerability — any web page the user has
open could read the tracker. **This risk is identical whether we serve MCP or plain HTTP**; it is a
property of running a local HTTP server at all, not of the wire protocol.

### Auth and credentials

Authorization is **OPTIONAL** in MCP, is defined only for HTTP transports, and is OAuth 2.1-shaped
([Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization),
fetched 2026-08-08):

> - Implementations using an HTTP-based transport **SHOULD** conform to this specification.
> - Implementations using an STDIO transport **SHOULD NOT** follow this specification, and instead
>   retrieve credentials from the environment.

An MCP server that wants auth is expected to be an OAuth 2.1 resource server implementing RFC 9728
Protected Resource Metadata, with clients doing PKCE, RFC 8707 `resource` indicators, and RFC 9207
`iss` validation. For a loopback read-only viewer that is preposterous overhead. The pragmatic
alternative — a bearer token minted at startup and handed to the page — is what the official
Inspector does (§5), and it is *not* MCP authorization; it is ordinary HTTP auth in front of the
handler. Nothing in the spec forbids that, because the spec's requirement is only "**SHOULD**
implement proper authentication".

---

## 4. Recommendation: should the browser speak MCP here?

**No. Build a plain HTTP + SSE read-only web app in the same process, sitting on the ADR 0001 driver
seam, alongside — not through — the MCP tool layer.**

Recommended shape:

- One long-lived Node process. It constructs the markdown `StorageDriver` and the workspace index +
  `fs.watch` watcher exactly once, and serves **two** front doors over that one instance:
  - the existing `StdioServerTransport` (unchanged, `src/bin.ts`), and
  - an HTTP listener bound to `127.0.0.1` on an ephemeral port, serving the SPA, a small read-only
    JSON API (`GET /api/board`, `GET /api/tickets?ids=…`), and one SSE endpoint (`GET /api/events`)
    that emits a `changed` event when the watcher invalidates the index.
- The browser holds no MCP client. It fetches JSON and listens to one `EventSource`.
- A start-up-minted bearer token in the launch URL, an `Origin` allow-list, and loopback-only
  binding — the Inspector's exact posture.
- Ship the UI behind a separate entry point (`frontier-mcp web` or similar), not as a side effect of
  the stdio server. The stdio path must not grow a listening socket.

### Why

**1. The MCP tool surface is deliberately the wrong shape for a human.** `AGENTS.md:135-136` fixes the
tool count at eight, *permanently*, because "every tool schema is context in every session, against a
project whose whole purpose is token cost." Every rendering rule in `AGENTS.md:224-241` is a
token-saving compromise: a Board never carries a body; warnings are grouped rather than itemized;
Boards render as terse text lines. A human UI wants the opposite — bodies inline, warnings attached to
the Ticket they concern, structured data rather than pre-rendered prose. Serving the browser through
MCP means either shipping a ninth tool (forbidden), overloading `get_board` with a `verbose` argument
whose schema text every agent session then pays for (the cost the eight-tool rule exists to prevent),
or making the browser parse text that was rendered for an LLM. All three are worse than a JSON
endpoint that costs an agent session literally nothing, because agents never see it.

**2. The driver seam is already the right seam, and it is not the tool seam.** `src/storage/driver.ts:64-141`
is an interface of domain operations — `listEfforts`, `listTickets`, `readMap`, `readSpec` — that
"never mentions paths or markdown" and is bound to its workspace at construction. A read-only web API
is `listEfforts` + `listTickets` + `readMap` + `readSpec`, plus the existing `src/frontier.ts`
computation. It needs nothing the seam does not already offer. Meanwhile `AGENTS.md:222` forbids
`src/tools/` importing from `src/storage/` — so an HTTP layer reading the driver directly sits *beside*
the tool layer at the same altitude, which is architecturally clean, whereas routing the browser
through MCP would make the tool layer a load-bearing dependency of the UI for no gain.

**3. MCP's live-update story is worse than SSE's, for our case.** `subscriptions/listen` would work,
but it is designed around `resourcesListChanged` / `resourceSubscriptions` — meaning Tickets would
have to be modelled as MCP *resources* with URIs, a modelling burden we do not otherwise have (the
repo has exactly one resource today, `tracker-doc`, and it is shipped-package configuration, not
tracker data). And `2026-07-28` **removed** stream resumability, so MCP gives us no reconnection
guarantee that a bare `EventSource` does not already give us for free — `EventSource` at least
auto-reconnects, which is more than the MCP transport now promises.

**4. Adopting MCP-as-wire drags in an SDK migration we do not otherwise need.** The pinned
`@modelcontextprotocol/sdk@1.30.0` cannot speak `2026-07-28`. A browser MCP client written today
against a modern SDK would need the server on `@modelcontextprotocol/server@2.0.0` — a GA release
eleven days old at time of writing — plus `@modelcontextprotocol/node` or a framework adapter. That
also collides with `AGENTS.md:169-170`: "**`tsc` alone** for the build, no bundler. The only heavy
dependency is the SDK, and bundling it would inline express and hono for a stdio server that needs
neither." The v2 HTTP story is precisely those framework adapters. A hand-rolled `node:http` handler
for four read-only routes has no such dependency and no such migration.

**5. Nothing is foreclosed.** Because the API sits on the seam and not on the tool layer, exposing
Streamable HTTP later — for a *remote agent* client, which is the actual use case MCP-over-HTTP is
designed for — remains a separate, additive decision. The multi-repo case likewise stays open: a
future aggregator constructs N drivers and fans out over the same interface, which is far easier than
aggregating across N MCP sessions.

### What this costs, honestly

- **`spec.md:399` still needs reopening.** "HTTP transport […] out of scope" is broken by this
  recommendation either way — the process now listens on a socket. What this recommendation preserves
  is the narrower and more valuable half of that line: *MCP* stays stdio-only, one server process per
  client session, no MCP-over-HTTP surface to secure or version. That distinction should be written
  into the amending ADR explicitly, or the next reader will think the whole line was simply overturned.
- **Two read paths to keep honest.** The Board an agent sees and the Board a human sees derive from
  the same driver and the same `src/frontier.ts`, but they render separately. That divergence is a
  real maintenance cost, and it is also the point — see the Map's open question "whether a human
  reading a Board in a browser changes what `get_board` should return to agents". The answer this
  recommendation implies is *no*: the human path absorbs the change so the agent path does not have to.
- **We give up "any MCP host can render our UI."** If MCP Apps (§5) ever becomes the way trackers are
  displayed inside Claude or ChatGPT, we would have built the wrong thing. Judged unlikely to matter:
  MCP Apps renders inside a host chat client, which is not the standalone always-open board this
  Effort's Destination describes.

### Constraint check

| Constraint | Effect |
| --- | --- |
| Markdown canonical, index derived (ADR 0001) | Unaffected — the web layer is a *reader* of the same derived index, one more cache over one source of truth. |
| No lock files outliving a crash (`AGENTS.md:245-246`) | Unaffected — read-only, no writes, no locks. |
| ADR 0004 claim guard / ADR 0005 id guard | Untouched. Read-only means the web process never joins either protocol. If editing lands later it joins as one more guarded writer, exactly as the Map already argues. |
| Read-only first | Enforced structurally: the HTTP layer can be given the driver typed as a read-only subset, so a write is a compile error rather than a policy. |
| Single workspace, multi-repo not foreclosed | The API is workspace-scoped like the driver; aggregation is N drivers behind one route later. |
| Eight tools, permanently (`AGENTS.md:135-136`) | Preserved. This is the constraint MCP-as-wire would have broken. |
| `src/tools/` must not import `src/storage/` (`AGENTS.md:222`) | Preserved; the new layer is a sibling of `src/tools/`, not a consumer of it. |

---

## 5. Prior art

### MCP Inspector — the official one, and the decisive data point

[`modelcontextprotocol/inspector`](https://github.com/modelcontextprotocol/inspector) is the MCP
project's own human-facing tool: a Vite + React + Mantine SPA, a CLI, and a TUI behind one
`mcp-inspector` binary.

Its architecture is exactly the recommendation above. From the repo's own
[`AGENTS.md`](https://github.com/modelcontextprotocol/inspector/blob/main/AGENTS.md) (fetched
2026-08-08): **the browser does not speak MCP directly.** A Hono backend under `clients/web/server/`
holds the MCP connection; the browser reaches it over **HTTP with Server-Sent Events for streaming
responses — not raw MCP and not WebSocket**. Shared isomorphic logic lives in `core/`, consumed by
both sides via a Vite alias.

Its security posture is the one worth copying wholesale:

- Web server on port **6274**, browser auto-open disabled by default.
- **Session bearer token**, injected into `index.html` on every page load
  (`clients/web/server/inject-auth-token.ts`), so the page gets it without a login screen.
  `DANGEROUSLY_OMIT_AUTH=true` opts out — note the naming.
- **`Origin` allow-list** explicitly "to prevent DNS-rebinding attacks", validated before serving.
- **Refuses to bind `0.0.0.0`** outside containers, so as not to expose "the process-spawning backend
  to the local network"; inside Docker it takes `DANGEROUSLY_BIND_ALL_INTERFACES=true`.

The relevant lesson is not just "they used HTTP+SSE" but *why they had to*: the Inspector's whole job
is connecting to arbitrary stdio servers, so a bridge is unavoidable for it. Our case is stronger, not
weaker — we own both ends, so we do not even need the bridge, only the seam.

### MCP Apps (SEP-1865) — real, official, and a different problem

[SEP-1865](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp) is
**Final**, Extensions Track, created 2025-11-21, authored across Anthropic, OpenAI and the MCP-UI
community. It standardises servers shipping interactive UI: resources declared under a `ui://` scheme,
associated with tools via metadata, `text/html;profile=mcp-app`, rendered in **sandboxed iframes**
inside the host, communicating by JSON-RPC over `postMessage`. Spec lives at
[`modelcontextprotocol/ext-apps`](https://github.com/modelcontextprotocol/ext-apps).

This is genuinely the official answer to "how does an MCP server show a human something" — but the
human is *inside a chat client*, looking at a tool result. It does not give you a standalone
always-open board at a URL, which is what the Destination asks for. Worth revisiting if the Effort's
goal ever shifts to "the Board renders nicely inside Claude"; not the answer to T21.

### Other servers with web UIs

Several exist — `mcp-dashboard`, MCPHub, `mcp-browser-use`'s daemon dashboard, Agent Browser — all
serving a localhost dashboard on their own port. **Sourced from web search aggregators rather than
verified against each repository**, so treat the details as indicative only. What is consistent across
them, and is corroborated by the Inspector, is the pattern: a separate HTTP port, a normal web app,
and MCP kept as the *agent-facing* interface rather than the UI's transport. No primary source was
found for an MCP server whose own web UI speaks MCP to itself from the browser.

---

## Sources

All fetched **2026-08-08**.

**Specification (modelcontextprotocol.io)**

- [Versioning](https://modelcontextprotocol.io/specification/versioning) — current revision `2026-07-28`
- [Transports overview, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
- [Streamable HTTP, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [Changelog, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- [Authorization, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [Feature lifecycle and deprecation policy](https://modelcontextprotocol.io/community/feature-lifecycle)
- [SEP-1865: MCP Apps](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp) — status Final, created 2025-11-21

**TypeScript SDK (github.com/modelcontextprotocol/typescript-sdk)**

- [`docs/protocol-versions.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/protocol-versions.md)
- [`docs/serving/http.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/http.md)
- [`docs/serving/sessions-state-scaling.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/sessions-state-scaling.md)
- [`docs/clients/connect.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/connect.md)
- [`packages/client/src/shimsBrowser.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/src/shimsBrowser.ts)
- [`packages/codemod/.../importMap.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/codemod/src/migrations/v1-to-v2/mappings/importMap.ts)
- [`examples/legacy-routing/server.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/examples/legacy-routing/server.ts)
- [Releases](https://github.com/modelcontextprotocol/typescript-sdk/releases) — v2 packages published 2026-07-27, `prerelease: false`

**npm registry / unpkg**

- [`@modelcontextprotocol/sdk`](https://registry.npmjs.org/@modelcontextprotocol/sdk) — `latest` = 1.30.0
- [`@modelcontextprotocol/server`](https://registry.npmjs.org/@modelcontextprotocol/server) — `latest` = 2.0.0
- [`@modelcontextprotocol/client`](https://registry.npmjs.org/@modelcontextprotocol/client) — `latest` = 2.0.0
- [`sdk@1.30.0/dist/esm/types.d.ts`](https://unpkg.com/@modelcontextprotocol/sdk@1.30.0/dist/esm/types.d.ts)
- [`sdk@1.30.0/dist/esm/server/webStandardStreamableHttp.d.ts`](https://unpkg.com/@modelcontextprotocol/sdk@1.30.0/dist/esm/server/webStandardStreamableHttp.d.ts)

**MCP Inspector (github.com/modelcontextprotocol/inspector)**

- [`README.md`](https://github.com/modelcontextprotocol/inspector/blob/main/README.md)
- [`AGENTS.md`](https://github.com/modelcontextprotocol/inspector/blob/main/AGENTS.md)

**Secondary, and labelled as such in the text**

- Web-search summaries of `mcp-dashboard`, MCPHub, `mcp-browser-use`, Agent Browser (§5, final
  paragraph). Not verified against their repositories.
