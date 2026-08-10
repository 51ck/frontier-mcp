---
id: T29
title: Is the scan cost worth sharing one driver across processes
kind: decision
type: grilling
status: open
triage: ready-for-human
blocked_by: [T19]
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

- [ ] The T19 numbers are quoted, not summarized, and the judgement rests on them
- [ ] One of no / yes / partly is chosen, by the user, on the record
- [ ] The choice states which of the three costs it addresses — N scans per write, resident memory
      per process, N recursive `fs.watch` handles — and which it leaves standing
- [ ] It is stated explicitly that the ADR 0004 and ADR 0005 guards survive unchanged, and how a
      shared driver participates in them rather than replacing them
- [ ] On a no: this Effort closes, and `AGENTS.md:167-168` cites the measurement
- [ ] On a yes: an ADR records the architecture from the Map's Notes, says what it does to
      `spec.md:399`, and the degradation-to-today invariant and permitted split-brain are written
      down rather than left as folklore
- [ ] On a yes: the fog patches this Map carries are graduated into Tickets or explicitly deferred
