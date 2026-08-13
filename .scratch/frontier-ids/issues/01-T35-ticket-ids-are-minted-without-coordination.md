---
id: T35
title: Ticket ids are minted without coordination
kind: decision
type: grilling
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: Ids become opaque lowercase base36, six characters after the `T` — `Tk39fq` — matching `^T[0-9a-z]+$`, which every existing `T<n>` id already satisfies, so the change is additive and nothing migrates
---

## Question

`max + 1` over a scan needs a global allocator, and git deliberately has none. Two trees both at
`T34` both mint `T35`, and git merges the two files cleanly because their paths differ by slug.

Does the id format change so that collisions cannot happen, rather than being coordinated away? And
if so — what shape, what length, and what happens to the 34 ids already minted?

## Acceptance criteria

- [x] Sequential-versus-uncoordinated is settled, with the reason recorded
- [x] The alphabet, length and case are fixed, with the collision exposure stated as a number
- [x] The fate of existing `T<n>` ids is settled — migrate, or stay valid
- [x] The pattern that replaces `MINTED_ID` is written down

## Answer

**Uncoordinated, because a repo-global counter needs a global allocator and git deliberately has none.** Sequential ids fight the substrate; the tracker never orders by id anyway — sort order lives in `NN` by contract, and nothing outside allocation does arithmetic on `n`. The counter's only products were short names and the whole of ADR 0005.

**Format: lowercase base36, six characters after the `T`.** `Tk39fq`. The pattern is `^T[0-9a-z]+$`.

- **base36 over Crockford base32** because the validation pattern and the mint alphabet then coincide exactly — the pattern *is* the alphabet, with no exclusion table to document or drift. Crockford's dropped `I/L/O/U` only pay off when a human transcribes an id by hand, which we decided not to optimise for.
- **Lowercase only** is forced, not chosen: this machine's filesystem is case-insensitive, so `Tk39FQ` and `Tk39fq` are one file. A mixed-case alphabet would introduce a second, silent collision source in the filename.
- **Six characters** gives 2,176,782,336. The exposure is not raw birthday math: a duplicate *within the working tree* is still caught deterministically by the scan we already take, so randomness only defends against ids that exist but have not merged into this tree. Against 100 such foreign ids that is ~1 in 22 million per mint.

**Opaque, not time-ordered.** A ULID-style time prefix would make ids sort chronologically repo-wide, but ordering already lives in `NN`, and that split — position in the filename, identity in the id — is deliberate. A sortable id re-couples them and invites the first reader who sorts by id to get a subtly wrong answer. Random says plainly: this is a name, not a position. It is also half the length.

**Nothing migrates, because the change is additive.** `T34` already matches `^T[0-9a-z]+$`. Old ids stay valid forever, git history and commit messages stay true, and the "never reused or changed" contract is never touched. This is what makes the whole change cheap — the alternative, rewriting 34 ids referenced in resolved answers, ADRs and PR bodies, would have broken the one promise the tracker makes about ids.

One consequence to carry into [[T36]]: `create_tickets` distinguishes a real Edge from a sibling's temporary key by testing against `MINTED_ID`, so widening the id alphabet widens the set of key names that are forbidden for looking like ids.

**Rejected: prefix lookup.** Git-style unambiguous short prefixes (`k39` resolving to `Tk39fq`) were considered and dropped. It adds an ambiguity failure mode to `get_tickets`, to `blocked_by` resolution and to every prose reference, in exchange for saving three keystrokes on a string the caller is copying out of `get_board` anyway. If typeability hurts in practice, that is a later Ticket with evidence behind it.
