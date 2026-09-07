# Consumer adoption field report — why an available FrontierMCP was bypassed

Date: 2026-09-05

## Incident

A user asked whether Ticket `T219` was already done in a repository where the `frontier` MCP
server was configured and loaded. The agent used `rg` to find the Markdown Ticket, read it from
`.scratch/`, and compared it with Git history. It only called `get_tickets` after the user asked
why FrontierMCP had not been used.

The fallback returned the right substantive answer. It still failed the product's intended workflow:
the agent reparsed canonical storage when the query layer that owns Ticket status was available.

## What caused the fallback

### The action did not name the product

"Check if T219 is already done" looks like an ordinary repository question. The agent reached for its
default code-search routine before it classified the request as tracker work. The Ticket id was a
weak enough cue that it did not activate the tracker workflow.

A consumer instruction has to make the branch explicit: a known Ticket id is a tracker lookup, not a
text-search task.

### Availability was not made into a first step

The repository's tracker document says to use FrontierMCP when it is loaded and permits a file fallback
when it is not. That is the right policy, but the agent did not first establish which condition held.
It treated direct disk inspection as harmless orientation work and only later discovered that
`mcp__frontier__get_tickets` was available.

"Use FrontierMCP when loaded" is a conditional rule. Adoption needs an observable first action:
before reading `.scratch/` for tracker state, inspect the available tools for the `frontier`
server. If it is present, make the matching FrontierMCP call.

### The fallback is cheaper in an agent's local decision loop

`rg T219` is one familiar command with no schema recall. The MCP path requires recognizing the
server, selecting a tool, and supplying an id. The product's value is real — status, graph, and
schema come from the owning layer — but that value arrives after the agent has already picked a
shortcut.

The instruction therefore needs a short, task-shaped routing table at the point agents load it.
Longer explanations belong behind the existing tracker resource.

### Configuration exposes a capability; it does not establish a habit

Codex, Claude, and Cursor can all be configured to launch the `frontier` server. That makes its
tools callable. It does not tell an agent that an issue-shaped request should begin with them.

The existing `frontier://tracker-doc` resource is a good reference. A resource an agent has to
choose to read cannot be the only adoption mechanism. The durable consumer contract needs a compact
pointer in the repository's always-loaded agent instructions.

## Product changes

### 1. Ship one universal, action-first consumer contract

Give consumers this exact block for their root `AGENTS.md`, `CLAUDE.md`, or equivalent project
instruction file:

> ## Tracker work
>
> A request mentioning a Ticket id, Effort, Board, Frontier, claim, resolve, triage, dependency, Map,
> or Spec is tracker work. First check for the `frontier` MCP server. When it is available, use its
> tools as the tracker interface:
>
> - a known Ticket id → `get_tickets`
> - an Effort, open work, or dependencies → `get_board`
> - repository-wide orientation → `list_efforts`
> - create or update tracker state → `create_tickets`, `update_ticket`, `edit_map`, or `spec`
>
> Use the Markdown files only after `frontier` is unavailable or its relevant call fails. State that
> fallback in the handoff.

This has one positive leading rule — **tracker work** — and maps the common request forms to calls.
It does not ask an agent to memorize the full API or to read a long guide before answering a narrow
question.

### 2. Make setup install the pointer, not only the server

The consumer setup path should offer to place that compact contract in the project's established
agent-instruction file. It should discover the file rather than prescribe one:

- Codex: `AGENTS.md`
- Claude: `CLAUDE.md` or the project's agent instructions
- Cursor: `AGENTS.md`, `CLAUDE.md`, or the repository convention

The setup result should name the file it changed and include the installed FrontierMCP version. The
project owns the wording around the block; FrontierMCP owns the block itself so fixes ship from one
source.

This is the actionable part of onboarding. Merely registering an MCP server makes the capability
available; placing the pointer connects the capability to the moments when an agent must use it.

### 3. Keep the document and resource as progressive disclosure

Keep `frontier://tracker-doc` as the complete source for tool semantics, lifecycle rules, workspace
resolution, and file fallback. The compact contract links to it by name rather than copying those
details. This avoids stale copies and keeps the always-loaded instruction small.

The setup path should also tell agents to read the resource once when they first encounter tracker
work in an unfamiliar repository. The first tool call should never depend on that read: the routing
table already supplies it.

### 4. Test the adoption path as behavior, not only packaging

Add consumer-fixture tests for the material FrontierMCP owns:

1. A generated instruction block contains the `tracker work` trigger, `frontier` availability
   gate, and known-Ticket-to-`get_tickets` route.
2. The served `frontier://tracker-doc` exposes the same authoritative workflow and a clearly scoped
   fallback.
3. Re-running setup updates FrontierMCP-owned text without overwriting surrounding consumer
   instructions.
4. A no-server consumer receives a usable file fallback and no claim that tools are available.

The model's final tool choice cannot be unit-tested by FrontierMCP alone. The product can test that
the correct instruction reaches each consumer and record field reports when it does not.

## Rollout

1. Resolve the onboarding design in T60 and T61, including where setup records its managed block and
   how it keeps the block current.
2. Implement the universal block and the setup path without adding a ninth tool unless the existing
   eight-tool contract is deliberately revised.
3. Publish copy-paste integration examples for Codex, Claude, and Cursor. The semantics stay the
   same; only each host's MCP registration and instruction-file discovery differ.
4. Add a short feedback path: when an agent uses `.scratch/` despite a loaded server, record the
   request, available tools, chosen fallback, and desired first call. Treat this as adoption evidence,
   not user error.

## Success criteria

- A known Ticket id causes an agent with `frontier` available to call `get_tickets` before reading
  `.scratch/`.
- An agent without the server can still use the documented Markdown fallback.
- A consumer sees the same routing rule in Codex, Claude, and Cursor without maintaining three
  divergent descriptions.
- FrontierMCP can update its managed wording without replacing a consumer's local policy.
- Field reports show whether failures come from registration, instruction placement, tool
  discoverability, or missing product capability.

## Relationship to existing work

This report is evidence for `frontier-onboarding` T61. T61 already asks what onboarding serves,
where it persists knowledge, how that copy gets a version stamp, and how it avoids a new tool. The
incident adds a concrete requirement: onboarding must install an action-first tracker pointer in the
consumer's instruction layer. A resource alone did not cause the agent to use the available tool.

The report also supports T39's decision that the server takes precedence when present. That rule
remains correct; the gap is making it the default route for an agent facing a short, ordinary-looking
Ticket question.
