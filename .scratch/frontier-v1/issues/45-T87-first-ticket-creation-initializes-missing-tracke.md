---
id: T87
title: First Ticket creation initializes missing tracker storage before reserving an id
kind: build
status: resolved
triage: needs-triage
blocked_by: []
answer_gist: Initialize tracker storage before guarded id allocation on first creation.
---

## Problem

In a fresh temporary repository with a .git directory and no .scratch directory, start the compiled server, initialize MCP, then call create_tickets with effort: probe, create: true, and tickets: [{title: Runtime probe}]. The README and tracker configuration say this creates the first Effort. Instead the call returns ENOENT opening .scratch/.frontier-id-T1.guard.

Observed during the 2026-09-04 runtime investigation on Node 20.20.2. Creating the empty .scratch directory before starting the server makes the same creation succeed. No consumer repository files were changed by the probe.

goals: effective, usable

## Done when

- [x] In a repository with no tracker directory, create_tickets with create: true creates the first Effort and Ticket without a preparatory filesystem edit.
- [x] Id allocation remains guarded across processes; initializing storage does not bypass the reservation path.
- [x] An MCP-level regression starts with only the repository marker and reproduces the failure before the fix.

## Answer

The creation path makes the tracker directory before reserving ids and keeps the existing cross-process guards. A new MCP regression starts from only the repository marker; it failed with the reported ENOENT before the fix and passes after it. Full suite: 248 tests. Typecheck, lint, format and build passed. Installed upstream skills are excluded from formatting so the verification gate preserves those copies. Blind review: PASS.
