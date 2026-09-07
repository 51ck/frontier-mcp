---
id: T80
title: An ADR for lazy conversion and the Foreign predicate
kind: build
status: open
triage: ready-for-agent
blocked_by: [T73, T74, T75, T77]
---

**What to build:** the written record of [[T57]]. Numbered after [[T72]]'s ADR 0006, so 0007 unless that one slips.

It clears all three bars. It is **hard to reverse** — a schema field withdrawn, a tool surface widened, and a conversion model committed to. It is **surprising without context**: a future reader finds `migrate_effort` that only mints and asks why it does not migrate, and finds no flag marking unreviewed migrated work and asks what happened to it. And it is a **real trade-off** with alternatives that were argued and rejected.

**What it states.**

Conversion is lazy: a Foreign Ticket is untouched until an agent writes to it, and that write normalizes the file. This is not new behaviour — `test/normalize-and-stale.test.ts:44-45` has stated it since [[T3]] — but it was incidental and is now the model, which is exactly the kind of change an ADR exists to catch.

`migrate_effort` is therefore not a conversion pass. It mints ids Effort-wide and resolves prose Edges, because `Blocked by: 01, 02` names sort orders that only a whole-Effort batch can resolve (`remapEdges`, `migrate.ts:211`). That is the one operation that cannot be lazy, and the ADR should say why the three escapes fail: handles in `blocked_by` retarget silently when a file is renumbered, cascading mints break the no-write invariant from inside, and dropping the Edge loses data the batch recovers mechanically.

**Foreign** is a conformance predicate, not a provenance one, with the reason: `legacy.ts` reads shape, not origin, and no rule can recover where a file came from.

`awaits_migration` was designed in [[T40]] and never built. The ADR records why: `id: undefined` survives the normalizing write, `unrecognizedStatus` covers an unmappable status, and the case both miss is where the floor's inference is most trustworthy.

Detection writes nothing, extending [[T38]]'s warn-on-read rule and keeping the read path pure per [[T8]].

**Also record the rejected alternatives**, briefly, since each cost real argument: a distinct migration-scoped tool, a validation function sourcing the flag, quarantining the fence into the body, and splitting Legacy from Foreign as two terms.

**Blocked by:** the behaviour has to exist before it is described.


- [ ] The ADR exists, numbered after ADR 0006
- [ ] It states lazy conversion as the model and names the test that already pinned it
- [ ] It states why minting alone cannot be lazy, with the three failed escapes
- [ ] It defines Foreign on conformance and says why provenance is unavailable
- [ ] It records `awaits_migration` as designed and not built, with the reason
- [ ] The four rejected alternatives are named
- [ ] No figure in it is unmeasured
