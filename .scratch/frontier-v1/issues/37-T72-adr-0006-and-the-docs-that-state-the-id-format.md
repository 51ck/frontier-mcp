---
id: T72
title: ADR 0006 and the docs that state the id format
kind: build
status: open
triage: ready-for-agent
blocked_by: [T65, T49]
---

**What to build:** the written half of the id work.

**ADR 0006 supersedes ADR 0005 rather than amending it.** [[T37]]'s reasoning: ADR 0005's arguments
— why the exclusive create cannot sit on the Ticket file, why no scheme for reclaiming a guard can be
made safe — are correct and worth keeping legible, and both stop applying to the default. Editing
them into a document about random ids leaves a text arguing for something it no longer does. The new
ADR states the mechanism, states the guard's *condition* per [[T53]], and links back.

**It may only quote measured figures.** [[T49]] exists because T37's numbers are ADR 0005's own
figures halved, and ADR 0005 says plainly its ranges "are doubled from single-scan timings rather
than measured as a pair". Halving a doubled number returns what it started from. Whatever part of the
figure remains arithmetic rather than observation is labelled as such.

**`CONTEXT.md`**, per [[T50]]: one rule settles it — a document references the source of the id
format and never restates the value. So it names `id_pattern` and no shape, gains **Temporary key**
and **Handle** as decided entries, and gains nothing about minting. The invariant "the server mints
every id it is present for" belongs to [[T39]] and lives in the shipped tracker doc, because a
glossary entry saying it would be contradicted by a passing test. **Legacy Ticket** and **Edge** are
both corrected — Edge because it claims a foreign Edge "looks no different" while the Board annotates
it precisely so it does.

**`AGENTS.md`** keeps both id bullets: the first stripped to what binds the code, the second made
pattern-conditional per T53. No pointer to the tracker doc — line 461 already is one.

**The shipped `docs/agents/issue-tracker.md`**, per T39. The preamble survives on a different
argument: it is about precedence, not danger. The scan instruction lives in the Layout bullet, not
Hand publish, and becomes: read `id_pattern` from `.scratch/frontier.yml`, then branch — generate
without scanning when the pattern has no `<N>`, scan-and-increment when it does, warning there that a
hand-writer cannot take the guard. Its guard filename is wrong for mixed patterns. Its "guessed id
passed to create_tickets" sentence describes no code path and goes. The doc gains a **version
marker**, which is the one mitigation that reaches a reader holding a stale vendored copy.

Also: `README.md`'s stability notice names "Ticket id format" as still being settled. After this
release it is settled but configurable, which is a different sentence.

**Blocked by:** the mechanism has to exist before it is described, and T49 before it is priced.

**Status:** ready-for-agent

- [ ] ADR 0006 exists, states the guard's condition, and marks ADR 0005 superseded
- [ ] Every figure in it is measured, or labelled as arithmetic
- [ ] `CONTEXT.md` names `id_pattern` and no shape; **Temporary key** and **Handle** are added;
      **Legacy Ticket** and **Edge** are corrected
- [ ] `AGENTS.md`'s two id bullets match the shipped behaviour
- [ ] `docs/agents/issue-tracker.md` branches on `id_pattern`, drops the sentence describing no code
      path, fixes the guard filename, and carries a version marker
- [ ] `README.md`'s stability notice is true after the release

## Comments

Two changes from [[T57]].

The T70 Edge is gone: T70 is dropped, because both halves of its premise died — the foreign fence is no longer quarantined into the body, and `awaits_migration` is never written. Nothing in this Ticket's remaining scope depends on it, so the Edge is not replaced. Foreign detection is [[T73]] and does not gate the id docs.

The `CONTEXT.md` criterion moves to [[T78]], which owns every glossary edit so they land in one commit rather than two Tickets editing one file. That covers this Ticket's three [[T50]] items — naming `id_pattern` with no shape, adding **Temporary key** and **Handle**, correcting **Edge** — alongside T57's Foreign entry and the accepted-synonym slot. Skip that criterion here; ADR 0006, `AGENTS.md`, `docs/agents/issue-tracker.md` and `README.md` are unchanged and still this Ticket's.
