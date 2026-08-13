# Should the server move to the v2 scoped SDK family

> **Dated snapshot — not a contract.** Researched **2026-08-13**, seventeen days after the v2 GA and
> sixteen after the last commit on the `v1.x` branch. Unlike `docs/adr/` and `docs/agents/`, this
> document is not current by construction and is never updated in place. It records what was true on
> its date, as evidence for a decision already taken. Do not cite it as authority against a live
> source: re-fetch and supersede it with a new dated document. The maintenance-status finding in §1
> is the part that expires first — it rests on the *absence* of an announcement, and an absence is
> only ever true as of a date.

Research for **T30** (`.scratch/frontier-v1/issues/23-T30-should-the-server-move-to-the-v2-scoped-sdk-fami.md`),
on the `frontier-v1` Effort. `package.json:43` pins `@modelcontextprotocol/sdk: ^1.30.0`;
`AGENTS.md:162-165` records the stack decision and `AGENTS.md:175-176` the no-bundler rationale.

Researched **2026-08-13**. Every claim below is from the npm registry API, the
`modelcontextprotocol/typescript-sdk` repository (its `main` and `v1.x` branches, its GitHub
releases, branches, PR queue and Actions history), the published package tarballs themselves, or the
MCP specification site. Where a fact was measurable locally it was measured rather than read: §3 and
§2 carry numbers from installs and program runs performed on this machine on the research date.

**Cutoff caveat.** The agent's training cutoff is May 2026 and everything load-bearing here
post-dates it. Nothing in this document rests on memory.

**Supersedes, partially:** `docs/research/browser-transport.md` §1 (T21, dated 2026-08-08). Its
package table is confirmed correct. Its claim that `serveStdio(...)` is *the* v2 stdio entry is
correct but incomplete — `StdioServerTransport` also survives, at a new import path, and that
distinction turns out to be the whole migration for this repo. See §2.

---

**Headline finding, before the detail.** The migration this ticket was worried about is not the
migration that exists. `@modelcontextprotocol/sdk@1.x` is **not deprecated** — no npm flag, no date,
and an explicit README commitment to "at least 6 months" of fixes — but it has also **not received a
single merged commit since the v2 GA**, while PRs keep piling up against it. Meanwhile the v2 port
of this repo is roughly *four import lines*, verified compiling and running on this machine, with
**zero change to what goes on the wire**. And the no-bundler rationale in `AGENTS.md:175-176` is
inverted by v2: the scoped split takes a stdio-only consumer's dependency closure from **91 packages
to 3**, dropping express, hono and cors entirely. The reason not to bundle stops being true, and the
reason to migrate turns out to be the dependency tree rather than the protocol.

---

## 1. Is `@modelcontextprotocol/sdk@1.x` maintained, or deprecated with a date?

**No announced deprecation date exists, as of 2026-08-13, in any of the sources checked** — and the
sources checked are the ones that would carry it. That is the direct answer to the acceptance
criterion. What follows is the evidence for the negative, and then a countervailing signal that
matters more than the absence.

### Where a deprecation would appear, and does not

