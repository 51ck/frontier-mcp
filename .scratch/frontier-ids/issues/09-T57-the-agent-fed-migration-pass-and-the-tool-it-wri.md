---
id: T57
title: The agent-fed migration pass and the tool it writes through
kind: decision
type: grilling
status: resolved
triage: ready-for-agent
blocked_by: [T40]
answer_gist: The pass writes through `update_ticket` widened with `title`/`kind`/`type`, one Ticket at a time — and most of it already ships, because a write to a Foreign Ticket normalizes it lazily; so `awaits_migration` and the quarantine block are both deleted, foreign frontmatter is surfaced in `get_tickets` output instead of written into the file, `migrate_effort` narrows to the id-minting batch that alone cannot be lazy, and Legacy becomes Foreign on a conformance axis because provenance is unknowable and irrelevant
---

## Question

[[T40]] settles that `migrate_effort` is a mechanical floor and that a per-Ticket agent-fed pass
sits above it. The floor mints ids, resolves prose Edges through the order-to-id map only a
whole-Effort batch holds, quarantines any foreign frontmatter fence into the body, and sets
`awaits_migration: true`. Everything the regular expressions in `legacy.ts` cannot read is left for
an LLM to derive from the prose.

Nothing can write what that LLM derives. `update_ticket` reaches Status through the lifecycle verbs,
Edges, triage, comments and acceptance criteria. It cannot set `title`, `kind` or `type`, and it
cannot clear `awaits_migration`.

What tool does the agent pass write through — a widened `update_ticket`, or a separate one scoped to
Tickets still awaiting migration? What licenses a write that overwrites a value the floor already
put there, and what stops that same write reaching a Ticket nobody migrated?

## Acceptance criteria

- [x] The write path is decided: `update_ticket` widened, or a distinct tool
- [x] What clears `awaits_migration`, and whether anything else may, is stated
- [x] Whether the pass runs per Ticket or per Effort is decided, with the reason
- [x] The treatment of the quarantined `## Unmerged legacy frontmatter` block is stated — consumed and removed, or left in place

## Answer

## Answer

**The pass writes through the server, and the surface is `update_ticket` widened with `title`, `kind` and `type`.**

A distinct tool lost both of its arguments during this grilling. It was to be gated on `awaits_migration`, and that field is deleted below. It was to edit the quarantined block in the body, and nothing is quarantined below. What remains is three fields the tracker's CRUD surface cannot reach — a tracker that cannot fix a typo in a title has a gap, and migration merely walked into it. `TicketEdit` (`src/domain.ts:120-134`) gains three mutation points; a second tool writing those same three fields would be a migration-shaped hole in a general surface.

Hand-editing was the other candidate and is refused. The pass writes the schema fields the floor wrote seconds earlier, and a hand edit carries no revision token, so it clobbers where a served write would be refused. [[T39]]'s precedence argument settles the direction: the server is authoritative when it is present.

**It runs per Ticket.** [[T40]] said so but argued it from the floor's constraint — the order-to-id map that only a whole-Effort batch holds (`remapEdges`, `migrate.ts:211`). Above the floor that constraint is spent: every Ticket has an id, so a per-Ticket agent can name a sibling directly. The residue is an Edge stated in free prose, which needs sibling titles — and `get_board` is 466 tokens for a whole Effort ([[T2]]), which is cheaper than batching. Each write is small, independently revision-checked, and a failure costs one Ticket rather than a batch.

**Conversion is lazy, and most of it already ships.** `test/normalize-and-stale.test.ts:44-45` states the model in its own comment — "The tracker converts itself as it is worked, rather than in one risky pass." A write to a Foreign Ticket already normalizes that file, keeps its prose verbatim, and drops it out of the Foreign set. Nothing on disk changes until an agent decides to change it.

**`migrate_effort` narrows to the one operation that cannot be lazy.** Under lazy minting, `Blocked by: 01, 02` has nothing to resolve to: it names this Effort's sort orders, and the siblings have no ids yet. Every escape is worse than the batch. Storing handles in `blocked_by` makes an Edge that silently retargets when a file is renumbered, because `order` is sort order and never identity. Cascading mints onto the blockers make one update write three files, breaking the no-write invariant from inside. Dropping the Edge loses graph data the batch recovers mechanically. So migration keeps minting Effort-wide and resolving prose Edges, and writes nothing else.

**`awaits_migration` does not exist.** [[T40]] introduced it because `legacy` is derived from fence presence (`ticket.ts:52`, `:93`) and migration destroys it by adding a fence. That is true and insufficient: three markers already survive. `foreign` marks the file before any write. `id: undefined` survives the normalizing write and renders as `no id (N)` — `test/normalize-and-stale.test.ts:97-101` pins it, with the comment "It must not drop out of the migration set on the way." And `unrecognizedStatus` covers a fence whose status will not map.

The one case all three miss is a Foreign Ticket whose id sat in its heading: `# T30 — Grammy group boot` normalizes to `id: T30`, exits `foreign`, never enters `no id`. Look at what was inferred there — a title read from the text after the em-dash, a status read from a labelled `Status:` line, and a `kind` defaulted to `build`, which is the value a Ticket has anyway. The only case that loses its marker is the case where the inference is most trustworthy, and where inference is weak the Ticket has no id and stays visible. A stored field, a writer, a clearer and a permanent widening of the tool surface are not worth that.

