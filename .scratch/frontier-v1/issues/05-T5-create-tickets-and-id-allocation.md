---
id: T5
title: create_tickets — global id allocation, temp-key Edges, cycle rejection
kind: build
status: open
triage: ready-for-agent
blocked_by: [T3]
---

# T5 — `create_tickets`: global id allocation, temp-key Edges, cycle rejection

**What to build:** Publishing a whole breakdown in one call. An agent hands over a set of Tickets whose
Edges reference its own temporary keys; the server mints ids, assigns filename numbers, and resolves
the keys into real Edges atomically. This is what deletes wayfinder's mandated create-then-wire second
pass.

Ids are `T<n>` from a repo-global counter derived as `max + 1` — no counter file to drift. Two parallel
sessions creating Tickets at the same moment must not collide, and the filesystem provides the mutual
exclusion for free.

- [ ] A set of Tickets is created in one call, with Edges declared by caller-chosen temporary keys
- [ ] Temporary keys resolve to real ids atomically; a partial failure creates no Tickets
- [ ] Ids are `T<n>`, unique across every Effort in the repo, derived from the highest existing id
- [ ] Allocation uses exclusive file creation with retry on collision — no counter file, no lock
- [ ] Genuinely concurrent creation from two sessions never issues the same id, tested with real
      concurrency
- [ ] New Ticket files are named `<NN>-T<n>-<slug>.md`
- [ ] An Edge may name a Ticket in another Effort by its plain id, with no compound reference form
- [ ] A cycle in the Edge graph is rejected at write time, on both creation and Edge updates
- [ ] Edge mutation via the update path is validated by the same cycle check
- [ ] An unknown Effort slug is created only when the call passes an explicit create flag, and
      otherwise fails
