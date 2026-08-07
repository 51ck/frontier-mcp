---
id: T4
title: Ticket annotations — comments, acceptance criteria, triage role
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T3]
answer_gist: update_ticket gains triage, comment and tick; annotations never move the Frontier, reversing T3 wontfix exclusion
---

# T4 — Ticket annotations: comments, acceptance criteria, triage role

**What to build:** The record an agent leaves while working, none of which touches the graph. Append a
comment and it lands where the skills expect to find it, stored exactly as written. Tick an acceptance
criterion as you satisfy it, without rewriting the body around it. Set a triage role independently of
Status, so `/triage` and the Frontier stop competing for one field.

Runs in parallel with everything after T3 — nothing here changes what appears on the Frontier.

- [x] A comment appends under the Ticket's comments heading, creating the heading if absent
- [x] Comment content is stored verbatim — nothing is prepended, appended, or reformatted, including
      `/triage`'s mandatory disclaimer, which is the skill's own to write
- [x] An acceptance criterion can be ticked by reference without rewriting surrounding body prose
- [x] Ticking a criterion leaves every other line of the body byte-identical
- [x] The triage role is a separate frontmatter field from Status, and setting one never changes the
      other
- [x] `wontfix` is accepted as a triage role and rejected as a Status
- [x] None of these mutations changes an Effort's Frontier

## Comments

Ticked and resolved through Frontier itself — first ticket closed by the server it belongs to.
