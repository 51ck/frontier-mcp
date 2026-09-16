---
id: T63
title: CI runs the test suite
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: Extended the existing Node 24 check/test/build workflow to every push; PR coverage and release workflow preserved.
---

**What to build:** nothing in CI runs the tests. `.github/workflows/release.yml` is the only
workflow, it is `workflow_dispatch`-only, and it has no test job. The pre-commit hook
(`.githooks/pre-commit`) runs typecheck, lint and format — checks only, never `vitest`.

That is survivable while every path is exercised by default. The id work ends that: [[T53]] makes the
guard path *conditional on the pattern* and the default pattern random, so `cross-process-create` is
the only thing that will ever touch the guards, and nothing will notice when it stops.

Add a workflow that runs the Verification gate plus `pnpm test` on push and on pull request. This
lands first, so every Ticket after it is reviewed against a green suite rather than a local run.


- [x] A workflow runs on push and on pull request, not only `workflow_dispatch`
- [x] It runs typecheck, lint, format:check and `pnpm test` on Node 24
- [x] `release.yml` is unchanged, or its duplication with the new job is deliberate and recorded
- [x] A failing test fails the job

## Comments

2026-09-10 — T63 implementation prepared: the existing runtime workflow now also runs on feature-branch pushes. Verification is blocked before execution: project dependencies are absent, the network approval request timed out, and offline installation against both local pnpm stores lacks package metadata. `git diff --check` passed; typecheck, lint, format, tests, and build have not run. Claim released; leave this Ticket open until the required checks and review pass.

2026-09-11 — Dependencies restored. Verification now passes: pnpm run check; pnpm test (28 files, 248 tests); pnpm run build. Existing runtime development job already runs the gate on Node 24; removed its master-only push filter so feature pushes are covered. release.yml unchanged. Awaiting independent review.

Independent review PASS. All acceptance criteria verified; normal test-step exit status fails the development job and blocks its dependent jobs.
