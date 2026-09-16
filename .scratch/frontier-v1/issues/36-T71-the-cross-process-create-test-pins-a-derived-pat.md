---
id: T71
title: The cross-process create test pins a derived pattern
kind: build
status: open
triage: ready-for-agent
blocked_by: [T65]
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


- [ ] `cross-process-create.test.ts` pins a `<N>` pattern explicitly and still proves distinct ids
      across four processes
- [ ] `IN_FILENAME` is derived from the configured pattern rather than hardcoded
- [ ] The random path has its own concurrency coverage
- [ ] Every other test asserting a literal `T<n>` shape is either repointed at id-ness or pins its
      pattern deliberately
