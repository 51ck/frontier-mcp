---
id: Tqlzf8v
title: Which kinds of search over Tickets earn a place in the tool surface
kind: decision
type: research
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: "Three kinds earn a place, in order: reverse Edges with no new argument, a literal `match` on `get_board` over id, title, gist and dropped reason, then `bodies: true` on the same call; embeddings, fuzzy matching, ranking, regex, a query language and recency are left out"
---

goals: effective, fast, token-effective

## Question

No tool searches the tracker. Which kinds of search would be useful to an agent consuming FrontierMCP, what should each return, and which are worth building given eight tools permanently and a cached scan that keeps frontmatter but no prose?

## Why now

Capture, 2026-11-13: `docs/agents/frontier-consumer.md` tells a consumer to scan for an existing Ticket before filing. To do that for seven Tickets the consumer read three whole Boards, about 25,000 characters, and matched titles by eye. Bodies were never searched, so "no existing match" was a title-only check. The other recurring case is "was this already decided?", whose answer sits in a resolved Ticket's gist or body in an Effort not yet opened. Both push an agent back to `grep` over `.scratch/`, which is what the tracker exists to prevent.

Related: `Tik4z0t` (Board filters and a cross-Effort read), `Tvndqat` (partial body reads).

## Done when

- [x] The distinct search needs are named, each with the agent task that produces it
- [x] What comparable trackers and their MCP servers expose for search is recorded from primary sources
- [x] Each candidate has a result shape and a stated cost against the cached scan
- [x] There is a recommendation: what to build, in what order, as arguments on which existing tools, and what to leave out
- [x] Findings are in a dated document under `docs/research/`

## Answer

Findings: `docs/research/2026-11-13-ticket-search.md`, a dated snapshot written by a research agent on 2026-11-13.

"Search" is three different operations. A field filter and a graph query both answer from the cached scan; a text search answers from it only for the summary fields the scan holds, and must read every Ticket file for bodies.

What is built, and where:

1. Reverse Edges — `Tb0znxz`. `blocks=` on the `get_tickets` header, and a `resolve` result that names what it made takeable. No dependency.
2. Field filters and the cross-Effort read — `Tik4z0t`. This also answers most of the duplicate check: the open Tickets of this repository are 30 titles, about 2.2KB, which the calling model can judge directly.
3. `match` over summary fields — `Tiovvu9`, built on `Tik4z0t`.
4. `bodies: true` — `T1g1ezn`, after `Tiovvu9` and the decision `Tu3qzvu` on whether a hit may carry a bounded excerpt. Summary-only search misses most hits: for `search`, 1 by title or gist and 17 more by body; for `watcher`, 4 and 13.
5. The consumer doc's scan-before-filing step — `Tmnx44b`.

Left out, with the reasons in the document: a ninth tool, embeddings, fuzzy matching, a tokenized index and ranking, regex, a query language, "what changed since", prose mentions as Edges, batch near-duplicate detection, search over Maps and Specs, result paging.

Limits of the evidence, as the document states them: Linear's and Atlassian's MCP tool schemas could not be read without an authenticated client; hit counts come from a throwaway script with a cruder parser than the driver's; search cost at 1000 Tickets is extrapolated; no upstream commit hashes were recorded. The build order was accepted by the maintainer asking for these Tickets to be filed; the excerpt question is still open in `Tu3qzvu`.
