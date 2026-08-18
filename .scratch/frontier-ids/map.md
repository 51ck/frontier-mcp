---
header: map
---

# Map

## Destination

A decided and ADR-recorded design for **uncoordinated Ticket ids** in the markdown driver: the id
format, the boundary between what the domain knows about an id and what the driver owns, what
replaces ADR 0005's allocation machinery, and how a duplicate id is surfaced.

The map ends at the decisions. The build is handed to `frontier-v1` as build Tickets.

## Notes

**Origin.** A real collision, 2026-08-13. `create_tickets` minted `T33` on a branch cut from
`master` while `T33` already existed on the unmerged `t30-v2-sdk-family` branch. Ids come from
`max + 1` over a scan of one working tree, and a scan sees one branch. The per-id guard of ADR 0005
does not catch it — that guard exists for two processes on one tree, not two trees. Renumbered to
`T34` by hand; recorded in that Ticket's answer.

**Domain.** FrontierMCP's own tracker. This Effort changes how the product allocates ids, and the
product's own Tickets are the first thing it changes.

**Skills.** `/grilling` and `/domain-modeling` every session. `CONTEXT.md` holds the ubiquitous
language; two of its entries go stale here — **Ticket** still states the id has the form `T<n>`, and
there is no term at all for a draft's temporary key.

**Standing preference.** Decisions only. Nothing in this Effort implements; the handoff is a build
breakdown in `frontier-v1`.

**Charted on `master` on purpose.** Charting is a tracker write, and `master` is the one tree every
other tree merges into — which is exactly the property this Effort exists to stop relying on.

## Decisions so far

<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
- [T35 — Ticket ids are minted without coordination](issues/01-T35-ticket-ids-are-minted-without-coordination.md) — Ids become opaque lowercase base36, six characters after the `T` — `Tk39fq` — matching `^T[0-9a-z]+$`, which every existing `T<n>` id already satisfies, so the change is additive and nothing migrates
- [T36 — The storage driver owns id shape and minting](issues/02-T36-the-storage-driver-owns-id-shape-and-minting.md) — The driver owns both the shape of an id and the minting of one; the domain keeps only the contract — opaque string, repo-unique, never reused, never changed — and the tool layer asks the driver "is this one of your ids?" instead of testing a pattern
- [T37 — ADR 0005's allocation machinery is deleted, not kept](issues/03-T37-adr-0005-s-allocation-machinery-is-deleted-not-k.md) — All of it goes — guards, the re-scan under guards, MAX_ATTEMPTS, CANDIDATE_HEADROOM and the never-reclaim rule exist only to serialize a derived counter, so creation drops from two full workspace scans to one and ADR 0005 is superseded rather than amended
- [T38 — A duplicate id warns on read and refuses on write](issues/04-T38-a-duplicate-id-warns-on-read-and-refuses-on-writ.md) — Split by direction — reads warn and show every claimant, writes refuse and name both files; nothing repairs a duplicate automatically, and the CI repair tool is ruled out of scope because the format change removes the case it was for
- [T39 — What a hand-writing agent does without FrontierMCP](issues/05-T39-what-a-hand-writing-agent-does-without-frontierm.md) — The preamble survives but on a different argument: it is about precedence, not danger — the field observation pinned in test/ship.test.ts:134 is an agent *with* the server scanning by hand, which no id format touches — while its stated collision justification is now conditional on the pattern, its guard filename is wrong for mixed patterns, and its "guessed id passed to create_tickets" sentence describes no code path at all; the scan instruction (which lives in the Layout bullet, not Hand publish) becomes read `id_pattern` from `.scratch/frontier.yml`, then branch — generate without scanning when the pattern has no `<N>`, scan-and-increment when it does, warning there that a hand-writer cannot take the guard; stale copies are accepted rather than mitigated because there is no vendoring mechanism at all and a pinned consumer's served doc is frozen exactly as hard, making it one exposure already disclosed in README's pre-1.0 notice
<!-- /GENERATED -->

## Not yet specified

## Out of scope

- **A CI tool that repairs id collisions at merge time.** Proposed while cross-branch collisions were an expected merge outcome; the format change in T35 removes the case it was built for. What still collides across branches is the `NN` file number, which is cosmetic by contract. See [[T38]].
- **Prefix lookup for ids.** Git-style unambiguous short prefixes (`k39` resolving to `Tk39fq`) add an ambiguity failure mode to `get_tickets`, `blocked_by` and every prose reference, to save keystrokes on a string the caller copies out of `get_board`. Revisit only with evidence that typeability hurts. See [[T35]].


<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
<!-- /GENERATED -->
