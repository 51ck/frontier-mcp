---
id: T52
title: The token language and what makes a pattern legal
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: []
---

## Question

Which tokens exist, and which patterns does the product refuse to accept?

The candidate set from charting: `<N>` (the next number within the pattern's own namespace),
`<b36{n}>` and `<b16{n}>` (random strings of a given length), `<effort>` (the Effort slug), and
literal characters. `<commit>` and anything else derived from git state is ruled out of scope.

Proposed legality rules, also from charting: no leading `<N>`, at most one `<N>` per pattern, and
filename-safe characters only — the id appears in `<NN>-<id>-<slug>.md`, so a pattern that cannot be
put in a filename is not a pattern.

Two hard parts those rules do not reach.

**`<effort>` derives identity from something that renames.** An Effort slug is a directory name. Move
a Ticket between Efforts, or rename an Effort, and the id either lies or changes — and *never
changed* is what commit messages, cross-Effort Edges and every prose reference stand on. `<effort>`
also forces `<N>` to count per Effort, which contradicts `docs/agents/issue-tracker.md`'s statement
that ids do not restart per Effort. Does `<effort>` survive at all, and if it does, what happens on
rename?

**The ambiguity budget.** `src/tools/create-tickets.ts:162` sorts every Edge into a declared key, an
id on disk, a well-formed id that does not exist yet (allowed — dangling Edges are Board warnings by
design), or a typo (refused). The fourth bucket only survives while the id pattern is narrow. Under
`T<b36{6}>` a typo'd key `auth-iu` matches nothing and is refused. Under `<effort>-<N>` in an Effort
named `auth`, the typo `auth-1` **is** a well-formed id and is silently accepted as dangling. A wide
pattern converts caught typos into silent dangling Edges.

The predicate ruling — current pattern plus the on-disk id set, no history — sharpens this for
`<effort>-<N>` specifically: is `frontier-v1-3` well-formed in a tree holding no `frontier-v1`
Effort? Accept any slug-shaped prefix and the pattern swallows more key space; accept only known
slugs and Edges into unmerged Efforts are refused.

## Acceptance criteria

- [ ] The token set is fixed, each token with its meaning
- [ ] Whether `<effort>` survives is decided, and if it does, the rename and cross-Effort-move cases
      are answered
- [ ] The legality rules are stated, and it is said which of them exist for parseability and which
      for ambiguity
- [ ] How much plausible-key space a pattern may swallow is decided, or the loss is recorded
      deliberately
- [ ] For a pattern containing `<effort>`, whether an unknown slug is well-formed is decided
