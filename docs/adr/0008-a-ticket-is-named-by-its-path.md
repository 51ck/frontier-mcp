# A Ticket is named by its path, and nothing is minted

Supersedes [ADR 0006](./0006-ids-are-minted-by-pattern-and-guarded-only-when-counted.md) for 2.0.
Accepted on 2026-11-15 and not yet built: ADR 0006 describes what 1.x ships until the Tickets of the
`ticket-names` Effort land.

A new Ticket's name is where it lives. `PROJ-123.token-cache` is the file
`.scratch/PROJ-123/issues/token-cache.md`: the Effort slug, a dot, and the file's stem. The creator
chooses the stem, one to three meaningful words. The server mints nothing, and a Ticket written this
way carries no `id` field.

## Why the minted id goes

A minted id is a second namespace beside the one people already use. Where an Effort mirrors an
external tracker issue, `PROJ-123` is the branch name and the commit prefix, and `Tik4z0t` says
nothing about it. The id is unreadable, unsayable, and two of them are hard to tell apart; the owner's
report after filing twenty was that they look like junk.

It also bought its own machinery. A pattern language, a config file, two minting plans, guard files
for the counted one, a standing warning for the pattern that does not survive a merge, temporary keys
so a batch can name what has no id yet, a predicate to tell a key from an id, and a handle form for
the Ticket that has none. Every one of those exists because identity was kept apart from the path.

Five designs written without sight of this one all put identity in the path, and all five rejected
counters and hashes (recorded on Ticket `Tptzdka`). They were one model answering
one brief, so that is a reason to look, not a proof. Two things were then checked here. A counter
under the Effort slug, which GitHub issue #53 asked for, costs the same tokens as a word and collides
whenever two branches add a Ticket. And a meaningful name is reproduced as faithfully as an opaque
one: 1,980 references across three schemes and two models produced no wrong, re-derived or invented
name ([2026-11-15 name fidelity](../research/2026-11-15-name-fidelity.md)).

## The rules

**A name is derived, in this order.** A file carrying `id:` is named by it, exactly as before. A file
with no parseable fence whose prose declares an id is named by that. Otherwise the name is the file's
stem with a leading `<digits>-` removed. Reading is lenient: any stem is a name.

**Existing ids are read forever.** `T52` and `Tik4z0t` keep resolving as Edges and as tool input, and
no existing file is renamed or rewritten. This is what lets 2.0 ship without a migration: commit
messages, pull requests and ADRs that already name an id stay true.

**A reference resolves nearest first.** Inside an Effort a bare name means a Ticket of that Effort.
`<effort>.<name>` crosses Efforts, matched on the longest known Effort slug so a slug may itself
contain a dot. A string that is neither is looked up as an existing id, repo-wide. The server stores
an Edge in the shortest form that resolves: bare within the Effort, full across.

**Tool input with no Effort to resolve against** takes a full name or an existing id. A bare name is
accepted when exactly one Ticket in the workspace has it, and otherwise refused with the candidates.

**Names compare without regard to case**, because the common filesystems do.

**A new name is checked on creation, never on read.** One to three words of lowercase letters and
digits joined by hyphens, starting with a letter, at most 24 characters, no dot. `lock` is refused
because a git ref may not end in `.lock`; `true`, `false`, `null`, `yes`, `no`, `on` and `off` because
a hand-written Edge list would read them as something else; the Windows device names because they are
not filenames everywhere. A name already taken in the Effort, or equal to an existing id, is refused.

**The server stops writing the `NN-` prefix.** Two branches that both add `cache` then write the same
path, and git stops the merge. With a sort-order prefix they would write `05-cache.md` and
`06-cache.md` and merge in silence. A prefix on an existing file is still read as a hint. Board order
is derived from the Edges, ties broken by that hint and then by name.

**A reference to a name that does not exist** is refused when it is a near miss of one that does,
naming the near one. A swap of two adjacent characters counts as one edit, and the allowance grows
with the shorter of the two strings: none up to three characters, one edit at four to six, two from
seven up. A bare name that is exactly a Ticket's name in another Effort is refused too, naming it
in full. Anything else is a dangling Edge, as today, because pointing at a Ticket not yet written is
how a breakdown gets built. An Edge a Ticket already carries is never refused when its list is
replaced.

**`create_tickets` takes `name` and drops `key`.** The name a caller gives is the name siblings use
for it in the same call. Nothing is temporary, so there is nothing to tell apart from an id.

## What is deliberately not done

- **No random word from a list.** It would be as faithful and as sayable, and it would need the tool
  to draw it. Hand-writing stays legal and the upstream skills create files themselves; a file named
  for what it is has a name the moment it exists.
- **No counter**, per Effort or otherwise.
- **No rename.** A name that has gone stale against its title stays. The title is free to change.
- **No hidden per-file nonce.** Two branches adding the same path with the same bytes merge silently,
  and that is one Ticket created twice, which is what the merge should conclude.
- **No near-name refusal between siblings.** `step-1` beside `step-2` is allowed.

## Consequences

A same-name collision between branches surfaces as a git add/add conflict and is resolved by a person
or an agent renaming one side before it merges. The server takes no part. Two sessions that chose the
same meaningful name in one Effort have usually found the same work.

A name records the Effort a Ticket was created in. The owner's rule is that an Effort is not renamed
and a Ticket does not move: work that moves is closed in one Effort and filed again in the other with
a link. An Effort directory moved by hand leaves its own bare Edges intact and makes the full-name
Edges pointing into it dangle, visibly, on the Board.

The order a planning session listed its Tickets in is no longer kept unless the Edges imply it.

The duplicate rules stay, with less to do: they still cover two files carrying one `id:` and two
stems that reduce to one name.

`<storageDir>/frontier.yml`'s `id_pattern` is no longer read. A workspace that still sets it gets a
warning, not a refusal.

[ADR 0007](./0007-conversion-is-lazy-and-foreign-is-a-conformance-predicate.md)'s Foreign predicate
keys on a missing `id`, which under this ADR describes every new Ticket. It has to be restated before
the read path is built; that is a decision Ticket of the `ticket-names` Effort and is not settled
here.

This is a breaking change to `create_tickets` and to what a created file looks like, so it ships as
2.0.
