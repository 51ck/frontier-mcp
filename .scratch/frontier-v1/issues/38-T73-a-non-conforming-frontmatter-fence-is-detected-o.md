---
id: T73
title: A non-conforming frontmatter fence is detected on read
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: "Foreign fences detected on read: no-id plus a non-schema key is Legacy; unmapped fenced status sets unrecognizedStatus and stays off the Frontier"
---

**What to build:** the detection half of [[T57]], replacing the quarantine half of the dropped T70.

**The hole.** `splitFrontmatter` treats any opening `---` fence whose YAML parses as a mapping as a schema Ticket (`frontmatter.ts:26-37`). Nothing checks the fields are ours. A GitHub export or an Obsidian note reads as `legacy: false`, the Foreign parser never runs, and nothing flags the file. The damaging case is a foreign field wearing one of our names: `readStatus` (`ticket.ts:120`) matches the four `STATUSES` and returns `undefined` otherwise, which line 43 turns into `'open'`. A foreign `status: closed` reads as **open**, lands on the Frontier, and is handed to an agent as takeable work.

**Two independent tests, because either alone leaks.**

First: a fence with **no `id` key and at least one key outside our eleven** (`id`, `title`, `kind`, `type`, `status`, `triage`, `blocked_by`, `answer_gist`, `dropped_reason`, `claimed_by`, `claimed_at`) is Foreign. The conjunction is load-bearing. A Ticket normalized by a write but not yet minted an id has our keys and no `id`, and must not be caught — `test/normalize-and-stale.test.ts:85-102` pins that file's behaviour and it must not change.

Second: a `status` value outside `STATUSES` sets `unrecognizedStatus`, which today is only ever set on the Foreign path (`ticket.ts:94`). This catches the case the first test misses — a foreign fence carrying only keys that collide with ours, such as `title:` and `status: closed` and nothing else, which has no key outside our eleven and would pass.

**Detect on read, write nothing.** The Board warns, grouped rather than itemized like the existing Foreign and `no id` warnings (`get-board.ts:145`, `:218-224`). The Ticket stays off the Frontier — `isTakeable` (`frontier.ts:35-39`) already requires `status === 'open'`, and an unrecognized status is not one. This is [[T38]]'s warn-on-read, refuse-on-write rule reused, and it keeps the read path pure as [[T8]] requires.


- [x] A fence with no `id` and at least one key outside our eleven reads as Foreign
- [x] A normalized Ticket with our keys and no `id` is **not** caught, and `test/normalize-and-stale.test.ts:85-102` still passes
- [x] A `status` value outside `STATUSES` sets `unrecognizedStatus` on a fenced file, not only on the unfenced path
- [x] A foreign fence carrying only colliding keys is caught by the status test alone
- [x] `status: closed` never reaches the Frontier
- [x] The Board warns about Foreign fences as a group; nothing is written during a read

## Answer

Two independent tests, either alone leaks. A fence with no `id` and at least one key outside the eleven schema keys is `legacy: true` and joins the existing grouped Legacy warning. A fenced `status` outside STATUSES sets `unrecognizedStatus` (so `title` + `status: closed` is caught even when every key collides). `isTakeable` now also requires `unrecognizedStatus === undefined`, so those Tickets never reach the Frontier. Reads write nothing. A normalized no-id Ticket with only our keys is not caught — `test/normalize-and-stale.test.ts:85-102` still passes.
