---
id: T62
title: T40's migration answer assumes guards that T53 kept
kind: decision
type: grilling
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: "`withIdReservations` is kept: derived migration takes `needMint` guards and holds them across the write, random routes through the existing short-circuit; `peekMintedIds` is deleted for both and preview names handles; T40's other conclusions stand and its gist is amended so the Map stops advertising the deletion"
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

- [x] Whether `withIdReservations` is deleted, kept, or kept conditionally is settled, against
      T53's observation that it already short-circuits on `count === 0` (`create.ts:108`)
- [x] What a migration batch does under a derived pattern is stated — how many ids it takes guards
      for, and whether it holds them across the whole two-phase write as `reserve()` does today
- [x] `peekMintedIds`'s fate is settled for both strategies; T53 notes a preview under a random
      pattern cannot predict what the real run mints and should say so rather than showing candidates
- [x] Every other T40 conclusion is checked against a derived pattern and marked as surviving or
      restated — id preservation, the `rename` deletion, the handle-based preview, the frontmatter
      quarantine, `awaits_migration`
- [x] Whether T40 is amended in place or superseded by this Ticket is stated, so the Map's
      Decisions-so-far does not keep advertising the dead premise

## Answer

**T40's minting half is dead. The rest stands.**

[[T53]] already settled the strategy question, and [[T65]] makes `reserve()` (`create.ts:248`) pattern-conditional. Both mint paths bottom out there: `createTicketFiles` calls `reserve()` directly (`create.ts:70`), and `migrateEffortFiles` reaches it through `withIdReservations` (`migrate.ts:57`), a wrapper over the same `reserve()`/`release()` pair. Migration is not a third strategy. It is the same mint, called with a larger `count`. T40's opening — "With T37's guards gone, minting is one line of protocol" — describes only the random path, which T65 specifies, and which migration inherits from the same `reserve()`.

**`withIdReservations` is kept.** Deleted is what T40 said, and that is the sentence a builder of [[T69]] must not follow. It is `migrate_effort`'s route to the mint, and only that — `create_tickets` calls `reserve()` directly and releases in its own `finally` (`create.ts:70`, `:94`). The shared entry point is `reserve()`, not this wrapper, which is why T65's conditional lands in one place and both callers inherit it. Those internals are pattern-conditional, already specified by T53: a pattern containing `<N>` takes guards; a random pattern takes none.

T53's `count === 0` observation is why this is not a new function. `withIdReservations` already has a no-guard path (`create.ts:108`), which is T65's point that "the random path routes through the existing signature" — the signature accommodates a mint that takes no guard. A random pattern with `needMint > 0` uses the same idea one level down: `reserve()` draws instead of counting and takes no `.frontier-id-*.guard`, a branch inside one function rather than a second signature. A derived pattern with `needMint === 0` (every candidate already carries an id) hits the existing short-circuit and takes no guard either, which is correct: preserved ids are not being allocated.

Migration always calls `withIdReservations(storage, needMint, rescan, ...)`. It does not branch on the pattern at `migrate.ts`. The pattern compiled once; `reserve()` already knows.

**A derived migration takes `needMint` guards and holds them across the write.**

`needMint` is the count of candidates with no id (`migrate.ts:49`). Tickets that already carry an id take no guard — they occupy their name on disk, and a parallel session's scan sees them in `used`. That is today's behaviour and it stays.

What `reserve()` does today stays for `<N>`: scan, take every guard, re-scan while holding, restart if a candidate turned up. Then `withIdReservations` holds those reservations across `use()`, which for migration is `planChanges` plus `applyPlan`, and releases in `finally`. Releasing after the ids are chosen but before the files land reopens the window ADR 0005 measured — four processes, three Tickets each, thirteen files carrying four distinct ids. Migration is the largest batch mint the product performs. It is the worst place to reopen that window.

