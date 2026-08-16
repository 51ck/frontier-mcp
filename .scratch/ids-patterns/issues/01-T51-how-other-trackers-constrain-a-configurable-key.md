---
id: T51
title: How other trackers constrain a configurable key format
kind: decision
type: research
status: open
triage: ready-for-agent
blocked_by: []
---

## Question

We are about to let a consumer name their own Ticket id format. Trackers that already do this have
met every failure mode ahead of us, and what they **refuse** is worth more than what they allow.

Examine Jira project keys, Linear team keys, YouTrack, Redmine, and GitHub issue numbers, from
primary sources only — vendor documentation and API references, not blog posts. Four things:

1. What shapes and characters are illegal in a key, and what reason is given.
2. What happens when a project key is changed after issues already exist — are old ids rewritten,
   kept, or aliased.
3. Whether the numeric part counts per project or globally.
4. Whether **any** of them offers a template rather than a fixed prefix plus counter. If none does,
   that is itself a finding worth recording, since it would mean this Effort has no prior art to
   lean on.

## Acceptance criteria

- [ ] For each tracker, the legal key format and the constraints on it are recorded with a citation
- [ ] What each does when a key changes after issues exist is recorded
- [ ] Whether the numeric part is per-project or global is recorded for each
- [ ] Whether any tracker offers a template rather than prefix plus counter is answered
- [ ] Findings live in one file, linked from this Ticket
