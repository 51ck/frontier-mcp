# Conversion is lazy, and Foreign is a conformance predicate

Amended on 2026-11-15 by the owner's decision recorded on Ticket `To7zwid`: Foreign means no
parseable fence, and a key outside the schema is only an Unimported key.

A Ticket file the server did not write is converted one Ticket at a time, by the agents working it,
and never by a pass over the tracker. Nothing on disk changes until an agent writes to that Ticket.
This was not new when it was decided: `test/normalize-and-stale.test.ts`, in "writing to a Foreign
Ticket › normalizes that file to the schema", has asserted since T3 that a `drop` on a file with no
frontmatter leaves it fenced with `id`, `title`, `status`, `dropped_reason` and `blocked_by`, under
the comment "The tracker converts itself as it is worked, rather than in one risky pass." Its
siblings pin that the inferred-from prose survives verbatim and that the Ticket leaves the Foreign
count. What was incidental is now the model, which is why it is recorded.

**Foreign** is the set of Ticket files with no parseable fence, in one of two ways: no frontmatter
fence, or a fence whose YAML does not parse as a mapping (`splitFrontmatter` then reads it as no
frontmatter, and the whole file goes to `parseProseBody`). Its fields were inferred from prose. A
fence that parses is never Foreign, whatever it carries and whether or not it has an `id`: under
[ADR 0008](./0008-a-ticket-is-named-by-its-path.md) a fence with no `id` is a Ticket named by its
file, and the Board's `no id (N)` warning and the `<effort>#<order>` handle are gone. A key outside
the schema's eleven is an **Unimported key**, which is a fact about the fence and not a kind of
Ticket. `CONTEXT.md` carries the Foreign case as **Legacy ticket**; its Foreign entry is T78's and
pending.

Until 2026-11-15 a third case was Foreign too: a fence that parsed, carried no `id`, and held a key
outside the schema. Its fields were already read from the fence, so the category changed only how
the Board counted it and how `get_tickets` showed it, and once no new Ticket carries an `id` it
treated one stray key differently on two Tickets that differ in nothing but their names.

The predicate is about conformance, not provenance, because provenance cannot be read. A file with
no fence may be this project's own older format, a hand-written note, or another tracker's export.
`legacy.ts` reads shape — a `# T30 — …` heading, a labelled `Status:` line, `Blocked by: 01, 02` —
and nothing in a file says where it came from. The only evidence for "our old format" was two
fixture Efforts by one author.

**The seam is the fence.** Lazy normalization holds only for a file with no parseable fence: any
write gives it a full schema block inferred from the prose. A fence that does not parse is replaced
by that block, not kept. That is the one way a Ticket leaves the Foreign set, and any write takes
it: a comment, a claim, a `drop`, or `migrate_effort`.

Unimported keys are a separate matter. A fence that parses is not rewritten by an ordinary write,
because per ADR 0003 a write mutates the existing YAML document and sets only the fields it edits;
a comment adds nothing to the fence and removes nothing from it (`test/foreign-fence.test.ts`,
"keeps the block and the count after a comment, which drops no key"). `get_tickets` shows a
Ticket's Unimported keys under `## Unimported frontmatter`, entry by entry as the file has them,
the same way with or without an `id`, and the Board counts the Tickets that hold any in one grouped
line. The server never removes one on its own. T101 decided that only an agent does, naming each in
`update_ticket`'s `drop_keys` (T103); dropping a Ticket's last one takes it out of the Board's
count. `migrate_effort` does not: it keeps every key it finds.

**`migrate_effort` is the batch that resolves sort-order Edges, not a conversion pass, and it mints
nothing.** `Blocked by: 01, 02` names this Effort's sort orders, and under
[ADR 0008](./0008-a-ticket-is-named-by-its-path.md) every Ticket those name already has a name: its
id, or its file's stem. The batch rewrites each bare sort-order Edge to the name of the one other
Ticket whose file carries that prefix (`planChanges` in `src/storage/markdown/migrate.ts`). One it
cannot settle stays as declared and dangling, and is listed in the report: two files carry the
prefix, that file's name is not its alone, or the file is the Ticket's own. Digits that already name
a Ticket keep meaning that Ticket.

