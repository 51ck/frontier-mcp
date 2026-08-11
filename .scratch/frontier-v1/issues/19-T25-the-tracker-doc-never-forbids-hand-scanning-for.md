---
id: T25
title: The tracker doc never forbids hand-scanning for the next id
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: The File conventions preamble states the rule once with the guard mechanism and ADR 0005's measurement; the `T<n>` bullet and the Hand publish body carry short fences at the point of instruction, and the no-server scan is fenced rather than removed
---

# The tracker doc never forbids hand-scanning for the next id

**What to build:** `docs/agents/issue-tracker.md` tells an agent that already has FrontierMCP loaded
not to work out the next Ticket id itself. Observed in the field: an agent with the server available
went to disk to find the highest `T<n>` by hand.

The doc invites it. Two passages instruct exactly that scan, and neither is fenced to the
no-server case at the point a skimming agent meets it:

- `docs/agents/issue-tracker.md:83-85` — "Before creating one by hand, scan every `.scratch/*/issues/`
  for the highest existing `T` number and continue from there". It sits under **File conventions**,
  whose own preamble at :71-72 says the conventions are canonical "whether FrontierMCP is loaded or
  not" — which reads as licence, not as a fallback.
- `docs/agents/issue-tracker.md:139-141` — the Hand publish section, correctly scoped to "no
  FrontierMCP" in its heading but reachable by an agent that never read the heading.

Why it matters: hand allocation is the naive `max + 1` that ADR 0005 was written against. Measured
there — four processes creating three Tickets each produced "thirteen files carrying four distinct
ids". `create_tickets` allocates under repo-global `.scratch/.frontier-id-T<n>.guard` files with a
rescan while holding every guard; a hand-written file participates in none of that. The damage is
silent: duplicate ids, and `get_tickets` resolving a bare id repo-wide to whichever file it finds.

A guessed id passed *to* `create_tickets` is harmless — the server allocates and discards the guess.
The failure is only the hand-written file. The fix is a stated rule, not new code.

This is an affordance gap, not a concurrency bug. No centralization catches it: a direct disk write
bypasses a proxy exactly as it bypasses the guards.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] The File conventions preamble states that when FrontierMCP is loaded, ids come from
      `create_tickets` and are never derived by scanning
- [x] The `T<n>` bullet at :83-85 carries that fence at the point of instruction, not only in a
      distant heading
- [x] The Hand publish section names the precondition in its body, so it is unambiguous to an agent
      that arrived without reading the heading
- [x] The reason is stated once — hand allocation is the naive `max + 1` ADR 0005 measured failing —
      so the rule is not merely asserted
- [x] The shipped `frontier://tracker-doc` resource serves the corrected text

## Answer

## Answer

The fix is three fences in `docs/agents/issue-tracker.md` and no new code.

The **File conventions preamble** now says outright that canonical is not licence to allocate ids by hand: with FrontierMCP loaded, ids come from `create_tickets` and are never derived by scanning. This is the one place the reason is argued — the repo-global `.scratch/.frontier-id-T<n>.guard` per candidate, the rescan while holding every guard, and [ADR 0005](../adr/0005-ids-are-allocated-under-a-guard-and-a-rescan.md)'s measurement of four processes producing thirteen files carrying four distinct ids. It also records the nuance that keeps the rule from being over-applied: a *guessed* id passed to `create_tickets` is harmless, because the server allocates and discards it. Only the hand-written file breaks.

The **`T<n>` bullet** leads with the fence rather than the scan, then keeps the scan behind "Only when the server is absent:". The **Hand publish section** carries the precondition in its body — "Everything below holds only while FrontierMCP is absent from the session" — so an agent that arrived at the procedure without reading the heading meets it anyway. Neither re-argues the reason; both point back at the preamble.

The no-server procedure survives intact. It is still the correct thing to do when there is genuinely no server, so it is fenced, not deleted.

`src/tracker-doc.ts` reads the document from disk at request time, so the corrected text ships through the existing path with no change. That made criterion 5 true by construction rather than verified, so `test/ship.test.ts` gains two tests: one reads the resource over the wire and matches the rule on substance (whitespace-tolerant, because the file re-wraps whenever a line grows), and one slices the Hand publish section and drops its heading line before asserting the precondition — a whole-document match would have passed on the preamble fence and proved nothing about the section the ticket was actually about.
