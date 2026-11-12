---
id: T108
title: Under a counted pattern, migration's fresh mint can silently satisfy a dangling prose Edge
kind: build
status: open
triage: needs-triage
blocked_by: []
---

Filed from the T69 review on 2026-11-12. Not introduced by T69 or T82; both left it as it was.

## What happens

Under a `<N>` pattern, `migrate_effort` mints `max + 1`. A prose Edge that dangled before the migration — `Blocked by: T31` where no `T31` exists anywhere — resolves afterwards if the migration happens to mint `T31` for some Ticket in the batch. The Edge now points at a Ticket its author never meant, and when the minted Ticket is the declaring Ticket itself, the file is written with a self-Edge.

Nothing reports it. The Edge resolves, so there is no dangling warning; the report shows an ordinary `blocked_by=`.

A test comment that T69 removed described this as expected behaviour: "No dangling Depends-on:T31 here — colour mints as T31".

A random pattern does not have the problem in practice: a drawn six-character id does not collide with an id someone wrote in prose.

## Repro

`frontier.yml` with `id_pattern: T<N>`. One Effort whose highest existing id is `T30`. A Foreign Ticket with no id whose body says `Blocked by: T31`. Run `migrate_effort`.

## Worth considering

A prose Edge was written about a Ticket that existed when the prose was written. An id minted in this call can never be that Ticket. So an Edge that names an id absent from the workspace before the call should stay dangling after it, which means either skipping that counter value or reporting the capture.

## Acceptance criteria

- [ ] An Edge that dangled before `migrate_effort` is not silently satisfied by an id the same call mints
- [ ] No migration writes a Ticket whose `blocked_by` names itself
- [ ] A preview and the real run agree on every Edge
- [ ] A regression test covers the repro

## Comments

2026-11-12, from the T82/T69 re-review: the same capture happens on the create path, so this is wider than migration. Reproduced under `T<N>`: an id-less unfenced Ticket saying `Blocked by: T1.4` shows `T1.4?` dangling; a later `create_tickets` mints `T1` into the same Effort, and the next scan coarsens the sub-slice onto that unrelated new Ticket. The only signal is the "coarsened" warning, and a lazy write then makes it permanent. A plain dangling `T31` is captured the same way by any later mint of `T31`. The fix should cover `create_tickets` as well as `migrate_effort`.
