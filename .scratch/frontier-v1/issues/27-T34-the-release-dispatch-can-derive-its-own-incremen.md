---
id: T34
title: The release dispatch can derive its own increment
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: The dispatch defaults to `auto`, which passes no `--increment` and lets the changelog plugin derive the bump; both behaviors were measured on a real dry run before the workflow was written
---

## What

The `Release` workflow's `workflow_dispatch` offered `patch` / `minor` / `major` and required the
releaser to pick one, which meant reading the commit log and deciding by hand what
`@release-it/conventional-changelog` was about to derive anyway. The plugin already knows: it reads
the conventional commits since the last `v*` tag to write the changelog.

Add `auto` as a fourth option and make it the default. `auto` passes **no** `--increment`, which is
precisely what hands the decision to the plugin. The explicit three stay, as overrides.

## Acceptance criteria

- [x] The dispatch offers `auto` and defaults to it
- [x] `auto` invokes `release-it --ci` with no `--increment`; an explicit choice still passes one
- [x] The releaser's choice reaches the shell as an environment variable, not as an inline `${{ }}`
      expansion into the command string
- [x] The no-op-on-exit-0 behavior is documented where a releaser will see it
- [x] README and the AGENTS.md release rationale both reflect the new option

## Answer

`auto` is the default and the first option. It runs `release-it --ci` with no `--increment` at all — that omission is the whole mechanism, because it is what leaves the decision to `@release-it/conventional-changelog`, which is already reading that commit range to write the changelog. An explicit `patch`/`minor`/`major` still passes the flag.

Both behaviors were measured rather than assumed, on real `release:dry` runs against this repo:

- With a `feat:` commit since `v0.2.1`, the no-increment run picked **0.3.0**.
- With a tag planted at HEAD so nothing was releasable, it printed `No new version to release` and
  **exited 0**.

The second is the one that needed writing down, and it is in `AGENTS.md` and the README both: a green
run is not evidence that a version shipped. The job succeeds having done nothing, which is the right
behavior for a dispatch a human may fire speculatively, but it is silent about it. Check the tags.

The choice reaches the step as an `INCREMENT` env var and is branched on in shell, rather than
interpolated into the command string as `${{ inputs.increment }}`. The old form was safe because a
`choice` input cannot carry an arbitrary value, but the env form does not depend on that remaining
true, and it is the shape that survives the input becoming free-text later.

**Unrelated defect surfaced while filing this Ticket, and it is the product's own.** `create_tickets`
minted `T33` here, on a branch cut from `master`, while `T33` already existed on the unmerged
`t30-v2-sdk-family` branch. Ids come from `max + 1` over a scan of the working tree, and a scan sees
one branch. Two Efforts on two branches mint the same id, and the per-id guard of ADR 0005 does not
catch it — that guard exists for two processes on one tree, not two trees. This Ticket was renumbered
to `T34` by hand. The general case is not fixed and needs its own Ticket.
