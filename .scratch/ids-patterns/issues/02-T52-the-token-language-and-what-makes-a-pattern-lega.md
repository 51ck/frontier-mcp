---
id: T52
title: The token language and what makes a pattern legal
kind: decision
type: grilling
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: Four tokens — `<N>`, `<b36{n}>`, `<b16{n}>` and literals; `<effort>` is refused because identity may not derive from an unvalidated directory name the product ships a tool to change, which dissolves the unknown-slug question; legality is split into parseability rules, filesystem rules that come from outside the repo, and no ambiguity rules at all — the plausible-key loss is recorded deliberately as a density problem, not a width one
---

## Question

Which tokens exist, and which patterns does the product refuse to accept?

The candidate set from charting: `<N>` (the next number within the pattern's own namespace),
`<b36{n}>` and `<b16{n}>` (random strings of a given length), `<effort>` (the Effort slug), and
literal characters. `<commit>` and anything else derived from git state is ruled out of scope.

Proposed legality rules, also from charting: no leading `<N>`, at most one `<N>` per pattern, and
filename-safe characters only — the id appears in `<NN>-<id>-<slug>.md`, so a pattern that cannot be
put in a filename is not a pattern.

Two hard parts those rules do not reach.

**`<effort>` derives identity from something that renames.** An Effort slug is a directory name. Move
a Ticket between Efforts, or rename an Effort, and the id either lies or changes — and *never
changed* is what commit messages, cross-Effort Edges and every prose reference stand on. `<effort>`
also forces `<N>` to count per Effort, which contradicts `docs/agents/issue-tracker.md`'s statement
that ids do not restart per Effort. Does `<effort>` survive at all, and if it does, what happens on
rename?

**The ambiguity budget.** `src/tools/create-tickets.ts:162` sorts every Edge into a declared key, an
id on disk, a well-formed id that does not exist yet (allowed — dangling Edges are Board warnings by
design), or a typo (refused). The fourth bucket only survives while the id pattern is narrow. Under
`T<b36{6}>` a typo'd key `auth-iu` matches nothing and is refused. Under `<effort>-<N>` in an Effort
named `auth`, the typo `auth-1` **is** a well-formed id and is silently accepted as dangling. A wide
pattern converts caught typos into silent dangling Edges.

The predicate ruling — current pattern plus the on-disk id set, no history — sharpens this for
`<effort>-<N>` specifically: is `frontier-v1-3` well-formed in a tree holding no `frontier-v1`
Effort? Accept any slug-shaped prefix and the pattern swallows more key space; accept only known
slugs and Edges into unmerged Efforts are refused.

## Acceptance criteria

- [x] The token set is fixed, each token with its meaning
- [x] Whether `<effort>` survives is decided, and if it does, the rename and cross-Effort-move cases
      are answered
- [x] The legality rules are stated, and it is said which of them exist for parseability and which
      for ambiguity
- [x] How much plausible-key space a pattern may swallow is decided, or the loss is recorded
      deliberately
- [x] For a pattern containing `<effort>`, whether an unknown slug is well-formed is decided

## Answer

**The token set is four things: `<N>`, `<b36{n}>`, `<b16{n}>`, and literal characters.**

| Token | Meaning |
| --- | --- |
| `<N>` | The next unused number in the **repo-global** namespace. Derived by scan, exactly as `highestMinted()` derives one today (`src/storage/markdown/create.ts:362`). |
| `<b36{n}>` | `n` characters drawn at random from `[0-9a-z]`. |
| `<b16{n}>` | `n` characters drawn at random from `[0-9a-f]`. |
| literals | Any character in the legal literal alphabet below, contributing no variability. |

`<b16{n}>` is kept even though base36 carries more entropy per character, because the space it reaches is what matters and not the per-character rate: `0x<b16{8}>` gives 4.3 billion against `T<b36{6}>`'s 2.2 billion. It costs one alphabet constant to support.

`<N>` has exactly one namespace now, the repo, because the only token that could have subdivided it is refused below. `highestMinted()` already contributes nothing for an id that does not match the pattern, which is how ids minted under an earlier pattern, and ids preserved verbatim through migration, stay harmless rather than poisoning the counter.

**`<effort>` does not survive.** Three arguments, each sufficient on its own.

*It derives identity from something the product ships a tool to change.* `migrate_effort` moves Tickets between Efforts and is a first-class tool, not a hypothetical — so "the id lies, or the id changes" is a supported workflow rather than an edge case. Renaming an Effort directory is likewise a `mv`. Under [[T36]] the domain keeps exactly one contract for an id — opaque, repo-unique, never reused, **never changed** — and `<effort>` is the only proposed token that cannot honour it.

*An Effort slug is not a validated string.* It arrives as a bare `z.string()` with no `.min(1)` (`src/tools/create-tickets.ts:9`, and the same in every other tool taking one), is used directly as a path segment (`src/storage/markdown/driver.ts:242`), and is read back as nothing more than a directory name (`driver.ts:761`). Its legal alphabet is therefore "whatever the filesystem accepted". Meanwhile the id is interpolated **raw** into both the Ticket filename (`create.ts:137`) and the guard path (`create.ts:351`), with no sanitising anywhere — `slugify()` cleans the title half and nothing cleans the id half. Pattern legality is the *only* filter standing between a token and two filesystem paths. Routing an unvalidated string through it defeats every rule stated below.

*It re-couples location to identity.* [[T35]] rejected a ULID-style sortable prefix because ordering already lives in `NN` and "position in the filename, identity in the id" is a deliberate split. `<effort>` makes the same mistake on the other axis: it puts *where a Ticket lives* inside *what a Ticket is called*. The precedent is ours and it points one way.

And it contradicts a claim the product ships. `docs/agents/issue-tracker.md:104` states that ids **do not restart per Effort**; that file is served as `frontier://tracker-doc` and shipped in the npm tarball (`package.json:13`). `<effort>` forces `<N>` to count per Effort and makes the vendored doc false for the repo reading it.

**What a consumer loses, and what they get instead.** The shape being asked for is Jira's `AUTH-1`, and it remains reachable as a literal: `AUTH-<N>` is legal. What is not on offer is a prefix that *varies by Effort*. That is not a consolation prize but the only coherent answer, because the pattern is repo-level wherever [[T54]] lands it — every candidate location there has repo lifetime or worse — so a token varying per Effort would be a per-Effort setting read out of a repo-level file.

Hosted trackers can offer this because a project-key rename is a server-side operation that rewrites every reference transactionally. That is the asymmetry [[T51]] was dropped for. We have no server and no rewrite, so we cannot sell the feature that makes it safe.

**The unknown-slug question is dissolved, not answered.** Whether `frontier-v1-3` is well-formed in a tree holding no `frontier-v1` Effort was a question only about a pattern containing `<effort>`. No such pattern is legal, so the case cannot arise and the predicate never needs to know which slugs exist. This is recorded as removed rather than decided — if `<effort>` is ever revisited, the question comes back with it.

## Legality rules

They fall into three groups, and the split matters because only the first is ours to negotiate.

**Parseability — the pattern must compile, and the id must survive a round trip.**

1. *A pattern must contain at least one variable token.* All-literal patterns mint one id forever.
2. *At most one `<N>`.* With two, "the next number" is undefined and no scan can decompose an id back into its fields.
3. *An id may not begin with `<N>`; the first character must be a literal in `[A-Za-z_]`.* The reason is stronger than the one charting recorded. [[ADR 0003]] parses frontmatter as a real YAML document via `parseDocument` and preserves scalar style, so a bare-numeric id is a YAML **integer** — `id: 3` and `blocked_by: [3]` deserialise as numbers, not strings, and the round trip that ADR exists to protect is exactly where it shows. The general rule is *an id must never be a YAML-ambiguous scalar*, which also catches `true`, `null`, `yes`, `1e5` and `0x10`; requiring a leading alphabetic or underscore character is the cheap enforcement that implies all of them. This is also what keeps an id visibly an id rather than a sort position, which is what `MINTED_ID`'s comment already claims the `T` is for.
4. *A minted id is at most 64 characters.* The filesystem allows about 200 here — `<NN>-<id>-<slug>.md` spends 55 bytes around the id and `NAME_MAX` is 255 — so 64 is not the binding constraint. Legibility is: an id is copied into commit messages, PR bodies and prose, and nothing legitimate needs more.

**Filesystem — these come from outside the repo, and exist for neither parseability nor ambiguity.**

5. *Literals are restricted to `[A-Za-z0-9._-]`, the POSIX portable filename set.* This is the rule that does not depend on whether Windows is supported, because it is the intersection of all three platforms rather than a bet on one. It excludes `<>:"/\|?*` as a side effect, which is most of what a consumer would reach for as a separator, and leaves `-`, `_` and `.` — which is enough.
6. *Whole-name filesystem hazards are structurally unreachable and need no rule.* The id is never a basename; it is always embedded as `<NN>-<id>-<slug>.md`. So `CON`, `NUL`, `AUX`, `PRN`, `COM1`–`COM9` and `LPT1`–`LPT9` are not reserved in the position the id occupies, and Windows' trailing-dot-and-space stripping cannot bite because the id is always followed by `-<slug>.md`. The one place the id *is* nearly a whole name is the guard, `.frontier-id-<id>.guard` (`create.ts:351`), and the affix there saves it the same way.
7. *Case collisions are impossible by construction, so uppercase literals stay legal.* [[T35]] forced lowercase base36 because APFS folds case. That constraint lands on the **token alphabets**, not on the pattern: `<b36>` and `<b16>` are defined lowercase-only and `<N>` is digits, while literals are by definition identical in every id the pattern mints. No two ids from one pattern can therefore differ only by case. `AUTH-<N>` is safe on APFS for the same reason it is safe anywhere.

This is worth stating because it is the one place the product is exposed with no net: there is **no CI running the test suite at all**. `.github/workflows/release.yml` is the only workflow, is `workflow_dispatch`-only, and has no test job; the pre-commit hook runs typecheck, lint and format, not tests. The charting comment supposed a case collision would pass CI and fail on macOS. It is worse than that — it would pass everything, everywhere, until a developer hit it by hand. Rule 7 is what makes that unreachable, so it must hold by construction rather than by test.

**Ambiguity — no rules.** Deliberately none. The reasoning is below.

## The ambiguity budget

**Not capped. The loss is recorded, and it is a density problem rather than a width one.**

The charting framing was that a wide pattern converts caught typos into silent dangling Edges. That is both too kind and too harsh, and getting it right changes what a consumer needs warning about.

`checkEdges` (`src/tools/create-tickets.ts:162`) accepts an Edge on `keys.has(edge) || ids.has(edge) || MINTED_ID.test(edge)` and throws otherwise. Under [[T36]] that last test becomes the driver's predicate, compiled from the pattern. A mistyped Edge then lands in one of three places:

- **Refused.** The typo does not satisfy the predicate. `checkEdges` throws and names the declared keys.
- **Accepted as dangling.** The typo satisfies the predicate but no Ticket holds it. This is *not* silent — `collectWarnings` (`src/tools/get-board.ts:150`) already emits dangling Edges as one of its warning classes. The failure is deferred from write time to Board time and softened, not lost.
- **Accepted as a correct-looking Edge to the wrong Ticket.** The typo satisfies the predicate *and* some other Ticket holds it. Nothing warns, because nothing is wrong: it is a well-formed Edge to a real Ticket. This case is undetectable by any mechanism, now or later.

The third tier is the only real loss, and which tier a typo falls into is governed by **occupancy** — how much of the id space is actually taken — not by how wide the pattern is:

- `T<N>` has occupancy ~1.0 by construction. Every neighbour of a live id is itself live, so `T12` mistyped for `T13` is well-formed *and* resolves. Sequential ids maximise the undetectable tier.
- `T<b36{6}>` at 34 Tickets has occupancy ~1.6 × 10⁻⁸. A typo lands in empty space and surfaces as a Board warning.

So the warning a consumer needs is not "your pattern is wide". It is: **a dense pattern turns single-character typos into Edges pointing at the wrong Ticket, with no diagnostic possible** — and density is a property of `<N>` specifically. A pattern is dense exactly when its space is comparable to the Ticket count it will hold, which the product can compute from the pattern alone and hand to [[T56]] as the trigger.

No legality rule is spent on this. It fails the map's standing preference — warn, never prevent — and any threshold would be arbitrary in a way the density statement is not. A consumer who wants `T<N>` and its readable ids may have them, having been told what they cost.

**One thing the build inherits.** [[T35]] widened the id alphabet and noted that doing so widens the set of key names forbidden for looking like ids; a configurable pattern makes that set move per repo. `create_tickets`' schema still hardcodes the old shape in prose — `'... Never stored. May not look like T<n>.'` (`src/tools/create-tickets.ts:24`) — and `MINTED_ID` is still `/^T(\d+)$/` in `src/domain.ts:18`, read directly above the storage seam at two call sites, with the driver predicate [[T36]] specified but unbuilt. Every rule above lands on that predicate. Nothing here is implementable until it exists, which makes it the first Ticket of the handoff.

## Comments

Inherited from T51 when it was dropped. "Filename-safe" is doing more work than it looks, and it is the one constraint here that comes from outside the repo rather than from our own design.

The id appears in `<NN>-<id>-<slug>.md`, and three filesystems are in play with no test covering the difference. **APFS is case-insensitive** — T35 already hit this and forced base36 lowercase, but a pattern mixing cases could mint `Tab7` and `TAb7` as distinct ids that collide as filenames on the developer's own machine. CI runs ubuntu only, so a case collision would pass every check and fail on macOS. `package.json` declares no `os`, so the package nominally installs on **Windows**, where `CON`, `NUL`, `AUX`, `PRN` and `COM1`-`COM9` are reserved names regardless of extension, and `<>:"/\|?*` are illegal — several of which are natural literal separators for a pattern.

Whether Windows is actually supported is a product question this map does not own. What T52 owes is a rule that does not silently depend on the answer.
