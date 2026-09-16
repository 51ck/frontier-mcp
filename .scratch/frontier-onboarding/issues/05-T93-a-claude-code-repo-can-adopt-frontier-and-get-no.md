---
id: T93
title: A Claude Code repo can adopt frontier and get no tools, silently
kind: build
status: open
triage: needs-triage
blocked_by: []
---

## What to build

A consumer setting frontier up for Claude Code ends with a config that client actually reads, and learns within one command if they have not.

Filed from a consumer report written at `staya-ui` on 2026-09-11, originally at `.scratch/consumer-report-claude-code-never-reads-agents-mcp-json.md` in this repo. `goals: usable, effective`.

### The capture

`staya-ui`, a private Vue component library, adopted frontier as its issue tracker. Its root `AGENTS.md` names frontier as the tracker, it vendors `docs/agents/issue-tracker.md`, it commits `.scratch/` to git, and it pins `frontier-mcp@0.3.1`. Every visible sign of a correct adoption is present. No Claude Code session opened in that repository has ever had a frontier tool.

- **Expected:** the eight `mcp__frontier__*` tools available in a session opened at the repository root.
- **Got:** no tools registered, and no error. `claude mcp list` listed three servers, none of them frontier. The session *did* report an unrelated server's connection timeout, which is what made the silence convincing — the client clearly reports MCP trouble, so an agent reasonably concludes frontier is fine.
- **Workaround:** none. The agent read `AGENTS.md`, learned it must never hand-write ticket markdown, and had no way to reach the tracker at all.

### Why it happened

The repository declared the server in `.agents/mcp.json`. Claude Code reads project-scoped servers only from `.mcp.json` at the repository root; its other two scopes, local and user, both live in `~/.claude.json`. `.agents/mcp.json` is the Codex convention that arrives with `skills ... --agent codex`, and nothing in Claude Code reads it. The repository had also set `enabledMcpjsonServers: ["frontier"]`, which reads like a fix and is not one — that key approves a definition in `.mcp.json`, it never introduces one.

**This repo gets it right and hides the fact.** `.mcp.json` and `.cursor/mcp.json` are both symlinks to `.agents/mcp.json`, so every client finds the same file. A consumer copying the visible `.agents/` layout copies the canonical file and not the two symlinks that make it reachable. git preserves symlinks, so the trick works here and is invisible as a technique.

### Why it stays silent

An MCP client reports servers it knows about and that fail. It cannot report a server it was never told exists. The consumer-side symptom is an absence, not an error, and the agent in the session has no signal to attribute it to. In `staya-ui` the misconfiguration survived across sessions for exactly this reason.

The blast radius is wider than one missing capability. A repository that keeps `.scratch/` in git, instructs agents never to hand-write tickets, and then hands them no tools has told them to do nothing. The safest outcome is a stalled session; the likely one is an agent hand-writing ticket markdown anyway and allocating ids outside the guard.

### What the evidence supports

1. **The README documents no Claude Code path.** "Install once (user scope)" shows only `~/.cursor/mcp.json` and says other clients "take the same command and arguments in their own user-scope server list". For Claude Code the correct instruction is a concrete command — `claude mcp add --scope user frontier -- npx -y frontier-mcp@x.y.z` — not a file to guess at. This Effort's spec already commits to "Publish copy-paste integration examples for Codex, Claude, and Cursor", so this is evidence for a decision already taken, not a new direction.
2. **`scripts/frontier-setup.cjs` accepts only `--client cursor` and `--client manual`.** The Cursor path validates its saved command through a real `initialize` and `tools/list` before writing. A Claude Code consumer gets none of that verification — and is precisely the consumer who ended up with a config no client reads. A `--client claude-code` target closes the gap with the machinery that already exists.
3. **Nothing detects the failure.** A doctor check that runs from the repository and reports which client config files declare `frontier`, and which of them the installed clients actually read, turns a silent absence into a sentence.
4. **The per-repo `.mcp.json` deserves a paragraph.** Consumers pin a version per repository and commit it for their team; `staya-ui` did that deliberately. The README's "no per-repo `mcp.json` file" reads as a reason not to have one rather than one option among several, and leaves a consumer who wants one without the correct filename.

### Not a defect

Recorded so nobody chases it. The consumer's command, `npx -y --registry https://registry.npmjs.org/ frontier-mcp@0.3.1`, is correct — run by hand in that repository it completes a handshake reporting `"serverInfo":{"name":"frontier","version":"0.3.1"}`. The package resolves, `0.3.1` exists on npmjs.org, the `bin` entry is intact. No second failure hides behind the first.

### Consumer-side resolution, for reference

`staya-ui` fixed its own side by symlinking `.mcp.json -> .agents/mcp.json`, mirroring this repo, and `claude mcp list` then reported frontier connected. That fix is a consumer workaround, not a substitute for any of the four items above.

## Acceptance criteria

- [ ] The README documents a Claude Code install path as a concrete command, not a file to guess at
- [ ] The per-repo option is described with its correct filename for each client, alongside the user-scope recommendation
- [ ] `frontier-setup.cjs` accepts a Claude Code client target, with the same handshake verification the Cursor path performs
- [ ] Some check, runnable from a consumer repository, reports which client configs declare frontier and which the installed clients read
