---
id: T66
title: Id shape leaves the domain and becomes a driver question
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T64]
answer_gist: "`MINTED_ID` is gone from the domain; `StorageDriver.isId()` answers from the compiled pattern and `create_tickets` refuses a temporary key when the pattern accepts it or when it names an existing Ticket"
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
migration that decision leaves behind. `src/domain.ts:19`, `:38`, `:42-44` and `:146` say the same thing in prose — `:38` is
`TicketSummary.id` ("`T<n>`, unique repo-wide"), the restatement [[T50]] singled out as the one
inside the layer [[T36]] emptied, and `:42-44` names a "Legacy Ticket" that [[T57]] renamed.

**Blocked by:** the predicate the tool layer calls is the compiled pattern's.


- [x] `MINTED_ID` no longer exists in `src/domain.ts`
- [x] The tool layer tests id-ness through the driver, not a regular expression it holds
- [x] A temporary key is refused exactly when the configured pattern would accept it as an id
- [x] `key`'s schema description and the domain's prose name no concrete shape

## Answer

`planBatch` takes the driver's `isId`; nothing under `src/tools/` holds an id regex. `idMatcher()` accepts any length per random token, so every existing `T<n>` id matches the default. Review found the criterion as written was not enough: under a non-default pattern an old `T1` no longer matches, so a key `T1` shadowed the real Ticket and an Edge went to the sibling. Keys are now also refused when they equal an id in use. Under a broken `frontier.yml`, `isId` answers from the default pattern; the write is still refused afterwards.
