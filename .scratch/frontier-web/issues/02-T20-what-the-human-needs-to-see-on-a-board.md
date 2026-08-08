---
id: T20
title: What the human needs to see on a board
kind: decision
type: prototype
status: open
triage: ready-for-agent
blocked_by: []
---

## Question

What does the browser actually show? Settling this makes the transport decision concrete instead of
abstract — the read path can only be designed once we know what it must serve.

Build a rough, throwaway static page from real `frontier-v1` data: Efforts, the Board with the
Frontier marked, Ticket bodies, Edges, claims. React to it, then decide what the read API owes a
browser that `get_board` and `get_tickets` do not already give it.

Read-only. Editing from the browser is out of scope for this Effort.

Invoke `/prototype`. HITL — this resolves in conversation with the user, not alone.

## Acceptance criteria

- [ ] A rough page exists, built from real `frontier-v1` data, and is linked from this Ticket as an
      asset rather than pasted into it
- [ ] The list of things a human needs that the current tool payloads do not carry is written down
- [ ] Whether the browser renders Ticket markdown, and who does that rendering, is decided
- [ ] Anything the prototype reveals as genuinely needing writes is recorded as out of scope, not
      quietly absorbed
