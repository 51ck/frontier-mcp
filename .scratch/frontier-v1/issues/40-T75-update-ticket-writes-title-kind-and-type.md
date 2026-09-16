---
id: T75
title: update_ticket writes title, kind and type
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: update_ticket writes title, kind, and type; type on a build Ticket is refused
---

**What to build:** the write path [[T57]] decided. The agent-fed migration pass derives a Ticket's real title, kind and type from its prose and writes them back; nothing can write them today.

`TicketEdit` (`src/domain.ts:120-134`) gains `title`, `kind` and `type` as mutation points, and `updateTicketInputSchema` gains the three fields. `type` is only meaningful when `kind` is `decision` (`domain.ts:48`), so setting it on a `build` Ticket is refused in `editFor` alongside the existing validations, which is where domain rules live rather than in the driver.

**Why not a migration-scoped tool.** Both of its arguments died: there is no `awaits_migration` to gate on, and no quarantined block to edit. A tracker whose CRUD surface cannot fix a typo in a title has a gap that migration merely walked into, and a second tool writing these same three fields would be a migration-shaped hole in a general surface.

**`status` is not part of this.** `editFor` throws on a direct `status` by design (`src/tools/update-ticket.ts:96-102`) — Status is derived from the lifecycle transition. The pass's inability to correct a wrongly inferred status is a real defect and is [[T76]], not this Ticket.


- [x] `update_ticket` sets `title`, `kind` and `type`, alone or alongside a lifecycle change
- [x] `type` on a `build` Ticket is refused, with the reason named
- [x] A write that changes only `title` still takes the revision check
- [x] `status` remains unsettable directly, with its existing error unchanged

## Answer

`TicketEdit`, the tool schema, and `fieldsOf` gained `title`, `kind`, and `type`. Domain rules stay in `editFor`: `type` is refused when the resulting kind is `build` (same sentence as `create_tickets`); `kind: build` clears a leftover `type`. The three fields may stand alone or ride with a lifecycle change. Direct `status` is still refused.
