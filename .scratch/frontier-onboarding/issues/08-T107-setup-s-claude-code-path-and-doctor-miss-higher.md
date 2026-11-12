---
id: T107
title: Setup's Claude Code path and doctor miss higher-precedence scopes and some config shapes
kind: build
status: open
triage: needs-triage
blocked_by: []
---

Filed from the T93 review on 2026-11-12. These were rated below the findings fixed inside T93 and left out of its scope.

## What is wrong

**1. `--client claude-code --apply` ignores local and project scope.** It registers at user scope and reports success. A local-scope entry (`projects[<path>].mcpServers.frontier` in `~/.claude.json`) or a `.mcp.json` entry outranks user scope, so the session keeps the old pin and nothing says why.

**2. The doctor's Codex read is one regex.** It matches only a `[mcp_servers.frontier]` table header. It misses `[mcp_servers]` with an inline `frontier = { ... }` and dotted keys. `codex mcp add` writes the header form, so this is rare.

**3. The local-scope key lookup rests on two assumptions.** The doctor looks up `projects[...]` by the resolved repository root or its realpath. Nobody verified that Claude Code keys by that root rather than by the launch directory, or how it writes the key on Windows (forward slashes).

**4. The doctor never names the `enabledMcpjsonServers` trap.** It does not read `.claude/settings*.json`, so a repository that set that key without a `.mcp.json` definition gets no sentence about it. That is the exact trap in T93's capture. The docs already explain the key correctly.

## Acceptance criteria

- [ ] The claude-code preview warns when a higher-precedence `frontier` entry exists for the current directory, naming the file and scope
- [ ] The doctor recognizes an inline-table and a dotted-key `frontier` entry in `~/.codex/config.toml`
- [ ] The `projects[...]` key Claude Code actually writes is verified on macOS or Linux and on Windows, and the doctor's lookup matches it
- [ ] The doctor reports `enabledMcpjsonServers` naming `frontier` when no read location defines it
