---
id: T56
title: How a consumer is warned about a pattern that collides
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: [T52, T54]
---

## Question

The standing preference is **warn, never prevent**. A consumer may choose `T<N>` and take the
cross-tree collisions that come with it; the product's job is to make sure that choice was informed.
A configuration file has no natural place to print anything, so the warning needs a channel.

Candidates, and each has a different failure:

- **At write time, on every call** — loud, unmissable, and quickly ignored. `get_board` already has a
  grouped warnings channel (`src/tools/get-board.ts:145`), so there is a precedent to follow or to
  deliberately not follow.
- **Once, when the pattern is first accepted** — seen by whoever set it, and by nobody who joins
  later.
- **Only in documentation** — honest, cheap, and read by nobody at the moment it matters.
- **Not at all for a legal pattern** — defensible if legality already encodes the judgement, but then
  the recommendation has no teeth.

There is a second audience the phrasing has to serve. The warning is read by **agents**, not only by
the human who chose the pattern, and an agent reading "this pattern may collide" on every board is
noise it will learn to skip. What an agent needs is different from what the human needs, and the
channel may have to differ too.

And there is a real duplicate to report separately: T38 already decided that a duplicate id warns on
read and refuses on write. That is the warning for a collision that **happened**. This Ticket is
about the warning for a collision that is **likely**, and the two should not be conflated in one
channel unless that is chosen on purpose.

## Acceptance criteria

- [ ] The channel for the likely-collision warning is decided
- [ ] How often it fires is decided, and the ignorability of the answer is faced rather than hoped
      away
- [ ] The relationship to T38's duplicate-detected warning is stated — same channel or separate
- [ ] What the warning actually says is drafted, in words that serve an agent and a human both
