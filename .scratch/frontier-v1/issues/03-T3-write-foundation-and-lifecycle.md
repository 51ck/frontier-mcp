---
id: T3
title: Write foundation and Ticket lifecycle — claim, resolve, drop
kind: build
status: open
triage: ready-for-agent
blocked_by: [T2]
---

# T3 — Write foundation and Ticket lifecycle: claim, resolve, drop

**What to build:** An agent can take a Ticket and record its outcome. Claiming is a real claim — a
second session attempting the same Ticket is refused rather than quietly succeeding. Resolving records
the answer and a one-line gist; dropping records why the work was ruled beyond the destination. Every
mutation that moves a Ticket through the graph lives here; annotations that don't affect the Board are
T4.

Underneath it, the write machinery every later slice depends on: atomic writes, an optimistic check
that fails loudly rather than clobbering a concurrent edit, and normalization of whatever Legacy file
the write happens to touch.

- [ ] Writes are atomic — a temporary file renamed over the target, so an interrupted write cannot
      leave a partial Ticket
- [ ] Every read-modify-write checks the file's modification time and size against what was read, and
      fails loudly on mismatch
- [ ] No lock files are created
- [ ] Claiming sets holder and timestamp, and is compare-and-set: claiming a Ticket someone else holds
      fails
- [ ] Genuinely concurrent claims on one Ticket produce exactly one winner — tested with real
      concurrency, not sequential calls
- [ ] Claims older than a threshold are flagged on the Board and never auto-released
- [ ] Resolving requires a one-line `answer_gist` on every kind, build included, and writes the answer
      into the body
- [ ] Dropping requires a `dropped_reason`
- [ ] A Ticket blocked by a dropped Ticket is reported as a broken Edge, not promoted to the Frontier
- [ ] A write to a Legacy Ticket normalizes that file to the schema
