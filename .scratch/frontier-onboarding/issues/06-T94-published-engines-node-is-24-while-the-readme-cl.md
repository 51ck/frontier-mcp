---
id: T94
title: Published engines.node is >=24 while the README claims 20.x and 22.x support
kind: build
status: open
triage: needs-triage
blocked_by: []
---

## What to build

The published package's engine range and the README's support claim agree, so a consumer on a supported Node line is not refused an install.

Found alongside the Claude Code onboarding report on 2026-09-11, independent of it.

Published `0.3.1` declares `engines.node` as `">=24"`. The README claims support for the 20.x and 22.x lines from their floors (20.20.2 and 22.17.1). npm only warns on an engine mismatch, so this did not bite the reporting consumer — they were on Node 24.15.0 — but a consumer running `engine-strict=true` on Node 22 would be refused an install the README told them was supported.

Either the README overclaims or the published range is too narrow. Deciding which is the work; they cannot both stand.

## Acceptance criteria

- [ ] The supported Node range is stated once, in one authoritative place
- [ ] The published `engines.node` matches that statement
- [ ] If 20.x/22.x are genuinely supported, something verifies the package installs and runs on the lowest claimed line
