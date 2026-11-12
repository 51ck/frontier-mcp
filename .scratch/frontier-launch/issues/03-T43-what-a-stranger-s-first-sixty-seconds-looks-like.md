---
id: T43
title: What a stranger's first sixty seconds looks like with no tracker present
kind: decision
type: grilling
status: resolved
triage: ready-for-human
blocked_by: []
answer_gist: "The launch needs only a self-explaining list_efforts result when the storage directory is missing: four lines (resolved root and why, no tracker here, the one call that starts one, pointer to the tracker doc). No guided init, no configuration format."
---

## Question

What is the minimum first-run behaviour the launch requires, so that a stranger with no `.scratch/`
does not conclude the server is broken?

Today: install, open a repository, call `list_efforts`, get nothing. That is correct behaviour and it
reads as a failure. The README says a missing `.scratch/` is not an error, but the tool result is what
the user sees, and the README is what they did not read.

Decide the smallest thing that closes this for the launch. Candidates raised while charting:

- An empty result that *explains itself* — the tool telling the agent how to create the first Effort,
  rather than reporting nothing.
- A guided init: on finding no tracker, the server offers to create one, and does so after the user
  confirms through the agent.
- Configuration that names the driver and its options — tracker root (relative or absolute, so the
  tracker may sit outside the project), id format, and which backend is in use.

The grilling question is *how much of this the launch actually needs*, not what the full design is.
A self-explaining empty result is a very different cost from a configuration format, and only one of
them gates a launch.

Designing the configuration file and the driver-selection schema is its own product effort — see the
Map's Out of scope. This ticket may conclude "the launch needs configuration, so the launch waits on
that effort", but it does not design it.

## Answer

Decided by the user in grilling, 2026-11-12. The user asked the agent what it wants first on a bare repository and accepted the answer.

What an agent needs on its first call in a repository it has never seen, in order:

1. Which directory was resolved, and why. The fear is not an empty tracker; it is creating one in the wrong place.
2. "No tracker" said differently from "empty tracker". `(no efforts)` cannot tell a missing storage directory from an empty one.
3. The one call that starts one, with the exact `create: true` argument.
4. Where the conventions live: one pointer to `frontier://tracker-doc`, not the conventions themselves.

So the launch gate is this result, about 60 tokens, paid once per bare repository and only when the storage directory is missing:

```
root: /path/to/repo (resolved by .git)
no tracker here: .scratch/ does not exist
start one: create_tickets { effort, create: true, tickets } or edit_map { effort, create: true, destination }
conventions: frontier://tracker-doc
```

`(resolved by ...)` goes on this result only, not on every root line: the wrong-root risk is highest when nothing is there to contradict it, and a populated tracker shows its own Efforts as proof.

Not needed for the launch: a guided init (a confirmation an agent cannot complete without a human), a tutorial, or a configuration format naming the driver and tracker root. The last stays its own product effort, per the Map's Out of scope, and the launch does not wait on it.

Build: [[T105]] in frontier-v1.
