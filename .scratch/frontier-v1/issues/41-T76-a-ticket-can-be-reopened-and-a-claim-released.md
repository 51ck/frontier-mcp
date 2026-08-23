---
id: T76
title: A Ticket can be reopened and a claim released
kind: build
status: open
triage: ready-for-agent
blocked_by: []
---

**What to build:** the missing reverse transitions. Found while grilling [[T57]]; it is a defect in its own right and predates that Ticket.

There are four statuses — `open`, `claimed`, `resolved`, `dropped` (`domain.ts:31`) — and three verbs: `claim`, `resolve`, `drop`. Nothing returns a Ticket to `open`. `editFor` throws on a direct `status` (`src/tools/update-ticket.ts:96-102`), correctly, because Status is derived from the transition; but two transitions have no verb.

**Why it bites hardest under lazy conversion.** The Foreign floor reads `Status: resolved` off a prose line (`legacy.ts`), and [[T57]] makes the agent's *first* touch the write that bakes it into frontmatter — the moment it is least reviewed. After that no tool can move it back, and every Ticket downstream stays unblocked on a resolution that never happened, because `isTakeable` (`frontier.ts:35-39`) reads Edges as satisfied when the blocker is `resolved`.

It is not only a migration problem. A resolution that turns out wrong, and a claim held by an agent that died, are both ordinary and both currently permanent — `test/normalize-and-stale.test.ts` pins that a stale claim "is never auto-released", which is right as a default and wrong as the only option.

What the verbs are called and whether reopening a `dropped` Ticket differs from reopening a `resolved` one are open; both clear `answer_gist`/`dropped_reason`, and a reopen that silently discarded a written answer would be worse than the defect. Consider requiring a reason, the way `drop` does.

**Status:** ready-for-agent

- [ ] A `resolved` or `dropped` Ticket returns to `open`, and its `answer_gist`/`dropped_reason` are handled explicitly rather than left stale
- [ ] A claim is released without another agent having to take it
- [ ] Reopening a blocker puts every Ticket downstream of it back off the Frontier
- [ ] `status` is still not settable directly
