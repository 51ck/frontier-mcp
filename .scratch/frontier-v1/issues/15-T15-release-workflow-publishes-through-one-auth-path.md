---
id: T15
title: Release workflow publishes through one auth path, from master only
kind: build
status: claimed
triage: ready-for-agent
blocked_by: []
claimed_by: claude-opus-5
claimed_at: 2026-08-07T19:57:34.132Z
---

**What to build:** Dispatching the `Release` workflow actually publishes `frontier-mcp` to npm — it
authenticates through exactly one path, refuses to run off `master`, and leaves the CHANGELOG intro
where a reader can still see it. Today none of the three hold.

The auth path is self-defeating. `setup-node` is given `registry-url: https://registry.npmjs.org`,
which writes an `.npmrc` containing `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}`, and
`NODE_AUTH_TOKEN` is wired to `secrets.NPM_TOKEN`. When that secret is absent — the case the workflow
comments call "Optional fallback if Trusted Publishing is not configured" — the token resolves to an
empty string and the publish 401s instead of falling back to OIDC. Pick one path and make the other
absent rather than empty. Trusted Publishing is preferred per T14.

`npm install -g npm@latest` goes. It breaks the pnpm-only rule in AGENTS.md Work Guidance, and its
comment ("Trusted Publishing needs npm >= 11.5.1") describes a binary the publish never reaches:
`publishPackageManager: pnpm` makes release-it exec `pnpm publish`. Whatever npm version OIDC needs,
it has to come from the pinned pnpm. Settle `skipChecks: true` in the same pass — with a working auth
path it is a hedge for a failure mode that should no longer exist.

`workflow_dispatch` has no branch guard, so the workflow can be dispatched from any branch and
release-it will bump, commit, tag `v*` and push there before any publish check fires. The README's
"merge to master first" is convention only. Guard it in the job.

The version input's description offers "exact version like 0.2.0" on a `type: choice` that accepts
only patch / minor / major. Either the description is wrong or the type is.

Finally the CHANGELOG intro sinks. `@release-it/conventional-changelog` strips the literal
`# Changelog` header and re-prepends it, so the note saying these are package release notes and not
part of the `.scratch/` issue tracker will land below the first release section. The plugin takes a
`header` option; use it rather than loose prose.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The workflow authenticates through one path; an absent `NPM_TOKEN` does not leave an empty
      `_authToken` in `.npmrc`, and does not shadow OIDC
- [ ] `npm install -g npm@latest` is gone and no step assumes a globally installed npm
- [ ] `skipChecks` is either justified in place or removed
- [ ] A dispatch from a branch other than `master` fails before release-it commits, tags or pushes
- [ ] The version input's description and its type agree
- [ ] After a release, the CHANGELOG intro is still above the release sections, carried by the
      plugin's `header` option
- [ ] `pnpm exec release-it --dry-run` still passes on a clean tree
