---
id: T91
title: Select project Bun or Deno only when FrontierMCP compatibility is verified
kind: build
status: resolved
triage: needs-triage
blocked_by: [T89, T88]
claimed_by: codex-ship
claimed_at: 2026-09-05T10:00:07.405Z
answer_gist: Select only an exact verified Bun or Deno tuple at launch; otherwise explain and use Node.
---

## What to build

The installed user-scope launcher can prefer a project's Bun or Deno runtime when that exact runtime/version/platform has verified FrontierMCP support. Unsupported or failed candidates fall back to the selected supported Node with an explanation. Project runtime choice is made from the workspace at server launch; the directory where setup originally ran must not impose Bun or Deno on every later project. Per-call root overrides keep the already running runtime.

Research on 2026-09-04 found that Bun 1.3.14 and Deno 2.9.6 passed MCP initialization, resource reading and Ticket lifecycle calls, but both left a Board stale after an external Ticket edit on macOS arm64. Reproducing this failure is the starting point. Compatibility is conditional, so shipping an honest rejection/fallback for unsupported versions is valid; do not enable them based only on a successful handshake or a vendor's Node-compatibility claim.

## Acceptance criteria

- [x] Project markers include Bun's package-manager declaration and current/legacy lockfiles, and Deno configuration/lockfiles. Search only the resolved launch workspace with documented monorepo boundaries. Conflicting markers produce an explicit choice or visible Node fallback; an override wins.
- [x] Bun and Deno are assessed separately against the actual pinned package, including installation/launch, MCP calls, shipped resources, lifecycle writes, nested external edits after watcher settling, newly created directories and cross-process claim/id guarantees. Declare tested versions/platforms and retain Node fallback for unverified combinations.
- [x] A regression reproduces the observed stale Board. Automatic selection of affected runtime versions remains disabled unless a verified fix or a newer verified runtime resolves it. This Ticket may complete with documented unsupported status and working fallback.
- [x] Bun execution explicitly forces Bun despite the package's Node shebang. A Node 16 executable on PATH cannot silently become the server runtime.
- [x] Deno execution uses isolated npm resolution and explicit noninteractive permissions for the operations actually required. It does not discover or rewrite the consumer's Deno config, lockfile or node_modules. Verify the final npm launcher separately from a local dependency-tree test.
- [x] Runtime verification uses throwaway storage, never mutates the consumer's tracker, and keeps diagnostics off MCP stdout. The launcher does not rerun destructive compatibility probes against real projects at each startup.
- [x] User-scope launch is demonstrated from a Node project and a Bun/Deno project without re-registering the server. Project pins and per-call workspace resolution remain unchanged.
- [x] The guide provides the tested manual Bun/Deno commands, precise limitations and Node fallback, distinguishing candidate commands from supported recipes.

## Research

See [runtime setup research](../../../docs/research/2026-09-04-runtime-setup.md).

## Comments

2026-09-15 evidence slice: strengthened `runtime-check.mjs` now primes each Board after watcher
settling and covers a newly created Effort plus a later edit inside its new directory. On macOS
arm64, Node 24.15.0, Bun 1.3.14, and Deno 2.9.6 passed the compiled-package probe under unrestricted
filesystem access; disabling watcher event invalidation made the Node baseline fail. Released 0.3.1
also passed installed-entry and final `bun x --bun` / isolated Deno `npm:` probes. With Node 16.20.2
first on `PATH`, both final launchers claimed and resolved a Legacy Ticket without losing its body.
Malformed consumer `deno.json` and `deno.lock` files stayed byte-identical and no consumer
`node_modules` appeared. Sandbox watcher errors caused reattachment timers that could hide a broken
Node watcher, while Bun/Deno went stale there, so runtime comparisons must use matched filesystem
permissions. Full commands, limitations, and artifact checksum are recorded in
[the dated verification](../../../docs/research/2026-09-15-t91-runtime-verification.md). Selection,
fallback, saved-launch, and multi-project implementation remain open; no acceptance criterion is
checked by this evidence alone.

2026-09-15 implementation: the content-addressed user launcher now chooses at each start from the
launch directory through the nearest `.scratch/` or `.git` workspace boundary. It recognizes every
specified marker, uses Node for mixed or missing workspace markers, and honors
`FRONTIER_RUNTIME=node|bun|deno` without letting an override bypass compatibility checks. Only the
measured `frontier-mcp@0.3.1` + macOS arm64 + Bun 1.3.14 or Deno 2.9.6 tuples are enabled. Bun uses
`x --bun`; Deno uses the tested isolated `npm:` flags. The selector checks markers, executable
presence and version at startup; it never runs lifecycle probes against the consumer workspace.
Diagnostics stay on stderr and a selected npm runner failure exits instead of switching runtimes
after partial startup.

The Node 16 process fixture applies one Cursor user entry, then starts it from Node, nested Bun, and
Deno projects without registration changes. It covers all marker forms, monorepo boundaries, mixed
markers, explicit and invalid overrides, unsupported and missing Bun fallback, exact commands,
unchanged Deno sentinels, and Node 16 first on `PATH`. The dated verification supplies the real Bun
and Deno package/lifecycle/watcher/concurrency evidence; the process fixture pins selection behavior.

## Answer

The saved launcher chooses Bun or Deno only for an exact verified package, runtime, platform and
architecture tuple. Every unverified, ambiguous, missing, or invalid choice reports its reason and
uses the compatible Node selected during setup. README documents the boundary, override, supported
manual commands, cache/network behavior, and fixed-per-session runtime. T92 can consolidate the
whole installation guide without changing this selection contract.
