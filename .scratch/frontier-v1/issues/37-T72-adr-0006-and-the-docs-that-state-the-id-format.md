---
id: T72
title: ADR 0006 and the docs that state the id format
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T65, T49]
answer_gist: ADR 0006 supersedes ADR 0005 with the pattern-driven mechanism and the guard's condition, quoting only T49's measured figures; the shipped tracker doc branches its hand-mint steps on `id_pattern` with the legality rules, names Handle and Temporary key, and carries a doc revision number; README's stability notice is true
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


- [x] ADR 0006 exists, states the guard's condition, and marks ADR 0005 superseded
- [x] Every figure in it is measured, or labelled as arithmetic
- [x] `docs/agents/issue-tracker.md:3-4` grows to name **Handle** and **Temporary key**, the two
      consumer-facing terms [[T50]] found missing from the list a consumer's `CONTEXT.md` is
      expected to define
- [x] `AGENTS.md`'s two id bullets match the shipped behaviour
- [x] `docs/agents/issue-tracker.md` branches on `id_pattern`, drops the sentence describing no code
      path, fixes the guard filename, and carries a version marker
- [x] `README.md`'s stability notice is true after the release

## Answer

ADR 0006: every figure traces to `docs/research/2026-09-13-create-path-cost.md`, the two differences are labelled arithmetic, and scan cost cites AGENTS.md without restating it. ADR 0005 gained one superseded line and is otherwise intact.

Tracker doc: the preamble argues precedence. Hand-minting reads `id_pattern`, checks legality and refuses to mint under a broken file (never the default), fixes random parts at exact length and lowercase and `<N>` at unpadded decimal, counts before drawing under a mixed pattern, and warns that a hand-writer cannot take the guard. The guard filename is fixed and the sentence describing no code path is gone. It also covers duplicate ids, the standing counted-pattern warning and foreign frontmatter.

Version marker: a doc revision integer, starting at 2 because 0.5.0 shipped the doc with none. A marker tied to the package version was built first and replaced: release-it tests before it bumps, so such a marker must understate the release it ships in. The revision is raised by hand when the doc's contract changes.

AGENTS.md: the second id bullet points at ADR 0006; the workspace-line rule now says ids are unique within a repository, not across repositories.

README: done with T100. Per T50 it does not restate the default pattern.

The `CONTEXT.md` criterion moved to T78 and was not touched.

## Comments

Two changes from [[T57]].

The T70 Edge is gone: T70 is dropped, because both halves of its premise died — the foreign fence is no longer quarantined into the body, and `awaits_migration` is never written. Nothing in this Ticket's remaining scope depends on it, so the Edge is not replaced. Foreign detection is [[T73]] and does not gate the id docs.

The `CONTEXT.md` criterion moves to [[T78]], which owns every glossary edit so they land in one commit rather than two Tickets editing one file. That covers this Ticket's three [[T50]] items — naming `id_pattern` with no shape, adding **Temporary key** and **Handle**, correcting **Edge** — alongside T57's Foreign entry and the accepted-synonym slot. Skip that criterion here; ADR 0006, `AGENTS.md`, `docs/agents/issue-tracker.md` and `README.md` are unchanged and still this Ticket's.
