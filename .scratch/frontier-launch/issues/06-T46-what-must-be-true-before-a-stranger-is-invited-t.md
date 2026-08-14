---
id: T46
title: What must be true before a stranger is invited to look
kind: decision
type: grilling
status: open
triage: ready-for-human
blocked_by: [T42, T43]
---

## Question

What is the readiness bar — the list of things that must be true before any promotion happens, and the
things that explicitly may stay rough?

With a small ecosystem and no reputation, a first impression that breaks costs more than the delay of
fixing it. But the bar can also be set so high it never clears, and the project is six days old.

Decide the bar itself, not the work. Known candidates:

- Repository surface: a description (currently empty), a homepage or its absence, badges, a README that
  leads with the reason rather than the mechanism.
- Whether visual identity — a logo, a social preview card — is on the bar or is decoration.
- Whether a demo is required, and if so whether it must be moving (asciinema, gif, video) or whether a
  worked example in text suffices.
- Whether the published token number is on the bar, which depends on how that measurement resolves.
- The cold-start behaviour, from its own ticket.
- Non-obvious things a stranger checks: licence, whether the package installs on a clean machine, whether
  the documented `npx` command works from nothing, what happens on an unsupported Node version.

For each item: on the bar, or explicitly off it. "Off the bar" is a real answer and is worth recording,
because it stops the launch drifting behind an unbounded polish queue.
