---
id: T16
title: Does a local pnpm release publish, or is publishing CI-only?
kind: decision
type: task
status: open
triage: ready-for-agent
blocked_by: []
---

## Question

Three files tell three stories about one fact. The README says publishing is CI-only via release-it.
`package.json` adds `"release": "release-it"`, which is a full local publish. T14's own Notes say
"Local `pnpm release` stays available for dry-runs / emergencies" — but it is not a dry-run;
`release:dry` is. Decide which is true, because the release docs cannot be made consistent until it is
settled.

If publishing is genuinely CI-only, the `release` script is a loaded gun and should go or be reduced
to the dry-run. If an emergency local publish is wanted, the README claim has to soften and the local
path needs credentials that the CI-only OIDC setup deliberately does not provide.

Settle two smaller unasked-for additions in the same call, both introduced by T14 beyond its
acceptance criteria:

- `.release-it.json` sets `github.release: true`. Creating a GitHub Release was not among the
  criteria (bump / changelog / tag / publish). Keep it or drop it.
- `hooks.before:init` runs `pnpm run check` and `pnpm test`. Sensible on a real release, but it makes
  every local `release:dry` run the full suite.

## Acceptance criteria

- [ ] One stated answer on whether a local `pnpm release` may publish
- [ ] A decision on the `release` and `release:dry` scripts that follows from it
- [ ] A keep-or-drop call on `github.release` and on the `before:init` hooks, with the reason

## Answer
