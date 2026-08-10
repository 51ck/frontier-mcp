---
id: T25
title: The tracker doc never forbids hand-scanning for the next id
kind: build
status: open
triage: ready-for-agent
blocked_by: []
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

- [ ] The File conventions preamble states that when FrontierMCP is loaded, ids come from
      `create_tickets` and are never derived by scanning
- [ ] The `T<n>` bullet at :83-85 carries that fence at the point of instruction, not only in a
      distant heading
- [ ] The Hand publish section names the precondition in its body, so it is unambiguous to an agent
      that arrived without reading the heading
- [ ] The reason is stated once — hand allocation is the naive `max + 1` ADR 0005 measured failing —
      so the rule is not merely asserted
- [ ] The shipped `frontier://tracker-doc` resource serves the corrected text
