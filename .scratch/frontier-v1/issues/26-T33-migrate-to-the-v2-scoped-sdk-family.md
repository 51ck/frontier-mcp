---
id: T33
title: Migrate to the v2 scoped SDK family
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T30]
answer_gist: On the v2 scoped family at a runtime closure of three packages, negotiating the same 2025-11-25 as before; the handshake surface the migration moved is now pinned by tests that had never covered it
---

## What

T30 decided Option A — migrate now. This is that migration. `docs/research/sdk-v2-family.md`
is the evidence; it is a dated snapshot (2026-08-13) and the per-import table in its §2 is the
specification for this Ticket.

`@modelcontextprotocol/sdk@^1.30.0` becomes `@modelcontextprotocol/server@^2.0.0` in
`dependencies`, and `@modelcontextprotocol/client@^2.0.0` joins `devDependencies` for the test
harness. `@modelcontextprotocol/node` is **not** added — it is HTTP-only and this server is stdio.

Four import sites, no renames and no signature changes on anything this repo calls:

| Site | v1 | v2 |
| --- | --- | --- |
| `src/server.ts:5` | `McpServer` from `sdk/server/mcp.js` | `@modelcontextprotocol/server` |
| `src/bin.ts:2` | `StdioServerTransport` from `sdk/server/stdio.js` | `@modelcontextprotocol/server/stdio` |
| `test/support/harness.ts:1`, two cross-process tests | `Client` from `sdk/client/index.js` | `@modelcontextprotocol/client` |
| same three files | `InMemoryTransport` from `sdk/inMemory.js` | **`RESOLVE_BY_CONTEXT`** — see below |

`npx @modelcontextprotocol/codemod@latest v1-to-v2 .` does the mechanical pass. It does not
reformat, so `pnpm format` afterwards.

## The parts the codemod will not do

- **`InMemoryTransport` is ambiguous.** It is exported from both `/server` and `/client`, and the
  codemod refuses to choose. Both halves of each `createLinkedPair()` must come from **one**
  package or the pair does not link.
- **`resources.listChanged` now defaults to `true`.** `src/server.ts:131` advertises
  `capabilities: { resources: {} }`; v2 reads that as `listChanged: true`, a notification this
  server never sends. Set `listChanged: false` explicitly there, and on `tools` with it, rather than
  taking either default. Re-baseline whatever assertion covers it.
- **`$schema` moves draft-07 → 2020-12** on emitted tool schemas. Expected, not a regression; any
  snapshot pinning the draft URI gets updated.
- **Raw zod shapes still compile** through `@deprecated` overloads, so the eight `inputSchema`
  shapes are not forced to change. Wrapping them in `z.object()` clears the deprecation and is worth
  doing in the same pass.

## AGENTS.md

Two paragraphs, and this is the part a future reader trips over if it is skipped:

- `AGENTS.md:162-165` — name the scoped family, not just the monolith. T30's fourth acceptance
  criterion.
- `AGENTS.md:175-176` — the no-bundler rationale says bundling "would inline express and hono".
  Under v2 there is no express and no hono in the tree to inline. The `tsc`-alone decision stands;
  its stated reason has to change or it becomes wrong-by-omission.

## Acceptance criteria

- [x] `dependencies` holds `@modelcontextprotocol/server`, `devDependencies` holds
      `@modelcontextprotocol/client`, and `@modelcontextprotocol/sdk` appears nowhere
- [x] `@modelcontextprotocol/node` is not a dependency
- [x] Every `createLinkedPair()` takes both halves from a single package
- [x] `resources.listChanged` and `tools.listChanged` are set explicitly, not defaulted
- [x] `pnpm check && pnpm test` pass, and the runtime still negotiates `2025-11-25` — the wire output
      does not change, which is what makes this revertable
- [x] `AGENTS.md:162-165` and `AGENTS.md:175-176` both updated

## Answer

`@modelcontextprotocol/server@^2.0.0` in `dependencies`, `@modelcontextprotocol/client@^2.0.0` in `devDependencies` for the harness, no `/node`. Four import lines, hand-edited; the codemod was not worth the round trip. All three `createLinkedPair()` sites take both halves from `/server`, `Client` alone from `/client`. Eight raw zod shapes wrapped in `z.object()`. Runtime closure is now `/server` -> `/core` -> zod, plus `yaml` — three packages against v1's 91, with express, hono, cors, ajv and jose among the 88 that left. The lockfile lost 663 lines.

`pnpm check` clean, 220 tests passing across 25 files. The server negotiates `2025-11-25` from both `src/bin.ts` and the built `dist/bin.js`, measured over real stdio rather than assumed.

**One acceptance criterion was written wrong, and ticking it needs the correction on the record.** It says "the wire output does not change". That is true of the protocol version and of tool schema semantics, and false of one field: `tools.listChanged` went `true` to `false`. Under v1 it advertised `true` for a notification this server has never sent — an over-advertisement — and the explicit `false` corrects it. So the migration is still revertable for the reason the criterion was reaching for, but the claim as phrased overstated it. The accurate form is that the negotiated revision does not change and no client-visible behavior depends on the corrected field.

The same criterion's "`@modelcontextprotocol/sdk` appears nowhere" holds for `package.json`, the lockfile, `src/` and `test/`. It survives as prose in `AGENTS.md`, which names the monolith deliberately to say we do not depend on it, and in the dated research docs.

**A gap the migration exposed rather than caused.** It passed on 217 green tests without one of them asserting on anything that moved: no test anywhere referenced `listChanged`, `capabilities`, `protocolVersion` or `$schema`. The handshake surface was entirely uncovered, so the deltas needed no re-baselining because nothing was pinning them. Three tests now sit in `test/ship.test.ts` beside the eight-tool assertion — negotiated version, both `listChanged` flags, and the 2020-12 schema dialect across every tool. The harness needed no extension; the v2 client already exposes all three. Each was confirmed to bite by flipping `tools.listChanged` back to defaulted and watching it go red on the v2 default of `true`.

Out of scope and left alone: `.serena/memories/tech_stack.md` still names the old SDK. It is untracked and gitignored, and will serve stale stack information to Serena-driven sessions until regenerated.
