---
id: T55
title: Whether a temporary key needs a sigil once the id space is wide
kind: decision
type: grilling
status: resolved
triage: ready-for-agent
blocked_by: [T52]
answer_gist: "No sigil — T36's rejection stands, because its premise survived T52 largely intact: refusing `<effort>` and requiring every pattern to begin with a literal leaves every legal predicate anchored and narrow, so the price sigils were rejected for was never paid; and a sigil separates keys from ids while T52 established that the surviving undetectable case is id-to-id, which a sigil cannot touch. The rule does not vary by pattern, and the only migration is the `key` schema description, which hardcodes `T<n>` and is wrong either way"
---

## Question

T36 considered requiring every temporary key to start with `@` — `@auth` — so that keys are
syntactically disjoint from any driver's ids by construction. It rejected the idea, and the recorded
reason is exact:

> It was rejected because it loses one case: an Edge reading `blah` carries no sigil, so the tool
> layer would have to accept it as an id that does not exist yet. Today `blah` is refused.

That argument holds while the id pattern is narrow. A wide configurable pattern loses **the same
check by the same mechanism** — under `<effort>-<N>` the typo `auth-1` is a well-formed id and is
accepted as dangling. So if a wide pattern ships, the price sigils were rejected for has already been
paid, and sigils would at least buy back disjointness: keys carry `@`, ids never do, and the pattern
can then be as wide as the consumer likes without eating key space.

T36 is not wrong. Its premise is what this Effort changes. The question is whether the trade it made
survives the change, and if sigils come back, whether they are mandatory, optional, or required only
for patterns above some ambiguity threshold — the third being the most tempting and the most likely
to produce a rule nobody can hold in their head.

A sigil is also a change to the **tool surface** rather than the driver: `create_tickets` takes
`key`, and its description tells the caller what a key may look like. Eight tools stay eight, but the
contract on one of them moves.

## Acceptance criteria

- [x] Whether temporary keys gain a required sigil is decided
- [x] If they do, the migration for callers is stated — the schema description, and whether an
      unsigiled key is refused or accepted with a warning
- [x] If they do not, what protects the typo case under a wide pattern is stated
- [x] Whether the answer varies by pattern is decided, and if it does, the rule is written in one
      sentence a caller can hold

## Answer

**No sigil. [[T36]]'s rejection stands, and it does not vary by pattern.**

## The premise did not survive T52

This Ticket rests on one claim: that a wide configurable pattern loses the same check sigils were rejected for losing, so the price is already paid. The worked example is `<effort>-<N>`, under which the typo `auth-1` is a well-formed id and is accepted as dangling.

**That pattern is illegal.** [[T52]] refused `<effort>` outright, and it went further in a way that matters more here: rule 3 requires every legal pattern to begin with a **literal character in `[A-Za-z_]`**. So there is no legal pattern without an anchored literal prefix, and every pattern compiles to a predicate of the same narrow family the tool layer tests against today:

| Pattern | Predicate | `blah` | `auth` | `parse` |
| --- | --- | --- | --- | --- |
| `T<b36{6}>` | `^T[0-9a-z]{6}$` | refused | refused | refused |
| `T<N>` | `^T\d+$` | refused | refused | refused |
| `AUTH-<N>` | `^AUTH-\d+$` | refused | refused | refused |
| `T<N>-<b36{4}>` | `^T\d+-[0-9a-z]{4}$` | refused | refused | refused |

The check T36 traded away is still there, for every pattern a consumer can legally write. The price was never paid, so there is nothing to buy back.

The empirical side agrees. Seven distinct temporary keys exist anywhere in this repo, all in tests. Six are bare lowercase words — `a`, `b`, `parse`, `render`, `left`, `right`, across `test/create-tickets.test.ts`, `test/cycles.test.ts` and `test/workspace-echo.test.ts` — and no legal pattern matches any of them.

The seventh is `T8` (`test/create-tickets.test.ts:176`), and it is the negative case: the test is named *'refuses a temporary key shaped like a real id'*. It is the one key in the repo that a legal pattern does match, it exists precisely to prove the collision is caught, and it is caught. That is the mechanism this answer relies on, already under test.

## Sigils solve the wrong ambiguity

