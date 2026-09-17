---
id: T92
title: Publish one installation guide for automatic setup and manual runtime selection
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T89, T90, T91]
answer_gist: Published one installation guide using the 0.4.1 bootstrap to install the measured 0.4.0 server pin, with complete manual recipes and explicit evidence limits.
---

## What to build

A new user follows the recommended automated setup or configures FrontierMCP manually using an installed Node manager, Bun or Deno, with the same compatibility rules and exact version pin in both paths. Consolidate the path-specific documentation from the setup Tickets into one discoverable public guide.

## Acceptance criteria

- [x] The README recommends the shipped automated setup and links to the full guide. All bootstrap, download and launch examples use real released artifacts and an explicit version pin; proposed commands are not presented as already available.
- [x] Explain the bootstrap's Node minimum, the compiled server's supported Node range and the separate development runtime. Explain how a Node 16 project can use FrontierMCP without changing its own pin, and recommend a supported LTS for new installations.
- [x] Include manual recipes for fnm, nvm, nvm-windows, Volta, asdf and mise, with manager discovery, absolute executable selection, desktop shell/PATH behavior, paths with spaces and commands to install a missing suitable Node. Recommend fnm when no manager exists and current Node is too old.
- [x] Document the exact supported Bun/Deno invocation and permission/config-isolation requirements, measured version/platform coverage, and any remaining watcher or concurrency limitation. If either remains unsupported, say so and supply the working Node fallback.
- [x] Explain target-client configuration formats, user scope, per-launch project detection, mixed project markers, overrides, restart behavior, version updates and how to restore or remove the frontier entry. Copyable examples preserve unrelated MCP servers and match setup output.
- [x] Verify the automatic path and each advertised manual recipe in representative environments; identify recipes that remain unverified instead of claiming universal compatibility.
- [x] Complete the DOX pass: document shipped contracts in their owner, leave dated research as evidence, and keep the README and detailed guide free of conflicting requirements.

## Research

See [runtime setup research](../../../docs/research/2026-09-04-runtime-setup.md),
[runtime verification](../../../docs/research/2026-09-15-t91-runtime-verification.md),
[0.4.0 release follow-up](../../../docs/research/2026-09-16-0.4.0-release-followup.md), and
[0.4.1 bootstrap verification](../../../docs/research/2026-09-17-0.4.1-bootstrap-verification.md).

## Answer

README and the detailed guide now recommend the published 0.4.1 bootstrap with an explicit 0.4.0
server pin. They retain the complete Node-manager, Bun, Deno, client-configuration, update, recovery,
and removal paths while separating literal published-artifact measurements from platform CI and
fixture coverage. The dated research note records the tarball digest, isolated Node 16 bootstrap,
saved launcher's full Bun runtime suite, and evidence boundaries. With pnpm 10, check, build, and all
254 tests pass.

## Comments

2026-09-16: README and the guide named the published 0.4.0 artifact, its real tarball extraction
commands, current Node range, exact server pin, and the bootstrap's cosmetic apply-output defect at
that release. Bun 1.3.14 passed the exact 0.4.0 npm launcher probe. Deno 2.9.6 passed only with a
one-time minimum-dependency-age override; its unchanged command failed during the release
verification window, so 0.4.0 is not allowlisted and uses the supported Node path for Deno. A later
Deno re-evaluation is outside this Ticket. Final published-bootstrap verification remained.

2026-09-17: The published 0.4.1 tarball supplied the final bootstrap. Its preview and apply paths
ran under Node 16.20.2 from an isolated Bun-marked consumer project, installed and verified the exact
0.4.0 server with explicit Node 24.15.0 and Bun 1.3.14 executables, and saved a working
content-addressed launcher without changing the project. That exact launcher passed the full runtime
suite with Bun forced, including watcher and cross-process checks. The guide now separates the 0.4.1
bootstrap artifact from the measured 0.4.0 server pin, removes the obsolete apply-output warning,
and labels literal, CI, and fixture evidence. T92 is resolved.
