---
id: T10
title: Workspace resolution recognizes a git worktree
kind: build
status: claimed
triage: ready-for-agent
blocked_by: []
claimed_by: claude-opus-5 (session 01RjtNzb)
claimed_at: 2026-08-10T08:50:35.694Z
---

# T10 — Workspace resolution recognizes a git worktree

**What to build:** A session working in a git worktree reads and writes that worktree's own
`.scratch/`, never the repository the worktree was made from.

`findRootMarker` accepts `.scratch` and `.git` only as directories. A worktree's `.git` is a file,
so that marker never matches — and because a worktree sits at `<repo>/.claude/worktrees/<name>`,
nested inside the parent, the upward walk escapes into the parent and serves its Efforts instead.
Measured: a worktree whose branch carries no `.scratch/` resolved to the enclosing repository, with
no error and nothing in the result to say so.

That is a correctness failure rather than a cosmetic one — a write from an isolated branch lands in
the main working copy, which is the isolation a worktree exists to provide. Treating `.git` as a
marker whether it is a file or a directory also covers submodules, which carry a `.git` file for
the same reason.

- [ ] A directory holding a `.git` file resolves as its own workspace, not the enclosing repository
- [ ] A worktree nested inside its parent repository serves its own `.scratch/`
- [ ] A worktree whose branch carries no `.scratch/` serves no Efforts rather than the parent's
- [ ] A plain repository, and a directory under no repository at all, resolve exactly as before
- [ ] The DOX pass records that the server takes its workspace from the working directory of the
      client that launched it, and does not follow a mid-session worktree switch — `root` or
      `FRONTIER_ROOT` is how a call retargets it
