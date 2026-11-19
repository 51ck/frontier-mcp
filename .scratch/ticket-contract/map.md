---
header: map
---

# Map

## Destination

A file is a Ticket because it says so. A Ticket file carries the marker `frontier: ticket` in its frontmatter, is validated against the schema the running server ships, and lives in a location the layout contract names. Everything else is left alone: a malformed marked file is excluded and diagnosed, unrelated Markdown is ignored, and nothing is parsed from prose, migrated or moved. An agent learns the schema and the layout from the server itself.

## Notes

Source: the owner's decisions of 2026-11-18 on `T79`, and the four-slice breakdown approved the same day. One user; breaking format changes are acceptable.

Settled, and binding on every Ticket here:
- The marker is `frontier: ticket`, with no schema or package version in the Ticket.
- The existing field set and workflow requirements are kept. This is not a schema redesign.
- No legacy prose parser and no automatic migration.
- Only explicitly supported locations are inspected. No recursive walk of an Effort.
- The layout contract is shipped and versioned with the server.
- Marking the Tickets already in this repository is a separate manual or agent step after the server is upgraded. The server never does it, and no build here waits on it or performs it.
- Additional metadata lives at the top level of the frontmatter. `extra` is the MCP argument envelope, not a persisted nested object.
- Every schema-owned field and `id` are reserved against `extra` and against extra-key deletion, on creation as on update; a conflicting call fails whole and writes nothing. Existing `id` semantics are unchanged.

Evidence: the research report of 2026-11-18 in the thread that produced these Tickets. It recommended `frontier: ticket/1`; the owner chose the marker without a version. Its figures: 139 Ticket files in this repository, none carrying a marker, none outside a supported location; validation costs about 0.5% of a Ticket's parse.

Existing work this touches, left where it lives:
- `T79` (frontier-onboarding, claimed): the decision these slices come from.
- `T2k2hdz` (ticket-names, open, the owner's): reporting files nothing links to. Slice 1 diagnoses known unsupported placements instead; whether anything of T2k2hdz remains is the owner's call.
- `T78` (frontier-v1, open): the glossary entry for Foreign, which slice 1 removes the subject of.
- `T83`, `T84`, `T86`, `T4f4k5k`, `T108` (migration-field-report, open): all about inferring Tickets from prose or migrating them. Slice 1 makes them moot; none is closed here.
- `T101`, `T102`, `T103` (frontier-v1, resolved): Unimported keys and `drop_keys`, the machinery slice 4 builds on.
- `T61` (frontier-onboarding, open): the onboarding tool, the other claimant to the tool slot `migrate_effort` frees.
- `frontier-search`: filtering by tags and by extra fields is tracked there, not here.
- ADR 0007 is superseded by slice 1 as a whole; ADR 0008's clauses on prose-declared ids and "any stem is a name" go with it.

## Decisions so far

<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
- [check-tracker — One tool reports the tracker's contract and what is wrong with its files](issues/check-tracker.md) — migrate_effort is replaced by the read-only check_tracker: the frontmatter schema with what is checked versus convention, layout contract v1, a valid example and every diagnostic itemized, optionally per Effort; all derived from FIELDS and the placement table the validator and scan read, the tracker doc block pinned verbatim. Eight tools, four writers, four readers.
- [explicit-ticket-marker — A file is a Ticket only when marked, valid and in a supported location](issues/explicit-ticket-marker.md) — A file is a Ticket only when it is a .md directly in issues/ carrying frontier: ticket; malformed marked files are excluded with structured diagnostics (Board grouped, list_efforts counts, get_tickets/update_ticket by name); prose parser, Foreign and migration removed; only storage root, Effort dirs and issues/ are listed; only the storage dir is followed as a link. ADR 0009.
- [tags-list — A Ticket can carry tags, set and read through the tools](issues/tags-list.md) — A Ticket may carry an optional tags list of arbitrary non-blank strings, kept exactly as given: set by create_tickets, replaced whole by update_ticket (empty removes the key), shown escaped in the get_tickets header; no effect on Status, Edges or the Frontier. Not on Board lines: deferred to frontier-search, measured at 81 tokens for two tags on the 15-Ticket Board.
<!-- /GENERATED -->

## Not yet specified

- Which fields a marked Ticket must carry to be valid; the owner said other required-field choices remain under discussion
- Whether ids already on disk are still read as names, given ADR 0008 promised "read forever" and breaking changes are now acceptable
- Whether "Unimported key" stays a term once keys outside the schema can be written on purpose

## Out of scope

- A version in the Ticket marker
- A legacy prose parser, automatic migration, and moving or rewriting a file the server did not create
- A recursive scan of an Effort for misplaced Tickets
- Filtering and search over tags and extra fields: tracked in `frontier-search`


<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
<!-- /GENERATED -->
