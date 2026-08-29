---
id: T83
title: Status inference is lossy by keyword and reports success either way
kind: build
status: open
triage: needs-triage
blocked_by: []
---

Same migration. The 191 Tickets carried a freeform `Status:` prose line that had grown **seventeen distinct values** over the repo's life. `migrate_effort` maps it by leading keyword, and fifteen Tickets landed on a wrong status:

| prose | mapped to | why it is wrong |
| --- | --- | --- |
| `closed, 2026-08-29` | `open` | two finished Tickets reopened |
| `deferred to 0.6.0 — code on feat/three-r185` | `dropped` | scheduled work marked terminal and out of scope; it would also have stopped unblocking its dependents |
| `superseded` | `dropped` | that repo's label vocabulary requires a superseded Ticket to name the board that took the work over; the mapping keeps neither the label nor a reason |

Each of these was reported as `normalize+mint`, indistinguishable from the 176 that mapped correctly.

## The ask

Not better guesses — the prose is genuinely ambiguous and a human has to look. The ask is that migration **say which Tickets it guessed at**. Something as small as a trailing section listing every Ticket whose status came from a keyword the tool does not recognise, with the original string beside it, would have turned a manual audit of 191 files into a review of fifteen.

Related: `deferred` mapping to a terminal state is the one that would have done real damage silently, because `dropped` does not unblock dependents. A conservative default of `open` for any unrecognised keyword would be safer than a terminal one.

This survives the narrowing in [[T57]]. Lazy conversion still has to infer a status from prose the first time it writes a Foreign Ticket; it just does it one Ticket at a time instead of in a batch.
