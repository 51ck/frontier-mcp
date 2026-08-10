---
id: T23
title: How the browser learns the board changed
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: [T22, T19]
---

## Question

An agent resolves a Ticket. How does the open browser tab find out?

Push over SSE or WebSocket, browser polling, or something else. Interacts directly with the 50ms
debounce (`src/workspace-watcher.ts:27`) and with whatever the scan measurement says about how long
fresh data takes to become available.

Constraint to check still holds: `spec.md:398` keeps watcher-triggered writes out of scope. Pushing
a read to a browser is not a write, but any design that regenerates derived Map blocks on a watcher
event would cross that line.

Invoke `/grilling`. HITL.

## Acceptance criteria

- [ ] A mechanism is chosen, consistent with the transport decision
- [ ] The staleness a human can observe is stated as a number, not an adjective
- [ ] Behaviour on a hand edit and on `git checkout` is specified — those are the common cases
- [ ] Confirmed that nothing in the design writes on a watcher event

## Comments

T19 moved to frontier-v1 when the shared-driver question separated into frontier-hive. This Ticket still needs its staleness-window measurement — write in one process, until a second returns fresh data, including the 50ms debounce — so the Edge is now cross-Effort. T22 stays as a resolved blocker: it settled that the web process is a standalone peer reader holding its own driver, which is what this Ticket pushes from.
