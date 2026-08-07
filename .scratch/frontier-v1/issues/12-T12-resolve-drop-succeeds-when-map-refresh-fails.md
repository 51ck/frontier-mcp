---
id: T12
title: Resolve/drop succeeds even when Map derived refresh fails
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: updateTicket returns TicketWriteResult; Map derived refresh after resolve/drop is best-effort with a stale warning
---

# T12 — Resolve/drop succeeds even when Map derived refresh fails

**What to build:** After `update_ticket` resolves or drops a Ticket, the Ticket Status is already
on disk. Regenerating the Map’s Decisions-so-far and dropped Out-of-scope is best-effort after that
write. If that regeneration exhausts retries or hits a non-retryable error, the tool still reports
success for the lifecycle change and includes an explicit warning that the Map derived blocks are
stale. The caller is never told the resolve or drop failed when the Ticket write already landed.
The Map catches up on a later successful refresh or Map mutation.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] Resolving or dropping a Ticket succeeds when Map derived regeneration fails after the Ticket
      write
- [x] The tool result carries a warning that Decisions-so-far / dropped Out-of-scope may be stale
- [x] A later successful Map refresh or Map mutation brings the derived blocks up to date
- [x] A concurrent Map edit that briefly contends for the Map no longer makes a completed resolve
      or drop look like a failure to the caller

## Answer

Ticket write still lands first. refreshMapDerived failures are caught; the tool returns success plus a warnings block that Decisions-so-far / dropped Out-of-scope may be stale. A later successful resolve or Map mutation regenerates the derived blocks. Acceptance criteria are wrapped — ticking them waits on T18.

## Comments

Criteria verified by test/edit-map.test.ts "resolve succeeds with a warning when Map derived refresh fails" plus the existing concurrent refresh retry test. Tick blocked by T18 (wrapped criterion text).
