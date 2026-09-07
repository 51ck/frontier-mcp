# Installed agent skills

## Purpose

Matt Pocock's upstream skills, installed for Codex in this repository.

## Ownership

This document owns `.agents/skills/`. Root owns the installation record `skills-lock.json`,
`.agents/mcp.json`, and the repository-specific configuration in `docs/agents/`.

## Local Contracts

- Source: `mattpocock/skills`. Keep installed skill files as upstream copies.
- Adapt engineering skills through `docs/agents/`, as required by the root contract.
- Installing a skill does not execute its setup steps or authorize its actions.

## Work Guidance

- Install or refresh with `pnpm dlx skills@latest add mattpocock/skills --skill '*' --agent codex --yes`
  from the repository root. Review changes to skills and `skills-lock.json` together.
- Preserve this DOX document when refreshing upstream files.
- Keep the existing tracker, triage labels, and domain configuration in `docs/agents/`.

## Verification

- Check every installed entry in `skills-lock.json` has a corresponding `<name>/SKILL.md` here.
- Confirm the recorded source is `mattpocock/skills`.

## Child DOX Index

No children. Each skill's `SKILL.md` and supporting files are maintained upstream.
