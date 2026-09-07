---
id: T74
title: get_tickets surfaces a foreign fence without writing it
kind: build
status: open
triage: ready-for-agent
blocked_by: [T73]
---

**What to build:** the surfacing half of [[T57]]. The agent has to read the foreign fence to migrate it, and the file must not change until the agent decides it should.

`get_tickets` renders `Split.raw` (`frontmatter.ts:19`) as a fenced `yaml` block appended to the Ticket's output, under a heading that names it as unimported. The bytes are the unparsed original, so nothing is re-serialized and nothing is lost. The file on disk is untouched.

**Why not the body.** [[T40]] quarantined the fence into the file under `## Unmerged legacy frontmatter`; [[T57]] withdrew that. Writing the block means a later pass has to consume and clean it, which needs a per-field disposition vocabulary before the block can ever empty, and leaves a heading asserting *unmerged* about a block that was merged. It would also be a fourth body mutation point, and the only one editing text the server wrote rather than appending text a caller supplied — `src/domain.ts:113-119` holds that a Ticket body is opaque apart from three places.

Only a Ticket that [[T73]] marked Foreign gets the block. A conforming Ticket's output is unchanged, so this costs nothing on the ordinary path.


- [ ] A Foreign fence appears in `get_tickets` output as a fenced `yaml` block, byte-identical to `Split.raw`
- [ ] The file on disk is not modified by the read
- [ ] A conforming Ticket's output gains nothing
- [ ] The block is absent once the agent's write has normalized the file
