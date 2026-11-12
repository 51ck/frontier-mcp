---
id: T44
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

## Comments

Grilling, 2026-11-12, decided by the user:

1. **No telemetry**, opt-in included. The credibility cost in a developer tool outweighs what it could tell.
2. **What invites a signal.** GitHub Discussions with one pinned thread ("Using FrontierMCP? What broke?"), linked from the README's first screen. And a "consumer report" issue template shaped like T93 (expected, got, workaround), so an agent that hits friction can file one without a human composing prose. Nothing in a tool result asks for feedback; that would be paid for in every session.

Left undecided on purpose ("I don't care now"): which proxy signals to watch, and the fallback, meaning what to conclude from silence and after how long. The recommendation on the table, not accepted and not rejected: npm weekly downloads as a trend only; GitHub traffic referrers to see whether a venue post sent anyone; issues and discussions opened by someone else as the only proof of use; and thirty days after the last venue post with no inbound contact, go back to T42 before building anything else.

This Ticket stays open for that part only. Nothing is built from it here: enabling Discussions is the owner's action on GitHub, and the template and README link belong to the launch breakdown.
