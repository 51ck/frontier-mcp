# Runtime scripts

## Purpose

Reusable executable checks for FrontierMCP runtime compatibility.

## Ownership

This document owns `scripts/`. The root document retains the application and package contracts.
These scripts provide runtime probes and setup helpers for T88–T91.

## Local Contracts

- `runtime-check.mjs` starts the supplied runtime and compiled package entry as real MCP stdio
  subprocesses. It never imports FrontierMCP source modules.
- Its check covers the public MCP surface, filesystem invalidation, and cross-process claim and id
  allocation. Keep those checks at the MCP/process boundary.
- `runtime-check.mjs` accepts `--runtime` and `--entry` so another setup or launcher can supply the
  command it wants verified.
- `package-runtime-check.mjs` creates an npm tarball and installs it with production dependencies in
  an isolated fixture before handing its installed entry to `runtime-check.mjs`. CI can supply its
  already-built `--tarball`.
- `frontier-setup.cjs` is a dependency-free Node 16 bootstrap. It reads the exact released pin's
  engine declaration, uses a resolved compatible Node plus its pnpm/Corepack JavaScript entry, stages
  an immutable user-data install, verifies real MCP initialization and `tools/list`, then previews or
  applies only Cursor user configuration. It ships in the package as bootstrap revision 1. Its private `testing` export exists solely for the adjacent
  process-level check to force races and protocol failures; it is not a supported interface.
- `frontier-setup-check.cjs` runs that bootstrap under Node 16 against an explicit newer Node and the
  released pin named by `FRONTIER_SETUP_RELEASE` (default `0.3.1`). It requires `FRONTIER_NODE16` and
  `FRONTIER_NODE24`, uses a temporary home and project, and needs registry access.
- The compiled package is verified from Node 20.20.2 on 20.x, 22.17.1 on 22.x, and 24.15.0 on 24.x.
  A probe result for another major is evidence to assess, not an expansion of that contract.

## Work Guidance

- Use Node 20.20-compatible JavaScript and built-in modules in the probe.
- Keep checks self-contained and leave setup policy to the setup helper that calls them.

## Verification

- Build first, then run `pnpm run test:runtime`.
- Run `FRONTIER_NODE16=/path/to/node16 FRONTIER_NODE24=/path/to/node24 pnpm run test:setup` for the
  source-checkout setup smoke. It never runs as part of the ordinary test suite because it installs a
  released package from the registry.

## Child DOX Index

No children.
