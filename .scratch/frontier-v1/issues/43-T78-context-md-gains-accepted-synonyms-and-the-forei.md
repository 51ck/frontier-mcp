---
id: T78
title: CONTEXT.md gains accepted synonyms and the Foreign entry
kind: build
status: open
triage: ready-for-agent
blocked_by: []
---

**What to build:** the glossary changes [[T57]] and [[T50]] decided. This Ticket owns every `CONTEXT.md` edit so they land in one commit instead of two Tickets fighting over one file — see the comment on [[T72]], whose `CONTEXT.md` criterion moves here.

**A third slot.** Entries become canonical term, `_Accepted_`, `_Avoid_`. This bends the skill's two-slot format, whose "be opinionated" rule argues against a middle slot; the justification is specific to this product. FrontierMCP is read by agents working in other people's repos, who arrive carrying Jira, GitHub and Linear vocabulary, so a translation table is worth more here than in an ordinary codebase.

**One binding rule, stated at the top of `## Language`:** the canonical term binds code identifiers, tool names and newly written prose; accepted synonyms are recognized on input only — an agent reading one knows what is meant, and never writes it into new code or docs. Without that rule the slot dissolves the discipline and the two words drift apart in the code.

**Entries.**

**Foreign Ticket** replaces **Legacy ticket**, whose two clauses [[T50]] found false. Defined on conformance, not provenance: a Ticket file that does not conform to the schema — no fence, a broken fence, or a fence that is not ours — parsed best-effort on read, and normalized by the first write that touches it. `_Avoid_` carries `legacy`, `unmigrated`, `old-format`, `imported`, `external`.

**Ticket** gains `_Accepted_: Issue`. The storage layout already agrees: `driver.ts:53` is `const ISSUES_DIR = 'issues'`.

**Effort** takes no accepted synonym, and `board` stays in its `_Avoid_` with the reason attached, because that is the mistake people actually make. Every familiar candidate imports a wrong model — *Epic* implies decomposable work, *Project* scope and duration, *Milestone* a date.

**Board** keeps its existing meaning as the view. Worth stating in the entry that there is no `Board` type in `domain.ts` and that `Effort` is the entity, so a reader does not re-derive the collision.

A focused `_Accepted_`/`_Avoid_` pass over **Ticket**, **Edge**, **Frontier**, **Status** and **Board** — the entries where agents actually collide. Not a rewrite of all fifteen.

Also from [[T50]], moved here from T72: `CONTEXT.md` names `id_pattern` and no shape, gains **Temporary key** and **Handle** as decided entries, gains nothing about minting, and **Edge** is corrected — it claims a foreign Edge "looks no different" while the Board annotates it precisely so it does.

**Status:** ready-for-agent

- [ ] `## Language` opens with the binding rule: canonical binds code and new prose, accepted synonyms are recognized on input only
- [ ] Entries carry three slots where a synonym exists
- [ ] **Foreign Ticket** replaces **Legacy ticket** and is defined on conformance
- [ ] **Ticket** carries `_Accepted_: Issue`; **Effort** carries none, and keeps `board` in `_Avoid_`
- [ ] **Edge** is corrected, and **Temporary key** and **Handle** are added
- [ ] `CONTEXT.md` names `id_pattern` and states no id shape
- [ ] The file stays a glossary — no implementation detail, no spec
