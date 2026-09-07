---
id: T91
title: Select project Bun or Deno only when FrontierMCP compatibility is verified
kind: build
status: claimed
triage: ready-for-agent
blocked_by: [T89, T88]
claimed_by: codex-ship
claimed_at: 2026-09-05T10:00:07.405Z
---

## What to build

The installed user-scope launcher can prefer a project's Bun or Deno runtime when that exact runtime/version/platform has verified FrontierMCP support. Unsupported or failed candidates fall back to the selected supported Node with an explanation. Project runtime choice is made from the workspace at server launch; the directory where setup originally ran must not impose Bun or Deno on every later project. Per-call root overrides keep the already running runtime.

Research on 2026-09-04 found that Bun 1.3.14 and Deno 2.9.6 passed MCP initialization, resource reading and Ticket lifecycle calls, but both left a Board stale after an external Ticket edit on macOS arm64. Reproducing this failure is the starting point. Compatibility is conditional, so shipping an honest rejection/fallback for unsupported versions is valid; do not enable them based only on a successful handshake or a vendor's Node-compatibility claim.

## Acceptance criteria

- [ ] Project markers include Bun's package-manager declaration and current/legacy lockfiles, and Deno configuration/lockfiles. Search only the resolved launch workspace with documented monorepo boundaries. Conflicting markers produce an explicit choice or visible Node fallback; an override wins.
- [ ] Bun and Deno are assessed separately against the actual pinned package, including installation/launch, MCP calls, shipped resources, lifecycle writes, nested external edits after watcher settling, newly created directories and cross-process claim/id guarantees. Declare tested versions/platforms and retain Node fallback for unverified combinations.
- [ ] A regression reproduces the observed stale Board. Automatic selection of affected runtime versions remains disabled unless a verified fix or a newer verified runtime resolves it. This Ticket may complete with documented unsupported status and working fallback.
- [ ] Bun execution explicitly forces Bun despite the package's Node shebang. A Node 16 executable on PATH cannot silently become the server runtime.
- [ ] Deno execution uses isolated npm resolution and explicit noninteractive permissions for the operations actually required. It does not discover or rewrite the consumer's Deno config, lockfile or node_modules. Verify the final npm launcher separately from a local dependency-tree test.
- [ ] Runtime verification uses throwaway storage, never mutates the consumer's tracker, and keeps diagnostics off MCP stdout. The launcher does not rerun destructive compatibility probes against real projects at each startup.
- [ ] User-scope launch is demonstrated from a Node project and a Bun/Deno project without re-registering the server. Project pins and per-call workspace resolution remain unchanged.
- [ ] The guide provides the tested manual Bun/Deno commands, precise limitations and Node fallback, distinguishing candidate commands from supported recipes.

## Research

See [runtime setup research](../../../docs/research/2026-09-04-runtime-setup.md).
