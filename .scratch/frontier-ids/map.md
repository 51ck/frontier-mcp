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
language, and [[T50]] settled what this Effort owes it: **Ticket**, **Edge** and **Legacy Ticket**
rewritten, **Temporary key** and **Handle** added. The charting estimate of "two stale entries" was
low — **Edge** and **Legacy Ticket** were falsified by T40 and by the driver's own rendering, not by
the id format.

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
- [T39 — What a hand-writing agent does without FrontierMCP](issues/05-T39-what-a-hand-writing-agent-does-without-frontierm.md) — The preamble survives but on a different argument: it is about precedence, not danger — the field observation pinned in test/ship.test.ts:134 is an agent *with* the server scanning by hand, which no id format touches — while its stated collision justification is now conditional on the pattern, its guard filename is wrong for mixed patterns, and its "guessed id passed to create_tickets" sentence describes no code path at all; the scan instruction (which lives in the Layout bullet, not Hand publish) becomes read `id_pattern` from `.scratch/frontier.yml`, then branch — generate without scanning when the pattern has no `<N>`, scan-and-increment when it does, warning there that a hand-writer cannot take the guard; stale copies are accepted rather than mitigated because there is no vendoring mechanism at all and a pinned consumer's served doc goes stale the same way — the vendored copy being the worse of the two, since it alone has no update path — an exposure already disclosed in README's pre-1.0 notice, with a version marker in the doc offered as the one mitigation that reaches a reader who cannot tell their copy is old
- [T40 — Legacy Tickets and migrate_effort under uncoordinated minting](issues/06-T40-legacy-tickets-and-migrate-effort-under-uncoordi.md) — Migration mints inline against the scan it already takes, `withIdReservations` and `peekMintedIds` are both deleted, an existing id is always preserved, `rename` goes, preview names unminted Tickets by handle through reference-style links, and a foreign frontmatter fence is quarantined into the body rather than imported
- [T50 — What a Ticket id is in the ubiquitous language](issues/08-T50-what-a-ticket-id-is-in-the-ubiquitous-language.md) — One rule settles all four criteria — a document references the source of the id format and never restates the value — so `CONTEXT.md` names `id_pattern` and no shape, gains **Temporary key** and **Handle** as decided entries, and gains nothing about minting: the invariant "the server mints every id it is present for" is T39's and lives in the shipped tracker doc, because a glossary entry saying it would be contradicted by a passing test; `AGENTS.md` keeps both id bullets, the first stripped to what binds the code and the second made pattern-conditional per T53, with no pointer to the tracker doc because line 461 already is one; **Legacy Ticket** and **Edge** are both corrected, Edge because it claims a foreign Edge "looks no different" while the Board annotates it precisely so it does
<!-- /GENERATED -->

## Not yet specified

## Out of scope

- **A CI tool that repairs id collisions at merge time.** Proposed while cross-branch collisions were an expected merge outcome; the format change in T35 removes the case it was built for. What still collides across branches is the `NN` file number, which is cosmetic by contract. See [[T38]].
- **Prefix lookup for ids.** Git-style unambiguous short prefixes (`k39` resolving to `Tk39fq`) add an ambiguity failure mode to `get_tickets`, `blocked_by` and every prose reference, to save keystrokes on a string the caller copies out of `get_board`. Revisit only with evidence that typeability hurts. See [[T35]].
- **How a consumer is onboarded, and who owns the tracker vocabulary.** [[T50]] surfaced both while deciding the words: a consumer's persisted copy of the tracker document has no update path, and `docs/agents/issue-tracker.md` names eight terms without defining any. Neither is about uncoordinated ids. Moved to the `frontier-onboarding` Effort as [[T60]] and [[T61]].


<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
<!-- /GENERATED -->
