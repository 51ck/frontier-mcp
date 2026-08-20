---
id: T66
title: Id shape leaves the domain and becomes a driver question
kind: build
status: open
triage: ready-for-agent
blocked_by: [T64]
---

**What to build:** [[T36]]'s boundary. `MINTED_ID = /^T(\d+)$/` (`src/domain.ts:26`) is the domain
asserting a shape the driver owns. It goes. The domain keeps only the contract — opaque string,
repo-unique, never reused, never changed — and the tool layer asks the driver "is this one of your
ids?" instead of testing a pattern.

The caller-visible consequence is in `create_tickets`. It distinguishes a real Edge from a sibling's
temporary key by testing against `MINTED_ID`, so widening the id alphabet widens the set of key names
that are forbidden for looking like ids ([[T35]]). That test becomes the driver's predicate, and
under a configured pattern the forbidden set is whatever that pattern accepts.

`key`'s schema description hardcodes `T<n>` — "Never stored. May not look like T<n>"
(`src/tools/create-tickets.ts:25`). [[T55]] records it as wrong either way, and it is the one
migration that decision leaves behind. `src/domain.ts:19` and `:146` say the same thing in prose.

**Blocked by:** the predicate the tool layer calls is the compiled pattern's.

**Status:** ready-for-agent

- [ ] `MINTED_ID` no longer exists in `src/domain.ts`
- [ ] The tool layer tests id-ness through the driver, not a regular expression it holds
- [ ] A temporary key is refused exactly when the configured pattern would accept it as an id
- [ ] `key`'s schema description and the domain's prose name no concrete shape
