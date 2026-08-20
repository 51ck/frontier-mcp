---
id: T58
title: "Whether a handle separates with # or @"
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: [T50]
---

## Question

A handle is `<effort>#<order>` — `handleFor` at `src/storage/markdown/ticket.ts:106-108`, `${effort}#${String(order)}`. T50 ratified that form into `CONTEXT.md` without arguing for it, because the form predates the Effort and nothing had put it in question. This Ticket puts it in question.

The case for `<order>@<effort>` is consistency. `@` is already the cross-Effort annotation in a rendered Edge: `renderEdge` emits `T3@other-effort` when a blocker lives in another Effort (`src/tools/get-board.ts:138`). Two forms that both mean "this thing, over in that Effort" spelled with two different characters is a rule a reader has to learn twice.

The case against is that the two forms only look alike. In the Edge annotation `@other-effort` decorates something already unique — strip it and `T3` still resolves repo-wide, which is exactly why `renderEdge` adds it for foreign blockers and omits it for local ones. In a handle the Effort is required: strip it and `5` resolves to nothing, and no version of the handle omits it. One part is droppable, the other is load-bearing. Reusing the character may teach a rule that is false half the time.

Leading with the Effort also groups handles under `sort` and `grep`, which is how T40's preview block reads. `5@auth` opens with a number that means nothing until the reader is past the separator.

`@` is genuinely unclaimed as *input*. It appears in exactly one place in the codebase, `get-board.ts:138`, and nothing parses it. `#` by contrast is claimed twice — the handle separator, and the informal stand-in `placeholderFor` stamps on a keyless draft as `#0`, `#1` (`src/tools/create-tickets.ts:210-214`). T55 cited that overload as one reason `#` could not become a key sigil, and then refused sigils outright, so freeing `#` buys nothing that anything is waiting for.

The change is caller-visible and touches more than one line: `handleFor`, the id-or-handle lookup at `src/storage/markdown/driver.ts:577-578`, `withUniqueHandles` and its `.2` suffix (`driver.ts:700-717`), the `get_tickets` description that names the form to callers (`src/tools/get-tickets.ts:11`), and T40's `migrate_effort --preview` report. Pre-1.0 permits it (`README.md:8-13`); that is a licence, not a reason.

One adjacent defect for whoever touches the preview: T40's worked example prints handles zero-padded as `ship-0-5-0#01`, but `handleFor` emits no padding — the filename pads (`pad`, `src/storage/markdown/create.ts:379-380`), the handle does not. A builder following that example renders a handle nothing resolves. It wants correcting whichever way this Ticket goes.

## Acceptance criteria

- [ ] The separator is decided, with the argument from `@`'s existing meaning in `renderEdge` either answered or accepted
- [ ] If it changes, every caller-visible surface that states the form is listed for the build
- [ ] Whether the `.2` collision suffix survives the chosen form is stated
- [ ] `CONTEXT.md`'s **Handle** entry is left correct, or its replacement wording is quoted
