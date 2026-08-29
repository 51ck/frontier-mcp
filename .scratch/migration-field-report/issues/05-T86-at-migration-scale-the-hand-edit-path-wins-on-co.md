---
id: T86
title: At migration scale the hand-edit path wins on cost, which is what makes it dangerous
kind: decision
type: grilling
status: open
triage: needs-triage
blocked_by: []
---

A field observation against [[T57]]'s refusal of hand-editing, offered as evidence for the decision rather than against it.

Cleaning up after that migration meant: 73 `answer_gist` values, 15 status corrections, 2 `dropped_reason`s, and stripping 255 stale prose lines. All of it was reachable through the served surface — `update_ticket` with `resolve` does update the gist on an already-resolved Ticket, which was verified rather than assumed.

It was done by script against the files anyway, in one pass, because the served path is ~90 round trips and the scripted one is a few seconds.

That worked only because there was exactly one writer. [[T57]] is right that a hand edit carries no revision token and clobbers where a served write would be refused. But the incentive to take the unsafe path is strongest precisely at migration scale, which is also when the most files are in flight — and the tracker doc's warning is currently aimed at id allocation, not at bulk field edits, so nothing in the docs argued against what was done here.

Two things would close the gap without reopening the decision:

- Say it in the tracker doc. The File conventions preamble warns about hand-allocating ids; it says nothing about hand-writing other fields, and a reader can reasonably conclude the rest is fair game.
- Consider whether the per-Ticket rule needs an exception for the one-shot migration pass, where the caller has just been handed the whole Effort by `migrate_effort` and holds every revision. That is a narrower case than a general batch write, and it is the case where hand-editing is actually tempting.
