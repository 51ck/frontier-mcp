---
id: T58
title: "Whether a handle separates with # or @"
kind: decision
type: grilling
status: resolved
triage: ready-for-agent
blocked_by: [T50]
answer_gist: "The separator stays `#`, but two of this Ticket's three arguments fail — grouping is void because `migrate_effort` is single-Effort and prints the slug on its header line, and \"freeing `#` buys nothing\" is symmetric — so the ruling rests on the asymmetry argument, made concrete by the prior decision to reject `<id>@<effort>` as input and teach it through `NoSuchTicket`: the product will now state that `@<effort>` is droppable decoration, which a handle with a mandatory `@` half would contradict; `/` was weighed and rejected for resembling a path it is not; `.2` survives with a wrong comment and no test to fix, `placeholderFor` moves to `draft 1` so `#` has one sense, the order of a prefix-less Ticket is unstable and the entry says so, and T78 takes the Edge on this Ticket it was missing"
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

- [x] The separator is decided, with the argument from `@`'s existing meaning in `renderEdge` either answered or accepted
- [x] If it changes, every caller-visible surface that states the form is listed for the build
- [x] Whether the `.2` collision suffix survives the chosen form is stated
- [x] `CONTEXT.md`'s **Handle** entry is left correct, or its replacement wording is quoted

## Answer

**The separator stays `#`.** Two of the three arguments this Ticket made for that conclusion do not survive, so the ruling rests on a different one.

## What fails in the Question's own case

**The `sort`/`grep` grouping argument is void.** `migrate_effort` takes a single `effort` slug (`src/tools/migrate-effort.ts:6`), and `renderMigration` prints that slug as the report's first line (`:30`). The preview is the only place handles appear in bulk, and every handle in it repeats a name already on screen one line above, identical to every sibling up to the separator. Grouping cannot pay on a set already grouped by construction. Within that block the varying half is the order, and effort-first buries it — `01@ship-0-5-0, 02@ship-0-5-0` scans better than `ship-0-5-0#01, ship-0-5-0#02`, the reverse of what the Question claims.

**"Freeing `#` buys nothing" settles nothing**, because it is symmetric: spending `@` costs nothing either. Both halves are true and they cancel.

**What survives is the asymmetry argument**, and it is now more than an argument — see below.

## `<id>@<effort>` is rejected as input, and the error teaches why

A prior question had to settle first: the Question asserts `@` is "genuinely unclaimed as *input*". True today, but that is a fact about current code, not a decision — and the whole `#`-versus-`@` case rests on it.

Nothing parses either character. `locate` compares string equality against `ticket.id` and `ticket.handle` (`src/storage/markdown/driver.ts:577-578`). So pasting the Board's own `T62@frontier-ids` into a call fails: `get_tickets` renders `not found: T62@frontier-ids`, `update_ticket` throws `No Ticket 'T62@frontier-ids' in this workspace.` and writes nothing.

**Accepting it was weighed and rejected.** Three costs:

1. **Four edit sites, not one.** Name resolution is hand-rolled in four places that share no helper — `driver.ts:577-578` (`locate`, write path), `driver.ts:644-646` (`readBodies`), `src/tools/get-tickets.ts:28-31` (`byName`), `src/server.ts:266`. That is the four-copies shape [[T50]] named as the mechanism that let `T<n>` rot unowned.
2. **It falsifies a sentence this Effort just wrote.** [[T50]]'s replacement `AGENTS.md` bullet reads "there is no compound cross-Effort reference form." Accepting the form creates one.
3. **The qualifier carries no resolving power, so accepting it forces a bad choice.** Strip `@other-effort` and the id still resolves repo-wide — the Question says so itself. So `update_ticket(id: "T62@frontier-launch")`, where T62 lives in `frontier-ids`, has two possible behaviours and both are worse than rejection: strip and match on the id, and the form silently accepts a lie on the write path; or verify the effort half, and you have built a checksum over a value that needs no checking, plus a second error message. There is no third answer.

A fourth cost, less certain: [[T50]] defines a Temporary key as any name that is not one of this repo's ids, and [[T36]] puts that predicate in the driver. `T62@frontier-ids` is a legal key today; accepting it as an id-form makes it ambiguous. That predicate does not exist yet — no `looksLikeId` or `id_pattern` anywhere in `src/` — so the decision would bind a seam before [[T66]] builds it.

**The ruling: reject it, and teach it.** `NoSuchTicket` (`src/storage/driver.ts:205-206`) recognizes a pasted `<id>@<effort>` and names the bare id back. One error branch. It closes the loop — `renderEdge` emits the annotation precisely so a foreign blocker stays followable, and today the obvious follow-up call rejects the string the Board printed — without making `@` an input character.

Measured on this repo, not a fixture: **8 foreign Edges out of 66**, and the annotation surfaces in exactly one place. `renderEdge` lives only in `get-board.ts`; `get_tickets` prints `blocked_by=` as bare ids (`get-tickets.ts:53`). The papercut hits Board readers, on an eighth of Edges, non-destructively.

## Why that decides the separator

Rejecting the form means the product now states, in its own error string, that `@<effort>` is droppable decoration. That is a caller-visible teaching. A handle spelled `01@ship-0-5-0` would use the same character for a half that is mandatory and unstrippable — contradicting a message the server prints, on the same class of path where it is read.

**That is the asymmetry argument made concrete, and it is the whole basis of the ruling.** The Question had it as a claim about roles. It is now a contradiction the product would ship.

## `/` was weighed

The Question framed this as a two-way fork it did not have to be. `/` answers the objections that killed `@`: unclaimed as input, and unambiguous *by construction* — `/` is the directory separator, so no Effort slug can contain one, a stronger guarantee than `#` has. It groups identically. It reads as an address, which is what a handle is.

