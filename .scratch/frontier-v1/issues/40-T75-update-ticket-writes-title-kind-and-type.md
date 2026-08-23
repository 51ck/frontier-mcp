---
id: T75
title: update_ticket writes title, kind and type
kind: build
status: open
triage: ready-for-agent
blocked_by: []
---

**What to build:** the write path [[T57]] decided. The agent-fed migration pass derives a Ticket's real title, kind and type from its prose and writes them back; nothing can write them today.

`TicketEdit` (`src/domain.ts:120-134`) gains `title`, `kind` and `type` as mutation points, and `updateTicketInputSchema` gains the three fields. `type` is only meaningful when `kind` is `decision` (`domain.ts:48`), so setting it on a `build` Ticket is refused in `editFor` alongside the existing validations, which is where domain rules live rather than in the driver.

**Why not a migration-scoped tool.** Both of its arguments died: there is no `awaits_migration` to gate on, and no quarantined block to edit. A tracker whose CRUD surface cannot fix a typo in a title has a gap that migration merely walked into, and a second tool writing these same three fields would be a migration-shaped hole in a general surface.

**`status` is not part of this.** `editFor` throws on a direct `status` by design (`src/tools/update-ticket.ts:96-102`) — Status is derived from the lifecycle transition. The pass's inability to correct a wrongly inferred status is a real defect and is [[reopen]], not this Ticket.

**Status:** ready-for-agent

- [ ] `update_ticket` sets `title`, `kind` and `type`, alone or alongside a lifecycle change
- [ ] `type` on a `build` Ticket is refused, with the reason named
- [ ] A write that changes only `title` still takes the revision check
- [ ] `status` remains unsettable directly, with its existing error unchanged