This is the argument that would close the question even if the premise had held.

A sigil makes keys **syntactically disjoint from ids**. That is a real property, and it is the property T36 was weighing. But [[T52]] established that key/id confusion is not where the surviving risk lives. The three tiers a mistyped Edge falls into are: refused by the predicate, accepted as dangling and reported as a Board warning, or — the only undetectable one — **well-formed and resolving to a real but wrong Ticket**. That last tier is `T12` mistyped for `T13`. It is id-to-id. Both strings are ids under any reading, no sigil is missing from either, and a sigil rule changes nothing about it.

So sigils would move the contract on a tool to harden the ambiguity that is already handled, and leave untouched the one T52 identified as unfixable. That is the wrong end of the trade, and it is the same shape of misjudgement T36 avoided — spending a real interface cost for a check that was not the binding one.

## `@` is not free vocabulary

A smaller point, but it argues the same way. `@` is already the cross-Effort annotation separator in rendered Edges — `renderEdge` emits `T3@other-effort` when a blocker lives in another Effort (`src/tools/get-board.ts:138`). `#`, the other obvious candidate, is the handle separator in `<effort>#<order>` and is already the informal sigil for keyless drafts (`placeholderFor`, `src/tools/create-tickets.ts:211`). Taking either would put one character on both sides of the id/key line it was introduced to keep apart.

## What protects the typo case without a sigil

Four things, in the order a bad Edge meets them:

1. **`declaredKeys` refuses a key that matches the id pattern** (`src/tools/create-tickets.ts:134`). Under [[T36]]'s driver predicate this becomes pattern-aware, so the confusion cannot be created from the key side at all. Its message already reads "looks like a Ticket id" rather than naming a shape, so it needs no rewording.
2. **`checkEdges` refuses anything that is neither a declared key nor predicate-matching** (`:162`). This is the check under discussion, and per the table above it keeps its strength for every legal pattern.
3. **A dangling Edge is reported**, grouped, on every Board — `collectWarnings` emits it as its first warning class (`src/tools/get-board.ts:150`). A typo that clears the predicate but names nothing is visible, not silent.
4. **The residual is a pathological pattern**, not a wide one. To swallow a plausible key a pattern must be short, weakly anchored and match a word — `a<b36{3}>` matches `auth`. Nothing stops a consumer writing that, and [[T56]] owns whether it is worth saying so. It is bounded by construction: the literal prefix has to *be* the start of the key it swallows.

## The rule, in one sentence

It does not vary by pattern, which is the point — a threshold rule would be the one outcome nobody could hold in their head.

> A temporary key is any name that is not one of this repo's Ticket ids; if it collides with the id pattern, `create_tickets` refuses it and names it, and you rename the key.

## What still has to change

Sigils are refused, but this Ticket is not free — one caller-visible string is wrong either way.

**The `key` schema description hardcodes the id shape.** `src/tools/create-tickets.ts:25` reads: `'Your own temporary name for this Ticket, so siblings can declare Edges on it before it has an id. Never stored. May not look like T<n>.'` The last sentence becomes false in any repo that sets a pattern, and it is the only place the tool surface states an id format to callers. It must become pattern-neutral — naming the constraint rather than the shape, and pointing at `id_pattern` where [[T54]] put it. This is the whole of the migration, and it lands whichever way this Ticket had gone.

**Keys keep having no character validation**, and that stays deliberate. A key is non-empty, not id-shaped, and not duplicated within the call — nothing else. Keys are never written to disk, never serialized, and live only for the length of one call, so no filesystem or round-trip constraint reaches them. Adding a character class now would be scope this Ticket did not earn.

One consequence worth recording: because `@` is not in [[T52]]'s legal literal alphabet, an `@`-prefixed string can never be an id under any legal pattern. **The sigil therefore remains available as a convention without being a rule** — a consumer or an agent that prefers `@auth` may adopt it unilaterally and it will always be safe. What is refused is mandating it.

**Vocabulary debt, again.** [[T36]] recorded that `CONTEXT.md` has no term for a draft's temporary key, and `frontier-ids` [[T50]] carries it as an open acceptance criterion. This Ticket adds nothing to that debt but confirms it is still owed — the sentence above is unwritable in the domain language as it stands.
