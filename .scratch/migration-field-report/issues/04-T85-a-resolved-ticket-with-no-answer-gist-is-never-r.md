---
id: T85
title: A resolved Ticket with no `answer_gist` is never reported
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: The Board counts, per Status and never per Ticket, resolved Tickets with no answer_gist, dropped with no dropped_reason, and claimed with no claimed_by or claimed_at; unfenced Tickets are left out because their answer is prose, so the counts appear once an Effort is migrated
---

The tracker doc says `answer_gist` is "required when `status: resolved` — one line, every kind", and a Map's Decisions-so-far regenerates from it.

Nothing enforces or reports it.

After migrating the 191-Ticket repo, **73 Tickets were `status: resolved` with no `answer_gist`** — migration cannot invent one, which is correct. But `get_board` on those Efforts printed no warning, and `list_efforts` showed nothing. A board of fifteen resolved Tickets with zero gists renders as a clean, finished board.

That is the failure mode: the Effort looks complete, and its Decisions-so-far would regenerate empty. The 73 were found by grepping frontmatter, not by asking the tool.

## The ask

`get_board` already has a warnings block and already counts things. `N/M resolved Tickets carry no answer_gist` fits there exactly, alongside the Legacy and dangling-Edge counts. It costs nothing to compute — the field is already parsed to render the gist column.

Same for `dropped` with no `dropped_reason`, which feeds Out of scope the same way, and `claimed` with no `claimed_by`. That migration produced five and two of those respectively, equally silently. Two of the `claimed` ones were stale claims from sessions that had ended, which a claimant-less claim arguably always is.

## Answer

`get_board` only. `list_efforts` is unchanged, because a populated tracker's `list_efforts` result is held byte-identical.

Measured on the fixtures: before migration neither Board gains a line; after `migrate_effort`, sobrina-telegram shows `15/15 resolved Tickets carry no answer_gist` and tag-customizer-ship-0-5-0 `7/7`. None of the new warnings fire on this repository's own Efforts. Each line costs about 10 tokens and appears only when something is missing.

`claimed_at` was added beyond the Ticket's ask: a claim with no timestamp can never be flagged stale.
