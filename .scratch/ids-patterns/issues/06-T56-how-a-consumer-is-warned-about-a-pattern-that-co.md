---
id: T56
title: How a consumer is warned about a pattern that collides
kind: decision
type: grilling
status: resolved
triage: ready-for-agent
blocked_by: [T52, T54]
answer_gist: "The warning rides the `create_tickets` result, on every call, and never appears on a read — minting is where the consequence is realised and the tool is a batch tool, so per-call is already rare; suppression is refused because the driver is cached per workspace until process exit, so \"once\" would mean once per server process and an agent connecting later would never see it. Separate from T38's channel, one-way cross-referenced: T38 reports a duplicate that happened and is actionable, this reports a disposition that never is"
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

- [x] The channel for the likely-collision warning is decided
- [x] How often it fires is decided, and the ignorability of the answer is faced rather than hoped
      away
- [x] The relationship to T38's duplicate-detected warning is stated — same channel or separate
- [x] What the warning actually says is drafted, in words that serve an agent and a human both

## Answer

**The warning rides the result of `create_tickets`, on every call, and never appears on a read.**

Two conditions fire it, both computable from the pattern alone when it compiles:

| Condition | Trigger | Risk |
| --- | --- | --- |
| **A** | The pattern contains no random token | Cross-tree duplicates on merge, and maximal typo density |
| **B** | The pattern's random space is below 10⁶ | A foreign unmerged id collides at a rate worth naming |

A **mixed** pattern does not warn. [[T53]] recommends `T<N>-<b36{4}>` by name, its identity cannot collide, and its counter racing is cosmetic in the way `NN` is. Warning about the pattern the product recommends is exactly the noise that teaches a reader to stop reading.

## Why the mint, and not the Board

`create_tickets` is where the pattern's consequence is actually realised. Everything else in the product only *reads* ids that already exist; minting is the one act the choice governs, so it is the honest place to say what the choice costs.

**`get_board`'s grouped warnings channel is refused deliberately**, despite being the obvious precedent. Three reasons, and the third is the one that decides it:

- It is the hot path. A Board is read many times per session and its size is *pinned*, not merely bounded — `test/read-path-cost.test.ts:80` asserts `expect(board).toBeLessThan(700)` with a comment saying the pin exists precisely to catch a Board quietly giving back its saving. A standing advisory line is 25–40 tokens of that budget, paid on every read, forever, to say something that never changes.
- The Board's warnings are **anomalies**, every one of them. `collectWarnings` (`src/tools/get-board.ts:141`) emits eight classes — dangling Edges, blocked-by-dropped, unrecognized status, coarsened sub-slice refs, declined-but-takeable, stale claims, Legacy Tickets, missing ids — and each names something that is wrong and could be fixed.
- **A never-actionable member would train readers to skip the block.** That is the real cost, and it is not paid by this warning; it is paid by the ones already there. Every reader who learns the warnings block usually contains one line they can do nothing about learns to skim it, and what gets skimmed is the dangling Edge and — once [[T38]] is built — the duplicate id. Buying loudness for a disposition by spending the credibility of the channel that reports facts is a bad trade in the only currency that matters here.

**`update_ticket` is the wrong tool** even though it already renders a `warnings:` block from `TicketWriteResult.warnings` (`src/tools/update-ticket.ts:214`). It does not mint. But its existence settles the shape question: a non-fatal advisory riding a write, produced below the storage seam and rendered by the tool, is an established pattern here rather than an invention — and it is the right seam, since [[T36]] left only the driver knowing what an id looks like.

**The mechanics.** `renderCreated(effort, created)` (`src/tools/create-tickets.ts:222`) takes no workspace and no config, so the advisory arrives either as a new parameter or composed at the `src/server.ts:236` call site. Appending after the last Ticket line is shape-safe: the header states the count up front, so a caller parsing *root line, count line, N Ticket lines* is unaffected by anything after line `2 + N`. The text should match `update_ticket`'s write-side format — `warnings:` then `- ` bullets — rather than `get_board`'s two-space indent, because it is a write. That the two formats differ at all is a small existing wart, and this Ticket should not add a third.

The string itself is a constant per workspace, computed when the pattern compiles ([[T54]]), not recomputed per call.

## How often, and why suppression is refused

**Every call. No once-per-session, no suppression, no counter.**

The tempting answer was to fire once and stay quiet. It fails on a fact about the runtime: `createDriverRegistry` (`src/driver-registry.ts`) caches one driver per resolved workspace in a `Map` with no TTL, no eviction and no size cap, and the only removal path is `closeAll()` from `FrontierMCP.close()`, which `src/bin.ts` never calls. **A driver lives from its first-touching call until process exit.** So "once" would mean once per server process per workspace — and an agent that connects to a long-running server later would never see the warning at all. That is precisely the failure this Ticket already listed for the once-at-accept-time option, *"seen by whoever set it, and by nobody who joins later"*, arriving in disguise.

