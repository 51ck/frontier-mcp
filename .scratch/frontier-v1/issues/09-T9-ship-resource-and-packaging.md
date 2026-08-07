---
id: T9
title: Ship it — tracker-doc resource, packaging, user-scope install
kind: build
status: open
triage: ready-for-agent
blocked_by: [T4, T5, T6, T7]
---

# T9 — Ship it: tracker-doc resource, packaging, user-scope install

**What to build:** Installing FrontierMCP into an existing project as one step. Registered once at user
scope, resolving the workspace from the session's working directory, with no per-repo configuration and
no registry round-trip on every session start.

The rewritten tracker configuration document ships as an MCP resource rather than a tool — read once at
setup, and resources cost no tool-schema tokens. It describes the MCP calls and retains the plain-file
conventions as a fallback, so a skill run in a session without FrontierMCP loaded still works. Last in the
sequence because it documents the finished tool surface.

- [ ] The package publishes to npm as `frontier-mcp` and runs under a pinned version
- [ ] A single user-scope registration serves every repo, with no per-repo configuration file
- [ ] Opening a project is the only setup step — the workspace resolves from the session's directory
- [ ] The tracker configuration document is exposed as an MCP resource, not a tool
- [ ] That document describes the MCP calls and retains the file conventions as a fallback
- [ ] Following the document with no server loaded still produces valid Tickets
- [ ] The tool surface is exactly eight tools
- [ ] Install and first-use instructions are written for a repo that has never used FrontierMCP
