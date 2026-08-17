---
id: T53
title: What each pattern implies for minting, and what becomes of the guards
kind: decision
type: grilling
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: "Charting fused two independent questions: `<N>` decides whether minting needs coordination, and the presence of any random token decides whether identity survives a merge — so guards are kept for every pattern containing `<N>` (they were never actually deleted) while a mixed pattern like `T<N>-<b36{4}>` is cross-tree safe with only its counter racing; T38's write-refusal cannot substitute because the only path that is a pure function of the id is the guard itself, so \"make the write atomic\" reduces to reinventing it"
---

## Question

`<N>` is ruled in, so scan-derived minting survives, and with it the coordination problem T37
believed it had deleted. The markdown driver now needs **two** minting strategies:

- **derived** — the pattern contains `<N>`. Scan the pattern's own namespace, take the max, add one.
  Needs coordination, exactly as ADR 0005 describes.
- **random** — the pattern contains only random tokens. Generate; no scan is needed to *produce* a
  candidate, only to verify it.

The two collision problems are not the same and must not be answered together. **Cross-tree** — two
branches, two worktrees — is unsolvable locally under `<N>` and is accepted knowingly, with a
recommendation against it. **Same-tree** — two agent sessions in one checkout — is solved today by
ADR 0005's guards, which measured four processes creating three Tickets each producing thirteen files
carrying four distinct ids, silently. If `<N>` ships without that protection, a consumer choosing
`T<N>` gets worse behaviour than they have today, in the setup this product exists for.

There may be a cheaper answer than restoring the guards. **T38 already resolved that a write refuses
on a duplicate id.** If that refusal is atomic, a same-tree race ends in a clean refusal and a retry
rather than a silent duplicate, and no guard is needed. Whether it *can* be atomic is genuinely open:
detecting the duplicate needs a scan, and the race is between the scan and the write — which is the
reasoning that produced the guard in the first place.

## Acceptance criteria

- [x] Which minting strategy a pattern implies, and how the driver decides, is stated
- [x] Whether ADR 0005's guard machinery returns for derived patterns is decided
- [x] Whether T38's write-refusal can serve instead of a guard is answered, with the scan/write race
      addressed rather than assumed away
- [x] The cross-tree exposure of a derived pattern is stated in the terms a consumer is warned in
- [x] What this leaves of T37 is written down, since T37 stays resolved and is superseded rather than
      reopened

## Answer

**The strategy question is two questions, and charting fused them.**

- *Does minting need coordination?* Yes exactly when the pattern contains `<N>`, because a counter is the only token derived from what is already on disk.
- *Does identity survive a merge?* Yes exactly when the pattern contains at least one random token, because randomness is the only thing that makes two trees disagree without talking.

Those axes are independent, which the "derived versus random" framing hides. Crossing them gives three reachable configurations rather than two:

| Pattern | Coordination | Cross-tree identity |
| --- | --- | --- |
| `T<b36{6}>` — random only | None needed | Safe |
| `T<N>` — derived only | Guards | **Collides** |
| `T<N>-<b36{4}>` — mixed | Guards | Safe |

The third row is the interesting one and it was not on the map. A mixed pattern races only on its **counter**: two sessions both reaching `35` mint `T35-ab12` and `T35-cd34`, which are different ids. Identity is never at risk, and what degrades is the counter's meaning — the same way `NN` degrades, cosmetically. That makes it the best configuration available to a consumer who wants an id that reads like a number but branches like a random one, and [[T56]] should recommend it by name rather than leaving a consumer to choose between readable and safe.

**How the driver decides: statically, from the compiled pattern, once.** Both axes are properties of the token list, so there is no runtime branch and no per-call decision — the pattern compiles to a minting plan when it is read.

**A pattern containing `<N>` mints under guards even when it also contains a random token.** The randomness would technically carry uniqueness on its own, so the guard is not load-bearing for identity there. It is kept anyway, because a consumer who writes `<N>` into a pattern is asking for a counter, and silently handing out `35` twice is the same class of broken promise as handing out an id twice — merely cheaper to live with. The machinery is already built and already paid for, so declining to use it buys nothing.

## The guards stay, because they were never removed

[[T37]] resolved that ADR 0005's allocation machinery is *deleted outright*, but that deletion was never performed. All of it is still in the tree: `guardFor()` at `src/storage/markdown/create.ts:344`, the exclusive `wx` create in `hold()` at `:334`, the bump-on-collision recursion in `claim()` at `:289`, `release()` at `:280`, and `reserve()` at `:248` still doing scan → take every guard → **re-scan while holding them** → restart if any candidate turned up → hold across the whole write and release in a `finally`. `withIdReservations()` at `:98` wraps it, and `migrate_effort` mints through the same path (`src/storage/markdown/migrate.ts:41`).

So the decision is not to restore anything. It is to **not carry out the deletion**, which costs nothing at all — the branch that would have removed it simply never gets written. The Effort that owns that deletion is `frontier-ids`, and the map already records that it must not write its ADR until this one closes.

