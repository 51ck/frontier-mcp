---
id: T85
title: A resolved Ticket with no `answer_gist` is never reported
kind: build
status: open
triage: needs-triage
blocked_by: []
---

The tracker doc says `answer_gist` is "required when `status: resolved` — one line, every kind", and a Map's Decisions-so-far regenerates from it.

Nothing enforces or reports it.

After migrating the 191-Ticket repo, **73 Tickets were `status: resolved` with no `answer_gist`** — migration cannot invent one, which is correct. But `get_board` on those Efforts printed no warning, and `list_efforts` showed nothing. A board of fifteen resolved Tickets with zero gists renders as a clean, finished board.

That is the failure mode: the Effort looks complete, and its Decisions-so-far would regenerate empty. The 73 were found by grepping frontmatter, not by asking the tool.

## The ask

`get_board` already has a warnings block and already counts things. `N/M resolved Tickets carry no answer_gist` fits there exactly, alongside the Legacy and dangling-Edge counts. It costs nothing to compute — the field is already parsed to render the gist column.

Same for `dropped` with no `dropped_reason`, which feeds Out of scope the same way, and `claimed` with no `claimed_by`. That migration produced five and two of those respectively, equally silently. Two of the `claimed` ones were stale claims from sessions that had ended, which a claimant-less claim arguably always is.
