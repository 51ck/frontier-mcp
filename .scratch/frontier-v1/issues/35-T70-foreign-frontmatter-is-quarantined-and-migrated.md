---
id: T70
title: Foreign frontmatter is quarantined and migrated Tickets are flagged
kind: build
status: dropped
triage: ready-for-agent
blocked_by: [T69]
dropped_reason: "Both halves of the premise died in [[T57]]. The foreign fence is no longer quarantined into the body under `## Unmerged legacy frontmatter` — it is surfaced in `get_tickets` output and the file is not written ([[T74]]). And `awaits_migration` is never written at all: `id: undefined` survives the normalizing write and renders as `no id (N)`, `unrecognizedStatus` covers a fence whose status will not map, and the only case both miss is a Ticket whose id sat in its heading, which is where the floor's inference is most trustworthy. The hole this Ticket opened is real and survives as [[T73]], which detects a non-conforming fence on read and writes nothing; the scope warning about T57 gating the release is answered, since there is no flag left for anything to clear."
---

**What to build:** the second half of [[T40]] — the part that protects against a file we did not
write.

**The hole.** `splitFrontmatter` treats any opening `---` fence whose YAML parses as a mapping as a
schema Ticket (`frontmatter.ts:26-37`). Nothing checks the fields are ours. A GitHub export or an
Obsidian note reads as `legacy: false`, the Legacy parser never runs, and nothing flags the file.
The damaging case is a foreign field wearing one of our names: `readStatus` (`ticket.ts:120`) matches
the four `STATUSES` and returns `undefined` otherwise, which line 43 turns into `'open'`. A foreign
`status: closed` reads as **open**, lands on the Frontier, and is handed to an agent as takeable
work. `unrecognizedStatus` would catch it but is only ever set on the Legacy path (`ticket.ts:94`).

**So migration imports nothing from a foreign fence.** The whole fence moves verbatim to the end of
the body under an `## Unmerged legacy frontmatter` heading, as a fenced `yaml` block. `Split.raw`
already carries the unparsed text (`frontmatter.ts:19`), so nothing is re-serialized. Migration then
writes our fields and only ours. It is the one operation that refuses to carry unknown fields
forward; ordinary writes still preserve them, because they mutate the parsed YAML document rather
than re-emitting an object (ADR 0003). Idempotent by construction — a second run finds no fence to
move.

**`awaits_migration: true`** goes on every migrated Ticket, as its own snake_case frontmatter field.
It cannot reuse `legacy`, which is derived from whether the file has a fence (`ticket.ts:52`, `:93`)
and which migration itself destroys by adding one. It is deliberately not a sixth `triage` role:
triage's five roles are human judgements about what a Ticket needs from a person, this is machine
bookkeeping, and a human answering "ready for an agent?" would overwrite it with nothing to notice.
It never reaches `isTakeable` (`frontier.ts:35`), so a migrated Effort keeps a working Board.

⚠️ **Scope decision before this lands.** The thing that clears `awaits_migration` is the agent-fed
pass, and its write path is undecided — [[T57]], open. `update_ticket` cannot set `title`, `kind` or
`type` and cannot clear the flag. Shipping this Ticket without T57 means every migrated Ticket
carries a flag nothing in the release can clear. Either T57 lands first, or this ships knowingly.

**Blocked by:** same files as the migration rewrite, and the smaller change lands first.


- [ ] A foreign fence moves verbatim under `## Unmerged legacy frontmatter` as a `yaml` block, and
      nothing from it is imported
- [ ] `migrate_effort --preview` reports the move as a flag beside `mint` and `normalize`
- [ ] Migration writes our fields and only ours; ordinary writes still preserve unknown fields
- [ ] A second migration run is a no-op
- [ ] `awaits_migration` is written on every migrated Ticket, is not a `triage` role, and never
      reaches `isTakeable`
- [ ] The fixtures' prose `Status:` and `Type:` lines are left where they are
