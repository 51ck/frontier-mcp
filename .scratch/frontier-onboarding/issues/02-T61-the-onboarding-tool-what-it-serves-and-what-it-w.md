---
id: T61
title: The onboarding tool — what it serves and what it writes
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: [T60, T59]
---

## Question

A consumer's agent meets FrontierMCP with no idea what an Effort is, where Tickets live, or what to do when the server is not loaded. Today it is told to read `frontier://tracker-doc` once at setup (`README.md:51-52`), and nothing checks that it did, nothing persists what it read, and nothing can update it afterwards.

The proposal is a tool that hands the agent the knowledge and asks it to lock it down wherever that project keeps agent knowledge — `CONTEXT.md`, `AGENTS.md`, a vendored `issue-tracker.md`, the product does not choose. The consumer's agent decides placement, because only it knows the project's conventions.

That is the right instinct, and the write-and-forget version of it recreates a failure [[T39]] already diagnosed. T39 found there is **no vendoring mechanism at all** — no script, no `postinstall`, no procedure, no manifest — and concluded that a copy with no update path is *strictly worse* than a pinned server's own stale document, because the pinned consumer can at least bump the pin after reading a changelog. A tool that writes knowledge somewhere it does not record turns every consumer into that worse case, deliberately.

So the design has to close the loop, and there are two candidate mechanisms. The destination can be recorded — [[T54]] put `id_pattern` in `<storageDir>/frontier.yml` as "a map with one key today, so that a second repo-level setting has a home", and where the knowledge landed is a plausible second key. And the written copy can carry the package version, which is the one mitigation T39 offered for exactly this: staleness is currently undetectable from inside a copy.

**Writing a default `frontier.yml` needs arguing, not assuming.** [[T54]] made an absent file the intended state for almost every repo, with the default living in code. A tool that writes one at setup materializes a file restating what the code already assumes, and creates a second place the default can be wrong. The narrower rule — write the file only when the consumer picks something other than the default — keeps absence meaningful.

**On asking.** The installed `@modelcontextprotocol/server` is 2.0.0 and implements `elicitInput` (`node_modules/@modelcontextprotocol/server/dist/mcp-DXXb3Vv3.mjs:1162`), so the tool can ask the human directly about driver, pattern and storage directory. Elicitation is a client capability, though: a client that does not declare it gets nothing back. A design that depends on it strands those consumers, so the returned-instructions path has to work on its own with elicitation as the better road where it exists.

**On ordering.** Onboarding does not need the server relaunched afterwards. `root` is a per-call argument and one process already serves many workspaces (`src/workspace.ts:34-46`), so the tool takes `root` like every other tool and writes there. [[T59]] settles whether that model holds.

**On what it serves.** Whether the vocabulary is the product's to hand out is [[T50]]'s sibling question and is decided separately; this Ticket consumes that answer rather than making it.

## Acceptance criteria

- [ ] What the tool returns is decided — knowledge, instructions, or both — and whether it works without client elicitation
- [ ] Whether and how the destination of persisted knowledge is recorded is decided
- [ ] Whether the persisted copy carries a version stamp is decided, against T39's staleness finding
- [ ] When `frontier.yml` is written, if ever, is decided consistently with T54's absent-by-default intent
- [ ] Re-running onboarding is specified — idempotent, refused, or an update path

## Comments

Correcting the Question: it proposes a tool as though the slot were free, and it is not.

`AGENTS.md:137-139` is a binding Local Contract — **"Eight tools, permanently. Every tool schema is context in every session, against a project whose whole purpose is token cost. A ninth tool is not a trade-off to weigh; an optional argument on an existing tool is the answer."** There are exactly eight today: `create_tickets`, `edit_map`, `get_board`, `get_tickets`, `list_efforts`, `migrate_effort`, `spec`, `update_ticket`. So "the onboarding tool" is not available as written, and this Ticket has to argue past the contract or find a shape that does not need to.

Three shapes worth weighing, and the third looks strongest before any argument is heard:

1. **An optional argument on an existing tool**, which is what the contract itself prescribes. `list_efforts` is the plausible host — it is what an agent calls first in an unfamiliar repo, and a fresh repo returns nothing from it, which is exactly the moment onboarding is wanted.
2. **A ninth tool with an ADR revising the contract.** The contract is explicit that this is not a trade-off to weigh, so this path needs an argument strong enough to overturn a standing rule, not merely a good use case.
3. **A resource, plus the consumer's own agent doing the writing.** `frontier://tracker-doc` already proves the shape (`src/server.ts:129-138`), resources are not tools and cost no per-session schema, and the agent being onboarded has its own file tools — it does not need the server to write into its repo. Under this reading the server never writes the knowledge at all; it serves it and tells the agent where the decision points are. Only `frontier.yml` would need a write, and that is one optional argument on one existing tool.

Shape 3 also answers the placement question more honestly than a tool could: "wherever the agent wants" is trivially true when the agent is the one holding the pen.

The acceptance criteria stand, with one added: whether onboarding can be delivered without a ninth tool must be answered before anything else, because it decides what the rest of the Ticket is even about.

The title says "tool" and may be wrong by the end.
