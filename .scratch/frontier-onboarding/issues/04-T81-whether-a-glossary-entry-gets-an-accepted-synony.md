---
id: T81
title: Whether a glossary entry gets an accepted-synonym slot
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: [T60]
---

## Question

[[T78]] arrived carrying a glossary design that no resolved decision asked for, and it reverses one that did. This Ticket takes that design away from the build Ticket and decides it properly.

What T78 proposed: entries gain a third slot, so an entry reads canonical term, `_Accepted_`, `_Avoid_`; `## Language` opens with a binding rule — the canonical term binds code identifiers, tool names and newly written prose, while accepted synonyms are recognized on input only; a focused pass applies it to **Ticket**, **Edge**, **Frontier**, **Status** and **Board**; and **Ticket** carries `_Accepted_: Issue`.

**The last item is a straight reversal.** [[T50]] decided the **Ticket** entry ends `_Avoid_: issue, task, card, story`. Nothing has overturned it, and T78 offered no argument against T50's — it cited `const ISSUES_DIR = 'issues'` (`src/storage/markdown/driver.ts:53`), which is a directory name the layout inherited, not a case for the word.

**The rationale is real and is why this is a Ticket rather than a deletion.** T78's case: FrontierMCP is read by agents working in other people's repos, who arrive carrying Jira, GitHub and Linear vocabulary, so a translation table is worth more here than in an ordinary codebase. That is a genuine argument, and it is the sort a decision Ticket exists to test.

**It also depends on [[T60]], which is why this Ticket blocks on it.** The argument is entirely about *consumers'* agents. If T60 rules the product only names terms and ships no definitions, those agents never read this glossary, and the slot's justification collapses into an internal style preference — which the `writing-for-agents` skill's two-slot format, and its "be opinionated" rule, argue against. If T60 rules the product ships definitions, the slot is a consumer-facing feature and the question is live.

Two facts for whoever takes this.

**The `_Avoid_` lists are load-bearing on code, not just prose.** `AGENTS.md:265` binds `src/domain.ts` naming to the glossary *including its `_Avoid_` lines*. A term moving from `_Avoid_` to `_Accepted_` therefore changes what the codebase may be called, not only what a document may say. `Issue` is the sharpest case: `ISSUES_DIR` already exists, so promoting the word retroactively legitimizes an identifier that the glossary currently makes a violation.

**A middle slot has a failure mode the two-slot format does not.** Two slots ask a reader one question — is this the word or not. Three ask two, and the second ("may I write it, or only read it?") is answered by a rule stated once at the top of the file, far from the entry being read. T78 saw this and proposed the binding rule as the fix; whether a rule at that distance actually holds is part of what this Ticket decides.

## Acceptance criteria

- [ ] Whether entries gain a third `_Accepted_` slot is decided, consistent with whatever [[T60]] ruled about who reads this glossary
- [ ] If they do, the binding rule's wording is quoted, and where it lives is stated
- [ ] `Issue` is decided explicitly — either [[T50]]'s `_Avoid_: issue` stands, or it is superseded with an argument against T50's, not merely a citation of `ISSUES_DIR`
- [ ] The interaction with `AGENTS.md:265`, which binds `src/domain.ts` naming to the `_Avoid_` lines, is stated
- [ ] Which entries the decision touches is settled, or ruled to be the build's call
