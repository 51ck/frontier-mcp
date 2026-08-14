---
id: T50
title: What a Ticket id is in the ubiquitous language
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: [T36, T39]
---

## Question

Two settled decisions have not reached the language. T35 makes an id opaque lowercase base36
(`Tk39fq`). T36 moves both shape and minting to the driver — the domain keeps only the contract, and
the tool layer asks the driver "is this one of your ids?" instead of testing a pattern.

`CONTEXT.md`'s **Ticket** entry still reads "Identified by a stable `id` of the form `T<n>`", which
after T36 is not the domain's business to state. `AGENTS.md:118` says it again — "`T<n>` from a
repo-global counter". The bullet after it, "The counter is derived, and allocated under a guard",
describes machinery T37 deleted; it dies with the code and needs no decision.

The generative half is harder. `CONTEXT.md` has **no term at all** for a draft's temporary key — the
thing `create_tickets` takes as `key`, which siblings name in `blocked_by` before any id exists. T36
made that distinction load-bearing: the entire reason the driver now answers "is this one of your
ids?" is to tell a key from an id. A concept the tool layer must discriminate on, and the ubiquitous
language cannot name, is a hole in the language rather than an omission from a file.

One invariant may also not survive. The tracker doc's case that only the server may allocate an id
rests on collision risk, which T35 removes. Whatever T39 decides about a hand-writing agent settles
whether "the server mints every id" is still true as language.

The mechanical edits themselves — `README.md`, the vendored `docs/agents/issue-tracker.md`, ADR
0005's supersession header — are build work handed to `frontier-v1`. This Ticket decides the words,
not the files.

## Acceptance criteria

- [ ] The **Ticket** entry's id sentence is rewritten to the contract T36 left in the domain —
      opaque, repo-unique, never reused, never changed — with shape named as the driver's
- [ ] `CONTEXT.md` has a decided entry, with its `_Avoid_` list, for a draft's temporary key
- [ ] Whether "the server mints every id" survives as a language invariant is decided, consistent
      with T39
- [ ] `AGENTS.md`'s two id bullets have agreed replacement wording, or an explicit ruling that one is
      deleted outright
