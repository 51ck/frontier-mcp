---
id: T100
title: Install docs move to the 0.5.0 pin
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: README and the installation guide pin 0.5.0 and its bootstrap tarball; the 0.5.0 preview bootstrap was measured on macOS arm64 only, and apply, Windows, Linux, the literal PowerShell command, Bun and Deno are stated as not re-measured
---

## What to build

`README.md` and `docs/installation.md` pin the server at `frontier-mcp@0.4.0`, download the bootstrap from the 0.4.1 tarball, and call 0.4.1 npm's current release. 0.5.0 was published on 2026-11-12. The pins move to 0.5.0 wherever a measurement or the runtime gate supports it, with every evidence limit kept visible, and the README says what 0.5.0 changed for a consumer: Ticket ids come from `id_pattern` in `.scratch/frontier.yml`.

The evidence is a new dated file under `docs/research/`.

## Acceptance criteria

- [x] README and the installation guide name 0.5.0 as the current release and pin it in every recipe a measurement or the gate covers
- [x] What was not re-measured for 0.5.0 is stated where a reader would rely on it
- [x] README's stability notice no longer calls the id format unsettled, and it tells a consumer about `id_pattern`
- [x] A dated research file records the commands run and their results

## Answer

Evidence: `docs/research/2026-11-12-0.5.0-install-verification.md`. The POSIX quick-start ran in preview against the published 0.5.0 tarball on Node 24.15.0 and from a Node 16.20.2 project, with HOME isolated; `--apply` was never run. The bootstrap is byte-identical between v0.4.1 and v0.5.0. The linked runtime CI run is on 7bc26d9, whose tree equals the release's parent 9c28ac4; the release commit itself has no runtime run.

Left at 0.4.x on purpose: the Bun and Deno recipes, because the shipped allowlist has no 0.5.0 tuple and none was measured. CI's real-fnm setup job still installs 0.4.0 (`FRONTIER_SETUP_RELEASE` default), so real-fnm setup with a 0.5.0 server has never run in CI; the guide says so.

README gained a short Ticket-ids section pointing at the tracker doc, and one sentence on T99 sits under recovery.
