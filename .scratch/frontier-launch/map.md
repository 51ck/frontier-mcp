---
header: map
---

# Map

## Destination

A decided, written go-to-market plan for FrontierMCP, ready to hand to a `/to-tickets` breakdown: what
the project claims, who it is aimed at, what must be true before strangers see it, which venues carry
it in what order, and how adoption is observed. No promotional asset is built and nothing is published
here — this map decides, a later effort executes.

## Notes

**Domain**: open-source developer-tool distribution, launched from zero owned audience.

**Skills every session should consult**: `/grilling` and `/domain-modeling` by default; `/research`
for the research tickets; `/prototype` where a draft artifact raises the fidelity of the discussion.

**Settled while charting** (constraints, not route steps — do not re-litigate without saying so):

- **Plan only.** Every ticket resolves a decision. Building README copy, a logo, benchmarks as
  shippable artifacts, or posting anywhere is the next effort's work.
- **Win condition**: one stranger still using FrontierMCP in their own project after ~30 days.
  Deliberately a retention bar, not a trial bar. Counting it is itself an open question (see the
  observation ticket) — the tracker root is configurable, so counting `.scratch/` directories is not
  a measure.
- **Audience**: people who already run agent-driven ticket workflows — the population around the
  Matt Pocock engineering skills. Not Matt himself; no assumption that any well-known person adopts it.
- **Lead claim**: the tracker lives in the repo — branch-local, offline, no GitHub and no git required.
  Token cost is a *supporting* number once it is honestly measured, never the headline.
- **Honesty is the strategy.** The known weaknesses — repository bloat, sync across branches and
  worktrees — get published beside the claims. There is no reputation to spend instead, and the
  trade-off is the pitch's credibility.
- **The GitHub-issues driver is roadmap, not a release gate.** The launch does not wait on it.
- **Accept being step three.** A stranger needs the skills before `.scratch/` exists. The launch does
  not try to fix that; it only ensures the first run does not look broken.

## Decisions so far

<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
<!-- /GENERATED -->

## Not yet specified

- **What each launch artifact actually says.** The per-venue copy — the post, the registry entry, the README section — cannot be phrased until the claims and the venue sequence are settled. Likely graduates into one ticket per venue class, or into nothing if the sequencing ticket decides the copy is execution rather than decision.
- **Whether the name and the visual identity need work.** Is `frontier-mcp` findable by someone searching for what it does, and does the project need a logo, a social preview card, or badges to be taken seriously? Currently unsharp: the readiness-bar ticket may rule these on or off the bar and dissolve this patch, or may surface a real naming problem that deserves its own ticket.
- **What happens when the first strangers actually arrive.** Reception, not outreach: what feedback is worth soliciting, how a stranger reports that the workflow did not transfer, what response time a solo maintainer can honestly promise, and how to tell a bug from a workflow mismatch. Only becomes specifiable once the sequencing ticket says who arrives from where.
- **Whether the roadmap is published, and how it is framed.** The GitHub-issues driver and other backends are real intentions. Saying so signals the project is going somewhere; it also tells a stranger the thing is unfinished, and invites "I'll wait for the GitHub driver" — which is a lost user, not a patient one. Hangs on how the claims settle.

## Out of scope

- **Building the promotional artifacts.** The README rewrite, the repository description, logo and badges, the demo, the benchmark run itself, registry submissions and launch posts. This Effort decides what is claimed, what the bar is, and which venues in what order; a `/to-tickets` breakdown executes it afterwards. Ruled out to keep the map producing decisions rather than drifting into a polish queue.
- **Designing the tracker configuration format and driver selection.** Which driver is active, tracker root as a relative or absolute path, id format, per-driver options, and a SQLite backend. Raised while charting the cold-start question and it is real product design, not a promotion decision. Its own Effort. The cold-start ticket may conclude that the launch depends on it, which is a scheduling fact, not a reason to design it here.
- **The GitHub-issues driver, and what happens when a repository mixes local markdown with GitHub issues.** Settled while charting that it is roadmap and does not gate the launch, so the plan is built on what exists today. The coexistence question — one repository holding both backends at once — is a real product concern and belongs with the driver, not with a promotion decision.
- **Anything with a budget.** Paid distribution, sponsored posts, advertising, conference presence. Out of scope for an unfunded solo project whose win condition is one retained user; spending money would also mask the only signal worth having, which is whether the workflow transfers on its own merits.


<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
<!-- /GENERATED -->
