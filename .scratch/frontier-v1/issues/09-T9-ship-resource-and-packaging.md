---
id: T9
title: Ship it — tracker-doc resource, packaging, user-scope install
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T4, T5, T6, T7]
answer_gist: frontier://tracker-doc resource ships rewritten issue-tracker.md; README documents pinned user-scope npx install; npm pack smoke test verifies dist and doc in tarball
---

# T9 — Ship it: tracker-doc resource, packaging, user-scope install

**What to build:** Installing FrontierMCP into an existing project as one step. Registered once at user
scope, resolving the workspace from the session's working directory, with no per-repo configuration and
no registry round-trip on every session start.

The rewritten tracker configuration document ships as an MCP resource rather than a tool — read once at
setup, and resources cost no tool-schema tokens. It describes the MCP calls and retains the plain-file
conventions as a fallback, so a skill run in a session without FrontierMCP loaded still works. Last in the
sequence because it documents the finished tool surface.

- [x] The package publishes to npm as `frontier-mcp` and runs under a pinned version
- [x] A single user-scope registration serves every repo, with no per-repo configuration file
- [x] Opening a project is the only setup step — the workspace resolves from the session's directory
- [x] The tracker configuration document is exposed as an MCP resource, not a tool
- [x] That document describes the MCP calls and retains the file conventions as a fallback
- [x] Following the document with no server loaded still produces valid Tickets
- [x] The tool surface is exactly eight tools
- [x] Install and first-use instructions are written for a repo that has never used FrontierMCP

## Answer

Shipped the tracker configuration document as MCP resource `frontier://tracker-doc` (not a ninth tool). Rewrote `docs/agents/issue-tracker.md` with MCP tool mapping, skill flow, and file fallback including hand-publish steps.

Added `README.md` with user-scope install via pinned `npx frontier-mcp@x.y.z`, first-use flow, and workspace resolution from the session directory. Included `docs/agents/issue-tracker.md` in npm `files`; `test/ship.test.ts` asserts exactly eight tools, resource listing, fallback-valid tickets, packaging metadata, and `npm pack` contents.

The publish path itself landed separately via T14–T18 (release-it on CI, Trusted Publishing); this Ticket's contribution is the resource, the packaging metadata, and the install docs.

