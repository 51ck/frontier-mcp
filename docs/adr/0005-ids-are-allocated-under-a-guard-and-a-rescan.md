# Ids are allocated under a guard and a re-scan, not by creating the Ticket file

The spec's mechanism is to create the Ticket file itself with an exclusive-create flag and bump on
collision, so that the filesystem provides the mutual exclusion and no counter file can drift. The
derived counter survives that reading; the exclusive create does not. Ids are unique **repo-wide**,
but a Ticket file lives in one Effort's `issues/`, and its name also carries a sort order and a slug —
so two sessions minting `T13` into different Efforts, or with different titles, write two different
paths and collide over nothing. The exclusive create only excludes when the racing writers agree on
the filename, and repo-global identity is exactly the case where they do not.

So allocation takes its exclusive create on a separate guard, `.scratch/.frontier-id-T13.guard`, which
racing sessions all derive the same name for. A guard that cannot be taken bumps the candidate rather
than waiting.

The guard alone is still not compare-and-set, for the same reason [ADR 0004](./0004-claims-are-guarded-by-a-revision-keyed-exclusive-create.md) records for claims: a session
that scanned before ours and finished writing after would hand us an id it had already used, and the
guard would be free by then. So the batch re-scans **while holding every guard** and starts over if any
candidate has turned up on disk, and holds the guards across the write. The invariant that falls out is
the one that matters: a file carrying id X is only ever written while X's guard is held, and the guard
is only kept when a scan taken after acquiring it shows X unused — so two sessions can never both write
X. Measured with four processes creating three Tickets each at a synchronized instant; the same test
against a naive `max + 1` produces thirteen files carrying four distinct ids.

## Consequences

This is a lock file, and the spec's "no lock files" bullet is again deliberately deviated from rather
than quietly reinterpreted. It cannot wedge the tracker: a guard is never waited on, only bumped past,
so the worst a crashed session can do is make one id number get skipped — and ids are promised never to
be *reused*, never that they run without gaps. It is swept on sight once older than 30 seconds anyway.
Guards are hidden, are not `.md`, and are not directories, so no scan sees them and `.scratch/` yields
them no Effort.

Allocation costs two full workspace scans per batch, plus one more per contended retry. At the volumes
this serves that is single-digit milliseconds, and creation is the rarest call on the surface.

The Ticket file is still written with an exclusive create, now as an assertion rather than as the
mechanism: with a unique id in every filename, a target that already exists would be a Ticket the write
was about to destroy.

Cycle rejection had to move with it. A Ticket on disk may declare an Edge on an id nobody has minted
yet — a dangling Edge, which the Board reports and does not refuse — and minting exactly that id is the
moment it becomes a loop. Nothing above the seam can see that coming, because nothing above the seam
knows what the next id will be. `CreateOptions` therefore carries a `validate` hook the driver calls
with the reserved ids, before any file lands. It takes ids and nothing else, so no markdown concept
crosses the seam to reach it.
