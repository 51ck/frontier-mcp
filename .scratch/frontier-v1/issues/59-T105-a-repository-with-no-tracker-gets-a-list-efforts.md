---
id: T105
title: A repository with no tracker gets a list_efforts result that explains itself
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: A repository with no storage directory gets four lines from list_efforts — root with the marker that resolved it, no tracker here, a start-one line that works verbatim, and the tracker-doc URI; an empty or populated `.scratch/` is unchanged and no read creates it
---

Decided in [[T43]], 2026-11-12. Today a stranger installs, opens a repository, calls `list_efforts` and gets `(no efforts)`. That is correct and reads as broken. It also cannot tell a missing storage directory from an empty one, which call for different next moves.

## What to build

When the storage directory does not exist, and only then, `list_efforts` returns four lines, about 60 tokens:

```
root: /path/to/repo (resolved by .git)
no tracker here: .scratch/ does not exist
start one: create_tickets { effort, create: true, tickets } or edit_map { effort, create: true, destination }
conventions: frontier://tracker-doc
```

- `(resolved by ...)` says which marker located the root, or that it fell back to the working directory. It appears on this bare-repository result only, not on every root line: the wrong-root risk is highest when nothing is there to contradict it, and a populated tracker shows its own Efforts as proof.
- An existing but empty storage directory keeps today's result. The two cases must read differently.
- No tutorial, no confirmation step, no options to choose between, no guided init.
- No configuration format. Tracker root and backend selection are out of scope for the launch (see the frontier-launch Map's Out of scope).

## To check while building

- The exact arguments in the `start one` line against the real tool schemas. An agent will copy them.
- How `src/workspace.ts` reports which marker it found; that is the only module allowed to know.

## Acceptance criteria

- [x] A repository with no storage directory gets the four lines, with the real resolved root and the real reason
- [x] An empty storage directory gets today's result, unchanged
- [x] A populated tracker's `list_efforts` result is byte-identical to today
- [x] Following the `start one` line verbatim creates an Effort
- [x] No read creates the storage directory
