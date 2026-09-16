---
id: T90
title: Find compatible installed Node versions through existing version managers
kind: build
status: resolved
triage: needs-triage
blocked_by: [T89]
answer_gist: Discover six Node managers without changing project or default state, with real fnm setup verified on macOS, Linux, and Windows.
---

## What to build

A user whose current Node is too old runs setup and gets FrontierMCP configured with an already installed suitable Node found through fnm, nvm, nvm-windows, Volta, asdf or mise. The user's project pin, global default and other open terminals keep their current runtime.

## Acceptance criteria

- [x] Detect the six named managers on their supported platforms, including nvm as a shell function with an installation directory rather than only an executable on PATH. Honor manager-specific locations and custom installation roots.
- [x] Ask each manager for installed versions, resolve and probe real executables, and select deterministically against the pinned server's supported version range. An explicit runtime override wins; an existing suitable Node avoids an unnecessary installation.
- [x] Saved launches supply an explicit version or resolved executable; project pins cannot switch them back to old Node. Do not persist a temporary fnm multishell path or a manager shim that reselects versions from the project.
- [x] Detection does not install runtimes, rewrite shell profiles or change global/project defaults. In particular, nvm-windows use is not used to switch its shared symlink.
- [x] If a detected manager has no suitable installed runtime, show the command for that manager to install the recommended supported LTS. If no manager is found and Node is too old, recommend fnm. A removed runtime produces clear repair guidance on the next launch.
- [x] End-to-end fixtures exercise old current Node plus suitable managed Node, multiple managers, missing installations, custom paths and spaces. Real platform checks substantiate advertised Windows/macOS/Linux support.
- [x] The installation guide includes manager-specific manual launch recipes that preserve the project's version, desktop PATH caveats and the same fallback policy as setup.

## Research

See [runtime setup research](../../../docs/research/2026-09-04-runtime-setup.md), including manager command references and the child-shebang trap.

## Comments

Implemented direct installed-runtime discovery for fnm, nvm, nvm-windows, Volta, asdf and mise across configured/custom roots; deterministic stable executable selection; immutable launch wrappers; and repair guidance for deleted runtimes. Added independent fixtures for all six managers, custom paths, spaces, missing runtimes, multiple candidates, Windows quoting and Node16 project pins. check, focused setup, 248 tests, build and diff check pass. Two blind review cycles completed. Remaining requirements: query each manager's installed-version interface before layout fallback, and obtain real Windows/Linux manager plus saved-launch evidence. Current Windows/Linux coverage is fixture-only and documentation says so. Ticket remains claimed and unresolved.

2026-09-13: Explicitly released stale codex-ship claim to resume the user-authorized work.

2026-09-13: Reclaimed as codex-ship; implementing manager list interfaces before layout fallback and adding real-platform setup checks to existing runtime CI. T89 publication remains pending.

2026-09-14: Added installed-version queries for fnm, nvm, nvm-windows, asdf and mise alongside Volta, with version filtering and probed-layout fallback. nvm loads its script with --no-use in an isolated child shell; all queries, including nvm-windows root lookup, run away from the consumer project with a five-second timeout. Fixtures assert actual queries, filtering, failure fallback, custom paths and multiple managers. Root verified the real fnm platform check on macOS arm64: Node 16.20.2 project PATH selected persistent Node 24.15.0, installed published 0.3.1 outside the project, applied Cursor with paths containing spaces, and passed MCP/idempotence checks. Existing runtime.yml now provisions real fnm on macOS/Linux/Windows; Linux/Windows setup results remain pending, so the platform criterion and Ticket stay open.

2026-09-14 verification: `pnpm run check`, `pnpm run build`, and all 252 tests pass. Full-suite signal tests exposed a separate startup-readiness race; replacing their fixed delay with a real initialization response removed it without weakening shutdown assertions. That prerequisite is reviewed separately from setup. DOX pass records query/CI contracts in scripts and root documents; Child DOX Index is unchanged because ownership is unchanged.

2026-09-15 review remediation: cleared BASH_ENV on the nvm child because Bash reads it despite --noprofile/--norc. A startup-file fixture proves the file is not sourced while installed-version discovery still succeeds. The invoked noninteractive Bash mode does not read ENV (checked locally), so that variable is unchanged. Setup smoke under Node 16.20.2/24.15.0, `pnpm run check`, 252 tests, and build pass. Scripts DOX records BASH_ENV isolation; root DOX and Child DOX Index need no further change.

2026-09-15 review cycle 2: moved BASH_ENV clearing to the shared manager-query boundary so Bash-based manager executables cannot source inherited startup files. The fixture now proves both the nvm child and a Bash-based asdf executable ignore BASH_ENV while their installed-version queries succeed. The focused setup smoke, `pnpm run check`, all 252 tests, and build pass. Scripts DOX now records the shared query contract; root DOX and Child DOX Index remain unchanged because ownership and structure did not change.

2026-09-15 review cycle 3: routed the Volta list and nvm-windows root queries through the same sanitized manager environment as every installed-version query. Bash-backed fixtures now cover every manager list path and the separate nvm-windows root path, while nvm keeps its explicit directory and PATH. The focused setup smoke, `pnpm run check`, all 252 tests, and build pass. The existing scripts DOX contract already states that every query clears BASH_ENV, so no further DOX text or index change was needed.

2026-09-16: [Runtime CI run 35074448965](https://github.com/51ck/frontier-mcp/actions/runs/35074448965) passed Development, real-fnm Setup on macOS/Linux/Windows, and the package probe at Node 20.20.2, 22.17.1 and 24.15.0 on all three operating systems. The Windows disposable-directory cleanup retry removed the final platform-check race; the platform runs verify registration, saved launch, Node 16 project isolation, paths with spaces, manager listing and idempotence. The final criterion is checked and T90 is resolved.
