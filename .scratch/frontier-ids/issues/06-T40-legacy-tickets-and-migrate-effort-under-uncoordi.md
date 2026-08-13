---
id: T40
title: Legacy Tickets and migrate_effort under uncoordinated minting
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: [T35, T37]
---

## Question

`migrate_effort` mints ids for Legacy Tickets through `withIdReservations` (`src/storage/markdown/create.ts:102`),
which exists only to hold guards — and the guards are going. Migration also rewrites Edges that name
a Legacy Ticket by its order number (`src/storage/markdown/migrate.ts:214`).

What does minting look like for a migration batch once there is nothing to reserve? And does a
Legacy Ticket that already carries a hand-written `T<n>` keep it, given old-format ids stay valid?

## Acceptance criteria

- [ ] How a migration batch mints is decided
- [ ] Whether `withIdReservations` survives in any form is decided
- [ ] The treatment of a Legacy Ticket already carrying an id is stated
