---
id: T39
title: What a hand-writing agent does without FrontierMCP
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: [T35]
---

## Question

`docs/agents/issue-tracker.md` is canonical whether the server is loaded or not, is served as MCP
resource `frontier://tracker-doc`, and is **vendored into other repositories**. Its Hand-publish
section tells an agent without the server to "scan every `.scratch/*/issues/` for the highest
existing `T` number and continue from there".

Uncoordinated ids make that instruction wrong. What replaces it? An agent can generate six random
base36 characters, but the doc's whole preamble argues that hand-allocating an id is the mistake —
and under the new scheme hand-allocation is suddenly *safe*, which weakens an argument the doc leans
on hard.

A vendored copy also means old copies stay in the wild giving the old instruction. Ids minted the old
way remain valid, so this may cost nothing — but it needs saying rather than assuming.

## Acceptance criteria

- [ ] The replacement Hand-publish instruction is written
- [ ] Whether the "never hand-allocate" preamble survives is decided
- [ ] The effect of stale vendored copies is stated, and accepted or mitigated
