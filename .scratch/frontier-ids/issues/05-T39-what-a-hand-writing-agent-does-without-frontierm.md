---
id: T39
title: What a hand-writing agent does without FrontierMCP
kind: decision
type: grilling
status: resolved
triage: ready-for-agent
blocked_by: [T35]
answer_gist: "The preamble survives but on a different argument: it is about precedence, not danger — the field observation pinned in test/ship.test.ts:134 is an agent *with* the server scanning by hand, which no id format touches — while its stated collision justification is now conditional on the pattern, its guard filename is wrong for mixed patterns, and its \"guessed id passed to create_tickets\" sentence describes no code path at all; the scan instruction (which lives in the Layout bullet, not Hand publish) becomes read `id_pattern` from `.scratch/frontier.yml`, then branch — generate without scanning when the pattern has no `<N>`, scan-and-increment when it does, warning there that a hand-writer cannot take the guard; stale copies are accepted rather than mitigated because there is no vendoring mechanism at all and a pinned consumer's served doc goes stale the same way — the vendored copy being the worse of the two, since it alone has no update path — an exposure already disclosed in README's pre-1.0 notice, with a version marker in the doc offered as the one mitigation that reaches a reader who cannot tell their copy is old"
---

## Question

`docs/agents/issue-tracker.md` is canonical whether the server is loaded or not, is served as MCP
resource `frontier://tracker-doc`, and is **vendored into other repositories**. Its Hand-publish
section tells an agent without the server to "scan every `.scratch/*/issues/` for the highest
existing `T` number and continue from there".

Uncoordinated ids make that instruction wrong. What replaces it? An agent can generate six random
base36 characters, but the doc's whole preamble argues that hand-allocating an id is the mistake —
and under the new scheme hand-allocation is suddenly *safe*, which weakens an argument the doc leans
on hard.

A vendored copy also means old copies stay in the wild giving the old instruction. Ids minted the old
way remain valid, so this may cost nothing — but it needs saying rather than assuming.

## Acceptance criteria

- [x] The replacement Hand-publish instruction is written
- [x] Whether the "never hand-allocate" preamble survives is decided
- [x] The effect of stale vendored copies is stated, and accepted or mitigated

## Answer

**The preamble survives, on a different argument than the one it makes. The scan instruction is replaced by a read of `frontier.yml` and a branch on whether the pattern contains `<N>`. Stale copies are accepted, because the exposure is not vendoring's and cannot be reached from here.**

## The preamble survives, and the Ticket asked the question the wrong way round

This Ticket frames the preamble as resting on collision risk, so that [[T35]] removing the risk removes the argument. That reading is what the wording invites, and it is not what the preamble is for.

**The prohibition is about precedence, not danger.** Read at what it aims: an agent that **has** the server and derives an id anyway. For that agent, hand-allocation is not risky-but-tempting — it is redundant, because `create_tickets` is right there. Whether the derived id would have collided is beside the point; the mint exists and was bypassed.

The fact this rests on is recorded rather than supposed, in the test that pins this paragraph (`test/ship.test.ts:134-135`):

> Observed in the field: an agent with the server loaded scanned for the highest `T<n>` itself, the naive `max + 1` ADR 0005 measured.

**An agent with the server loaded.** The failure that produced this paragraph was never a serverless agent making a dangerous choice; it was an agent ignoring an available tool. Nothing in this Effort touches that, and no id format could.

**The other reading deserves stating, because it is not silly.** The incident the test describes *is* a collision event — `max + 1` under concurrency is exactly what ADR 0005 measured producing duplicates — and the preamble's own sentence, "duplicates are silent", is a danger argument on its face. So one could read the rule as: hand-allocation is forbidden because it collides, and if it stops colliding the rule should go.

That reading loses on what the agent had in front of it. It had `create_tickets`. Whatever the consequence turned out to be, the thing it did wrong was available to it as a choice, and the rule that would have prevented it is "use the mint when there is one" — not "estimate your collision risk first". A rule whose force depends on the reader correctly assessing a hazard is a worse rule than one that does not, and under a configurable pattern the reader cannot assess the hazard without first reading `frontier.yml`, which is the very step they skipped.

