---
id: T17
title: Release docs tell one story
kind: build
status: open
triage: ready-for-agent
blocked_by: [T15, T16]
---

**What to build:** A reader deciding how to cut a release gets the same answer from the README,
AGENTS.md and `package.json`. Right now the release procedure lives in four places — the workflow,
`.release-it.json`, AGENTS.md Verification, README Releasing — and they have already drifted apart.

AGENTS.md lists `pnpm exec release-it --dry-run --increment=patch` in Verification beside `check`,
`test` and `build`, but `.release-it.json` sets `requireCleanWorkingDir: true` and
`requireUpstream: true`, so it fails in exactly the dirty-tree state where someone runs verification.
Either state the precondition or list a command that works. The same command is spelled out verbatim
in the README and a third time as the `release:dry` script; name the script once instead.

AGENTS.md documents release-it and conventional-changelog under Verification, though it is a settled
stack decision — the doc's own home for those is Work Guidance's "Stack, settled" or Local Contracts.

The DOX Child Doc Index still lists only `CONTEXT.md`, `docs/adr/` and `docs/agents/` as root-owned
files. T14 added root-owned `README.md` and `CHANGELOG.md` and neither was indexed, which the Update
After Editing and Closeout rules require.

The README tells a reader to bump their pinned `frontier-mcp@x.y.z` in their user MCP config, but
never shows the config the pin lives in. Give it the install snippet the pin line points at.

**Blocked by:** the release workflow ticket, whose behaviour these docs describe, and the local-release
decision, which settles what the `release` script is for.

**Status:** ready-for-agent

- [ ] README, AGENTS.md and `package.json` agree on how a release is cut and on whether a local
      publish is possible
- [ ] AGENTS.md Verification names a release-it command that works when run, or states the clean-tree
      and upstream preconditions
- [ ] The release-it / conventional-changelog stack decision sits with the other settled stack
      decisions, not under Verification
- [ ] The Child DOX Index lists root-owned `README.md` and `CHANGELOG.md`
- [ ] The README carries the MCP install snippet its "pins stay manual" line refers to
