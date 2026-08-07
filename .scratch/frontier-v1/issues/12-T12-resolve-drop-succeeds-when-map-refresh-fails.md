---
id: T12
title: Resolve/drop succeeds even when Map derived refresh fails
kind: build
status: open
triage: ready-for-agent
blocked_by: []
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

- [ ] Resolving or dropping a Ticket succeeds when Map derived regeneration fails after the Ticket
      write
- [ ] The tool result carries a warning that Decisions-so-far / dropped Out-of-scope may be stale
- [ ] A later successful Map refresh or Map mutation brings the derived blocks up to date
- [ ] A concurrent Map edit that briefly contends for the Map no longer makes a completed resolve
      or drop look like a failure to the caller
