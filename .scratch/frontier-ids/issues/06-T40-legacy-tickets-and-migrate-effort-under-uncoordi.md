---
id: T40
title: Legacy Tickets and migrate_effort under uncoordinated minting
kind: decision
type: grilling
status: resolved
triage: ready-for-agent
blocked_by: [T35, T37]
answer_gist: Migration mints inline against the scan it already takes, `withIdReservations` and `peekMintedIds` are both deleted, an existing id is always preserved, `rename` goes, preview names unminted Tickets by handle through reference-style links, and a foreign frontmatter fence is quarantined into the body rather than imported
---

## Question

`migrate_effort` mints ids for Legacy Tickets through `withIdReservations` (`src/storage/markdown/create.ts:102`),
which exists only to hold guards — and the guards are going. Migration also rewrites Edges that name
a Legacy Ticket by its order number (`src/storage/markdown/migrate.ts:214`).

What does minting look like for a migration batch once there is nothing to reserve? And does a
Legacy Ticket that already carries a hand-written `T<n>` keep it, given old-format ids stay valid?

## Acceptance criteria

- [x] How a migration batch mints is decided
- [x] Whether `withIdReservations` survives in any form is decided
- [x] The treatment of a Legacy Ticket already carrying an id is stated

## Answer

**Migration mints inline, against the scan it already takes.**

`migrateEffortFiles` computes `used` from `request.allTickets` at `migrate.ts:50`, before it plans a single change. With [[T37]]'s guards gone, minting is one line of protocol: draw a random id, check it against `used` and against the ids already drawn in this batch, redraw on a hit. No reservation, no second scan, and no `.frontier-id-*.guard` files for a crashed migration to strand.

`withIdReservations` (`create.ts:102`) is deleted. Strip the guard acquisition and the release and what is left is a `try/finally` around a call to the function passed in.

**`peekMintedIds` is deleted with it, and preview stops naming ids it will never mint.**

Today the two id sources agree by construction. `peekMintedIds` (`create.ts:122`) walks `highestMinted(used) + 1`, the real run mints that same sequence from that same scan, and so a preview's ids are the ids you get. Randomness breaks the agreement. Preview writes nothing, so every id it draws is discarded — run it twice against unchanged files and read two different reports.

The lead field is the smaller half of the problem. `blocked_by=` is rendered through `remapEdges` (`migrate.ts:211`), which points a sibling's Edge at a *predicted* id, so the graph a preview draws is provisional in every position rather than only in the column the reader happened to be checking.

Preview therefore names an unminted Ticket by its handle — `<effort>#<order>`, already computed by `handleFor` and already carried on the change record as `beforeHandle` (`domain.ts:228`). Handles appear inside `blocked_by=` too. The `minted` flag survives, because "this Ticket will get an id" is true and knowable while *which* id is not.

**The report links every Ticket, reference-style, from one definition block.**

```
ship-0-5-0: preview — would migrate 7
[ship-0-5-0#01]  Is the data-map fix a latent bug?  mint  blocked_by=[ship-0-5-0#02],[T31]
[T31]  Split the mixed commits  normalize

[ship-0-5-0#01]: .scratch/ship-0-5-0/issues/01-srgb-data-maps-verdict.md
[ship-0-5-0#02]: .scratch/ship-0-5-0/issues/02-texture-leak-fix-portability.md
[T31]: .scratch/ship-0-5-0/issues/03-split-the-mixed-commits.md
```

Inline `[handle](path)` links were the obvious shape and they collapse inside `blocked_by=`, where a Ticket with three Edges would carry three full paths on one line. Reference definitions keep every line short, resolve each path exactly once, and stay greppable — which matters, because `renderMigration` returns a string to the MCP client and nothing renders it into HTML. The reader is an agent reading raw text.

The links are only durable because `rename` is going. A preview link written against a file migration is about to move would be wrong the moment it was followed.

Paths are workspace-root-relative. The tool already takes `root`, so it knows the anchor; the reader's working directory is not knowable and an Effort-relative path is wrong from anywhere else.

This needs a plain `filename` on `MigrationChange`. `fromName` is only populated when a file is being renamed (`migrate.ts:122-123`), and `fromName`/`toName` both go away with `rename`.