So the reading is an interpretation rather than something the test states, and it is offered as the better one rather than the only one. **The preamble survives on it.** Its conclusion would survive on the collision reading too, for any pattern containing `<N>`; what it would lose is universality, and a rule that holds for some patterns is not the rule this paragraph is trying to be.

**What does not survive is the argument it offers**, in three parts, all of which are now wrong or about to be:

- **The stated justification is now conditional.** "Duplicates are silent" is exactly true for a pattern containing `<N>` and false for the random default, where two trees cannot agree. [[T53]] made the guards conditional on the pattern; a paragraph that justifies a universal rule with a conditional mechanism is arguing badly even when its conclusion is right.
- **The guard filename is wrong for mixed patterns.** Line 88 names `.scratch/.frontier-id-T<n>.guard`. [[T53]] re-keys the guard on the `<N>` value rather than the rendered id, so under `T<N>-<b36{4}>` the guard is `.frontier-id-N-35.guard` and the doc names a file that is never created.
- **One sentence describes no code path, and already did not.** Lines 92-93: *"A guessed id passed to `create_tickets` costs nothing; the server allocates and discards the guess."* There is no `id` field on `create_tickets` — the per-Ticket object (`src/tools/create-tickets.ts:18-42`) takes `key`, `title`, `kind`, `type`, `triage`, `blocked_by`, `body`, and nothing else, and the schema enclosing it adds only `effort`, `create` and `root`. The two nearest real behaviours both contradict it: a `key` that looks like an id is **refused** (`:134`), and a well-formed id in `blocked_by` that nothing holds is **accepted as dangling** (`:162`), not discarded. This is a pre-existing defect, unrelated to ids being configurable, and it is in the paragraph this Ticket rewrites, so it goes now.

The rest of the description is accurate today and verified line by line against `src/storage/markdown/create.ts` — `guardFor()` at `:350`, the exclusive `wx` create in `hold()` at `:334`, and `reserve()` at `:248` scanning, taking every guard, re-scanning while holding them and restarting if a candidate turned up. The ADR 0005 measurement is also attributed **correctly** here: the doc says the thirteen files are what `max + 1` produced, which is what `docs/adr/0005-ids-are-allocated-under-a-guard-and-a-rescan.md:21-22` reports. [[T53]]'s *Question* inverted that figure and its Answer corrected itself; the tracker doc never carried the error.

**So the preamble is rewritten to argue what it is actually for.** It should say that when the server is loaded, `create_tickets` is the only thing that allocates, because it is the only thing that can — it knows the pattern, and under a derived pattern it holds the guard that a direct disk write cannot take. The collision argument moves from being the reason to being one consequence of it, and stops being stated as universal.

## The replacement instruction

**The scan instruction is not in the Hand publish section, and rewriting that section alone does not fix it.** Hand publish (`:160-168`) delegates twice — "as described above" and "the template above". The instruction it delegates to is the Layout bullet at `:104-108`:

> **Ticket ids are `T<n>`, unique across the whole repo.** With FrontierMCP loaded, `create_tickets` assigns them and you never scan for the next one. Only when the server is absent: before creating a Ticket by hand, scan every `.scratch/*/issues/` for the highest existing `T` number and continue from there — ids do not restart per Effort.

That bullet is where the rewrite lands. Its replacement is three steps, and the branch is the whole point:

1. **Read `id_pattern` from `.scratch/frontier.yml`.** If the file is absent, or present without the key, the pattern is `T<b36{6}>` — [[T54]] made that the default and made an absent file the intended state for almost every repo. An agent with no server can do this: one file, one key, YAML it already parses to read any Ticket's frontmatter, in a directory it is already working in.
2. **If the pattern contains no `<N>`** — the default, and every random-only pattern — **generate the tokens and do not scan for a maximum.** There is no counter to continue. Scan only to confirm the id is not already taken, which is a different question from what the highest one is.
3. **If the pattern contains `<N>`** — scan every `.scratch/*/issues/` for the highest value that component has reached and add one. This is the old instruction, now correct only in this case and stated as such.

