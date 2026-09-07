---
id: T63
title: CI runs the test suite
kind: build
status: open
triage: ready-for-agent
blocked_by: []
---

**What to build:** nothing in CI runs the tests. `.github/workflows/release.yml` is the only
workflow, it is `workflow_dispatch`-only, and it has no test job. The pre-commit hook
(`.githooks/pre-commit`) runs typecheck, lint and format — checks only, never `vitest`.

That is survivable while every path is exercised by default. The id work ends that: [[T53]] makes the
guard path *conditional on the pattern* and the default pattern random, so `cross-process-create` is
the only thing that will ever touch the guards, and nothing will notice when it stops.

Add a workflow that runs the Verification gate plus `pnpm test` on push and on pull request. This
lands first, so every Ticket after it is reviewed against a green suite rather than a local run.


- [ ] A workflow runs on push and on pull request, not only `workflow_dispatch`
- [ ] It runs typecheck, lint, format:check and `pnpm test` on Node 24
- [ ] `release.yml` is unchanged, or its duplication with the new job is deliberate and recorded
- [ ] A failing test fails the job
