---
header: map
---

# Map

## Destination

An agent finds and narrows Tickets the way a person filters GitHub Issues: by Status (`open`), by arbitrary tags (`hotfix`), and by text, in one call and without reading whole Boards. This Effort tracks that work and decides what is still open in it. It builds nothing itself and fixes no query syntax; the builds stay in `frontier-v1`.

## Notes

Existing work, reused where it lives. No file is moved, so links by path and Edges by id keep working.

- `Tqlzf8v` (frontier-v1, resolved): the research. Search is three operations: a field filter, a graph query, a text search. Evidence in `docs/research/2026-11-13-ticket-search.md`.
- `Tik4z0t` (frontier-v1, open): `get_board` across every Effort, narrowed by `status` (including `takeable`), `kind` and `triage`, combined with AND. This is the Status half of the need, already specified.
- `Tiovvu9` (frontier-v1, open): `match`, a literal case-insensitive search over id, title, gist and dropped reason. Blocked by `Tik4z0t`.
- `T1g1ezn` (frontier-v1, open): `bodies: true`, the same match over Ticket prose. Blocked by `Tiovvu9` and `Tu3qzvu`.
- `Tu3qzvu` (frontier-v1, open, the maintainer's): whether a search result may carry one bounded excerpt of a body.
- `Tmnx44b` (frontier-v1, open): the consumer doc's scan-before-filing step, rewritten onto the cross-Effort read and `match`.
- `Tb0znxz` (frontier-v1, open): reverse Edges, the graph query. Related, independent of the rest.
- `Tvndqat` (frontier-v1, open): partial body reads, which a section-level search hit would lean on.

New here: tags. No Ticket carries tags today and the schema has no such key. Agreed in conversation on 2026-11-18, for context and not yet built or recorded as a decision: a Ticket may carry an optional `tags` list of arbitrary strings, with no effect on Status or on Edges. That key belongs to the Ticket schema work under discussion around `T79`; filtering by it belongs here.

Measured on 2026-11-18 while answering `T45`: with no Status filter, 51% of the `frontier-v1` Board is gists of resolved Tickets, and a narrow `grep` over frontmatter is cheaper than a Board. Filtering is what closes that gap.

## Decisions so far

<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
<!-- /GENERATED -->

## Not yet specified

- How several tags combine in one filter (any, all), and whether a tag can be excluded
- Whether tags compare by case, and what characters a tag may hold
- Whether a tag filter composes with `match` and with the `Tik4z0t` filters in one call, or some pairs are refused
- Whether the Board line shows a Ticket's tags, and what that costs in tokens per Board
- How an agent learns which tags exist in a workspace without reading every Board
- Whether Triage role stays its own field or becomes one tag among others
- Filtering over extra fields and tags: existence, equality and list membership, once `ticket-contract.extra-metadata` and `ticket-contract.tags-list` exist

## Out of scope

- A ninth tool: every filter is an optional argument on an existing tool
- A query language, regex, fuzzy matching, ranking and embeddings, as `Tqlzf8v` decided
- The final argument names and syntax, until the tag key itself is settled in the schema
- Filtering inside nested objects of an extra field: deferred


<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
<!-- /GENERATED -->
