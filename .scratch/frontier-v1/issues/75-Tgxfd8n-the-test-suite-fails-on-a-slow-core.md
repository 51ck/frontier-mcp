---
id: Tgxfd8n
title: The test suite fails on a slow core
kind: build
status: open
triage: needs-triage
blocked_by: []
---

## What happened

Run pinned to efficiency cores (`taskpolicy -b pnpm test`, Apple M4 Pro, 2026-11-15), the suite does not pass:

- **Released code (`0121fe6`, v1.0.0):** 6 failed of 399, 45.7s. `carries the revision check` (343ms, not a timeout), two duplicate-id Board tests (2.0s and 0.9s), and all three `exit-on-disconnect` cases at just over 5s.
- **Branch `feat/ticket-names` after the create-by-name slice:** 9 failed of 506. The same `carries the revision check` and `exits when stdin reaches EOF`, plus seven unrelated tests timing out at 6–7s.

On performance cores both pass in under 5 seconds.

## Why it matters

This machine is the fast end. CI runners and other contributors sit nearer the slow end, and a suite that only passes on a fast core hides real ordering bugs behind timeouts.

## What is known

- `carries the revision check` fails in well under the timeout on both, and failed once on performance cores during the read-path slice. That one is likely a real timing dependence on the watcher or on modification-time granularity, not a slow test.
- The branch added a test that creates a 1,502-Ticket batch to hold a race window open (`leaves a Ticket another session claimed mid-batch, and names it`). It is a plausible cause of the seven new timeouts in its neighbours.
- The `exit-on-disconnect` cases build the package in `beforeAll` and allow 5s for the process to die.

## Acceptance criteria

- [ ] `taskpolicy -b pnpm test` passes three times in a row
- [ ] `carries the revision check` is explained, and fixed in the code or the test, whichever is wrong
- [ ] The mid-batch race test no longer needs a four-figure batch, or is isolated so it cannot starve its neighbours
- [ ] No timeout is raised without a stated reason
