---
id: T1
title: Server skeleton, workspace resolution, and list_efforts
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: stdio server with list_efforts over the ADR 0001 driver seam and a scan-at-startup index; tests enter only at the MCP tool layer
---

# T1 — Server skeleton, workspace resolution, and `list_efforts`

**What to build:** A developer registers FrontierMCP in a session and asks what Efforts are in the repo,
and gets them back — each with its Ticket count and which header docs it has. Works on any repo,
including one with no `.scratch/` yet.

This slice establishes the scaffolding every later slice attaches to: the storage driver seam from
ADR 0001, the in-memory index, the MCP tool layer, and the fixture-tree test harness. Frontier size is
deliberately absent from the listing — it needs Ticket parsing, which arrives in T2.

- [x] A stdio MCP server starts, advertises the `frontier` server name, and responds to `list_efforts`
- [x] Workspace resolves by precedence: explicit `root` argument, then `FRONTIER_ROOT`, then the
      process working directory walked up to the nearest `.scratch/` or `.git/`
- [x] A repo with no `.scratch/` returns an empty list, not an error
- [x] Each Effort reports its slug, Ticket count, and which header docs it holds (map, spec, both, or
      neither)
- [x] Every read goes through a storage driver interface that exposes no paths, no frontmatter, and no
      section names to its callers
- [x] An in-memory index is built by a full scan at startup
- [x] Tests construct the server in-process against a temporary fixture tree and call tools; no test
      reaches past the tool layer