So `migrate_effort` normalizes unfenced files, rewrites those Edges, and writes nothing else. Into a
fence that parses it writes only `blocked_by`, and only when an Edge changed; the fence's other keys,
Unimported ones and `status` among them, stay as they were. The only `id` it writes is one a
fenceless file's prose already declared, and no file is renamed, so every Ticket keeps its name, the
preview and the real run report the same lines, and an Edge into the Effort from elsewhere resolves
afterwards as before. A prose sub-slice such as `T38.1`
is resolved at scan, coarsening to `T38` only when `T38` is another Ticket of the same Effort and
never onto the Ticket declaring it (T82), so for a sub-slice migration writes the Edge the Board
already showed. A bare sort-order Edge is the exception: the Board shows it dangling (`01?`), and
migration resolves it, which can put its Ticket on the Frontier. Everything else — a real title, a
Kind the prose implies — is an agent's to write per Ticket, through `update_ticket`'s `title`,
`kind` and `type`.

**Detection writes nothing.** A Foreign file is flagged on read and counted on the Board, a fence
holding Unimported keys is counted beside it, and a fenced `status` outside the four sets
`unrecognizedStatus` and keeps the Ticket off the Frontier, so an exported `status: closed` is never
handed out as takeable. The Unimported count and the status check are independent because either
alone leaks: an exported fence whose keys all collide with ours passes the first. This extends T38's
warn-on-read rule, and the read path stays pure as T8 requires (`test/foreign-fence.test.ts`, "does
not rewrite a file holding Unimported keys on get_board").

**`awaits_migration` was designed and never built.** T40 proposed a stored flag on every migrated
Ticket, cleared by the agent that read it, because the only marker then — fence presence — is
destroyed by the fence migration writes. Two markers survive: Foreign before any write, and
`unrecognizedStatus` for a status that will not map. A third, the missing `id` shown as
`no id (N)`, went with ADR 0008, under which a missing `id` marks nothing. Two cases miss them all. One is a fenceless Ticket whose id sat in its
heading, where the prose inference is most trustworthy — a labelled title and Status, and a Kind
read from a `Type:` line, else defaulted to `build`. The other is a Ticket exported from another
tracker with a fence that parses, whose title and status were read from keys that share our names.
That one was never Foreign and keeps a marker of its own for as long as it holds a key we do not
import: the Board counts it and `get_tickets` shows the keys, until an agent drops them with
`drop_keys`. A stored field, its writer, its clearer and a wider tool surface were not worth either.

## Rejected

- **A distinct migration-scoped tool.** It was to be gated on `awaits_migration` and to edit the
  quarantined block, and neither exists. What was left was `title`, `kind` and `type`, which a
  tracker's general write surface should reach anyway; a second tool writing them would break the
  eight-tool rule for nothing.
- **A validation function sourcing the flag.** Nothing in the driver validates, and validity is the
  wrong axis: a file the batch migrated is perfectly valid and is exactly the unreviewed one.
  Setting a flag on read would also make reads write.
- **Quarantining an exported fence into the body** under `## Unmerged legacy frontmatter`, T40's
  answer. It writes a block a later pass must consume, needs a per-field vocabulary to ever empty,
  and asserts *unmerged* about a block that was merged. Showing the same bytes in `get_tickets`
  output writes nothing.
- **Legacy and Foreign as two terms.** That split is on provenance, which cannot be read.
- **Foreign by fence.** Held until 2026-11-15, as above. It made a category of what is a property
  of a fence, and keyed it on a missing `id`.

## Consequences

The tracker needs no migration step before the server is useful, and an Effort is never rewritten
by anything but an agent working it or one explicit `migrate_effort`. The cost is that Unimported
keys stay on disk indefinitely, visible but inert, until an agent drops them with `drop_keys`, and
that an Effort imported with many of them keeps its Board line until each Ticket's are dropped.

The word carries a known imprecision: *foreign* suggests came-from-elsewhere, the provenance this
ruled out, and this project's own output from an older version is Foreign under it. A stated
definition is taken over an etymology. Foreign can also scale past the Ticket — an Effort or a whole
tracker that does not conform — and that vocabulary is reserved, not built.
