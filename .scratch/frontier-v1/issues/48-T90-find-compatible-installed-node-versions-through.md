---
id: T90
title: Find compatible installed Node versions through existing version managers
kind: build
status: claimed
triage: ready-for-agent
blocked_by: [T89]
claimed_by: codex-ship
claimed_at: 2026-09-04T09:40:33.990Z
---

## What to build

A user whose current Node is too old runs setup and gets FrontierMCP configured with an already installed suitable Node found through fnm, nvm, nvm-windows, Volta, asdf or mise. The user's project pin, global default and other open terminals keep their current runtime.

## Acceptance criteria

- [ ] Detect the six named managers on their supported platforms, including nvm as a shell function with an installation directory rather than only an executable on PATH. Honor manager-specific locations and custom installation roots.
- [ ] Ask each manager for installed versions, resolve and probe real executables, and select deterministically against the pinned server's supported version range. An explicit runtime override wins; an existing suitable Node avoids an unnecessary installation.
- [x] Saved launches supply an explicit version or resolved executable; project pins cannot switch them back to old Node. Do not persist a temporary fnm multishell path or a manager shim that reselects versions from the project.
- [x] Detection does not install runtimes, rewrite shell profiles or change global/project defaults. In particular, nvm-windows use is not used to switch its shared symlink.
- [x] If a detected manager has no suitable installed runtime, show the command for that manager to install the recommended supported LTS. If no manager is found and Node is too old, recommend fnm. A removed runtime produces clear repair guidance on the next launch.
- [ ] End-to-end fixtures exercise old current Node plus suitable managed Node, multiple managers, missing installations, custom paths and spaces. Real platform checks substantiate advertised Windows/macOS/Linux support.
- [x] The installation guide includes manager-specific manual launch recipes that preserve the project's version, desktop PATH caveats and the same fallback policy as setup.

## Research

See [runtime setup research](../../../docs/research/2026-09-04-runtime-setup.md), including manager command references and the child-shebang trap.

## Comments

Implemented direct installed-runtime discovery for fnm, nvm, nvm-windows, Volta, asdf and mise across configured/custom roots; deterministic stable executable selection; immutable launch wrappers; and repair guidance for deleted runtimes. Added independent fixtures for all six managers, custom paths, spaces, missing runtimes, multiple candidates, Windows quoting and Node16 project pins. check, focused setup, 248 tests, build and diff check pass. Two blind review cycles completed. Remaining requirements: query each manager's installed-version interface before layout fallback, and obtain real Windows/Linux manager plus saved-launch evidence. Current Windows/Linux coverage is fixture-only and documentation says so. Ticket remains claimed and unresolved.