**An existing id is preserved, never re-minted.**

[[T35]] settles that old-format ids stay valid forever and [[T36]]'s contract says an id is never reused or changed. Re-minting would break every prose reference to `T12` in another Effort's Map, in commit messages, and in merged PR bodies, none of which the server can rewrite. `parseLegacyBody` reads the id out of the heading (`legacy.ts:14-15`, `# T30 — Grammy group boot`) and migration keeps it.

One case refuses rather than resolving. If the inferred id already exists elsewhere in the repo, migration fails and names both files. That is [[T38]]'s write rule, reused unchanged: two Tickets answering to one id is the condition T38 exists to prevent, and migration is a poor place to invent an exception to it.

**`rename: true` is deleted.**

Renaming a Ticket in one Effort breaks a path link held in another Effort's hand-written prose, outside any GENERATED marker, and the migration of the first Effort never reads the second. This is not hypothetical. `test/fixtures/legacy/tag-customizer-ship-0-5-0/map.md` links `../three-app-backlog/issues/17-orm-jpeg-srgb-decoded-on-r147.md` and a Ticket in `../consume/`. The server cannot see those links, cannot fix them, and cannot warn about them.

`migrate-effort.ts:11-16` already documents `rename` as off by default "so relative links keep resolving". This hardens a default that was there for the right reason and removes the flag that could turn it off.

The id never comes from the filename, so keeping a Legacy name costs nothing for identity: `ticket.ts:31` reads `order` from the `NN` prefix and `ticket.ts:35` reads `id` from frontmatter. The accepted cost is that two filename conventions coexist forever, and `ticketFilename` applies only to freshly created Tickets.

**Foreign frontmatter is quarantined into the body, never imported.**

`splitFrontmatter` treats any opening `---` fence whose YAML parses as a mapping as a schema Ticket (`frontmatter.ts:26-37`). Nothing checks that the fields are ours. A file exported from an issue tracker, or an Obsidian note, reads as `legacy: false`, the Legacy parser never runs, and nothing flags the file at all.

The damaging case is a foreign field wearing one of our names. `readStatus` (`ticket.ts:120`) matches against the four `STATUSES` and returns `undefined` for anything else, which line 43 turns into `'open'`. A GitHub issue carrying `status: closed` reads as **open**, lands on the Frontier, and is handed to an agent as takeable work. `unrecognizedStatus` would have caught it, but that field is only ever set on the Legacy path (`ticket.ts:94`).

So migration imports nothing from a foreign fence. The whole fence moves, verbatim, to the end of the body under an `## Unmerged legacy frontmatter` heading, as a fenced `yaml` block. `Split.raw` already carries the unparsed text (`frontmatter.ts:19`), so nothing is re-serialized and nothing is lost in a round trip. The heading is what an agent greps for and what tells a human why the block is there. `migrate_effort --preview` reports the move as a flag on the change line, beside `mint` and `normalize`, so a file rewrite is never a surprise.

Migration then writes our fields and only ours: `id`, `title`, `kind`, `type`, `status`, `triage`, `blocked_by`, `answer_gist`, `dropped_reason`, `claimed_by`, `claimed_at`. Extra fields a human or an agent adds later still survive ordinary writes, because writes mutate the parsed YAML document rather than re-emitting an object (ADR 0003, `frontmatter.ts:4-6`). Migration is the one operation that refuses to carry unknown fields forward.

The result is idempotent by construction. A second run reads clean frontmatter and finds no fence to move, and the quarantined block sits in the body where nothing parses it as frontmatter.

The fixtures' prose `Status:` and `Type:` lines are left exactly where they are. They are prose, not a fence, and deleting a line a human wrote is further than migration should reach. The cost is that those lines then duplicate the frontmatter above them, which is a better outcome than a server that edits someone's writing.

**Every migrated Ticket carries `awaits_migration: true` until an agent has read it.**

The flag has to be written into the file, because the one that exists cannot survive the operation. `legacy` is not stored — it is derived from whether the file has a frontmatter fence, false at `ticket.ts:52` and true at `ticket.ts:93`. Migration adds a fence, so the next read reports `legacy: false` and every migrated Ticket looks identical to one an agent wrote by hand. Any design that leans on `legacy` to mark unreviewed work is leaning on a flag that migration itself destroys.

