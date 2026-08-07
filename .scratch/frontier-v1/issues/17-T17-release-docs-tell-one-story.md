---
id: T17
title: Release docs tell one story
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T15, T16]
answer_gist: release script removed per T16; AGENTS.md Verification names release:dry with its clean-tree precondition, stack decision moved to Stack-settled, DOX index gains README and CHANGELOG, README gains the install snippet
---
# T17 — Release docs tell one story

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
- [x] The Child DOX Index lists root-owned `README.md` and `CHANGELOG.md`
- [x] The README carries the MCP install snippet its "pins stay manual" line refers to

## Answer

README, `AGENTS.md` and `package.json` now agree: publishing is CI-only, and the `release` script that contradicted it is gone per T16. `release:dry` stays.

**Verification.** The block now names `pnpm run release:dry` instead of spelling out `release-it --dry-run --increment=patch` a second time, and says what makes it unlike its three neighbours — `requireCleanWorkingDir` and `requireUpstream` mean it is the one command there that will not run against uncommitted work. It also records that the `before:init` hooks are skipped in a dry run, so nobody mistakes it for a substitute for `check` and `test`.

**Stack decision.** release-it and conventional-changelog moved out of Verification and up into Work Guidance's "Stack, settled", beside the other tooling choices. It carries the three things a future editor would otherwise undo: `skipChecks` is load-bearing because release-it's checks shell out to `npm whoami` and OIDC gives it nothing to answer with, the CHANGELOG intro has to live in the plugin's `header` option, and pnpm is pinned to 10 because 11 404s on OIDC publish.

**DOX index.** Root-owned `README.md` and `CHANGELOG.md` added, both introduced by T14 and never indexed.

**README.** Gains an Install section with a pinned `npx -y frontier-mcp@x.y.z` MCP config — the config the "pins stay manual" line had been referring to without ever showing. The Releasing section now states the master-only guard and why it exists, and carries the `skipChecks` and pnpm-10 warnings where someone editing the release config will hit them.

One overlap to flag rather than hide: **T9 owns "user-scope install"** and is still open. The snippet added here is the minimum the pin sentence needs and is not meant to pre-empt whatever T9 settles — if T9 lands a different install story, this section is the thing it rewrites.

**Verified:** `pnpm run check` and `pnpm test` pass (176 tests, 23 files); a grep for the removed `release` script and the old spelled-out dry-run command finds nothing stale in README, AGENTS.md or package.json.
