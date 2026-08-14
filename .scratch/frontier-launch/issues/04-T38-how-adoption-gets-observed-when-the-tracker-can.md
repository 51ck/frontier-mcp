---
id: T38
title: How adoption gets observed when the tracker can live anywhere
kind: decision
type: grilling
status: open
triage: ready-for-human
blocked_by: []
---

## Question

What signals will actually tell you whether one stranger is still using FrontierMCP after thirty days,
and which of them are worth having?

The win condition is retention by a real user, and it is close to unobservable. npm downloads are
dominated by CI and by `npx` re-resolving on every session — 123 downloads in the last month with zero
known users shows how little the number means. Counting `.scratch/` directories on GitHub fails once
the tracker root is configurable and the tracker may sit outside the project entirely. Stars measure
attention, not use.

Decide:

- Which proxy signals are worth watching, and what each one does and does not prove. Consider downloads
  read as a floor and a trend rather than a count, repository traffic, issues and discussions opened by
  people who are not you, and inbound questions in the venues.
- Whether any form of opt-in usage reporting is acceptable in this ecosystem, or whether the credibility
  cost of telemetry in a developer tool outweighs anything it could tell you. Being honest about the
  trade-offs is a stated strategy for this project; instrumenting users quietly would contradict it.
- What deliberately invites a signal instead of measuring one — the cheapest reliable detector of a real
  user is a real user talking to you, so decide what makes that likely and where it lands.
- The honest fallback: what you will conclude if none of these ever fire, and how long you wait.
