---
id: T92
title: Publish one installation guide for automatic setup and manual runtime selection
kind: build
status: open
triage: ready-for-agent
blocked_by: [T89, T90, T91]
---

## What to build

A new user follows the recommended automated setup or configures FrontierMCP manually using an installed Node manager, Bun or Deno, with the same compatibility rules and exact version pin in both paths. Consolidate the path-specific documentation from the setup Tickets into one discoverable public guide.

## Acceptance criteria

- [ ] The README recommends the shipped automated setup and links to the full guide. All bootstrap, download and launch examples use real released artifacts and an explicit version pin; proposed commands are not presented as already available.
- [ ] Explain the bootstrap's Node minimum, the compiled server's supported Node range and the separate development runtime. Explain how a Node 16 project can use FrontierMCP without changing its own pin, and recommend a supported LTS for new installations.
- [ ] Include manual recipes for fnm, nvm, nvm-windows, Volta, asdf and mise, with manager discovery, absolute executable selection, desktop shell/PATH behavior, paths with spaces and commands to install a missing suitable Node. Recommend fnm when no manager exists and current Node is too old.
- [ ] Document the exact supported Bun/Deno invocation and permission/config-isolation requirements, measured version/platform coverage, and any remaining watcher or concurrency limitation. If either remains unsupported, say so and supply the working Node fallback.
- [ ] Explain target-client configuration formats, user scope, per-launch project detection, mixed project markers, overrides, restart behavior, version updates and how to restore or remove the frontier entry. Copyable examples preserve unrelated MCP servers and match setup output.
- [ ] Verify the automatic path and each advertised manual recipe in representative environments; identify recipes that remain unverified instead of claiming universal compatibility.
- [ ] Complete the DOX pass: document shipped contracts in their owner, leave dated research as evidence, and keep the README and detailed guide free of conflicting requirements.

## Research

See [runtime setup research](../../../docs/research/2026-09-04-runtime-setup.md).

## Comments

2026-09-16: README and the guide now name the published 0.4.0 artifact, its real tarball extraction
commands, current Node range, exact server pin, and the published bootstrap's cosmetic apply-output
defect. Bun 1.3.14 passed the exact 0.4.0 npm launcher probe. Deno 2.9.6 passed only with a one-time
minimum-dependency-age override; its unchanged command failed during the release verification
window, so 0.4.0 is not allowlisted and uses the supported Node path for Deno. A later Deno
re-evaluation is outside this Ticket. T92 stays open only for follow-up bootstrap publication and
verification of its final real commands.