`awaits_migration` is its own frontmatter field, snake_case to match `answer_gist` and `blocked_by`. It is deliberately not a sixth `triage` role: triage's five roles are all human judgements about what a Ticket needs from a person, this is machine bookkeeping, and a human answering "is this ready for an agent?" would overwrite the migration state with nothing to notice.

It never reaches `isTakeable` (`frontier.ts:35`), so a migrated Effort keeps a working Board while the agent pass runs. The agent clears it, and clearing it is the signal that the Ticket has been read — including its quarantined block, where there is one.

**The mechanical floor keeps inferring Status, Kind, Type and Edges from prose.**

The evidence for keeping it is narrower than the parser's own comment claims. `legacy.ts:8` says "the shapes here are the ones the real repos actually contain", and the fixtures are two Efforts written by one author, both of which happen to label their fields. Every file in both carries a `Status:` line. That is not evidence about anyone else's repo, and a Legacy Ticket written in free prose will not be parsed relevantly by regular expressions.

It survives anyway, for two reasons.

The floor does not guess on a file it cannot read; it defaults. No `Status:` line gives `open` (`legacy.ts:138`), no `Type:` line gives `build`, no `Blocked by:` line gives no Edges — the values a Ticket has anyway. Where the floor *can* be wrong it already declines to be: an unrecognized Status is kept as raw text rather than forced into one of the four, `wontfix` is deliberately not mapped to `dropped` because that would make it contagious down the graph, and `T38.1` is coarsened to `T38` with the coarsening reported. This is a recognizer with an "I did not understand this" channel, not a guesser.

And the prose Edge parse is the one thing only the floor can do. `Blocked by: 01, 02` names this Effort's sort orders, and resolving them needs the order-to-id map that only a whole-Effort batch holds (`remapEdges`, `migrate.ts:211`). A per-Ticket agent cannot construct it: the sibling's id does not exist until the batch mints it, and no agent can name an id the server has not drawn yet. That single constraint is why agent-fed migration is a layer above the floor and not a replacement for it.

**The agent-fed pass is recorded here and designed elsewhere.**

Everything the parser cannot read, an LLM has to read instead — one agent per Legacy Ticket, deriving the real title, Status, Kind, Type and Edges from prose and from any quarantined block, then writing them back and clearing `awaits_migration`.

Nothing can write those fields today. `update_ticket` sets Status through the lifecycle verbs, Edges, triage, comments and acceptance criteria; it cannot set `title`, `kind` or `type`, and it cannot clear a field like `awaits_migration`. Designing that tool is a real decision with its own arguments, and burying it in an answer about id allocation would put it where nobody will look for it. It gets its own Ticket.

**Rejected: a sentinel value in the fields themselves.** Marking an unread field by writing something like `?` into it is cheaper than a new field and is safe for `title`, `kind` and `type`, which nothing computes on. It is not safe for `status`. `isTakeable` requires `status === 'open'` and requires every Edge to point at a `resolved` Ticket (`frontier.ts:35-39`), so a sentinel drops the Ticket off the Frontier and everything downstream of it with the Ticket. Migrate a whole legacy Effort and the Board goes dark until the agent pass has finished, one Ticket at a time. `legacy.ts:53` already argues the direction: a Ticket wrongly left off the Frontier is a missed opportunity.

**Rejected: a field-by-field filter on foreign frontmatter.** Importing the fields we recognize and dropping the rest sounds more careful than quarantining the whole fence, and it is strictly worse. A filter still has to decide what a foreign `status: closed` means, and it cannot — that is the exact case that reads as `open` today. Refusing the whole fence is the only rule that covers a foreign field wearing one of our names.

**Rejected: per-field provenance.** Recording which fields the floor read from a label and which it defaulted would answer "did the file say `open`, or did it say nothing" precisely. It costs a schema change nobody has asked for, and the quarantined block already carries the raw source for any file that had one. For a file with no fence, the agent reads the prose regardless of which fields are marked.
