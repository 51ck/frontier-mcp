---
id: T36
title: The storage driver owns id shape and minting
kind: decision
type: grilling
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: The driver owns both the shape of an id and the minting of one; the domain keeps only the contract — opaque string, repo-unique, never reused, never changed — and the tool layer asks the driver "is this one of your ids?" instead of testing a pattern
---

## Question

`MINTED_ID` lives in `src/domain.ts` and the tool layer reads it. A driver for GitHub would use
issue numbers; a driver for a database would use primary keys. If the shape of an id is the driver's,
then the domain cannot hold a pattern and the tool layer cannot test against one.

The tool layer uses that pattern for two jobs today: `src/tools/create-tickets.ts:134` refuses a
temporary key shaped like an id, and `src/tools/create-tickets.ts:162` accepts an Edge naming an id
that does not exist yet while refusing anything else as a typo. Both stop working. What replaces
them?

## Acceptance criteria

- [x] What the domain still knows about an id is stated exactly
- [x] The mechanism that lets the tool layer tell an id from a temporary key is chosen
- [x] Both of today's checks keep their strength, or the loss is recorded deliberately

## Answer

**Ids are a driver concept, not a domain one.** A driver for GitHub would use issue numbers; a driver for a database would use primary keys. `MINTED_ID` therefore cannot stay in `src/domain.ts`, and `^T[0-9a-z]+$` is the markdown driver's dialect rather than a truth about Tickets.

What survives at domain level is the **contract**, and only the contract: an id is an opaque string, unique across the repo, never reused, never changed. Nothing above the storage seam may infer anything from its shape.

**Minting stays in the driver too.** Random ids no longer need the filesystem to *generate*, only to *verify* — but generation is the trivial half. The half that matters is checking a candidate against a scan, and only the driver takes scans. `src/storage/driver.ts:124` already says the driver mints every id; that stays true, and now for a better reason.

**The tool layer asks the driver.** `MINTED_ID` does two jobs above the seam today, and both need a shape the tool layer is no longer allowed to know:

1. `src/tools/create-tickets.ts:134` refuses a temporary key shaped like an id, because an Edge naming `T8` is ambiguous between the sibling draft and the Ticket already holding `T8`.
2. `src/tools/create-tickets.ts:162` accepts an Edge naming an id that does not exist yet — a dangling Edge is a Board warning by design, not a refusal — while refusing anything else as a typo in a key name.

The driver interface gains one predicate: *is this string one of my ids?* Markdown answers `^T[0-9a-z]+$`; a GitHub driver answers `^\d+$`; a database driver answers with a UUID pattern. Both checks keep their full strength, and the **eight-tool surface is untouched** — this is a driver capability, not a tool.

**Rejected: mandatory sigil keys.** Requiring every temporary key to start with `@` would make keys syntactically disjoint from any driver's ids by construction, needing no driver knowledge at all, and a mistyped key would keep its `@` and still be caught. It is the smaller change and it does not touch the driver interface. It was rejected because it loses one case: an Edge reading `blah` carries no sigil, so the tool layer would have to accept it as an id that does not exist yet. Today `blah` is refused. Trading a real check away to avoid one interface method is the wrong side of that trade, and the predicate is also the honest expression of the decision above — only the driver knows what an id looks like.

**Vocabulary debt.** `CONTEXT.md` has no term for a draft's temporary key, which is part of why this question was hard to state, and its **Ticket** entry still asserts the id has the form `T<n>`. Both need fixing in the build handoff.
