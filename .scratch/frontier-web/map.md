# frontier-web — serving the tracker to a human

## Destination

A settled, written architecture for serving one workspace's Board and Ticket bodies to a browser,
live — what the human needs to see, how the browser learns of a change, where it ships, and what it
is safe to expose. Ready to hand to a build effort. No web app is built here.

## Notes

**Domain:** the `.scratch/` markdown tracker, the FrontierMCP stdio server, Node 24, pnpm.

**Every session** consults `/grilling` and `/domain-modeling`. `AGENTS.md` Local Contracts are
binding until an ADR revises them.

**Standing constraints — not up for decision in this Effort:**

- Markdown files stay canonical (ADR 0001). Any index is derived, in-memory, and rebuildable from a
  scan. There is one source of truth and several caches; caches go stale, they do not diverge.
- No mechanism a crashed process leaves behind for a human to clean up (`AGENTS.md:246`, whose reason
  is stated at `spec.md:198`).
- The ADR 0004 claim guard and the ADR 0005 id guard are not weakened. A new writer joins that
  protocol; it does not replace it. Both are verified by tests that spawn real OS processes.
- Nothing under `src/tools/` imports from `src/storage/` (`AGENTS.md:223`).

**Why this Effort exists.** It began as a fear of write races between parallel agents. That fear is
answered: the guards above are cross-process and tested as such. What survived is the web UI itself.
A browser cannot speak stdio, so a long-lived process listening on a socket must exist regardless,
and it must push changes — which reopens `spec.md:399`, narrowly. T21 settled the shape and T22
settled the ownership: **the web process is a peer reader on the ADR 0001 driver seam, holding its
own driver, and it ships standalone.** MCP stays stdio-only, one server process per client session,
with no MCP-over-HTTP surface to secure or version.

**What left this Effort.** Whether the processes on one machine should share a single driver rather
than each holding its own is now `frontier-hive`, gated on T19's measurement. It is a performance
question with no bearing on what the browser is served or how. If that Effort later says yes, the
leader absorbs this listener and today's standalone process becomes its degenerate one-member case —
an evolution, never a precondition. Nothing charted here may assume it happens.

**Decided before charting:** read-only first, edits a later Effort; single workspace now, without
foreclosing multi-repo later. Read-only is a product decision rather than a structural one — the
driver interface already carries the write methods, so a writing browser would join the existing
guards and need no new protocol.

## Decisions so far

<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
- [T21 — How a browser talks to an MCP server in 2026](issues/03-T21-how-a-browser-talks-to-an-mcp-server-in-2026.md) — The browser should not speak MCP: serve a loopback HTTP+SSE read-only app off the ADR 0001 driver seam, beside the tool layer, keeping MCP stdio-only
- [T22 — Who owns filesystem I/O when a browser is watching](issues/04-T22-who-owns-filesystem-i-o-when-a-browser-is-watchi.md) — Option A for the web process, which ships standalone as a peer reader on the seam; the shared-driver question separates into the frontier-hive Effort with its architecture designed but its go/no-go gated on T19
<!-- /GENERATED -->

## Not yet specified

- Access model — localhost-only is assumed; binding beyond loopback makes auth a real question and changes much of the above.
- What the browser shows for a workspace that has no `.scratch/` yet.
- Whether the UI shows live agent presence, or only what the files already record — `claimed_by` is in the files, "session X is connected" is not.
- The shape of multi-repo aggregation, when it comes.
- Whether `docs/agents/issue-tracker.md`, the shipped agent contract, must say anything about a second human-facing reader.
- Whether the repo should migrate to the v2 scoped SDK family (`@modelcontextprotocol/server`/`client`/`node`@2.0.0, GA 2026-07-27) at all — T21 found the pinned `^1.30.0` tops out at protocol `2025-11-25`, which makes `AGENTS.md:161-163` accurate but now under-descriptive. Concerns the server itself, not the web UI, so it likely belongs on `frontier-v1`.
- Whether a human reading a Board in a browser changes what `get_board` should return to agents.

## Out of scope

- Editing from the browser — read-only first by decision; it constrains the architecture Ticket rather than being one.
- Multi-repo aggregation for now — `spec.md:399` stands for this Effort.
- The SQLite driver and `md ↔ db` conversion — already deferred by ADR 0001.
- A broker justified as a fix for write races — the race is closed and tested cross-process; centralization earns its place from the UI or not at all.
- Auto-expiry of claims (`spec.md:397`) and writes triggered by the filesystem watcher (`spec.md:398`).
- Rendering the tracker inside an MCP host via MCP Apps (SEP-1865) — weighed and set aside in T21: it renders inside a host chat client, which is not the standalone always-open board this Destination describes.
- Sharing one driver instance across the processes on a machine — separated into the `frontier-hive` Effort, where it is gated on T19. It is a performance question about the server, not a question about serving a browser, and this Effort must stay shippable whether or not it is ever answered yes.


<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
<!-- /GENERATED -->
