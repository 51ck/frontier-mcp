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
  allocation. Prime the watcher cache after its attach settle schedule finishes so a scheduled
  invalidation cannot hide a missing filesystem event. Keep checks at the MCP/process boundary.
- `runtime-check.mjs` accepts `--runtime` and `--entry` so another setup or launcher can supply the
  command it wants verified.
- `package-runtime-check.mjs` creates an npm tarball and installs it with production dependencies in
  an isolated fixture before handing its installed entry to `runtime-check.mjs`. CI can supply its
  already-built `--tarball`. The package check accepts pnpm distributed as JavaScript or a native
  executable.
- `frontier-setup.cjs` is a dependency-free Node 16 bootstrap. It reads the exact released pin's
  engine declaration, uses a resolved compatible Node plus its pnpm/Corepack JavaScript entry, stages
  an immutable user-data install, verifies real MCP initialization and `tools/list`, then previews or
  applies only Cursor user configuration. It ships in the package as bootstrap revision 1. Its private `testing` export exists solely for the adjacent
  process-level check to force races and protocol failures; it is not a supported interface.
- Cursor configuration writes back up the previous file, refuse malformed JSON and changes detected
  by the final read, then replace by rename. The setup guard serializes cooperating setup processes;
  an unrelated editor can still write between that final read and rename. This accepted limit must
  stay visible in installation instructions; backups recover the prior file, not that intervening edit.
- When its current Node is unsuitable and no explicit `--node` was supplied, `frontier-setup.cjs`
  queries installed versions from fnm, nvm, nvm-windows, Volta, asdf, and mise before falling back
  to their layouts when the command is missing, fails, or has unrecognized output. Queries run away
  from the consumer project with a five-second timeout and `BASH_ENV` cleared. nvm loads only its
  script with `--no-use` in a child shell that also disables profiles and rc files. It resolves and
  probes a persistent executable, never a project-sensitive shim; manager discovery never installs,
  changes a default, or reads shell profiles. Saved launches use a generated wrapper so a deleted
  managed executable reports its manager-specific repair command on stderr. The setup fixture
  exercises the documented on-disk layouts; only fnm discovery is measured against a local macOS
  installation.
  Launcher filenames derive from their contents so a preview cannot rewrite an already configured
  launch. Windows uses a batch launcher; preflight invokes system `cmd.exe`, as the SDK transport's
  batch-file support does. Keep Windows claims limited to fixtures until measured there.
- `frontier-setup-check.cjs` runs that bootstrap under Node 16 against an explicit newer Node and the
  released pin named by `FRONTIER_SETUP_RELEASE` (default `0.3.1`). It requires `FRONTIER_NODE16` and
  `FRONTIER_NODE24`, uses a temporary home and project, and needs registry access.
- `frontier-setup-platform-check.cjs` verifies a real preinstalled fnm and Node 16/24 pair, including
  Cursor application, idempotence, saved-launch MCP, unchanged project pins and manager listing.
  The `setup-runtime` CI job provisions fnm on macOS, Linux, and Windows before this check; results
  from other managers remain fixture evidence. It installs the released package in a temporary home.
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
