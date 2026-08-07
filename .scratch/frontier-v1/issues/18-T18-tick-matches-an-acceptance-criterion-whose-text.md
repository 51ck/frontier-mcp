---
id: T18
title: tick matches an acceptance criterion whose text wraps across lines
kind: build
status: open
triage: needs-triage
blocked_by: []
---

**What to build:** `update_ticket` `tick` ticks a criterion whose text is wrapped over more than one
line, the way every Ticket in this repo writes them. Today it only matches criteria that sit on a
single line, so the house style silently defeats the tool.

goals: usable, effective

## Problem

Captured while resolving T15.

- **Tool:** `update_ticket`, `id: T15`, `tick: [...]`
- **Passed:** the criterion text copied verbatim out of `get_tickets`, including its newline and the
  six-space continuation indent —
  `"The workflow authenticates through one path; an absent `NPM_TOKEN` does not leave an empty\n      `_authToken` in `.npmrc`, and does not shadow OIDC"`
- **Expected:** the criterion ticks, since that is byte-for-byte what the body holds.
- **Got:** `No acceptance criterion matches "The workflow authenticates through one path; ..."`
- **Also tried:** the same text re-joined onto one line with single spaces. Same error.
- **Workaround:** ticked only the five single-line criteria in the same Ticket; the two wrapped ones
  could not be ticked at all and were left unchecked on a resolved Ticket.

The failure is not cosmetic. `tick` is documented as "matched on their text", and the text the caller
has is whatever `get_tickets` returned. An agent that copies it back exactly still fails, and there is
no third thing to try — so the criterion stays unticked and the Ticket's own record of what was
verified goes wrong. It also aborts the whole call on the first non-match, so one wrapped criterion
costs the ticks of every criterion listed after it.

Worth checking whether the same line-joining assumption affects any other text matcher below the seam.

## Done when

- [ ] `tick` matches a criterion whose text wraps across lines, given the text as `get_tickets`
      returns it
- [ ] `tick` also matches that same text re-joined onto one line, so a caller need not reproduce the
      wrapping
- [ ] Ticking a wrapped criterion changes only its checkbox; its wrapping, indentation and wording
      stay byte-identical, per the annotation rules in AGENTS.md
- [ ] A `tick` list containing one unmatched criterion still reports which one failed, and the
      existing all-or-nothing behaviour is either kept deliberately or documented in the tool
      description
