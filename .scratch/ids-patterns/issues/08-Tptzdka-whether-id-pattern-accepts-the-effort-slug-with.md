---
id: Tptzdka
title: Whether a Ticket's name is its path, replacing the minted id
kind: decision
type: grilling
status: resolved
triage: ready-for-human
blocked_by: [T7yghip]
answer_gist: "`<effort>` does not become a pattern token and no counter is added: the minted id goes entirely. A new Ticket is named by its path, `<effort>.<name>` with a meaningful name the creator picks; existing ids are read forever; it ships as 2.0. ADR 0008 supersedes ADR 0006."
---

## Question

GitHub issue #53 asks for Ticket ids of the form `<effort>.<n>`, counting within one Effort, so an
Effort named after an external tracker issue (`PROJ-123`) gets `PROJ-123.1`, `PROJ-123.2`. The
external id is already the branch name, the commit prefix and the Effort slug; the Ticket id is a
second namespace nobody quotes.

[[T52]] refused `<effort>` on three arguments it called each sufficient, and [[T55]] then relied on
the refusal. This Ticket reopens that decision.

## What the owner has stated

- An Effort is never renamed.
- A Ticket never moves between Efforts. If the work has to move, the Ticket is closed in one Effort
  and a new one in the other Effort links back to it.

## Position going in

The slug is stamped into the id once, at creation, and never derived again.

- **T52 argument 1, the slug changes by `mv`.** Answered by the two statements above for this
  consumer, and by stamping for everyone else: after a rename old Tickets keep the old slug, new ones
  get the new one. Documented, not refused.
- **T52 argument 2, location inside identity.** The precedent is [[T35]]'s rejection of a sortable
  prefix, but sort order changes and the Effort a Ticket was created in does not.
- **T52 argument 3, the shipped doc says ids do not restart per Effort.** The doc says so because
  T52 decided so. It changes with the decision.

What it really costs:

- **The typo check from T55.** A pattern starting with `<effort>` has no literal anchor. Either a
  string counts as an id only when its prefix is the slug of an existing Effort, or a sigil carries
  recognition — which is why this waits on the sigil research.
- **A separate per-Effort counter token**, so `<N>` keeps meaning workspace-wide. The guard keys on
  slug plus counter value.
- **Slug legality at creation.** A slug with a character outside the id alphabet, a leading digit,
  or one that pushes the id past the length limit makes `create_tickets` refuse with the reason.
- **Merge collisions**, as with any counted pattern; rarer when one Effort lives on one branch.

The demand so far is one consumer. The change touches ADR 0006, the `isId` predicate, the guard and
the shipped tracker doc.

## Acceptance criteria

- [x] Whether `<effort>` becomes a legal token is decided
- [ ] If it does: the counter token, the guard key, the id predicate and the slug legality rule are stated
- [ ] If it does: what a rename and a hand-moved Ticket file leave behind is stated
- [x] If it does not: ADR 0006 gains the reason, and issue #53 is answered with it
- [x] Either way, what [[T55]]'s typo check rests on afterwards is stated

## Source

GitHub issue #53, opened 2026-11-14.

## Answer

Decided with the owner on 2026-11-15. The rules are [ADR 0008](../../../docs/adr/0008-a-ticket-is-named-by-its-path.md); the build is the `ticket-names` Effort.

- **`<effort>` as a token:** no. Issue #53's `PROJ-123.1` is answered by `PROJ-123.token-cache`. A per-Effort counter costs the same tokens as a word and collides whenever two branches add a Ticket.
- **Rename and move:** an Effort is not renamed and a Ticket does not move. A name records where a Ticket was created. A hand-moved Effort directory keeps its bare Edges and makes full-name Edges into it dangle visibly.
- **What [[T55]]'s typo check rests on afterwards:** not on id shape. A reference that resolves to nothing is refused within two edits of an existing name and stored as dangling beyond that. Temporary keys are gone, so there is nothing to confuse with an id.
- **ADR 0006:** marked superseded for 2.0. Issue #53 is answered when the docs Ticket of `ticket-names` lands, with the owner's go-ahead to post.

The third criterion is unticked on purpose: the answer to "if it does not" applies, and ADR 0008 carries the reason in place of a line in ADR 0006.

## Comments

**2026-11-15 — the question widened, and the owner set the frame.**

Five clean-room researchers, given the needs and none of this design, all named a unit `<effort>.<name>` with the name equal to the file path and the external tracker key as the Effort name. All five rejected minted ids, counters (including `PROJ-123.1` from issue #53) and hashes. Four chose a meaningful slug the creator picks; one chose a random word the tool draws. Caveat recorded by their coordinator: one model, one brief, so the agreement is weaker than five people agreeing.

Direction proposed here and not yet written into an ADR:

- A new Ticket's name is its path: `PROJ-123.token-cache` at `.scratch/PROJ-123/issues/token-cache.md`. A bare name resolves within its own Effort; the full name crosses Efforts.
- A meaningful slug rather than a random word, because hand-writing stays legal and the upstream skills create files themselves: a file named for what it is has a name from the moment it exists.
- Minting, the id pattern, counter guards, temporary keys and `<effort>#<order>` handles go away for new Tickets.

Owner decisions, 2026-11-15:

- This may override earlier ADRs and the spec.
- It ships as 2.0. Existing ids are read forever: a file carrying `id:` keeps that as its name. New Tickets are written without one. Existing Tickets do not move.
- An Effort is never renamed and a Ticket never moves between Efforts.

Measured the same day, `docs/research/2026-11-15-name-fidelity.md`: 1,980 references across opaque ids, meaningful slugs and random words, on two models, up to 25,000 tokens from the Board. No scheme produced a wrong, re-derived or invented name. Fidelity does not separate the schemes, so the stated kill criterion for meaningful slugs was not met.

Still open before an ADR: whether the server stops writing the `NN-` order prefix, how a bare name resolves outside an Effort context, the typo rule that replaces the `isId` predicate, the slug grammar and reserved words, and what a same-name collision at merge asks of the person resolving it.
