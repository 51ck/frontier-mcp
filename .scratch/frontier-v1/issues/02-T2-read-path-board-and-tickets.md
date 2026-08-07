---
id: T2
title: Read path — Ticket schema, legacy parsing, get_board and get_tickets
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T1]
answer_gist: get_board renders a 358-token Board where reading the Effort costs 8185; Legacy Tickets parse best-effort from the real sobrina and tag-customizer files and are flagged
---

# T2 — Read path: Ticket schema, legacy parsing, `get_board` and `get_tickets`

**What to build:** The headline. An agent asks for an Effort's Board and gets the Destination followed
by one summary line per Ticket — id, title, kind, status, Edges — with the Frontier marked and
warnings for anything broken. Roughly 200 tokens where reading the Effort costs 13k. When detail is
actually needed, full bodies come back by id.

Legacy files parse best-effort so the server is useful on day one: title from the heading, status from
a `Status:` line, Edges from `Depends on:` / `Blocked by:` prose, flagged so an agent knows which
inferences to distrust. Reads never write.

- [x] Schema-conformant Tickets parse from YAML frontmatter into the model in CONTEXT.md's vocabulary
- [x] Tickets with no frontmatter parse best-effort and are flagged as Legacy in the returned model
- [x] `get_board` returns the Effort's Destination, then one line per Ticket, and never a body
- [x] The Frontier — open, unblocked, unclaimed — is marked inline and computed, never read from a file
- [x] A blocker owned by another Effort is annotated with that Effort's slug
- [x] Dangling Edges and Legacy Tickets appear in a warnings block on the Board
- [x] `get_tickets` returns full bodies for a list of ids in one call
- [x] Fixtures are Efforts copied verbatim from sobrina and tag-customizer — `T31` ids, `**Depends
      on:**` prose with relative links, `Blocked by: —`, resolved Tickets carrying long answers
- [x] A test asserts the measured token cost of a Board against reading the same Effort whole
- [x] No read modifies any file
