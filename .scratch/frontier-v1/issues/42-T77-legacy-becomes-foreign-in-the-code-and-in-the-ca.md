---
id: T77
title: Legacy becomes Foreign, in the code and in the caller-visible strings
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T73, T74]
answer_gist: Legacy is Foreign in code, tool descriptions, the Board warning and the docs; `foreign` states the predicate as implemented (no fence, unparseable fence, or no id plus a non-schema key); a pasted `<id>@<effort>` names the bare id back on both update_ticket and get_tickets; `legacy.ts` keeps its filename
---

**What to build:** the rename [[T57]] decided, once the behaviour it names has landed.

**Why.** The old term splits on provenance — ours-but-old versus someone-else's — and provenance is unknowable. `legacy.ts`'s regexes read shape, not origin, and [[T40]] already conceded the fixtures are two Efforts by one author. The new term splits on **conformance**, which is a predicate the code evaluates on every read. Three ways in: a missing fence, a broken fence, or a fence that does not conform.

**Scope, measured:** 40 occurrences across 12 files. Four are caller-visible and are the ones that need care — the `get_tickets` and `update_ticket` `id` descriptions, `migrate_effort`'s description and its `effort` param, and the Board warning `"N/M Tickets are Legacy — title, ..."` (`get-board.ts:218`). `TicketSummary.legacy` (`domain.ts:70`) becomes `foreign`, and its doc comment states the conformance rule rather than "predating the schema".

**`legacy.ts` keeps its filename.** That file parses one specific unstructured shape; naming it `foreign.ts` would claim a generality it does not have, since a non-conforming *fence* never reaches it.

Pre-1.0 permits the caller-visible break (`README.md:8-13`). Land it in one commit so no release ships half the vocabulary.


- [x] `TicketSummary.legacy` is `foreign`, with a doc comment stating the conformance rule
- [x] All four caller-visible strings are updated, the Board warning included
- [x] `legacy.ts` keeps its filename, and its module comment says why
- [x] No occurrence of the old term survives outside `legacy.ts`'s filename and its own internals
- [x] The whole rename is one commit
- [x] `NoSuchTicket` recognizes a pasted `<id>@<effort>` and names the bare id back, per [[T58]]
- [x] `placeholderFor` emits `draft 1`, one-based, so `#` has only its handle sense
- [x] `withUniqueHandles`'s comment names the real collision cause — a prefix-less file taking
      `position + 1` colliding with an `NN-` prefix, not two files sharing a prefix
- [x] `withUniqueHandles` has a test; it has none today
