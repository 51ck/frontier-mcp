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
- The compiled package is verified from Node 20.20.2 on 20.x, 22.17.1 on 22.x, and 24.15.0 on 24.x.
  A probe result for another major is evidence to assess, not an expansion of that contract.

## Work Guidance

- Use Node 20.20-compatible JavaScript and built-in modules in the probe.
- Keep checks self-contained and leave setup policy to the setup helper that calls them.

## Verification

- Build first, then run `pnpm run test:runtime`.

## Child DOX Index

No children.
