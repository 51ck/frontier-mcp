---
id: T14
title: release-it on CI for version bump and npm publish
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: release-it + workflow_dispatch CI publish; package CHANGELOG and README release docs; MCP pins stay manual
---

## Acceptance criteria

- [x] `release-it` bumps version, updates package CHANGELOG, tags, and can publish with `pnpm`
- [x] GitHub Actions `Release` workflow is human-gated (`workflow_dispatch`) and runs `release-it --ci`
- [x] README documents how to cut a release and that MCP pins stay manual

## Notes

Publishing runs on CI only. Local `pnpm release` stays available for dry-runs / emergencies. Trusted Publishing (OIDC) preferred over long-lived `NPM_TOKEN`.

## Answer

Added release-it with conventional-changelog, a human-gated GitHub Actions Release workflow that runs release-it --ci and publishes with pnpm (OIDC trusted publishing + optional NPM_TOKEN), and README/AGENTS docs. Dry-run verified locally.
