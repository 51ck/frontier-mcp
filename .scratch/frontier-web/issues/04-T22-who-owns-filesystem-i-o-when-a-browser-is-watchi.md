---
id: T22
title: Who owns filesystem I/O when a browser is watching
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: [T19, T21]
---

## Question

The central decision of this Map. A long-lived HTTP process must exist for the browser regardless.
Does anything else change?

Candidates:

- **A — web server as peer.** Its own index, its own watcher, writing under the same ADR 0004 / 0005
  guards as every other writer. No new coordination protocol, no daemon lifecycle, MCP sessions
  untouched.
- **C — shared read cache, direct writes.** A hub serves reads to all sessions, eliminating the N
  redundant scans and N watchers, but every writer still writes directly under the existing guards.
  Targets the measured cost without claiming a single-writer guarantee.
- **B — full hive.** One process owns all filesystem I/O; MCP sessions become thin proxies.

The framing that must survive this grilling: **a broker can never be the only writer.** The editor,
`git checkout`, and any agent's plain file tools all mutate `.scratch/` without passing through it —
the user has already observed an agent going to disk to work out the next Ticket id by hand. So B
cannot deliver a single-writer guarantee, only the appearance of one, and the temptation that
follows — dropping the revision check because "we are the only writer" — is the regression to avoid
(`AGENTS.md:254-256`).

B must additionally answer: who starts and reaps the daemon; version skew when Cursor is pinned to
one published version and another client to a different one; and what happens when the hub is down.

Invoke `/grilling` and `/domain-modeling`. HITL.

## Acceptance criteria

- [ ] One of A, B or C is chosen, with the scan measurement and the transport research as inputs
- [ ] The decision records what it does to `spec.md:399` — amended in place, or superseded by a new ADR
- [ ] It is stated explicitly that ADR 0004 and ADR 0005 guards survive unchanged, and how the new
      process participates in them
- [ ] The choice forecloses neither browser edits nor later multi-repo aggregation, and says how
- [ ] If B is chosen, daemon lifecycle, version skew and degraded mode each have an answer