There is also no precedent to build on and a discipline to break. Nothing in the codebase suppresses repeated output; there is no session identity anywhere; and every renderer — `renderBoard`, `renderCreated`, `renderUpdate`, `renderMigration`, `renderEfforts`, `renderMap`, `renderSpec`, `renderTickets` — is a pure function of what it was handed. A renderer whose output depends on invisible history is unreproducible for a caller and untestable for us, and it would be the only one.

**Facing the ignorability rather than hoping it away.** It will be ignored, and that is the correct outcome rather than a defect to engineer around.

- The frequency is naturally low without any suppression, because `create_tickets` is a **batch** tool by construction — *"Publish a whole breakdown in one call"*. An agent calls it a handful of times in a session, not once per Ticket. The rarity comes from the tool's shape, which is honest, rather than from hidden state, which is not.
- The warning is not actionable and is not supposed to be. The consumer chose the pattern deliberately and the map's standing preference is **warn, never prevent**. A warning about a deliberate choice that cannot be ignored has stopped being a warning and become prevention.
- Its job is **discoverability, not persuasion**: to be present at the moment the cost is incurred, so that someone who did not choose the pattern can find out why their ids behave as they do. It does not need to be read every time to do that job. It needs to be findable the first time somebody wonders.

What is refused is the trade that buys un-ignorability with the read path's credibility.

## Relationship to T38

**Separate channels, deliberately, with a one-way cross-reference.**

| | [[T38]] | This Ticket |
| --- | --- | --- |
| Reports | A duplicate that **happened** | A collision that is **likely** |
| Channel | `get_board` grouped warnings; writes refuse | `create_tickets` result |
| Actionable | Yes, now | No, ever |
| Cause | Usually a merge | The pattern |

Conflating them would put a standing property into the channel that reports facts, which is the failure described above. Keeping them apart means the Board's warnings stay a list of things that are wrong.

The cross-reference runs **one way only**: when T38's duplicate warning fires in a repo whose pattern meets condition A, its message should name the pattern as the likely cause, because at that point the disposition has become the explanation for a fact. This Ticket's warning never mentions duplicates that have not happened.

## What the warning says

Two audiences, one text. The human needs to know what was given up and what the alternative is; the agent needs to know whether to act and whether to escalate. The closing clause does the agent's half, and it is load-bearing — without it an agent will report a standing property to the user as a per-call failure.

**Condition A** — no random token:

```
warnings:
- id pattern `T<N>` mints by counting the Tickets already in this working tree, so a
  branch that counts the same tree mints the same ids and a merge leaves two Tickets
  on one id with nothing to notice it. It also leaves little room to catch a mistyped
  Edge: with the numbers densely used, a typo usually names a real but wrong Ticket.
  `T<N>-<b36{4}>` keeps the readable number and cannot collide across branches.
  Set in .scratch/frontier.yml. No action is required here — this describes the
  pattern, not this call.
```

**Condition B** — random space below 10⁶:

```
warnings:
- id pattern `T<b36{3}>` draws from 46,656 possible ids. Against 100 ids that exist
  but have not merged into this tree, that is roughly a 1-in-467 chance per mint.
  `T<b36{6}>` gives 2.2 billion and about 1 in 22 million. Set in
  .scratch/frontier.yml. No action is required here — this describes the pattern,
  not this call.
```

The exposure is stated in [[T35]]'s terms — against *foreign unmerged ids*, not as raw birthday math — because a duplicate inside the working tree is caught deterministically by the scan the driver already takes, and under [[T53]]'s random strategy is retried rather than written. Only ids that exist somewhere this tree cannot see are actually dangerous, which is the same framing T35 used to size `T<b36{6}>` at 1 in 22 million.

**The 10⁶ threshold** is chosen so the stated exposure is at worst 1 in 10,000 per mint against 100 foreign ids. `<b36{4}>` is 1,679,616 and passes; `<b36{3}>` is 46,656 and fails; `<b16{5}>` is 1,048,576 and just passes. It is a round number rather than a derived one, and it is stated in the answer so that a consumer who disagrees can see exactly what it assumes.

## The second channel, for the human who chooses

The warning above reaches whoever mints. It does not reach the person editing `frontier.yml`, because a configuration file has nowhere to print — which is where this Ticket started.

That audience is served by documentation, and [[T54]] already put the hook in place: the tracker doc must stop stating the id format and start pointing at `id_pattern`. The recommendation belongs there, next to the pointer, where a human deciding what to write is already reading. It is honest that documentation is *read by nobody at the moment it matters* for a runtime failure — but this is not a runtime failure, and the moment that matters for a pattern choice is the moment someone is reading about how to make one. That is the one case where the documentation channel is not a cop-out.

Neither channel is load-bearing alone. Together they cover the person who chose and the agent who mints, which are the two populations the map's *informed choice* standard actually names.
