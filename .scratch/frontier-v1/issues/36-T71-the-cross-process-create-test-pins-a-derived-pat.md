---
id: T71
title: The cross-process create test pins a derived pattern
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T65]
answer_gist: "`cross-process-create.test.ts` pins `T<N>` and `T<N>-<b36{4}>`, derives its id matching from the pinned pattern string, and races four processes under the random default asserting distinct well-formed ids and no guard file; the suite-wide sweep found nothing else asserting a minted `T<n>` shape"
---

**What to build:** the test repair [[T53]] hands to the build, called out because it fails silently.

`test/cross-process-create.test.ts` is the only thing that has ever proved the guards work — four
processes, three Tickets each, asserting every session returns `OK` and every id is distinct. Once
the default pattern is random, that test exercises a path which needs no guards at all, and it will
keep passing while proving nothing. It must pin a derived pattern explicitly.

It also matches ids with `IN_FILENAME = /-(T\d+)-/` (`:59`), which is pattern-specific and breaks the
moment the pattern moves.

The same sweep is worth taking across the suite: anything asserting on `T<n>` shape rather than on
id-ness is now testing the default configuration, not the contract.

**Blocked by:** there is no pattern to pin until minting is configurable.


- [x] `cross-process-create.test.ts` pins a `<N>` pattern explicitly and still proves distinct ids
      across four processes
- [x] `IN_FILENAME` is derived from the configured pattern rather than hardcoded
- [x] The random path has its own concurrency coverage
- [x] Every other test asserting a literal `T<n>` shape is either repointed at id-ness or pins its
      pattern deliberately

## Answer

Criterion 1 was already met by T65 and was verified, not assumed. The random case was checked to bite: expecting a guard file fails, and so does a wrong shape. It cannot prove the in-process redraw, and cross-process random draws are uncoordinated by design (T53), so it uses the full `T<b36{6}>` space where a collision among 13 ids is about 3e-8. Sweep: counted cases already pin `T<N>` through `COUNTED`; the rest assert declared fixture ids or the random shape. `scripts/runtime-check.mjs` already reads the minted id and pins `T<N>` for allocation.