**Rejected because it resembles a path it is not.** `ship-0-5-0/01` looks enough like `.scratch/ship-0-5-0/issues/01-….md` to invite completion into one, or to be passed where a path is wanted — a new wrong-thing-to-try on exactly the failure path the paragraph above just closed. `#` resembles nothing else in the system, which for an address form is a virtue.

On a blank sheet `/` is the better character. This is not a blank sheet, and what remains of its margin does not buy a caller-visible break that delivers no new capability.

## The `.2` suffix survives; two defects around it do not

**It survives unchanged.** Strip it and one Ticket becomes unfetchable, defeating the concept. The alternative that removes collisions by construction — always use listing position, ignore `NN-` — costs more than it saves, because matching the filename number is what makes a handle guessable from a directory listing.

Two defects found in the reading:

- **Its comment names the wrong cause.** `withUniqueHandles` says "Two files can share an `NN-` prefix" (`driver.ts:698-699`). That is the narrower source. A file with no `NN-` prefix takes `position + 1` (`driver.ts:687`), so a prefix-less file at position 3 collides with `03-foo.md`. Two prefix-less files can never collide with each other.
- **It is untested.** `withUniqueHandles` appears twice in the repo, both in `driver.ts`; nothing in `test/` exercises a collision. The single property that makes a handle usable is unpinned.

## The `#` overload with `placeholderFor` is fixed, not accepted

The Question cites the overload as a reason `#` could not become a key sigil, then keeps `#` — which makes the overload permanent rather than transitional. `placeholderFor` emits `#0`, `#1` (`src/tools/create-tickets.ts:91`, `:211`) into cycle and Edge errors, and `#0` reads as a handle with an empty Effort. An agent trying `get_tickets(["#1"])` gets `not found: #1` — the same dead end just closed for `@`.

**The placeholder form becomes `draft 1`, one-based.** It touches one function and the error strings carrying it; no caller passes these names, the server invents them. It also fixes the off-by-one that makes the first draft `#0` while every order counts from 1. `#` is then unambiguously the handle separator and nothing else.

## The `CONTEXT.md` entry

Replacing the **Handle** wording [[T50]] quoted:

> **Handle**:
> How you name a Ticket in a call — the id when it has one, otherwise `<effort>#<order>`, which is all
> a Ticket without an id has until minting gives it one. `<order>` is the number the `NN` filename
> prefix carries, written unpadded — `ship-0-5-0#1`, never `#01` — or the Ticket's position in the
> Effort when it has no prefix, counting from 1; that position moves when a sibling is added or
> removed. Two Tickets landing on one order are separated by a `.2`, `.3` suffix so every Ticket stays
> addressable. An addressing form, never an identity: nothing is stored under a handle, and a Ticket's
> handle changes the moment it gets an id.
> _Avoid_: id (a handle is usually one, but they are not the same thing), name, reference

**It drops "Legacy" rather than translating it to Foreign.** [[T57]] made Foreign a conformance predicate, and a Ticket can conform and still be unminted — T57 narrows `migrate_effort` to exactly that batch. "A Ticket without an id" is the true condition and needs no further edit when [[T77]] lands.

**The unpadded clause is the fix for a live defect.** [[T50]]'s wording said `<order>` is "the `NN` filename prefix", which reads as `01`; [[T40]]'s worked example prints `ship-0-5-0#01`. `handleFor` emits no padding (`src/storage/markdown/ticket.ts:106-108`) — the filename pads (`pad`, `src/storage/markdown/create.ts:379-380`), the handle does not. Padding was rejected: `readOrder` returns `Number(match[1])`, unpadded by construction, and a Ticket with no prefix takes a listing position that has no padding to inherit — so padding would have to be *invented* for exactly the Tickets with no filename number to copy.

**The instability clause is new and load-bearing.** A prefix-less Ticket's order is its position in the listing, which moves when a sibling is added or removed — and that also decides which of two colliding Tickets takes the `.2`. It is the strongest evidence for the sentence the entry already leads on.

One consequence outside this entry: [[T50]]'s **Temporary key** entry avoid-lists "handle (that is a Legacy Ticket's)". Same defect, same fix — "that is an unminted Ticket's".

[[T50]]'s **Edge** entry needs no change. It was written to name the annotation without naming its character, and that holds.

## Surfaces for the build

Nothing changes in `handleFor` (`ticket.ts:106-108`) or `locate`'s comment (`driver.ts:571`) — the form is unchanged. What rides along:

| surface | change | home |
| --- | --- | --- |
| `src/storage/driver.ts:205-206` | `NoSuchTicket` recognizes a pasted `<id>@<effort>` and names the bare id back | [[T77]] |
| `src/tools/create-tickets.ts:210-214` | `placeholderFor` emits `draft 1`, one-based | [[T77]] |
| `src/storage/markdown/driver.ts:698-699` | comment names the wrong collision cause | [[T77]] |
| `test/` | first test for `withUniqueHandles` | [[T77]] |
| `src/domain.ts:42-44`, `src/tools/get-tickets.ts:11`, `src/tools/update-ticket.ts:10`, `src/storage/driver.ts:91` | the Legacy wording in the handle strings | [[T77]] |
| `CONTEXT.md` | **Handle** as above; **Temporary key**'s avoid-line | [[T78]] |
| [[T40]]'s preview example | `ship-0-5-0#01` becomes `ship-0-5-0#1` | [[T69]] |

## A graph correction

[[T78]] carries `blocked_by: []` while owning the **Handle** entry this Ticket decides. It takes an Edge on this Ticket.
