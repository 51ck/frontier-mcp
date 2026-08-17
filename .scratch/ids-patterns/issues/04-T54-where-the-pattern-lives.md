---
id: T54
title: Where the pattern lives
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: []
---

## Question

FrontierMCP has **no per-repo configuration today**. `FRONTIER_ROOT` names which repo is served, not
how a repo behaves; the driver's options — `storageDir`, watcher timings — come from the server
constructing it, not from the workspace. A pattern would be the first thing a repo says about itself,
and that is an architectural first rather than a knob.

Candidates, none obviously right:

- A file under `.scratch/` — canonical with the tracker it configures, travels with the branch,
  visible to a hand-writing agent with no server. Also a new file kind in a directory whose whole
  contents are currently Efforts.
- Frontmatter on something that already exists — nothing repo-level exists to hang it on.
- An environment variable — invisible to a hand-writer, and per-session rather than per-repo, so two
  sessions could disagree about the same workspace.
- A server argument — registered once at user scope, which is the wrong lifetime entirely: the
  pattern belongs to the repo, not to the person opening it.

Whatever holds it is also where a bad pattern is caught, which ties this to how the consumer is
warned. And it must be readable by an agent working the tracker **without** the server, since the
file conventions are canonical either way.

## Acceptance criteria

- [ ] Where the pattern lives is decided, with the lifetime argument stated
- [ ] What a workspace with no pattern set means is stated — the T35 default, presumably, but said
      rather than assumed
- [ ] How a hand-writing agent with no server reads it is answered
- [ ] What happens when the file is malformed or names an illegal pattern is decided
