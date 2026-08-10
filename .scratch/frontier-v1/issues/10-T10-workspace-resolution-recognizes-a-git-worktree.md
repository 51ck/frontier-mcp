---
id: T10
title: Workspace resolution recognizes a git worktree
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: "Root markers carry their own predicate: `.scratch` counts only as a directory, `.git` counts as a file too, so a worktree or submodule resolves to itself instead of the repository enclosing it"
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

- [x] A directory holding a `.git` file resolves as its own workspace, not the enclosing repository
- [x] A worktree nested inside its parent repository serves its own `.scratch/`
- [x] A worktree whose branch carries no `.scratch/` serves no Efforts rather than the parent's
- [x] A plain repository, and a directory under no repository at all, resolve exactly as before
- [x] The DOX pass records that the server takes its workspace from the working directory of the
      client that launched it, and does not follow a mid-session worktree switch — `root` or
      `FRONTIER_ROOT` is how a call retargets it

## Answer

`ROOT_MARKERS` is now a list of `{ name, matches }` rather than two names tested with one predicate.

- **`.scratch` still counts only as a directory.** It is the tracker itself; a stray `.scratch` file
  is somebody's notes. Locked by a test.
- **`.git` counts either way.** A git worktree and a submodule both carry it as a file naming the
  real git directory. Since a worktree sits nested inside the repository it was made from, a
  directory-only marker walked straight past it and served the parent.
- **`exists` uses `lstatSync`, not `statSync`.** The question is whether an entry is there, not what
  it leads to — a dangling `.git` symlink still marks a root, and reading it as absent reopens the
  escape. `isDirectory` keeps `statSync` deliberately: a `.scratch` symlinked at shared storage is
  still the tracker. That asymmetry is why the two predicates are not one stat helper.

Six tests, all entering at the MCP tool layer. Three of them discriminate — the submodule case, the
worktree with no `.scratch/` of its own, and the dangling symlink — each verified to fail against the
old code before the fix landed.

**One criterion has no regression guard, and cannot have one.** "A worktree nested inside its parent
repository serves its own `.scratch/`" is tested, but that test passes against the old code too: a
worktree carrying its own `.scratch/` matches the tracker marker before the `.git` question is ever
asked, so the two implementations genuinely agree on that fixture. The failure only ever appeared
when the worktree's branch carried no `.scratch/`. The test is kept as characterization, with a
comment in the file saying which fixtures discriminate and why.

**DOX.** The marker rule is restated in `docs/agents/issue-tracker.md` (also served as MCP resource
`frontier://tracker-doc`), `README.md`, the `src/workspace.ts` row of `AGENTS.md`, and this Effort's
own `spec.md`, which described the old rule and was wrong as of the fix. The first two also now say
that the working directory is the one the client launched the server in and is fixed for the session
— a mid-session worktree switch is retargeted with `root` or `FRONTIER_ROOT`, never followed. T1's
body says the old thing and is left alone: a resolved Ticket records what was built.

**Bearing on T11.** T10 closes the known route to a silent write into the wrong repository, not the
class of it — which is the question T11 asks. T11's premise is unchanged.
