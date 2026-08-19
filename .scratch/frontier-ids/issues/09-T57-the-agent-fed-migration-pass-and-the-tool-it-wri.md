---
id: T57
title: The agent-fed migration pass and the tool it writes through
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: [T40]
---

## Question

[[T40]] settles that `migrate_effort` is a mechanical floor and that a per-Ticket agent-fed pass
sits above it. The floor mints ids, resolves prose Edges through the order-to-id map only a
whole-Effort batch holds, quarantines any foreign frontmatter fence into the body, and sets
`awaits_migration: true`. Everything the regular expressions in `legacy.ts` cannot read is left for
an LLM to derive from the prose.

Nothing can write what that LLM derives. `update_ticket` reaches Status through the lifecycle verbs,
Edges, triage, comments and acceptance criteria. It cannot set `title`, `kind` or `type`, and it
cannot clear `awaits_migration`.

What tool does the agent pass write through — a widened `update_ticket`, or a separate one scoped to
Tickets still awaiting migration? What licenses a write that overwrites a value the floor already
put there, and what stops that same write reaching a Ticket nobody migrated?

## Acceptance criteria

- [ ] The write path is decided: `update_ticket` widened, or a distinct tool
- [ ] What clears `awaits_migration`, and whether anything else may, is stated
- [ ] Whether the pass runs per Ticket or per Effort is decided, with the reason
- [ ] The treatment of the quarantined `## Unmerged legacy frontmatter` block is stated — consumed and removed, or left in place