One consequence to hand to the build: with the default pattern random, the guard path stops being exercised by default. `test/cross-process-create.test.ts` is the only thing that has ever proved the guards work — four processes, three Tickets each, asserting every session succeeds and every id is distinct — and it must pin a derived pattern explicitly or it will quietly start testing the path that needs no guards. It also matches ids with `IN_FILENAME = /-(T\d+)-/` (`:59`), which is pattern-specific and breaks the moment the pattern moves. This matters more than it looks: **no CI runs the test suite at all** — `.github/workflows/release.yml` is the only workflow, is `workflow_dispatch`-only, and has no test job, while the pre-commit hook runs typecheck, lint and format only. A guard path that stops being exercised will not be noticed by anything.

## T38's write-refusal cannot serve instead, and the reason is structural

It fails twice, and the second failure is the one that closes the question.

**The race is in the wrong place.** A refusal has to detect the duplicate, detection needs a scan, and the window that produces a duplicate is precisely the one between that scan and the write. So the refusal catches duplicates that existed *before* it looked, and is blind to the only kind a race creates. This is the reasoning that produced the guard in the first place, and restating it does not weaken it.

**The write cannot be made atomic in the id, because its path is not a function of the id.** This is the part that settles it. The filesystem's only compare-and-set is exclusive create, which excludes two writers only when they derive the *same name*. A Ticket file is `<NN>-<id>-<slug>.md` inside an Effort directory (`create.ts:137`), so two sessions minting one id into different Efforts, or with different titles, write different paths and exclude nothing — ADR 0005 records exactly this, and repo-global identity is the case where racing writers most reliably disagree about the filename. Making the write atomic therefore requires an exclusive create on a path derived from the id **alone**, and that object already has a name: `.scratch/.frontier-id-<id>.guard`. **"Make the write atomic instead of holding a guard" reduces to reinventing the guard.** There is no cheaper answer here, only the same answer wearing different words.

**[[T38]] is still worth building, for a different job.** It is also not built — `indexById()` at `src/frontier.ts:17` still keeps the first id it sees, `collectWarnings()` (`src/tools/get-board.ts:150`) emits six warning classes and none of them is a duplicate id, and the write path resolves a handle by first match at `src/storage/markdown/driver.ts:576`. So there is nothing to lean on today even if the argument had held. What T38 catches is the duplicate that arrives by **merge**, which no guard can prevent because the two writers were never in the same tree. That is the complementary half:

> Guards prevent same-tree duplicates. T38 detects cross-tree ones. Neither substitutes for the other, and a derived pattern needs both.

## Cross-tree exposure, in the terms a consumer is warned in

Unsolvable locally, and accepted knowingly. The exposure belongs to patterns whose **only** variable token is `<N>`; a mixed pattern is exempt from it. Stated as [[T56]] would put it to a consumer:

> `T<N>` numbers your Tickets by counting the ones already in this working tree. A second branch counts the same tree and reaches the same number, and when the branches merge git will merge both files cleanly — their filenames differ by slug — leaving two Tickets answering to one id. FrontierMCP cannot prevent this. Git has no global allocator, which is why the default pattern is random rather than sequential. If you branch, put a random token in your pattern: `T<N>-<b36{4}>` keeps the number and cannot collide.

The duplicate surfaces after the merge, through [[T38]]'s read warning, and repair stays a human act on an unmerged branch — T38 already settled that nothing renumbers automatically, because renumbering cannot reach the commit messages and PR bodies that already name the id.

This is a real regression against today for a consumer who chooses it: [[T35]] moved to random ids specifically to engineer this failure away, and `<N>` opts back into it. That is the trade the map's standing preference permits — warn, never prevent — but the warning has to say *regression*, not *caveat*.

## What this leaves of T37

[[T37]] stays resolved and is superseded rather than reopened, the way a resolved Ticket records the route actually walked.

**What survives.** Its reasoning is still correct for the default pattern. `T<b36{6}>` needs no coordination to be unique, so if the default were the only pattern, deleting the machinery would be right. Nothing in this answer disputes that.

**What falls.** Only the universal form. Configurability makes the guard **conditional on the pattern** instead of dead — alive for `<N>`, unused for the default, and never reached by most consumers.

**What follows.** ADR 0005 is superseded by a new ADR rather than amended, stating the guard's condition; `frontier-ids` writes it once this map closes. [[T40]] opens on the premise that the guards are going, and that premise is now dead — it needs rewriting whichever Effort answers it, as the map records under its second fog patch.

## What the build inherits

- The random path needs candidate generation plus verification against the scan, with a bounded retry — short random tokens make collisions ordinary rather than astronomical, and `T<b36{1}>` is legal under [[T52]].
- `withIdReservations()` already short-circuits on `count === 0` (`create.ts:106`), so a random pattern can route through the existing signature without taking a guard. The conditional is smaller than it sounds.
- `CANDIDATE_HEADROOM` and the "No free Ticket id within 1000 of the highest in use" error (`create.ts:298`) are derived-only concepts, and the message names `.frontier-id-*.guard` files that a random pattern never creates. The random path needs its own limit and its own message.
- `peekMintedIds()` (`create.ts:118`) takes no guards because it serves `migrate_effort`'s preview, which is advisory. Under a random pattern a preview cannot predict what the real run will mint at all, and should say so rather than showing candidates it will not honour.
