---
id: T68
title: create_tickets warns about a collision-prone pattern
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T64, T65]
answer_gist: Under a pattern whose only variable token is `<N>`, every `create_tickets` result carries a warning naming the configured pattern and its file, the mixed form `T<N>-<b36{4}>`, the word regression, and T56's no-action clause; mixed, random and default patterns and every read carry nothing
---

**What to build:** [[T56]]'s warning channel.

It rides the `create_tickets` result, on every call, and never appears on a read — minting is where
the consequence is realised, and the tool is a batch tool, so per-call is already rare. Suppression
is refused: the driver is cached per workspace until process exit, so "once" would mean once per
server process and an agent connecting later would never see it.

It is a separate channel from [[T38]]'s duplicate report and the two are cross-referenced one way.
T38 reports a duplicate that happened and is actionable; this reports a disposition that never is.

**The warning belongs to patterns whose only variable token is `<N>`.** A mixed pattern is exempt.
Per [[T53]], the text has to recommend the mixed form by name rather than leaving a consumer choosing
between readable and safe, and it has to say *regression* rather than *caveat* — [[T35]] moved to
random ids specifically to engineer this failure away, and `<N>` opts back into it.

T53's wording is the reference text:

> `T<N>` numbers your Tickets by counting the ones already in this working tree. A second branch
> counts the same tree and reaches the same number, and when the branches merge git will merge both
> files cleanly — their filenames differ by slug — leaving two Tickets answering to one id.
> FrontierMCP cannot prevent this. Git has no global allocator, which is why the default pattern is
> random rather than sequential. If you branch, put a random token in your pattern: `T<N>-<b36{4}>`
> keeps the number and cannot collide.

**Blocked by:** the disposition is a property of the compiled pattern, and the channel is the mint
result.


- [x] The warning rides every `create_tickets` result under a `<N>`-only pattern
- [x] It never appears on a read, and there is no suppression
- [x] A mixed pattern produces no warning
- [x] The text names `T<N>-<b36{4}>` and calls the exposure a regression
- [x] It cross-references T38's channel without merging into it

## Answer

The seam gained `StorageDriver.mergeCollidingIdPattern()`, returning the pattern and where it is configured, or undefined. The tool layer renders the warning from that, so it follows a custom storage directory.

Criterion 5 is met in T56's direction, not this Ticket's wording. T56 rules the cross-reference one way: this warning never mentions duplicates that have not happened, and the duplicate report (T67) names the counted pattern as the likely cause. The first build pointed it the other way; review caught it.

Not built: T56's condition B (a random space below 10^6). This Ticket scopes the warning to `<N>`-only patterns. T56's sentence about mistyped Edges was left out to keep a per-call warning short.
