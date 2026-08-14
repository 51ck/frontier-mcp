---
id: T49
title: What the drop to one scan actually costs, measured
kind: decision
type: prototype
status: open
triage: ready-for-agent
blocked_by: []
---

## Question

T37 resolved that creation drops from two full workspace scans to one, and put figures on it —
~9–13ms at this repo's size, ~79–101ms at 1000 Tickets — by halving ADR 0005's numbers. ADR 0005
states plainly that its own ranges "are doubled from single-scan timings rather than measured as a
pair". Halving a doubled number returns the single-scan timing it started from, so the new ADR would
be quoting a measurement of one thing dressed as a measurement of another.

`bench/scan-cost.ts` exists and measures a scan honestly — cold, warm, and post-invalidation re-scan,
over the real `.scratch/` and synthesized 200 / 1000 Ticket fixtures, with a machine attribution
block that makes the numbers quotable. But every group in it times `listTickets()` in isolation.
Nothing times `createTickets` end to end, and that is the operation T37's claim is about: the guard
creates, the re-scan while holding them, and the two-phase write all sit outside what the harness
currently sees.

The new path cannot be measured, because nothing implements it and this Effort implements nothing.
What can be measured is today's create path end to end, and today's single scan — two independently
observed quantities the ADR can subtract, rather than one quantity halved.

## Acceptance criteria

- [ ] Whether `bench/scan-cost.ts` gains a create-path group is decided, and it is built if so
- [ ] Today's `createTickets` cost is measured at the real workspace size and at 1000 Tickets
- [ ] The run is done at the slow end — `taskpolicy -b`, plus `UV_THREADPOOL_SIZE=1` for the
      disk-bound question — with the attribution block recorded alongside the figures
- [ ] The figure the new ADR is allowed to quote is written down, together with whatever part of it
      remains arithmetic rather than observation