| Source checked | Result |
| --- | --- |
| npm registry metadata, package root `deprecated` field ([`registry.npmjs.org/@modelcontextprotocol/sdk`](https://registry.npmjs.org/@modelcontextprotocol/sdk)) | **Absent.** |
| Per-version `deprecated` flags, all 79 published versions | Exactly **two** are flagged, `1.0.2` and `1.23.0-beta.0` — both pre-date v2 and neither is a line-level deprecation. |
| `npm view @modelcontextprotocol/sdk deprecated` | Empty output. |
| `npm view @modelcontextprotocol/sdk@1.30.0 deprecated` | Empty output. |
| npm dist-tags | `{ "latest": "1.30.0" }` — v1 still holds `latest` on its own package name. |
| GitHub repo state | `archived: false`, `disabled: false`, `pushed_at: 2026-08-13T04:35:13Z` (same day as this research). |
| `v1.x` branch `README.md` ([raw](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/README.md)) | **No deprecation banner, no EOL notice, no pointer to v2 at all.** The v1 README reads exactly as it did before the split. |
| `SECURITY.md` on `main` | Reporting process only. **No supported-versions table.** |
| Repo-wide code search for a support window | One hit, `README.md` — quoted below. |

The contrast that makes this a real negative rather than an oversight: **the maintainers demonstrably
know how to set the npm deprecation flag, and used it on the same publish day.**
`@modelcontextprotocol/server-legacy@2.0.0`, published 2026-07-27T23:55:20Z, carries a populated
`deprecated` string ([`registry.npmjs.org/@modelcontextprotocol/server-legacy`](https://registry.npmjs.org/@modelcontextprotocol/server-legacy)):

> This package is a frozen copy of v1's SSE transport and OAuth Authorization Server helpers for
> migration purposes only. Use StreamableHTTP from @modelcontextprotocol/server and a dedicated OAuth
> server in production. Will not receive new features.

They flagged the package they meant to freeze. They did not flag `@modelcontextprotocol/sdk`.

### What is affirmatively stated

The `main` branch [`README.md`](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md)
(fetched 2026-08-13) carries the only support statement in the repository, verbatim:

> **v2 is the stable release line**, released alongside the 2026-07-28 spec. v1.x continues to
> receive bug fixes and security updates for at least 6 months after v2's release.

v2 released **2026-07-27**, so that is a **floor of 2027-01-27** for bug fixes and security updates.
It is a *floor*, not an end date: "at least 6 months" names no expiry, and nothing in the repository
names one either.

[`CONTRIBUTING.md`](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/CONTRIBUTING.md)
backs it with live policy (lines 50-60):

> This repository has two main branches:
> - **`main`** – v2 of the SDK (the stable release line). This is a monorepo with split packages.
> - **`v1.x`** – stable v1 release. Bug fixes and patches for v1 should target this branch.

and the `v1.x` branch carries its own working release machinery — `.github/workflows/publish.yml`,
`main.yml`, `conformance.yml` (branch contents API, `?ref=v1.x`, fetched 2026-08-13).

### The countervailing signal, which is the one that matters

**The `v1.x` branch has had zero merged commits since the v2 GA, while its PR queue keeps growing.**

- `v1.x` HEAD is `2d889f2` — *"chore: bump version to 1.30.0 (#2563)"*, committed
  **2026-07-27T17:53:15Z**. That is the newest commit on the branch as of 2026-08-13, a gap of
  **sixteen days** ([branches API](https://api.github.com/repos/modelcontextprotocol/typescript-sdk/branches/v1.x)).
- The commit list for `v1.x` since 2026-07-27 contains exactly three entries, all landing *before*
  the v2 GA at 23:55Z the same day.
- Actions runs on `branch=v1.x`: the most recent is 2026-07-27T17:53:19Z. All are `push`-triggered,
  all succeeded. Nothing since.
- **46 pull requests are open against `base=v1.x`.** The four newest were opened 2026-08-06,
  2026-08-08, 2026-08-11 and **2026-08-12** — the day before this research. The newest *merged* PR
  is #2563, merged **2026-07-27T17:53:16Z**.

So contributors are still filing v1 fixes and the branch is still the documented target for them —
but nothing has been merged for over two weeks. The `main` README explains why, and dates the
condition:

> **We're limiting pull requests to 1 per new contributor while v2 settles after the 2026-07-28 spec
> release.** […] Issues are the most useful feedback right now — we'll reopen PRs as v2 stabilizes.

Read together: v1 is **policy-maintained and practice-frozen**. The commitment is real and dated to a
floor; the throughput is currently zero and the stated cause is temporary and v2-focused. The honest
characterisation is *not* "abandoned" and *not* "healthy" — it is **a maintenance channel whose
attention has moved, with a paper guarantee behind it and no evidence yet of that guarantee being
exercised.**

One further wrinkle worth recording, because it will confuse the next reader:
`CONTRIBUTING.md:166` states that "v1.x releases are published with `release-X.Y` npm tags (e.g.
`release-1.25`), not `latest`". **No such dist-tags exist** — the registry shows `latest` and nothing
else. The document is describing a scheme that was never applied to the published versions.

### The stalled `v1.x-2026-07-28` branch

Worth naming because its name implies something it does not deliver. A branch called
`v1.x-2026-07-28` exists — an integration branch for teaching v1 the new protocol revision. Its HEAD
is *"ci: run CI and conformance on the v1.x-2026-07-28 integration branch (#2261)"*, dated
**2026-06-09**, and `compare/v1.x...v1.x-2026-07-28` reports `ahead_by: 1, behind_by: 6` — one CI
commit ahead, six behind, `status: diverged`. It stalled before the GA and was never merged.

**Conclusion: `@modelcontextprotocol/sdk@1.30.0` will not learn `2026-07-28`.** The ceiling is
structural, not a matter of waiting. Confirmed locally against the installed package:
`node_modules/@modelcontextprotocol/sdk/dist/esm/types.d.ts:3-4` reads

```ts
export declare const LATEST_PROTOCOL_VERSION = "2025-11-25";
export declare const DEFAULT_NEGOTIATED_PROTOCOL_VERSION = "2025-03-26";
```

The published spec is still at `2026-07-28`
([Versioning](https://modelcontextprotocol.io/specification/versioning), re-fetched 2026-08-13).

### The package family, re-verified

T21's table (`browser-transport.md` §1) is **confirmed correct** against the registry on 2026-08-13.
Re-stated with the fields that matter here:

| Package | `latest` | Published | npm `deprecated` |
| --- | --- | --- | --- |
| `@modelcontextprotocol/sdk` | 1.30.0 | 2026-07-27T17:56:01Z | — |
| `@modelcontextprotocol/core` | 2.0.0 | 2026-07-27T23:55:21Z | — |
| `@modelcontextprotocol/server` | 2.0.0 | 2026-07-27T23:55:22Z | — |
| `@modelcontextprotocol/client` | 2.0.0 | 2026-07-27T23:55:22Z | — |
| `@modelcontextprotocol/node` | 2.0.0 | 2026-07-27T23:55:17Z | — |
| `@modelcontextprotocol/express` | 2.0.0 | 2026-07-27T23:55:17Z | — |
| `@modelcontextprotocol/hono` | 2.0.0 | 2026-07-27T23:55:16Z | — |
| `@modelcontextprotocol/fastify` | 2.0.0 | 2026-07-27T23:55:16Z | — |
| `@modelcontextprotocol/server-legacy` | 2.0.0 | 2026-07-27T23:55:20Z | **yes** (quoted above) |
| `@modelcontextprotocol/codemod` | 2.0.0 | 2026-07-27T23:55:18Z | — |

Every 2.0.0 GitHub release carries `prerelease: false`. Each package's version history runs
`alpha.1…alpha.4 → beta.1…beta.5 → 2.0.0`, so the GA is the terminus of a real prerelease ladder, not
a rename. T21's caution about stale "first beta of SDK v2" prose in the release notes stands, and is
still contradicted by the flag and the dist-tag. **The eleven-days-old reservation T21 recorded is
now seventeen days old, and no 2.0.1 has shipped** — no post-GA patch has been needed, which is
itself mild evidence either way and should not be over-read.

---

## 2. Does v2 change the server surface *this repo* uses?

**Barely. Four import lines move; nothing is renamed; no signature this repo calls changes; and the
bytes on the wire are identical.** The surface that got redesigned in v2 — `createMcpHandler`, the
per-request HTTP handler, framework adapters, era negotiation, multi-round-trip requests — is
entirely the surface this repo does not touch.

### The exact surface in use

Grepped repo-wide (`src`, `test`, `bench`), these are all of them:

| Site | Import |
| --- | --- |
| `src/server.ts:5` | `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js` |
| `src/bin.ts:2` | `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js` |
| `test/support/harness.ts:1` | `Client` from `@modelcontextprotocol/sdk/client/index.js` |
| `test/support/harness.ts:2` | `InMemoryTransport` from `@modelcontextprotocol/sdk/inMemory.js` |
| `test/cross-process-create.test.ts:26-27` | same two |
| `test/cross-process-claim.test.ts:23-24` | same two |

Plus the API surface exercised on them: `new McpServer(info, { capabilities })`,
`server.registerTool(name, config, handler)` ×8, `server.registerResource(name, uri, meta, handler)`
×1, `server.connect(transport)`, `server.close()`, and raw-shape zod objects
(`{ effort: z.string().describe(…) }`) as `inputSchema`.

Note the ticket's phrasing — "the `Server` class" — is off by one level. This repo uses the
**high-level `McpServer`**, never the low-level `Server`. That matters, because the low-level
`Server` is where v2's real breaks live (`setRequestHandler` moved from schema-first to
method-string-first, `request()` signatures changed) and `McpServer` is explicitly listed as
unchanged.

### Per-import verdict

Routing is from the codemod's
[`importMap.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/codemod/src/migrations/v1-to-v2/mappings/importMap.ts),
which the
[upgrade guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/upgrade-to-v2.md)
names the "source of truth" for import mappings. Both fetched 2026-08-13.

| v1 import | v2 | Verdict |
| --- | --- | --- |
| `McpServer` ← `sdk/server/mcp.js` | `@modelcontextprotocol/server` | **Package moves. Name, constructor and methods unchanged.** `status: 'moved'` in `importMap.ts:81-84`. Verified present in the root barrel of `@modelcontextprotocol/server@2.0.0`, `dist/index.d.mts`. |
| `StdioServerTransport` ← `sdk/server/stdio.js` | `@modelcontextprotocol/server/stdio` | **Package + subpath move. Class name unchanged, constructor compatible.** `importMap.ts:89-91`. The root barrel deliberately does *not* re-export it — the guide: "the root entries are runtime-neutral so browser/Workers bundlers can consume them." Gains an optional third `{ maxBufferSize }` argument (default 10 MB); we pass none. |
| `Client` ← `sdk/client/index.js` | `@modelcontextprotocol/client` | **Package moves.** `importMap.ts:51-54`. Constructor, `connect`, `close`, `listTools`, `callTool` unchanged in the ways we use them. |
| `InMemoryTransport` ← `sdk/inMemory.js` | `@modelcontextprotocol/server` **or** `/client` — pick one | `importMap.ts:224-227` marks it `RESOLVE_BY_CONTEXT`, i.e. **the codemod cannot decide this one for us**. See the hazard below. |

Nothing in this repo's surface is renamed. Nothing is removed. From the upgrade guide's
[Unchanged APIs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/upgrade-to-v2.md#unchanged-apis)
section, verbatim:

> - `McpServer` constructor, `server.connect(transport)`, `server.close()`, and the `McpServer.server`
>   accessor […]
> - `StdioClientTransport` and `StdioServerTransport` — **import path moved** to the `./stdio` subpath
>   and gained an optional `maxBufferSize`.

### The one hazard: `InMemoryTransport` and linked pairs

`@modelcontextprotocol/client` and `@modelcontextprotocol/server` **each bundle their own copy** of
`InMemoryTransport` with private state. The guide is explicit:

> The two packages bundle separate copies with private state, so the halves of a linked pair must
> come from the **same package's** import — pick one package per file (per linked pair) rather than
> mixing the client's `InMemoryTransport` with the server's.

`test/support/harness.ts` and both cross-process tests take `Client` from one package and the
transport pair from the shared `inMemory.js`. Post-migration they must take *both halves of
`createLinkedPair()`* from one package while `Client` may come from the other. **Verified working on
this machine**: `InMemoryTransport` from `@modelcontextprotocol/server` paired with `Client` from
`@modelcontextprotocol/client` completes a full connect / `listTools` / `callTool` round trip. The
constraint is on the pair, not on which class comes from where.

Also relevant to the test harness, from
[`support-2026-07-28.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md):

> There is no in-memory serving entry — `InMemoryTransport.createLinkedPair()` connects 2025-era
> instances only.

Which is exactly what we want and exactly what we have. The tests keep testing the thing the
production binary does.

### zod input schemas: raw shapes still work, and are now deprecated

v2 moved tool schemas to [Standard Schema](https://standardschema.dev/). Raw `{ field: z.string() }`
shapes — what all eight tools in `src/tools/` export — are **still accepted, via `@deprecated`
overloads**. Read directly out of the shipped types
(`@modelcontextprotocol/server@2.0.0`, `dist/createMcpHandler-CLhGwQTn.d.mts:3309-3318`):

```ts
/** @deprecated Wrap with `z.object({...})` instead. Raw-shape form: `inputSchema`/`outputSchema`
 * may be a plain `{ field: z.string() }` record; it is auto-wrapped with `z.object()`. */
registerTool<InputArgs extends ZodRawShape, …>(name: string, config: { … }, cb: LegacyToolCallback<InputArgs>): RegisteredTool;
```

The codemod wraps them in `z.object()` automatically, which is the fix and is mechanical.

Two preconditions, both **already satisfied here**:

- **zod ≥ 4.2.0 required.** The guide: "Zod v3 is no longer supported […] Zod **≥4.2.0** self-converts
  via `~standard.jsonSchema` — the supported path." Below 4.2 the SDK falls back to its bundled zod
  and **silently drops `.describe()` descriptions** from the generated JSON Schema — which for this
  repo would quietly delete the per-argument prose in every tool schema. `package.json:45` declares
  `zod: ^4.4.3`; `4.4.3` is installed. Clear.
- **Node 20+.** `package.json` sets `engines.node: >=24`. Clear.

There is a real trap here that this repo *does not* fall into but the next reader should know about:
the guide warns that raw shapes are wrapped with the SDK's own resolved zod, so a raw shape built by
a *foreign* zod copy "fail[s] at registration or at the first `tools/list`". Wrapping in `z.object()`
yourself removes the hazard entirely.

### Verified empirically, not just read

A minimal port — the repo's exact `McpServer` construction, its exact `registerResource` call, and
`get_board`'s exact raw-shape `inputSchema` including both `.describe()` calls — was compiled and run
against `@modelcontextprotocol/server@2.0.0` + `@modelcontextprotocol/client@2.0.0` + `zod@4.4.3`,
**under this repo's own `tsconfig.json` copied verbatim** (`nodenext` resolution,
`verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly`, `strict`).

- `tsc --noEmit`: **exit 0, no errors, no warnings.** The deprecated raw-shape overload typechecks
  clean under `strict`.
- Runtime round trip: tool listed, schema descriptions preserved, `callTool` returned correctly.
- **Negotiated protocol version: `2025-11-25`. Era: `legacy`.** Byte-identical to what v1 negotiates.

That last line is the important one, and it is corroborated by the SDK's own documentation
([`support-2026-07-28.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md)):

> A hand-constructed `Server`/`McpServer` connected directly to a `StdioServerTransport` serves only
> the 2025-era protocol — **upgrading the SDK changes nothing about what it puts on the wire.**

Adopting `2026-07-28` on stdio is a *separate, opt-in* step: replacing
`server.connect(new StdioServerTransport())` with `serveStdio(() => buildServer())` from
`@modelcontextprotocol/server/stdio`. T21 established we want none of that, and the migration does
not force it. Staying on the transport form is the supported path, not a holdout.

### Two observable deltas, both measured

The same tool registered identically under v1.30.0 and v2.0.0, compared by running both:

**1. JSON Schema dialect changes** (SEP-1613 / SEP-2106). Same schema body, different stamp:

```
v1.30.0: "$schema": "http://json-schema.org/draft-07/schema#"
v2.0.0:  "$schema": "https://json-schema.org/draft/2020-12/schema"
```

Properties, types, `required`, and `description` strings are identical. Agent-visible, semantically
inert here.

**2. Advertised capabilities gain `resources.listChanged`.** With this repo's exact
`{ capabilities: { tools: {}, resources: {} } }`:

```
v1.30.0: {"resources":{},"tools":{"listChanged":true}}
v2.0.0:  {"resources":{"listChanged":true},"tools":{"listChanged":true}}
```

The guide documents this as **eager capability-handler install**: "a declared `tools: {}` /
`resources: {}` / `prompts: {}` is advertised with `listChanged: true` at construction". The `tools`
half is pre-existing (v1 already over-advertised it). The `resources` half is new, and this server
never sends `notifications/resources/list_changed` — its one resource, `tracker-doc`, is static
packaged configuration. **Advertising a notification we never send invites a client to cache the
resource list forever.** One-line fix at `src/server.ts:131`:
`{ capabilities: { tools: {}, resources: { listChanged: false } } }`. Worth doing to `tools` at the
same time, since the same misstatement is already there under v1.

Also noted but not applicable: `registerResource` now reserves a `cacheHint` config key
(`RangeError` on invalid values). `src/server.ts:137-142` passes `title` / `description` /
`mimeType` only. No collision.

---

## 3. What does v2 do to the `tsc`-alone build with no bundler?

**It removes the premise of `AGENTS.md:175-176` entirely.** The line reads:

> **`tsc` alone** for the build, no bundler. The only heavy dependency is the SDK, and bundling it
> would inline express and hono for a stdio server that needs neither.

Under v2, a stdio-only consumer's tree **contains no express and no hono to inline.**

### Measured, not inferred

Two throwaway installs on this machine, 2026-08-13, `npm ls --all --parseable`:

| Install | Packages in closure | `node_modules` on disk |
| --- | --- | --- |
| `@modelcontextprotocol/sdk@1.30.0` + `zod@4.4.3` | **91** | 24 MB |
| `@modelcontextprotocol/server@2.0.0` + `zod@4.4.3` | **3** | 14 MB |

The v2 closure, in full — that is the entire list, not an excerpt:

```
@modelcontextprotocol/core
@modelcontextprotocol/server
zod
```

The 88 packages that disappear include the whole express middleware chain and both HTTP frameworks:

```
@hono/node-server  ajv  ajv-formats  body-parser  bytes  content-disposition  content-type
cookie  cookie-signature  cors  cross-spawn  debug  depd  encodeurl  escape-html  etag
eventsource  eventsource-parser  express  express-rate-limit  fast-deep-equal  fast-uri
finalhandler  forwarded  fresh  hono  http-errors  iconv-lite  ip-address  ipaddr.js  jose
json-schema-traverse  json-schema-typed  media-typer  merge-descriptors  mime-db  mime-types
negotiator  on-finished  parseurl  path-to-regexp  pkce-challenge  proxy-addr  qs  range-parser
raw-body  router  send  serve-static  side-channel*  statuses  type-is  vary  zod-to-json-schema
… (88 total)
```

### Why the split does this

Straight from the published manifests (`npm pack` of each, 2026-08-13):

```jsonc
// @modelcontextprotocol/sdk@1.30.0 — 17 direct dependencies
{ "@hono/node-server": "…", "ajv": "…", "ajv-formats": "…", "content-type": "…",
  "cors": "…", "cross-spawn": "…", "eventsource": "…", "eventsource-parser": "…",
  "express": "^5.2.1", "express-rate-limit": "…", "hono": "^4.11.4", "jose": "…",
  "json-schema-typed": "…", "pkce-challenge": "…", "raw-body": "…", "zod": "^3.25 || ^4.0",
  "zod-to-json-schema": "…" }

// @modelcontextprotocol/server@2.0.0 — 2 direct dependencies
{ "zod": "^4.2.0", "@modelcontextprotocol/core": "2.0.0" }

// @modelcontextprotocol/core@2.0.0 — 1
{ "zod": "^4.2.0" }
```

`AGENTS.md:175-176` is describing the v1 manifest exactly: `express` and `hono` really are direct
runtime dependencies of the monolith, for every consumer, stdio or not. v2 pushes them behind the
adapter packages, which declare their frameworks as **peer** dependencies rather than direct ones.

**`@modelcontextprotocol/node` is not needed here and should not be added.** It is the Node
`IncomingMessage`/`ServerResponse` Streamable-HTTP wrapper; its manifest is
`dependencies: { "@hono/node-server": "^1.19.9" }`, `peerDependencies: { "hono": "^4.11.4"
(optional), "@modelcontextprotocol/server": "^2.0.0" }`. Adding it would drag `@hono/node-server`
back in for no reason. The ticket's guess that "a scoped `/node` package may change that calculus in
either direction" resolves cleanly: **`/node` is for HTTP, we serve stdio, so `/node` is simply not
part of our tree.**

### Two honest counterweights

**The tarball is not smaller.** `@modelcontextprotocol/server@2.0.0` unpacks to **6.2 MB** against
the v1 SDK's **5.9 MB**, plus `@modelcontextprotocol/core` at 1.3 MB. v2 pre-bundles what v1
delegated — notably ajv, which is now a 273 KB chunk inside the package
(`dist/ajvProvider-CEoC__sr.mjs`) rather than a `node_modules` entry. From the guide's
[Enhancements](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/upgrade-to-v2.md#enhancements):

> The SDK auto-selects the validator: Node.js → AJV […] You don't need to install `ajv`,
> `ajv-formats`, or `@cfworker/json-schema` for the default path.

And it *is* loaded on the stdio path — `dist/index.mjs` imports `@modelcontextprotocol/server/_shims`,
which on the `node` condition resolves to `dist/shimsNode.mjs`, whose entire body is:

```js
import { n as AjvJsonSchemaValidator } from "./ajvProvider-CEoC__sr.mjs";
import process from "node:process";
export { AjvJsonSchemaValidator as DefaultJsonSchemaValidator, process };
```

So the win is in **package count, supply-chain surface and install-time transitive risk — not
bytes**. 91 packages from ~40 publishers becomes 3 from 2. For a tool that runs inside developer
repositories, that is the axis that matters, and it is the one `AGENTS.md:175-176` was reaching for.

**The tests need `@modelcontextprotocol/client`,** which is not as slim: its manifest carries
`cross-spawn`, `eventsource`, `eventsource-parser`, `jose`, `pkce-challenge`. Measured closure for
`server + client + zod`: **14 packages, 21 MB** — still an 85% package-count reduction from 91, and
it lands in `devDependencies`, not the published runtime tree. The shipped `dependencies` stay at
three.

### The build itself

`tsconfig.json` sets `"module": "nodenext"` / `"moduleResolution": "nodenext"`, which honours
`exports` maps — required, because every v2 entry point is `exports`-only and the package uses a
self-referential `@modelcontextprotocol/server/_shims` import internally. **Verified:** the smoke
build compiled under this repo's tsconfig copied verbatim and ran on Node v24.15.0 with no resolution
flags, no `paths` entries, and no bundler. v2 also ships `.cjs` alongside `.mjs`; irrelevant to us
(`"type": "module"`), but it means nothing about the build shape has to change.

**Net effect on the no-bundler decision: the conclusion survives, the reason changes.** Not bundling
is still right — for a stdio binary with three runtime dependencies there is nothing to gain — but
after migration it can no longer be justified by "bundling would inline express and hono", because
there would be no express and no hono. `AGENTS.md:175-176` would need its second sentence rewritten
whichever way T30 goes.

---

## 4. Does anything in v2 interact with the peer-reader web listener?

**No.** T22 settled that the browser-facing process reads the ADR 0001 driver seam directly and never
speaks MCP. Nothing in v2 touches that. Verified rather than assumed, four ways:

1. **No HTTP module is imported on the path we use.** `@modelcontextprotocol/server@2.0.0`'s
   `dist/stdio.mjs` imports exactly three specifiers: two internal chunks and
   `@modelcontextprotocol/server/_shims`. Grepped for an actual `import`/`require` of `node:http` in
   `dist/index.mjs`, `dist/index.cjs` and `dist/stdio.mjs`: **none**. The single textual occurrence of
   `node:http` in `index.mjs` is inside a JSDoc comment.
2. **No ambient side effects.** Grepped the server package's runtime chunks for top-level
   `process.on(`, `globalThis.… =`, `.listen(` and `createServer(`: **no matches**. Importing the
   package binds no port, registers no signal handler, and mutates no global. `createMcpHandler`,
   were we ever to use it, returns a `fetch`-shaped function the caller mounts — it does not listen.
3. **No framework collision.** §3's dependency lists are the evidence: v2 brings no `express`, `hono`,
   `cors` or `router` into the tree, so a hand-rolled `node:http` listener beside the MCP layer shares
   nothing with it and cannot be version-constrained by it.
4. **Nothing in the repo would break on the removals.** Grepped `src`, `test`, `bench` for imports of
   `express`, `hono`, `cors`, `@hono/*`, `ajv`, `jose`, `eventsource`, and for `node:http`,
   `node:net`, `createServer(`, `.listen(`: **no matches**. There is no HTTP code in this repo today.

One genuine interaction exists, and it is a **future** hazard rather than a present one, so it is
worth writing down: today `express`, `hono` and `cors` are physically present in `node_modules` as
incidental transitive deps of the v1 SDK. A peer-reader listener written *before* a v2 migration could
`import` one of them and appear to work without declaring it — a phantom dependency. Migrating to v2
deletes all three, so such a listener would break at import time. **The mitigation is to migrate
before the web listener is written, not after.** T22's chosen shape — a hand-rolled `node:http`
handler over the driver seam — has no framework dependency at all and is unaffected either way, which
is one more argument for it.

---

## 5. Migration options

### Option A — migrate now

**Cost.** Bounded and mostly mechanical. `npx @modelcontextprotocol/codemod@latest v1-to-v2 .`
rewrites the four import sites and `package.json` in one pass, then:

- Resolve `InMemoryTransport` by hand in three test files (`RESOLVE_BY_CONTEXT` — the codemod will
  not choose). Both halves of each `createLinkedPair()` from one package.
- Optionally wrap eight `inputSchema` raw shapes in `z.object()` — the codemod does this, and it
  clears the `@deprecated` overload.
- Add `@modelcontextprotocol/client` to `devDependencies`; `@modelcontextprotocol/server` replaces
  the SDK in `dependencies`.
- Re-baseline the capabilities assertion: `resources.listChanged` now advertises `true`. Set it to
  `false` explicitly at `src/server.ts:131` (and `tools` with it) rather than accepting the default.
- Rewrite `AGENTS.md:162-165` and `AGENTS.md:175-176`.
- Run `pnpm check && pnpm test`. Note the codemod does not reformat — `pnpm format` after.

**Risk.** Low, and lower than it looks:
- The v2 GA is **seventeen days old** with no 2.0.1 yet — genuinely fresh, and that is the real risk.
- But **the wire output does not change**: negotiated version stays `2025-11-25`, era stays `legacy`,
  measured. Any regression would be internal to the SDK, in code paths a stdio server with eight
  tools barely exercises.
- The two behavioral deltas are both known, both measured, both one-line.
- Reverting is a `git revert` of one commit; nothing in the workspace format or the tracker files is
  touched.

**Gain.** 91 packages → 3. `AGENTS.md:175-176`'s premise resolved rather than left stale. The pin
lands on the line that receives commits.

### Option B — migrate on a named trigger

The candidate triggers, and what is actually wrong with each:

| Trigger | Assessment |
| --- | --- |
| "When 1.x is deprecated" | **Weak.** §1 found no date and no flag. This trigger may never fire, and 1.x could go quiet without ever being formally deprecated — which is arguably already happening. |
| "At 2027-01-27, the 6-month floor" | **Better, but it is a floor, not an expiry.** Nothing happens on that date. It fires late and means nothing when it does. |
| "When we need `2026-07-28`" | **Never fires by construction.** T21 established we want nothing in that revision, and it is out of scope for T30. |
| "When a v1 CVE goes unpatched" | **Fires exactly when it is most expensive** — under time pressure, with the migration still ahead of us. |
| **"Before the `frontier-web` listener is written"** | **The one real trigger.** §4: migrating after the listener exists risks a phantom-dependency break on express/hono/cors; migrating before cannot. |

**Cost.** Same as A, deferred, plus carrying an accurate-but-stale `AGENTS.md` in the meantime — which
is the specific harm T30 was opened to fix ("what the note does not say is that a **whole package
family** now exists alongside the one we pin, which is the part a future reader will trip over").

**Risk.** The migration gets no easier by waiting, and one plausible trigger makes it harder.

### Option C — stay pinned on `^1.30.0`

**Cost.** Zero today, genuinely. The server works, the protocol ceiling is irrelevant to us, and the
6-month floor is real. But: 91 packages in the runtime tree of a tool that installs into developer
repositories, of which ~60 exist to serve HTTP we do not serve; a fix queue with 46 open PRs and zero
merges in sixteen days, so a v1 bug we hit has no visible path to a release; and `AGENTS.md:175-176`
stays wrong-by-omission indefinitely.

**Risk.** Deferred, and it compounds: the longer the pin holds, the more likely the migration happens
under pressure (a CVE in one of those 88 packages) or after the web listener has already been built
against phantom dependencies.

### Recommendation

**Migrate now (Option A).**

The load-bearing reasons, in order:

1. **The migration is smaller than the deliberation.** Four import lines, no renames, no signature
   changes on anything this repo calls, and a `tsc --noEmit` that came back clean on the first
   attempt under this repo's own strict tsconfig. It was measured, not estimated.
2. **It changes nothing on the wire.** Negotiated `2025-11-25`, era `legacy`, identical to today —
   confirmed by running both. This is a dependency-line change with no protocol consequence, which is
   exactly the question T30 asked.
3. **The dependency argument is now the whole argument.** 91 → 3 is not a marginal improvement, and
   it retires `AGENTS.md:175-176`'s premise instead of leaving it to rot. That the tarball is slightly
   *larger* is worth stating plainly and does not change the conclusion: package count and
   supply-chain surface are what matter for something that installs into other people's repositories.
4. **v1's guarantee is on paper and its throughput is zero.** Sixteen days without a merge, 46 open
   PRs, four filed in the last week. The commitment is real; the attention has moved. Nothing about
   waiting improves the odds.
5. **The only trigger worth naming fires soon and fires the wrong way.** Migrating before the
   `frontier-web` listener exists is free; after, it risks a phantom-dependency break.

**The honest counterweight**, stated so it is not lost: the v2 GA is seventeen days old and has not
yet needed a patch release. If that reads as too fresh, the defensible fallback is **Option B with
"before the `frontier-web` listener lands" as the trigger** — the only trigger in the table that
fires at the right time and for a real reason. What is *not* defensible is Option C, or Option B with
"when 1.x is deprecated" as the trigger, because §1 found no evidence such a date will ever be
announced.

Either way, `AGENTS.md:162-165` needs to say the scoped family exists — that acceptance criterion is
independent of which option wins.

---

## Sources

All fetched or measured **2026-08-13**.

**npm registry**

- [`@modelcontextprotocol/sdk`](https://registry.npmjs.org/@modelcontextprotocol/sdk) — `latest` = 1.30.0; no package-level `deprecated`; 79 versions, 2 flagged (`1.0.2`, `1.23.0-beta.0`); `time.modified` = 2026-07-27T17:56:02Z
- [`@modelcontextprotocol/server`](https://registry.npmjs.org/@modelcontextprotocol/server) · [`/client`](https://registry.npmjs.org/@modelcontextprotocol/client) · [`/core`](https://registry.npmjs.org/@modelcontextprotocol/core) · [`/node`](https://registry.npmjs.org/@modelcontextprotocol/node) · [`/express`](https://registry.npmjs.org/@modelcontextprotocol/express) · [`/hono`](https://registry.npmjs.org/@modelcontextprotocol/hono) · [`/fastify`](https://registry.npmjs.org/@modelcontextprotocol/fastify) · [`/codemod`](https://registry.npmjs.org/@modelcontextprotocol/codemod) — all `latest` = 2.0.0, none deprecated
- [`@modelcontextprotocol/server-legacy`](https://registry.npmjs.org/@modelcontextprotocol/server-legacy) — `latest` = 2.0.0, **deprecated** with the message quoted in §1
- `npm view @modelcontextprotocol/sdk deprecated` and `…@1.30.0 deprecated` — both empty

**TypeScript SDK repository (github.com/modelcontextprotocol/typescript-sdk)**

- [`README.md`](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md) (`main`) — the "at least 6 months" statement; the PR-limiting warning
- [`README.md`](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/README.md) (`v1.x`) — **negative result: no deprecation banner, no EOL notice, no v2 pointer**
- [`CONTRIBUTING.md`](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/CONTRIBUTING.md) — branch policy, lines 50-60; v1.x patch-release procedure, lines 130-166
- [`SECURITY.md`](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/SECURITY.md) — **negative result: no supported-versions table**
- [`docs/migration/upgrade-to-v2.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/upgrade-to-v2.md) — packaging split, imports & transports, server registration API, Standard Schema, behavioral changes, Unchanged APIs
- [`docs/migration/support-2026-07-28.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md) — hand-wired stdio serves 2025-era only; `InMemoryTransport` is 2025-era only
- [`docs/serving/stdio.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/stdio.md) · [`docs/serving/legacy-clients.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/legacy-clients.md) · [`docs/protocol-versions.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/protocol-versions.md)
- [`packages/codemod/src/migrations/v1-to-v2/mappings/importMap.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/codemod/src/migrations/v1-to-v2/mappings/importMap.ts) — authoritative per-import routing
- GitHub API: repo metadata; `branches/v1.x` and `branches/v1.x-2026-07-28`; `compare/v1.x...v1.x-2026-07-28`; `commits?sha=v1.x&since=2026-07-27`; `pulls?base=v1.x` (open and closed); `actions/runs?branch=v1.x`; `releases`; `contents/.github/workflows` on both branches
- [Releases](https://github.com/modelcontextprotocol/typescript-sdk/releases) — all 2.0.0 packages `prerelease: false`, published 2026-07-27T23:55Z; `1.30.0` published 2026-07-27T17:54:36Z

**Package tarballs (`npm pack`, unpacked and read)**

- `@modelcontextprotocol/server@2.0.0` — `package.json` (2 deps, `exports` map); `dist/index.d.mts` (root barrel); `dist/stdio.d.mts` (`serveStdio`, `StdioServerTransport`, `ServeStdioOptions`); `dist/createMcpHandler-CLhGwQTn.d.mts:3300-3318` (`registerTool` overloads); `dist/shimsNode.mjs`
- `@modelcontextprotocol/core@2.0.0`, `@modelcontextprotocol/client@2.0.0`, `@modelcontextprotocol/node@2.0.0` — manifests

**Local measurement (this machine, Node v24.15.0, TypeScript 5.9.3)**

- `node_modules/@modelcontextprotocol/sdk/dist/esm/types.d.ts:3-4` — v1 protocol ceiling
- Two throwaway `npm install`s + `npm ls --all --parseable` — the 91 vs 3 vs 14 package counts and disk sizes
- A smoke project using this repo's `tsconfig.json` verbatim — `tsc --noEmit` exit 0 on the raw-shape v2 port; in-memory round trip reporting era `legacy`, version `2025-11-25`; the v1/v2 `$schema` and capability comparisons
- Repo greps for the SDK surface and for phantom framework imports

**Specification (modelcontextprotocol.io)**

- [Versioning](https://modelcontextprotocol.io/specification/versioning) — current revision still `2026-07-28`

**Prior art in-repo**

- `docs/research/browser-transport.md` (T21, dated 2026-08-08) — §1 package table confirmed; its
  `serveStdio` claim refined in §2 above
