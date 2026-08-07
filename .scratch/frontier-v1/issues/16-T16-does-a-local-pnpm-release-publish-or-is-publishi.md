---
id: T16
title: Does a local pnpm release publish, or is publishing CI-only?
kind: decision
type: task
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: "Publishing is CI-only: the release script goes, release:dry stays; github.release and the before:init hooks both stay, and hooks do not run in a dry run"
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

**A local `pnpm release` may not publish.** The `release` script is removed; `release:dry` stays. The README's "CI-only" claim becomes true as written rather than being softened.

The deciding argument is the auth model settled in T15. CI publishes through Trusted Publishing (OIDC), which by construction issues no long-lived credential a laptop could hold. Keeping a local publish path therefore means minting exactly the long-lived npm token the OIDC setup exists to avoid, for a path nobody exercises and CI never tests. The emergency it was kept for is better served by dispatching the workflow, which is the same one click.

**`github.release: true` stays.** README step 3 already promises a GitHub Release, the workflow already has the `contents: write` and `GITHUB_TOKEN` it needs, and it is how a human finds what shipped without reading tags. It was outside T14's stated criteria, which is a scope observation and not a defect; keeping it is cheaper than removing a thing the docs already describe.

**`hooks.before:init` stays**, and the objection against it does not survive contact with the tool. The claim was that it makes every local `release:dry` run the full suite. The dry run output prints `! pnpm run check` and `! pnpm test` — release-it's `!` prefix marks a command it did *not* execute. Hooks are skipped in a dry run, so the local cost is zero, and on a real CI release the hooks are the only thing standing between a red test and a published version.

One correction to the record while settling this: the slow `release-it --dry-run` that prompted the concern was not the hooks. It was the interactive prompt hanging without `--ci`.