The "two-phase write" in the criterion names two different two-phases. `reserve()`'s own two-phase is the scan / re-scan-under-guards, and derived migration still takes it because it goes through `withIdReservations`. `applyPlan`'s two-phase is stage-every-file then rename, and that dies with `rename` (T40, surviving). After `rename` goes, the write is in-place atomic updates. The hold duration does not change: guards stay held until every file is on disk.

A mixed pattern `T<N>-<b36{4}>` inherits [[T65]]'s `guardFor` change for free — the guard keys on the `<N>` value, not the rendered id. Migration does not re-specify that.

A crashed derived migration can strand a guard file. T40 listed "no `.frontier-id-*.guard` files for a crashed migration to strand" as a win of deleting the guards. That win is random-only.

**`peekMintedIds` is deleted for both strategies.**

T40 already deleted it because randomness breaks the agreement between preview and the real run. T53 added: a random preview cannot predict what the real run mints, and should say so rather than showing candidates it will not honour. Those are the same deletion.

Derived preview *could* still walk `highestMinted + 1`. It should not. Three reasons, and the third is the one that decides it:

- Preview takes no guards (T40: a dry run never leaves `.frontier-id-*.guard` files). A parallel `create_tickets` can steal the sequence between preview and the real run, so a derived prediction is already a lie in the only case the guards exist for.
- `remapEdges` (`migrate.ts:211`) would still point a sibling's Edge at a predicted id, so the graph a preview draws is provisional in every position. T40 already refused that.
- [[T69]] requires one report shape, and requires that preview run twice against unchanged files produce the same report. Handles give both strategies that for free. Showing derived candidates and hiding random ones makes two report shapes, and a builder copying T40's worked example would not know which they were looking at.

Preview names an unminted Ticket by its handle. The `minted` flag survives. The report does not print a candidate id, and it does not pretend to. Under a random pattern that is because the id does not exist yet; under a derived pattern that is because a prediction we did not take a guard for is not an id we will mint.

T40's worked example zero-pads handles as `ship-0-5-0#01`. `handleFor` emits no padding. That is a defect in the example, not a decision — T69 already corrects it, and [[T58]] owns the separator.

**What else of T40 survives a derived pattern.**

| Conclusion | Fate |
| --- | --- |
| Existing id preserved; collision with an id elsewhere refuses and names both files | Survives. [[T35]]/[[T36]]: never changed. [[T38]]'s write rule, reused. Pattern-independent. |
| `rename: true` deleted; `fromName`/`toName` go; `MigrationChange` gains `filename` | Survives. The argument is path links in another Effort's prose, which no id format can see. |
| Preview names by handle, reference-style links, workspace-root-relative paths | Survives, and is required for random. See above. |
| Foreign frontmatter quarantined under `## Unmerged legacy frontmatter` | Survives. [[T70]]. About a fence we did not write, not about ids. |
| `awaits_migration: true` on every migrated Ticket | Survives. [[T70]]. `legacy` is derived from the fence; migration destroys it by adding one. |
| Mechanical floor + agent-fed pass; the tool that writes the pass is a separate Ticket | Survives. [[T57]]. The order-to-id map still exists only in a whole-Effort batch, under either strategy. |
| Inline mint against the scan; no reservation; no second scan; no stranded guards | **Restated.** True of the random path only, which T65 specifies. Derived takes guards, two scans, and can strand a guard file, the same as `create_tickets`. |
| "Minting is one line of protocol" | **Restated.** That line is the random path. Migration does not invent a third. |

**T40 is superseded on minting, not rewritten.** Same move T53 made to T37: a resolved Ticket records the route actually walked. Rewriting T40's Answer would bury the correction inside a document that opens on a dead premise, and T69 already says "Do not write this Ticket from T40's text alone." T62 is the live minting decision. T40 keeps the surviving conclusions — T70 still cites it for quarantine, T57 still cites it for the floor.

T40's gist is amended so Decisions-so-far stops advertising "`withIdReservations` and `peekMintedIds` are both deleted". The Answer body stays as the historical record, with a comment pointing here. That is the one edit T40 receives. Pure supersede without the gist change would leave the Map lying; rewriting the Answer would pretend T40 had known about T53.
