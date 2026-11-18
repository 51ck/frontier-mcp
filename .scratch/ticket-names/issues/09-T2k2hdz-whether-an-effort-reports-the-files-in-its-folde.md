---
id: T2k2hdz
title: Whether an Effort reports the files in its folder that nothing links to
kind: decision
type: grilling
status: open
triage: ready-for-human
blocked_by: []
---

## Question

Anything in an Effort directory besides `map.md`, `spec.md` and `issues/` is ignored, never an error.
A `research/` directory or a loose note is therefore invisible to every tool. The owner's idea,
2026-11-15: list the files in an Effort folder that nothing in the tree links to.

It came up as a way to define Foreign, and does not work for that: a valid Ticket is often unlinked
(a new one with no Edges, the root of a breakdown), and linkage says nothing about whether a file
conforms. It does describe something not reported today — material left beside the tracker that no
Ticket, Map or Spec points to.

## What has to be decided

- Whether it is worth reporting at all, and to whom: an agent starting a session, or a human tidying.
- What counts as a link: a markdown link by path from a Ticket body, the Map or the Spec; a `[[name]]`
  reference; a plain mention of the filename.
- Where it appears. A Board never reads a body, and finding links means reading every body in the
  Effort. `migrate_effort` preview already reads bodies. An opt-in argument on `list_efforts` is the
  other candidate. A ninth tool is not available.
- Whether a Ticket file under `issues/` that no other Ticket links to is in the list. Position going
  in: no, only files outside the three served locations.

## Acceptance criteria

- [ ] Whether to build it is decided
- [ ] If yes: what a link is, where the list appears, and what it costs per call are stated
- [ ] If no: the reason is recorded

## Source

Owner comment on `Ti75suj`, 2026-11-15.
