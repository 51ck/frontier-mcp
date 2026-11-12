---
id: T29
title: Is the scan cost worth sharing one driver across processes
kind: decision
type: grilling
status: resolved
triage: ready-for-human
blocked_by: [T19]
answer_gist: "Partly, and small: no shared driver and no external engine; per-file invalidation is filed as T106 and parked until a real repo shows re-scan cost. ADR 0004 and 0006 guards unchanged."
---

## Question

The whole Effort, in one Ticket. T19 has measured what a workspace scan costs, how it degrades with
N sessions sharing one repo, and how long a write takes to become visible in another process. Given
those numbers — and given that T27 has already removed cached bodies and T28 has already collapsed
the cache and watcher into the driver — is it worth sharing one driver instance across the processes
on a machine?

Three outcomes, and the first is a real one:

- **No.** The scan is cheap, the remaining memory per process is small, N watchers on one tree cost
  nothing worth the machinery. Close this Effort with the numbers recorded, and correct
  `AGENTS.md:167-168` so it cites a measurement instead of asserting one.
- **Yes.** Write the ADR from the architecture already settled in the Map's Notes and in T22's
  answer, then chart the build.
- **Partly.** Some narrower change captures most of the saving — a cheaper watcher, per-file
  invalidation (`spec.md:229` already claims this exists), a shared cache without a shared writer.
  If this is the answer, say precisely which cost it targets and which it leaves.

**The decision is the user's, taken after reading T19.** An agent does not resolve this one alone.
Invoke `/grilling` and `/domain-modeling`.

**What must survive the grilling.** The framing that a shared process can never be the only writer:
the editor, `git checkout` and any agent's plain file tools all mutate `.scratch/` without passing
through it. So no outcome may weaken the ADR 0004 claim guard or the ADR 0005 id guard, and the
temptation that follows a yes — dropping the revision check because "we are the only writer" — is the
regression this Ticket exists to refuse (`AGENTS.md:254-256`).

**What a yes costs, so it is priced honestly rather than discovered later.** The happy path is small:
port election, a JSON request/response surface over the driver, a stdio-to-socket consumer shim,
refcount and idle shutdown. The project is the failure modes — simultaneous-start election, a leader
killed mid-write, version skew, split-brain, platform differences — and each needs a test that spawns
real OS processes, in the style of `test/cross-process-claim.test.ts` and
`test/cross-process-create.test.ts`. Estimate the tests at several times the feature.

## Acceptance criteria

- [x] The T19 numbers are quoted, not summarized, and the judgement rests on them
- [x] One of no / yes / partly is chosen, by the user, on the record
- [x] The choice states which of the three costs it addresses — N scans per write, resident memory
      per process, N recursive `fs.watch` handles — and which it leaves standing
- [x] It is stated explicitly that the ADR 0004 and ADR 0005 guards survive unchanged, and how a
      shared driver participates in them rather than replacing them
- [ ] On a no: this Effort closes, and `AGENTS.md:167-168` cites the measurement
- [ ] On a yes: an ADR records the architecture from the Map's Notes, says what it does to
      `spec.md:399`, and the degradation-to-today invariant and permitted split-brain are written
      down rather than left as folklore
- [ ] On a yes: the fog patches this Map carries are graduated into Tickets or explicitly deferred

## Answer

Decided by the user in grilling, 2026-11-12: **partly**.

## The T19 numbers the judgement rests on

From `AGENTS.md` Work Guidance, measured with `bench/scan-cost.ts` on Node v24.15.0, darwin arm64, Apple M4 Pro, n=30 per group, against this repo's own `.scratch/` (33 Tickets, 3 Efforts, 102KB):

- Cold scan 8.91ms median / 14.97ms p95. Re-scan after an invalidation 12.94ms / 17.28ms. Warm read off the cache 0.01ms.
- 18.80ms cold / 31.96ms re-scan at 200 Tickets; 78.73ms / 100.88ms at 1000.
- A completed scan retains 1.2MB of heap here and 5.2MB at 1000 Tickets.
- On efficiency cores: ~0.46ms per Ticket against ~0.08ms on a performance core. This repo's re-scan is 17.93ms median / 41.71ms p95; 1000 Tickets is 457.91ms.
- The volume at which any of this starts to matter is ~1000 Tickets, thirty times every Ticket in this repo put together.

## The choice

- **No shared driver.** At these numbers the scan is cheap, retained memory per process is about a megabyte, and the machinery a shared process needs (election, a killed leader, version skew, split-brain, each with a real-process test) costs several times what it saves.
- **No external engine.** The user's model was a file driver holding a virtual model of the markdown tree, and asked whether MarkdownDB could be that engine. Researched in `docs/research/2026-11-12-markdowndb-as-driver-engine.md`: it is slower (about 221ms to index this repo against a 16ms re-scan; about 842ms against 64ms at 1000 Tickets), brings 483 packages and a native `sqlite3` binding against our 5, writes to stdout, writes an index to disk as a second source of truth against ADR 0001, aborts on one malformed frontmatter block, and failed 15 of 60 index runs with four processes on one database. It changes none of the three costs. The driver already is that virtual model: a cached scan of every Ticket's frontmatter. What it lacks is granularity.
- **The narrower change: per-file invalidation**, inside the existing driver. Filed as [[T106]] and deliberately not built now. It is to be taken only when a repository actually shows re-scan cost.

## Which costs this addresses

- N scans per write: **left standing** in count. T106 would cut the cost of each one, not how many processes do one.
- Resident memory per process: **left standing**. About 1.2MB here.
- N recursive `fs.watch` handles: **left standing**.

## The guards

The ADR 0004 claim guard and the id guard (ADR 0005, superseded by ADR 0006) survive unchanged. There is no shared driver to participate in them. The revision check reads the file itself immediately before a write and never the cached model, so per-file invalidation cannot weaken it either.

## Housekeeping

`AGENTS.md` already cites the measurement rather than asserting one (the scan-cost paragraphs in Work Guidance). `.scratch/frontier-v1/spec.md:236` still says the index is "invalidated per file", which is not true today; T106 carries the correction. This Effort stays open only for [[T59]] and the parked T106.
