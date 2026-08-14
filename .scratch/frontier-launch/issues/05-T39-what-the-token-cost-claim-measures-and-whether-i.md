---
id: T39
title: What the token-cost claim measures, and whether it survives a skeptic
kind: decision
type: research
status: open
triage: ready-for-agent
blocked_by: [T36]
---

## Question

What quantity gets published as the token claim, measured how, against what — and does it hold up?

The tracker doc already asserts FrontierMCP answers orientation questions "for a fraction of the token
cost of reading every Ticket file". Nothing published backs that. `bench/scan-cost.ts` measures
filesystem scan cost, which is a different quantity from tokens entering a model's context.

Decide the measurement before running it:

- The comparison. Against an agent reading every ticket file, which is the honest baseline for the
  no-server fallback path. Against `gh issue list` and `gh issue view`, which is what a skeptic will
  raise, since Matt's recommended path is GitHub issues. Both, or one, and why.
- The corpus. This repository's own Efforts are real but small and self-selected; `frontier-v1` at 27
  tickets is the largest. Decide what corpus makes the number credible rather than flattering.
- The unit. Tokens into context for a stated task, not bytes on disk and not wall-clock time.
- Whether the number is big enough to publish at all. If a board read saves a modest fraction on a
  realistic effort, the claim quietly drops instead of being stretched — that outcome is a valid
  resolution of this ticket.

If a performance number is also reported, measure the slow end: this machine is faster than the ones
readers will run on, so report the floor rather than caveating a best case.
