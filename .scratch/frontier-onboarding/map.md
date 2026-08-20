---
header: map
---

# Map

## Destination

A settled, written design for how a consumer adopts FrontierMCP: what knowledge the product hands a
consumer's agent at setup, who owns the tracker vocabulary, where that knowledge is persisted and how
it is kept from going stale, and when repo-level configuration is written rather than assumed.

The map ends at the decisions. The build is handed to `frontier-v1` as build Tickets.

## Notes

**Domain:** the `.scratch/` markdown tracker, the FrontierMCP stdio server, the shipped
`docs/agents/issue-tracker.md`, Node 24, pnpm.

**Every session** consults `/grilling` and `/domain-modeling`. `AGENTS.md` Local Contracts are
binding until an ADR revises them.

**Standing constraints — not up for decision in this Effort:**

- Markdown files stay canonical (ADR 0001).
- The id pattern lives at `<storageDir>/frontier.yml` under `id_pattern`, and an absent file is the
  intended state for almost every repo (T54).
- No sigil marks a temporary key (T55).
- There is no vendoring mechanism today, and a copy with no update path is worse than a pinned
  server's own stale document (T39).

**Why this Effort exists.** `frontier-ids` T50 asked what a Ticket id is in the ubiquitous language
and surfaced three questions that are not about ids: whether the product owns the words at all,
whether the tracker document should be persisted into a consumer's repo, and what a setup tool would
have to do to avoid manufacturing stale copies. None of the existing Efforts holds them.

**Related, decided elsewhere:** T59 in `frontier-hive` settles whether per-call `root` stays the
workspace model, which the onboarding tool's write path depends on.

## Decisions so far

<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
<!-- /GENERATED -->

## Not yet specified

## Out of scope

<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
<!-- /GENERATED -->
