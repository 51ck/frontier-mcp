---
id: T15
title: Release workflow publishes through one auth path, from master only
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: One auth path (OIDC, no NODE_AUTH_TOKEN), npm bootstrap dropped, master-only guard, CHANGELOG intro moved into the plugin header; skipChecks kept because OIDC has no whoami
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
- [x] `npm install -g npm@latest` is gone and no step assumes a globally installed npm
- [x] `skipChecks` is either justified in place or removed
- [x] A dispatch from a branch other than `master` fails before release-it commits, tags or pushes
- [x] The version input's description and its type agree
- [ ] After a release, the CHANGELOG intro is still above the release sections, carried by the
      plugin's `header` option
- [x] `pnpm exec release-it --dry-run` still passes on a clean tree

## Answer

Landed in `.github/workflows/release.yml` and `.release-it.json`.

**Auth.** `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` is gone. npm's own trusted-publishing recipe keeps `setup-node`'s `registry-url` and sets no token at all, so `registry-url` stays; what had to go was the token wired to a secret that may not exist, which expanded to an empty `_authToken` and 401'd instead of falling back to OIDC. The step now carries a comment saying the absence is deliberate.

**npm bootstrap.** `npm install -g npm@latest` removed. The dry run confirms the publish command is `pnpm publish . --tag latest`, so the upgraded npm was never on the path — the finding was right that OIDC has to come from pnpm. The `pnpm/action-setup` pin is now commented: 10 on purpose, because pnpm 11 404s on OIDC publish (pnpm/pnpm#11513).

**skipChecks: kept, not removed.** Reading `release-it/lib/plugin/npm/npm.js`, `skipChecks` short-circuits `init()` before `isCollaborator()`, which shells out to `npm whoami`. Under trusted publishing there is no token for `whoami` to answer with, so the checks would abort the release. The ticket guessed it was a hedge for a failure mode a working auth path removes; it is the opposite — a working OIDC path *requires* it. `.release-it.json` cannot carry the reason as a comment, so it is recorded in the README's Releasing section under T17.

**Branch guard.** A first step fails the job with `::error::Releases are cut from master only` when `github.ref != 'refs/heads/master'`, before checkout. An explicit failure rather than a job-level `if:`, so a wrong dispatch reads as a failure and not as a skipped run.

**Input description.** Now just `Semver increment`; the `choice` type is the honest one.

**CHANGELOG.** The intro moved into the plugin's `header` option, matching the file's current head byte-for-byte. Simulated against the plugin's own `writeChangelog` logic: the header strips cleanly from the previous changelog (no residue, no duplication) and the intro stays above the first release section.

**Verified:** `pnpm run check` passes; `pnpm exec release-it --dry-run --ci --increment=patch` exits 0 and leaves `CHANGELOG.md` and `package.json` untouched. No test seam exists for CI config — the repo's only seam is the MCP tool layer, and per AGENTS.md a change needing a new one is a design signal, not a reason to add one.

Two criteria could not be ticked through `update_ticket` because their text wraps across lines; that is filed as T18. They are met: the auth path is single, and the CHANGELOG intro survives.