**Foreign frontmatter is surfaced, never written.** `get_tickets` renders `Split.raw` (`frontmatter.ts:19`) as a fenced `yaml` block in its output, and the file is untouched. This deletes the `## Unmerged legacy frontmatter` heading, the block-consumption rules, and a fourth body mutation point — `src/domain.ts:113-119` holds that a Ticket body is opaque apart from three places, and this would have been the only one editing text the server wrote rather than appending text a caller supplied. Nothing is written that later has to be cleaned up.

The cost is that the poison stays on disk. A fence carrying `status: closed` reads as `open` (`readStatus`, `ticket.ts:120`, and line 43) and lands on the Frontier as takeable work. Detection closes that without writing: **two independent tests**, because either alone leaks. A fence with no `id` key *and* at least one key outside our eleven is Foreign — the conjunction matters, since a normalized Ticket still awaiting an id has our keys and no `id`, and must not be caught. Separately, a `status` value outside `STATUSES` sets `unrecognizedStatus`, which catches a foreign fence carrying only keys that collide with ours and would pass the first test. Detect on read, warn on the Board, keep off the Frontier, write nothing — [[T38]]'s warn-on-read, refuse-on-write precedent, and the read path stays pure as [[T8]] requires.

**Foreign replaces Legacy, and the axis is conformance rather than provenance.** They are one concept, not two. A file with no fence may be our own older format, a hand-written note, or another tracker's export, and nothing in `legacy.ts` establishes which — its regexes read shape, not origin. T40 already conceded the fixtures are two Efforts by one author, so "our old format" was one person's habits dressed as a category. Provenance is unknowable and we do not care about it. Three ways in: a missing fence, a broken fence, or a fence that does not conform. The first two already behave correctly — `frontmatter.ts:39-43` states that unparseable frontmatter "reads as no frontmatter at all, and the file falls through to the Legacy parser rather than failing the whole scan" — so only the third needs the new detectors.

The word keeps its imprecision knowingly: *foreign* connotes came-from-elsewhere, which is the provenance just ruled irrelevant, and our own output from three versions ago is Foreign under this rule. A stated definition beats an etymology, and `Unconformed` and `Nonconforming` buy accuracy nobody will say out loud.

**Foreign scales past the Ticket, and that part is not built here.** A whole Effort can fail to conform — a directory with no header doc, or a different layout under `issues/` — and so can a whole tracker, in a repo whose issues do not live under `.scratch/` at all. Both touch workspace resolution, which [[T10]] settled on root markers, and neither has anything to do with ids. The vocabulary is decided now so scaling it later costs nothing; the build is Ticket-level only, and the rest belongs to `frontier-onboarding`.

**One defect this pass cannot route around.** There are four statuses and three verbs — `claim`, `resolve`, `drop` — and `editFor` throws outright on a direct `status` (`src/tools/update-ticket.ts:96-102`). Nothing reopens and nothing releases. So when the floor reads `Status: resolved` off a prose line that meant something else, the first write bakes `resolved` into the frontmatter and no tool can move it back. Under lazy conversion that write is the agent's *first* touch, which is when it is least reviewed. Widening `status` is not the fix — Status is derived from the transition by design. The missing reverse transitions are their own defect and get their own Ticket.

## Rejected

**A validation function that sets the flag.** There is nothing to extract: no `safeParse`, no schema object, nothing in `src/storage/markdown/` validates, and `splitFrontmatter` commits to the opposite discipline in a comment. Worse, the predicate fires on the wrong set. A file that fails to parse already reads `foreign`; a file the floor migrated is *perfectly valid* and is precisely the unreviewed one. Validity and reviewedness are orthogonal, so a validator can never see the case the flag was for. Setting a flag on read would also make the read path write, against [[T8]] and against [[T38]]'s warn-on-read precedent. The predicate itself is worth having on the write side — that is [[T67]]'s business, not this Ticket's.

**Quarantining the foreign fence into the body.** T40's answer, superseded. It writes a block that a later pass has to consume and clean, needs a per-field disposition vocabulary to ever empty, and leaves a heading asserting *unmerged* about a block that was merged. Surfacing the same bytes in tool output costs one render and writes nothing.

**Two terms, Legacy and Foreign.** Splits on provenance, which is unknowable. See above.

**Board as a synonym for Effort.** Requested and refused: `CONTEXT.md`'s **Board** entry already ends `_Avoid_: using "board" for the directory itself`, and the Effort is the directory. There is no `Board` interface in `domain.ts` — Board is a rendering in `get-board.ts`, while `Effort` is the entity carrying `slug`, `headerDocs`, `ticketCount` and `destination`. Under the synonym, `get_board({ effort })` reads as *get the effort of the effort*. The instinct comes from Jira and Trello, where a board holds issues — but Jira boards are configurable views over a project's issues, which is this repo's usage exactly.

**A familiar synonym for Effort at all.** *Epic* implies decomposable work, and this Effort is eleven decision Tickets and no builds. *Project* implies scope and duration, *Milestone* a date. An unfamiliar term makes a reader look it up; a familiar wrong one makes them assume.
