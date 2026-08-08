# frontier-web — serving the tracker to a human

## Destination

A settled, written architecture for serving one workspace's Board and Ticket bodies to a browser,
live — which process owns the filesystem, how the browser learns of a change, and what that costs
the current one-process-per-session model. Ready to hand to a build effort. No web app is built here.

## Notes

**Domain:** the `.scratch/` markdown tracker, the FrontierMCP stdio server, Node 24, pnpm.

**Every session** consults `/grilling` and `/domain-modeling`. `AGENTS.md` Local Contracts are
binding until an ADR revises them.

**Standing constraints — not up for decision in this Effort:**

- Markdown files stay canonical (ADR 0001). Any index is derived, in-memory, and rebuildable from a
  scan. There is one source of truth and several caches; caches go stale, they do not diverge.
- No lock files that outlive a crash (`AGENTS.md:245-246`).
- The ADR 0004 claim guard and the ADR 0005 id guard are not weakened. A new writer joins that
  protocol; it does not replace it. Both are verified by tests that spawn real OS processes.
- Nothing under `src/tools/` imports from `src/storage/` (`AGENTS.md:223`).

**Why this Effort exists.** It began as a fear of write races between parallel agents. That fear is
already answered: the guards above are cross-process and tested as such, and a single-writer broker
would be *weaker*, because it can never be the only writer — the editor, `git checkout`, and any
agent's plain file tools all write `.scratch/` without passing through it. The real driver is the
planned web UI: a browser cannot speak stdio, so a long-lived HTTP process must exist regardless,
and it must push changes. That is genuine centralization, and it reopens `spec.md:399`.

**Decided before charting:** read-only first, edits a later Effort; the A/B/C architecture question
is deliberately left open as this Map's central Ticket rather than assumed; single workspace now,
without foreclosing multi-repo later.

## Decisions so far

<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
- [T21 — How a browser talks to an MCP server in 2026](issues/03-T21-how-a-browser-talks-to-an-mcp-server-in-2026.md) — The browser should not speak MCP: serve a loopback HTTP+SSE read-only app off the ADR 0001 driver seam, beside the tool layer, keeping MCP stdio-only
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
