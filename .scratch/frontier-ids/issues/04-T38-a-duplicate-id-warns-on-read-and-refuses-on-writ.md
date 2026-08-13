---
id: T38
title: A duplicate id warns on read and refuses on write
kind: decision
type: grilling
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: Split by direction — reads warn and show every claimant, writes refuse and name both files; nothing repairs a duplicate automatically, and the CI repair tool is ruled out of scope because the format change removes the case it was for
---

## Question

`src/frontier.ts:23` keeps the first id it sees and drops the rest, so a duplicate makes one Ticket
silently stop answering to its own id — `blocked_by` and `get_tickets` resolve to whichever file the
scan reached first. Nothing reports it.

What should FrontierMCP do when it finds two Tickets carrying one id? And is repair the product's
job at all, or a human's?

## Acceptance criteria

- [x] The behaviour of each read tool on a duplicate is decided
- [x] The behaviour of each write tool on a duplicate is decided
- [x] Whether anything repairs a duplicate automatically is settled
- [x] The eight-tool contract is not broken by the answer

## Answer

**Reads warn. Writes refuse.**

A tree carrying a duplicate is exactly the tree you most need to look at, so refusing to render the Board is the worst possible moment to refuse. But `update_ticket` addressed to an ambiguous id cannot know which of two files the caller means, and picking one silently is how a duplicate turns into two Tickets with diverged content.

- `get_board` reports it through the existing grouped warnings channel (`src/tools/get-board.ts:145`), alongside dangling Edges. No new surface.
- `get_tickets` returns every claimant and says there is more than one.
- Any **mutation** addressed to a duplicated id fails, naming both filenames so a human can act.

**This is a defect today, independent of the format change.** `src/frontier.ts:23` keeps the first id the scan reaches and drops the rest, so one of the two Tickets silently stops answering to its own id — `blocked_by: [T35]` and `get_tickets(["T35"])` both resolve to whichever file the scan hit first, with no error anywhere. The real `T33` collision on 2026-08-13 was caught by eye, not by the product. Worth fixing on its own merits.

**Nothing repairs automatically.** Renumbering would have to rewrite the id, every `blocked_by` naming it, and every prose mention — and it cannot reach the commit messages and PR bodies that already name it. Repair stays a human act, on an unmerged branch, where the id was never public.

**Out of scope: a CI merge-repair tool.** It was proposed while cross-branch collisions were an expected merge outcome. Under [[T35]] they are not, so a repair path would be built for a case that has been engineered away. What actually still collides across branches is the `NN` file number, and `NN` is cosmetic by contract — duplicates there are harmless sort ties.

The eight-tool contract is untouched: every part of this answer lands on tools that already exist.
