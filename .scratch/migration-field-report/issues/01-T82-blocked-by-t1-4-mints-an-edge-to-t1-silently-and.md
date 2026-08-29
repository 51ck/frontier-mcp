---
id: T82
title: "`Blocked by: T1.4` mints an Edge to `T1`, silently and to the wrong board"
kind: build
status: open
triage: needs-triage
blocked_by: []
---

Found migrating a 191-Ticket, 20-Effort repo (`tag-customizer`) onto the schema.

That repo's `typescript-rewrite` board names its predecessors in prose as `Blocked by: T1.4`, where `T1.4` is a milestone label from the original rewrite plan. It predates Ticket ids and is not one.

`migrate_effort` read the `T1` prefix out of `T1.4` and minted `blocked_by: [T1]` on thirteen Tickets. `T1` existed — it was a Ticket on a completely unrelated board, `consume`'s "`Camera.destroy()` leaves gsap tweens and timers live".

## Why nothing caught it

This is the part worth fixing beyond the parse itself. The Edge resolved to a real, `resolved` Ticket, so:

- no `dangling Edges` warning fired;
- the frontier was unaffected, because a resolved blocker suppresses nothing;
- the board was `0/13 Legacy` and reported no warnings at all.

A full-repo verification pass across all twenty boards reported `ALL BOARDS CLEAN`. The Edges were wrong, not broken, and nothing distinguishes those two states in the output. It was found by grepping `blocked_by:` by hand afterwards.

## Repro

A Ticket body containing `Blocked by: T1.4` in an Effort where nothing named `T1.4` exists, migrated with `migrate_effort`, in a repo where some Ticket holds the id `T1`.

## Worth considering

A prose Edge reference should match a Ticket id exactly, not by prefix. `T1.4` matching `T1` is the same class of substring trap as the `issuePrefixes: ["gh-"]` finding on the consumer side.

A cross-Effort Edge minted by migration is also inherently suspicious: `Blocked by:` prose in a legacy board almost always names a sibling by sort order, so an Edge that lands on another board is more likely a misparse than an intent. Worth at least naming in the migration report.

Under the uncoordinated-id format from [[T35]] the concrete `T1.4` case disappears, since `T1` stops being a plausible id shape. The general one does not: prefix-matching an id out of arbitrary prose is what failed, and a six-character base36 id can still sit inside a longer token.
