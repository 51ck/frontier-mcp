---
id: T65
title: Two minting strategies, chosen statically from the compiled pattern
kind: build
status: open
triage: ready-for-agent
blocked_by: [T64]
---

**What to build:** [[T35]]'s uncoordinated minting and [[T53]]'s conditional guards, as one
strategy compiled from the pattern.

**The default becomes `T<b36{6}>`** — lowercase base36, six characters after the `T`, matching
`^T[0-9a-z]+$`. Lowercase is forced rather than chosen: a case-insensitive filesystem makes `Tk39FQ`
and `Tk39fq` one file. Nothing migrates, because `T34` already matches the new pattern — old ids stay
valid forever and the never-reused, never-changed contract is untouched.

**Random path:** draw, verify against the scan the batch was already going to take, redraw on a hit,
bounded. The retry is not decorative — `T<b36{1}>` is legal under [[T52]], so short random tokens make
collisions ordinary rather than astronomical. It needs its own limit and its own message:
`CANDIDATE_HEADROOM`'s "No free Ticket id within 1000 of the highest in use"
(`src/storage/markdown/create.ts:298`) is a derived-only concept and names `.frontier-id-*.guard`
files a random pattern never creates.

**Derived path: the guards stay.** [[T37]] resolved they were deleted; the deletion was never carried
out and T53 resolved it must not be. `reserve()` (`create.ts:248`), `hold()` (`:334`), `claim()`
(`:289`), `release()` (`:280`) and the re-scan under guards all remain for any pattern containing
`<N>`, including a mixed one, because a consumer who writes `<N>` is asking for a counter and handing
out `35` twice is a broken promise even when identity is safe.

**One change the existing machinery does not survive unaltered:** `guardFor(storage, id)` (`:350`)
builds `.frontier-id-<id>.guard` from the full id, which is correct only while the id *is* the
counter. Under `T<N>-<b36{4}>` two sessions both reaching `35` render `T35-ab12` and `T35-cd34`,
derive two different guard paths, never contend, and the counter the guard exists for is handed out
twice anyway. The guard's subject is the **derived component**, not the id.

`withIdReservations` already short-circuits on `count === 0` (`:108`), so the random path routes
through the existing signature without taking a guard. The conditional is smaller than it looks.

**Blocked by:** the strategy is a property of the compiled pattern, which does not exist yet.


- [ ] The minting plan compiles once from the token list; there is no per-call strategy branch
- [ ] Random: draw, verify against the batch scan, bounded retry, its own limit and its own message
- [ ] Derived: `guardFor` keys on the `<N>` value, and two sessions minting `T35-ab12` and
      `T35-cd34` contend on one guard path
- [ ] The default pattern is `T<b36{6}>` and no existing id changes
- [ ] `CANDIDATE_HEADROOM` and its error message are unreachable under a random pattern
- [ ] ADR 0005's two-phase all-or-none write, the Effort directory created after validation, and the
      `validate` hook all survive — none of them are about counters
