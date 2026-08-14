---
id: T43
title: What a stranger's first sixty seconds looks like with no tracker present
kind: decision
type: grilling
status: open
triage: ready-for-human
blocked_by: []
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
