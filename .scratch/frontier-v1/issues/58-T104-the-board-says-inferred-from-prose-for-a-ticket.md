---
id: T104
title: The Board says "inferred from prose" for a Ticket whose fields were read from a foreign fence
kind: build
status: open
triage: ready-for-agent
blocked_by: []
---

Noted in [[T101]], predating [[T74]]. A foreign-fenced Ticket has its fields read from its fence, yet the Board's grouped warning counts it as "inferred from prose". That misdescribes where the data came from and sends a reader to look for a `Status:` line that is not there.

## Acceptance criteria

- [ ] A foreign-fenced Ticket is not counted as inferred from prose
- [ ] The warning that does count it says its fields came from frontmatter that was not imported
- [ ] Warnings stay grouped, never itemized per Ticket
- [ ] An unfenced Legacy Ticket's wording is unchanged
