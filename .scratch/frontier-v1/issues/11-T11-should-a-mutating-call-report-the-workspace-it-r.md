---
id: T11
title: Should a mutating call report the workspace it resolved?
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: [T10]
---

# T11 — Should a mutating call report the workspace it resolved?

## Question

Only `list_efforts` echoes the workspace it resolved. A successful `update_ticket` or
`create_tickets` against the wrong repository says nothing — which is how the worktree escape in
T10 stayed invisible until it was probed for deliberately. Should a write name where it went?

Against: every character is a token on every call, and cutting token cost is the whole reason this
server exists. The eight-tool ceiling is held for the same reason.

For: a silent write to the wrong repository is the one failure a caller cannot detect from the
result it gets back. T10 closes the known route to it, not the class.

## Acceptance criteria

- [ ] Decided, with the token cost of the chosen answer measured rather than assumed
- [ ] If a write should report it, a build Ticket exists for that work; if not, the answer records
      why the remaining risk is acceptable
