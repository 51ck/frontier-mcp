---
id: T89
title: Run setup from Node 16 and register FrontierMCP with an explicit compatible Node
kind: build
status: claimed
claimed_by: codex-ship
claimed_at: 2026-09-13T14:59:47.551313Z
triage: ready-for-agent
blocked_by: []
---

## What to build

A user in a Node 16 project runs a standalone setup script, chooses an already installed compatible Node, and gets a working pinned FrontierMCP entry in their chosen MCP client without changing the project's runtime. Deliver the complete first path using the current compatible executable or an explicit executable override. Use today's declared server minimum until the runtime-support work changes it.

The bootstrap is separate from the server dependency graph. It must be obtainable before installing an engine-restricted server package. The first configuration writer targets Cursor user scope, matching the existing public install flow; other clients get a printable command/arguments/environment entry for manual placement. This is a setup CLI, not a ninth MCP tool and not tracker-vocabulary onboarding.

## Acceptance criteria

- [ ] A versioned, dependency-free bootstrap runs directly under Node 16 and current supported Node without importing server code. Its tested floor is stated explicitly; it does not claim every historical Node version. The distributed bootstrap can be obtained without first installing the main package under old Node.
- [x] Setup accepts an exact released FrontierMCP version, probes the chosen runtime against that version's declared requirement, and prepares the package outside the consumer repository. Updates remain explicit and pinned.
- [x] The saved command uses an absolute persistent runtime path and a pinned package entry or launcher. Shebangs, package-runner child processes and desktop PATH cannot reselect the project's Node 16. It works with paths containing spaces and preserves the server's launch working directory.
- [x] Preview states the selected runtime, package version, target file and resulting frontier entry; application affects only the selected client. Repeated application is idempotent, unrelated servers/settings survive, and invalid configuration and changes detected by the final pre-replacement read are refused. Replacing an existing frontier entry is explicit and backs up the previous configuration for recovery. An unrelated editor writing between the final read and rename is outside this guarantee; document that interval.
- [x] The exact saved command passes an MCP handshake and tool-list check before configuration is applied. Setup failure leaves the previous working entry intact. Launcher output keeps protocol stdout clean, forwards shutdown, and reports actionable errors on stderr.
- [x] With no usable runtime and no detected version manager, setup explains the minimum and recommends fnm with a supported LTS Node, currently 24. Runtime installation and shell-profile changes are not implicit discovery side effects.
- [x] Verification launches from a project pinned to Node 16 with a minimal desktop-style environment, checks successful registration and malformed-config/no-runtime failure behavior, and confirms no project runtime pins or package files changed.
- [ ] Publish a working quick-start for this path with the bootstrap's actual download/run commands, supported client/scope and manual equivalent.

## Research

See [runtime setup research](../../../docs/research/2026-09-04-runtime-setup.md).

## Comments

Implementation committed incrementally with Node 16.20.2 bootstrap, exact registry pin, persistent Node executable, isolated immutable pnpm install, preflight MCP, Cursor preview/apply/backups and process checks. pnpm check/build and prior full suite (248 tests) pass; focused released 0.3.1 setup check passes on Node 16.20.2 and 24.15.0 with shim canonicalization, Node16 desktop PATH, changed/deleted idempotent config, and final-read race refusal. Two blind review cycles completed. Remaining requirements: public versioned bootstrap download awaits publication; portable optimistic config replacement detects edits before its final read but cannot guarantee refusal/recovery for an unrelated editor writing between that read and rename. The latter requires an explicit scope decision or a different client-supported write protocol. Ticket remains claimed and unresolved; dependent implementation can proceed on the available code while these delivery requirements stay visible.

2026-09-13: Explicitly released the stale codex-ship claim before resuming the authorized work.

2026-09-13: Reclaimed as codex-ship. User approved detected-conflict refusal and recoverable replacement, accepting the final-read/rename interval for unrelated editors. The criterion now states that scope explicitly.

2026-09-13: Configuration recovery now checks the successful replacement backup byte-for-byte against the prior file. Node 16.20.2 setup smoke against published 0.3.1 with Node 24.15.0 passed; `pnpm run check`, `pnpm run build`, and `pnpm test` (252 tests) passed. README records the accepted race limit, restoration steps, and the registry-tarball bootstrap extraction procedure for a future release. Publication remains outstanding: 0.3.1 lacks the bootstrap, so download and published quick-start criteria remain unchecked. Root DOX and its Child DOX Index stay unchanged because ownership and structure did not change; scripts DOX records the accepted configuration contract.
