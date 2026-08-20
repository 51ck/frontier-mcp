---
id: T62
title: T40's migration answer assumes guards that T53 kept
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: []
---

## Question

[[T40]] and [[T53]] are both resolved and they contradict each other on the same mechanism.

T40's answer opens "With [[T37]]'s guards gone, minting is one line of protocol: draw a random id,
check it against `used` and against the ids already drawn in this batch, redraw on a hit." It then
deletes `withIdReservations` (`src/storage/markdown/create.ts:102`) and `peekMintedIds` (`:122`)
outright, and describes a migration that takes no guard at all. The word `id_pattern` does not appear
in it. Every sentence is written under the assumption that the only pattern is random.

T53 resolved the opposite for derived patterns: the guards were never actually deleted, they stay for
every pattern containing `<N>`, and `guardFor` (`create.ts:350`) must be re-keyed on the `<N>` value
rather than the rendered id. It also names T40 by name — "T40 opens on the premise that the guards
are going, and that premise is now dead — it needs rewriting whichever Effort answers it."

The rewrite never happened. T40 resolved at `41e2672`, after T53 resolved at `74891ca` and after its
review correction at `92fc583`, and still carries the dead premise.

This is not a documentation nit. A builder following T40 literally would write a `migrate_effort`
that mints uncoordinated ids under a `T<N>` pattern, which is exactly the failure ADR 0005 measured:
four processes, three Tickets each, thirteen files carrying four distinct ids. Migration is the
largest batch mint the product performs, so it is the worst place to lose the guard.

What survives of T40 under a configurable pattern, and what has to be restated before its build
Ticket can be written?

## Acceptance criteria

- [ ] Whether `withIdReservations` is deleted, kept, or kept conditionally is settled, against
      T53's observation that it already short-circuits on `count === 0` (`create.ts:108`)
- [ ] What a migration batch does under a derived pattern is stated — how many ids it takes guards
      for, and whether it holds them across the whole two-phase write as `reserve()` does today
- [ ] `peekMintedIds`'s fate is settled for both strategies; T53 notes a preview under a random
      pattern cannot predict what the real run mints and should say so rather than showing candidates
- [ ] Every other T40 conclusion is checked against a derived pattern and marked as surviving or
      restated — id preservation, the `rename` deletion, the handle-based preview, the frontmatter
      quarantine, `awaits_migration`
- [ ] Whether T40 is amended in place or superseded by this Ticket is stated, so the Map's
      Decisions-so-far does not keep advertising the dead premise
