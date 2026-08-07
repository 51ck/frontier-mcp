---
id: T14
title: release-it on CI for version bump and npm publish
kind: build
status: claimed
triage: ready-for-agent
blocked_by: []
claimed_by: cursor-agent
claimed_at: 2026-08-07T19:44:10.223Z
---

## Acceptance criteria

- [ ] `release-it` bumps version, updates package CHANGELOG, tags, and can publish with `pnpm`
- [ ] GitHub Actions `Release` workflow is human-gated (`workflow_dispatch`) and runs `release-it --ci`
- [ ] README documents how to cut a release and that MCP pins stay manual

## Notes

Publishing runs on CI only. Local `pnpm release` stays available for dry-runs / emergencies. Trusted Publishing (OIDC) preferred over long-lived `NPM_TOKEN`.