**Step 3 carries a warning the old instruction did not need**, and it is the one genuinely new hazard this Ticket surfaces. Under a derived pattern the server serialises minting with a guard, and **a hand-writer cannot take one**. `hold()` is an exclusive create on a guard path; a file written straight to disk participates in none of it. So hand-writing under `<N>` while any session might be minting is unsafe in a way hand-writing under the default is not — the two racers derive the same number and neither sees the other. The doc should say this at step 3 and not before, because it is false at steps 1 and 2.

**Two supporting edits the branch requires:**

- **Layout must admit that `.scratch/` holds a file.** `:97` says "One Effort per directory: `.scratch/<effort-slug>/`", and the section describes nothing else at that level. An agent following it literally has no reason to look for `frontier.yml`, which makes step 1 unreachable from the text. [[T54]] put the file at the storage root; Layout has to say so.
- **The frontmatter template's comment states the format.** `:115` reads `id: T12  # T<n>, repo-unique, never reused`. The example value stays — an example must be *something* — but the comment stops naming a shape and states the contract: repo-unique, never reused, never changed, shaped by `id_pattern`.

**What the doc must not do is state the pattern.** [[T54]] settled this and the reason is structural: the resource is registered with `listChanged: false` (`src/server.ts:129-138`), advertised as static packaged configuration, and read from the install directory rather than the workspace (`src/tracker-doc.ts:16`). One doc serves every repo. It can point at `id_pattern`; it cannot report one. [[T56]]'s recommendation to prefer `T<N>-<b36{4}>` over bare `T<N>` belongs next to that pointer, since a human choosing a pattern is reading this and nothing else.

## "The server mints every id" survives as language, conditionally

[[T50]] is blocked on this Ticket for exactly one criterion — whether that invariant holds — and its framing needs the same correction as this Ticket's. T50 says the tracker doc's case "rests on collision risk, which T35 removes". T53 post-dates T50 and puts the collision risk back for any pattern containing `<N>`.

The invariant survives, in this form: **the server mints every id it is present for.** It is a statement about precedence, which is unconditional, rather than about capability, which is not — a serverless agent demonstrably can mint, and the Hand publish section exists to tell it how. What is false is the stronger reading, that an id can only come from the server. That reading was never true; `test/ship.test.ts:150-183` writes a hand-transcribed `id: T1` Ticket into a fixture and asserts the Board renders it as a first-class Ticket, explicitly not Legacy.

## Stale copies: accepted, and the exposure is not vendoring's

**There is no vendoring mechanism.** No script, no `postinstall`, no documented procedure, no manifest, and no version marker in the doc. The sole product-side acknowledgement is one README sentence (`README.md:51-52`): "or read `docs/agents/issue-tracker.md` in a repo that vendors it." Any copy that exists was made by hand, and nothing here can reach it.

**But vendoring is not where the staleness is, and this is the finding that settles the criterion.** The doc ships inside the npm tarball (`package.json:13-16` ships `dist` and `docs/agents/issue-tracker.md`, nothing else) and is read out of the install directory at request time (`src/tracker-doc.ts:16`). `README.md:22-41` instructs registering the server pinned to an exact version, and says outright: *"The pin is the version you get; nothing bumps it for you."* So **a pinned consumer's `frontier://tracker-doc` is frozen too**, and the served copy is the larger population by far.

**The two are not equally frozen, and the difference cuts against the vendored copy.** A pinned consumer has an update path the product tells them about: bump the pin, having read the changelog first (`README.md:8-13`). A vendored copy has none — by the finding above there is no script, no procedure and no manifest, so it goes stale permanently unless somebody re-copies it for reasons nobody has given them. The vendored copy is strictly the worse of the two.

That asymmetry does not change the disposition, because neither copy is reachable from a decision made here, and it sharpens the mitigation below rather than arguing for a different one: the copy that most needs to be able to tell it is stale is exactly the copy with no update path.

That reframes the criterion. Mitigating "stale vendored copies" specifically would be aiming at the smaller half of a problem, using a mechanism that does not exist, against a population that cannot be enumerated.

