---
id: T2
title: Read path — Ticket schema, legacy parsing, get_board and get_tickets
kind: build
status: open
triage: ready-for-agent
blocked_by: [T1]
---

# T2 — Read path: Ticket schema, legacy parsing, `get_board` and `get_tickets`

**What to build:** The headline. An agent asks for an Effort's Board and gets the Destination followed
by one summary line per Ticket — id, title, kind, status, Edges — with the Frontier marked and
warnings for anything broken. Roughly 200 tokens where reading the Effort costs 13k. When detail is
actually needed, full bodies come back by id.

Legacy files parse best-effort so the server is useful on day one: title from the heading, status from
a `Status:` line, Edges from `Depends on:` / `Blocked by:` prose, flagged so an agent knows which
inferences to distrust. Reads never write.

- [ ] Schema-conformant Tickets parse from YAML frontmatter into the model in CONTEXT.md's vocabulary
- [ ] Tickets with no frontmatter parse best-effort and are flagged as Legacy in the returned model
- [ ] `get_board` returns the Effort's Destination, then one line per Ticket, and never a body
- [ ] The Frontier — open, unblocked, unclaimed — is marked inline and computed, never read from a file
- [ ] A blocker owned by another Effort is annotated with that Effort's slug
- [ ] Dangling Edges and Legacy Tickets appear in a warnings block on the Board
- [ ] `get_tickets` returns full bodies for a list of ids in one call
- [ ] Fixtures are Efforts copied verbatim from sobrina and tag-customizer — `T31` ids, `**Depends
      on:**` prose with relative links, `Blocked by: —`, resolved Tickets carrying long answers
- [ ] A test asserts the measured token cost of a Board against reading the same Effort whole
- [ ] No read modifies any file
