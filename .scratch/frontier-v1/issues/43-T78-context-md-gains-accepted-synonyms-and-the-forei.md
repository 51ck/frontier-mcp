---
id: T78
title: CONTEXT.md gains the Foreign entry and T50's decided wording
kind: build
status: open
triage: ready-for-agent
blocked_by: [T58, T81]
---

**What to build:** the glossary changes [[T57]] and [[T50]] decided. This Ticket owns every `CONTEXT.md` edit so they land in one commit instead of two Tickets fighting over one file — see the comment on [[T72]], whose `CONTEXT.md` criterion moves here.

**The accepted-synonym slot is not this Ticket's.** It was specified here, and a build Ticket cannot decide a glossary's shape — the version proposed also reversed [[T50]]'s `_Avoid_: issue` with no argument against it. That design now lives in [[T81]], which this Ticket blocks on. Apply whatever T81 rules; do not re-derive it.

**Entries.**

**Foreign Ticket** replaces **Legacy ticket**, whose two clauses [[T50]] found false. Defined on conformance, not provenance: a Ticket file that does not conform to the schema — no fence, a broken fence, or a fence that is not ours — parsed best-effort on read, and normalized by the first write that touches it. `_Avoid_` carries `legacy`, `unmigrated`, `old-format`, `imported`, `external`.

**Effort** takes no accepted synonym, and `board` stays in its `_Avoid_` with the reason attached, because that is the mistake people actually make. Every familiar candidate imports a wrong model — *Epic* implies decomposable work, *Project* scope and duration, *Milestone* a date.

**Board** keeps its existing meaning as the view. Worth stating in the entry that there is no `Board` type in `domain.ts` and that `Effort` is the entity, so a reader does not re-derive the collision.

Also from [[T50]], moved here from T72: `CONTEXT.md` names `id_pattern` and no shape, gains **Temporary key** and **Handle** as decided entries, gains nothing about minting, and **Edge** is corrected — it claims a foreign Edge "looks no different" while the Board annotates it precisely so it does.


- [ ] **Foreign Ticket** replaces **Legacy ticket** and is defined on conformance
- [ ] **Effort** keeps `board` in its `_Avoid_`, with the reason attached
- [ ] Whatever [[T81]] ruled about an accepted-synonym slot is applied as ruled, and nothing beyond it
- [ ] **Edge** is corrected, and **Temporary key** and **Handle** are added
- [ ] `CONTEXT.md` names `id_pattern` and states no id shape
- [ ] The file stays a glossary — no implementation detail, no spec

## Comments

Takes an Edge on [[T58]]. This Ticket owns the **Handle** entry, and T58 is what decides its separator, its unpadded `<order>`, and the instability clause. It carried `blocked_by: []` while presuming an answer to an open decision.

T58's replacement wording supersedes the **Handle** text [[T50]] quoted, on three points: it drops "Legacy Ticket" for "a Ticket without an id" — the true condition, since [[T57]] made Foreign a conformance predicate and a Ticket can conform and still be unminted; it states `<order>` as the number the `NN` prefix carries, written unpadded, because `handleFor` emits no padding while the filename pads; and it adds that a prefix-less Ticket's order moves when a sibling is added or removed. Take the wording from T58's answer, not from T50's.

Also from T58: [[T50]]'s **Temporary key** entry avoid-lists "handle (that is a Legacy Ticket's)". Same defect — it becomes "that is an unminted Ticket's".

The accepted-synonym design moves out to [[T81]], and this Ticket takes an Edge on it.

Why it could not stay: a build Ticket was specifying the glossary's shape — a third `_Accepted_` slot, a binding rule for `## Language`, and a five-entry pass — that no resolved decision asked for, and `**Ticket** gains _Accepted_: Issue` reversed [[T50]]'s decided `_Avoid_: issue, task, card, story` on a citation of `ISSUES_DIR` rather than an argument. T81 also blocks on [[T60]], because the rationale is about consumers' agents and T60 decides whether they ever read this glossary at all.

The title narrows to match: this Ticket is now the **Foreign** entry plus [[T50]]'s decided wording.

**A consequence worth seeing.** This Ticket now sits behind T58 (resolved) and T81, and T81 behind T60 — both unstarted grillings. So the settled glossary work, the **Foreign** entry and T50's `id_pattern`/**Handle**/**Temporary key**/**Edge** edits, waits on a decision it does not depend on. If that stall matters, split this Ticket: ship the settled entries now against the T58 Edge alone, and let a small follow-on apply T81. The one-file argument for keeping them together is about two Tickets open on `CONTEXT.md` at once, which a strict ordering avoids anyway.
