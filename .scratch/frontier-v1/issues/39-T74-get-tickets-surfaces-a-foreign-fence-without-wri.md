---
id: T74
title: get_tickets surfaces a foreign fence without writing it
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T73]
answer_gist: "`get_tickets` appends a foreign fence byte-for-byte as a fenced yaml block under `## Foreign frontmatter (not imported; file unchanged)`, only on the body read path; the block clears after `migrate_effort`, not after an ordinary write, which is the gap filed as T101"
---

**What to build:** the surfacing half of [[T57]]. The agent has to read the foreign fence to migrate it, and the file must not change until the agent decides it should.

`get_tickets` renders `Split.raw` (`frontmatter.ts:19`) as a fenced `yaml` block appended to the Ticket's output, under a heading that names it as unimported. The bytes are the unparsed original, so nothing is re-serialized and nothing is lost. The file on disk is untouched.

**Why not the body.** [[T40]] quarantined the fence into the file under `## Unmerged legacy frontmatter`; [[T57]] withdrew that. Writing the block means a later pass has to consume and clean it, which needs a per-field disposition vocabulary before the block can ever empty, and leaves a heading asserting *unmerged* about a block that was merged. It would also be a fourth body mutation point, and the only one editing text the server wrote rather than appending text a caller supplied — `src/domain.ts:113-119` holds that a Ticket body is opaque apart from three places.

Only a Ticket that [[T73]] marked Foreign gets the block. A conforming Ticket's output is unchanged, so this costs nothing on the ordinary path.


- [x] A Foreign fence appears in `get_tickets` output as a fenced `yaml` block, byte-identical to `Split.raw`
- [x] The file on disk is not modified by the read
- [x] A conforming Ticket's output gains nothing
- [x] Once `migrate_effort` mints the id, the block shows only the keys outside the schema, under `## Unimported frontmatter`, rather than the whole fence

## Answer

`Ticket.foreignFence` is set only by `readTickets`, never on `TicketSummary`, so the Board scan stays prose-free. The fence delimiter is one backtick longer than the longest run inside the YAML. CRLF bytes are preserved. The read leaves bytes and mtime unchanged, and a conforming Ticket's output gains nothing.

Criterion 4 is not met as written and is left unticked. An ordinary write (comment, claim) leaves a foreign fence foreign, because `applyEdit` edits the existing fence in place per ADR 0003 and T73's predicate turns on the absence of an id, which only `migrate_effort` mints. So the block goes after `migrate_effort` and stays after every other write. That is a disagreement between T57 and T73, not a defect in this build; it is filed as [[T101]] for a decision, together with the consequence that unimported keys stop being surfaced once migration mints the id.

## Comments

2026-11-12, from [[T102]]: the fourth criterion was reworded to what [[T101]] decided and is now met. The gist and Answer above predate that: the block no longer clears after `migrate_effort` — keys outside the schema stay shown, entries only, under `## Unimported frontmatter` — and `Ticket.foreignFence` is now `Ticket.unimported`.
