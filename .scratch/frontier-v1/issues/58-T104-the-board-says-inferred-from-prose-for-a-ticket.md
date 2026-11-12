---
id: T104
title: The Board says "inferred from prose" for a Ticket whose fields were read from a foreign fence
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: A foreign-fenced Ticket is counted apart on the Board, as fields that came from frontmatter that was not imported; the unfenced warning's wording is unchanged and both stay grouped; the split crosses the seam as `TicketSummary.foreignFenced`
---

Noted in [[T101]], predating [[T74]]. A foreign-fenced Ticket has its fields read from its fence, yet the Board's grouped warning counts it as "inferred from prose". That misdescribes where the data came from and sends a reader to look for a `Status:` line that is not there.

## Acceptance criteria

- [x] A foreign-fenced Ticket is not counted as inferred from prose
- [x] The warning that does count it says its fields came from frontmatter that was not imported
- [x] Warnings stay grouped, never itemized per Ticket
- [x] An unfenced Legacy Ticket's wording is unchanged