**What a stale copy actually costs, stated rather than assumed.** It gives the old instruction, so its reader scans and writes `T7` into a repo whose pattern is something else. The consequences are bounded and worth naming precisely:

- The Ticket **reads fine**. Nothing validates an id on read — there is no id validation anywhere on the read path, and an off-pattern id is exactly what a migrated Legacy Ticket looks like, which the driver already preserves verbatim.
- The id **occupies its name**. `claim()` skips any candidate already in use (`src/storage/markdown/create.ts:307`), so the server will not mint over it.
- It **fails in one narrow place**: a forward-reference Edge. `checkEdges` accepts an Edge that names an existing id, so an Edge pointing at the written file is fine; what breaks is an Edge naming an off-pattern id **before** the file exists, which the predicate refuses.
- Under a derived pattern it **may duplicate**, silently, which is the pre-existing case [[T38]] catches on read and is not made worse here.

So the cost is real but small, and it is **already being paid today** — [[T35]] made the scan instruction wrong the moment it resolved, and this Ticket is the fix rather than the cause.

**Accepted, not mitigated, on three grounds.** The exposure is already disclosed in the only place a consumer would look: `README.md:8-13` says "Pre-1.0: the API can change in a breaking way on any release" and names "the on-disk conventions under `.scratch/` … Ticket id format among them" as unsettled. It is bounded by [[T54]]'s default, since a stale copy is wrong only in a repo that sets a pattern, and T54 expects almost none to. And it is unreachable — a copy nobody registered cannot be updated by anything decided here.

**One mitigation is worth its cost and is offered rather than required: give the doc a version marker.** It has none — no date, no version stamp, nothing a reader of any copy can use to tell how old it is. That is the one thing that helps someone holding a stale copy, because staleness is currently undetectable from the inside, and it is a single line. It also serves the pinned-server reader, which the vendoring framing was missing.

## What the build inherits

**The rewrite is test-constrained, in a test that encodes the paragraph under decision.** `test/ship.test.ts:124-139`, *'serves a document that forbids working out the next id by hand'*, asserts three things against the wire copy:

| Assertion | Under this decision |
| --- | --- |
| `/ids\s+come\s+from\s+`create_tickets`/i` | Survives. Keep the phrase. |
| `/never[\s\S]{0,40}\bscan/i` | Survives **only if the rewrite is careful.** The new text says a serverless agent *does* scan under `<N>`. The "never scan" clause must stay attached to the server-loaded case and within 40 characters of "never". |
| `/ADR 0005/` | Survives now, and **breaks later**. T53 has ADR 0005 superseded by a new ADR stating the guard's condition. When that lands, this assertion and the doc's link both move. |

Two more: `expect(doc).toContain('id: T')` (`:169`) survives, since the default pattern keeps a `T` prefix and the template keeps an example value; and `:186-201` slices the Hand publish section past its heading and requires `/absent|not loaded/i` and `/create_tickets/` in the body — so the rewritten section must keep stating its own precondition inline, which the three-step instruction above should preserve deliberately rather than by luck.

**A pre-existing defect in the same paragraph, worth fixing while it is open.** Line 90 links `[ADR 0005](../adr/0005-ids-are-allocated-under-a-guard-and-a-rescan.md)`, and `:120` links `triage-labels.md`. Both files exist in the repository and **neither ships** — `package.json` ships only `dist` and the tracker doc itself. Every consumer reading through `frontier://tracker-doc`, and every vendored copy, follows two dead relative links. Either the targets ship, or the links become prose. Not this Ticket's to decide, but it is in the text this Ticket rewrites.

**Scope.** This Ticket decides the words; the edit to `docs/agents/issue-tracker.md` is build work, and [[T50]] already records that division for the same file. The sections that move are the File conventions preamble (`:86-93`), the Layout bullets (`:97`, `:102-108`), the frontmatter comment (`:115`), and Hand publish (`:160-168`) — four passages totalling about 25 of the doc's 168 lines, though the Layout section around them will re-wrap. The MCP tools table, Typical agent flow, Skill mapping, Status and Map operations are untouched.
