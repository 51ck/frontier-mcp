# Conversion is lazy, and Foreign is a conformance predicate

A Ticket file the server did not write is converted one Ticket at a time, by the agents working it,
and never by a pass over the tracker. Nothing on disk changes until an agent writes to that Ticket.
This was not new when it was decided: `test/normalize-and-stale.test.ts`, in "writing to a Foreign
Ticket › normalizes that file to the schema", has asserted since T3 that a `drop` on a file with no
frontmatter leaves it fenced with `id`, `title`, `status`, `dropped_reason` and `blocked_by`, under
the comment "The tracker converts itself as it is worked, rather than in one risky pass." Its
siblings pin that the inferred-from prose survives verbatim and that the Ticket leaves the Foreign
count. What was incidental is now the model, which is why it is recorded.

**Foreign** is the set of Ticket files that do not conform to the schema, in one of three ways: no
frontmatter fence; a fence whose YAML does not parse as a mapping (`splitFrontmatter` then reads it
as no frontmatter, and the whole file goes to `parseProseBody`); or a fence that parses, carries no
`id`, and has at least one key outside the schema's eleven (`isForeignFence` in
`src/storage/markdown/ticket.ts`). A fence with an `id` is never Foreign, whatever else it carries;
a fence of schema keys and no `id` is not Foreign either, and shows on the Board as `no id (N)`. `CONTEXT.md` still carries only the unfenced case, as **Legacy ticket**; its Foreign entry is T78's
and pending.

The predicate is about conformance, not provenance, because provenance cannot be read. A file with
no fence may be this project's own older format, a hand-written note, or another tracker's export.
`legacy.ts` reads shape — a `# T30 — …` heading, a labelled `Status:` line, `Blocked by: 01, 02` —
and nothing in a file says where it came from. The only evidence for "our old format" was two
fixture Efforts by one author.

**The seam is the fence.** Lazy normalization holds only for a file with no parseable fence: any
write gives it a full schema block inferred from the prose. A fence that does not parse is replaced
by that block, not kept. A foreign-*fenced* file is not normalized by an ordinary write, because per
ADR 0003 a write mutates the existing YAML document and sets only the fields it edits; a comment
adds nothing to the fence and the Ticket stays Foreign (`test/foreign-fence.test.ts`, "keeps the
block after a comment, which leaves the fence foreign"). Its keys outside the schema are
**Unimported keys**: `get_tickets` shows them under `## Unimported frontmatter` on any Ticket that
carries them, id or not, and the server never removes one on its own. T101 decided that only an
agent does, naming each in `update_ticket`'s `drop_keys` (T103). A foreign-fenced Ticket therefore
stops being Foreign in one of two ways: `migrate_effort` mints its id, with its Unimported keys
still in the fence, or an agent drops the last of them, which leaves a schema fence with no id that
the Board names as `no id (N)`. So the two kinds of Foreign Ticket leave the set by different
routes, and the Board counts them apart (T104).

**Minting is the one step that cannot be lazy, so `migrate_effort` is the id-minting batch, not a
conversion pass.** `Blocked by: 01, 02` names this Effort's sort orders, and the siblings it names
may have no ids yet. Only a batch over the whole Effort holds the order-to-id map that turns those
into Edges (`remapEdges` in `src/storage/markdown/migrate.ts`). Each way of doing it per Ticket is
worse:

- **Store the handle in `blocked_by`.** `<effort>#<order>` stops naming a Ticket the moment it is
  minted, and Edges resolve only by id. Before that it is sort order, never identity, so a hand
  renumbering would silently retarget it.
- **Mint the blockers too, on the first write.** One `update_ticket` then writes at least three
  files, and as many more as those blockers' own sort-order Edges reach, and a
  write that touches Tickets it was not addressed to breaks, from inside, the invariant that nothing
  changes until an agent writes to that Ticket.
- **Drop the Edge.** That loses graph data the batch recovers mechanically.

So `migrate_effort` mints ids Effort-wide, keeps any id already read from a heading, rewrites bare
sort-order Edges to the ids those Tickets now carry, normalizes unfenced files on the way, and
writes nothing else. Into a fence that parses it writes only `id`, if missing, and `blocked_by`,
always; a foreign fence's own keys, `status` among them, stay as they were. It renames no file, and
its preview predicts no id: an unminted Ticket is named by its handle everywhere, `blocked_by=`
included (T69). A prose sub-slice such as `T38.1` is resolved at scan, coarsening to `T38` only when
`T38` is another Ticket of the same Effort and never onto the Ticket declaring it (T82), so for a
sub-slice migration writes the Edge the Board already showed. A bare sort-order Edge is the
exception: the Board shows it dangling (`01?`), and migration resolves it, which can put its Ticket
on the Frontier. Everything else — a real title, a Kind
the prose implies — is an agent's to write per Ticket, through `update_ticket`'s `title`, `kind`
and `type`.

**Detection writes nothing.** A foreign fence is flagged on read, counted on the Board, and a
fenced `status` outside the four sets `unrecognizedStatus` and keeps the Ticket off the Frontier, so
an exported `status: closed` is never handed out as takeable. The predicate and the status check are
independent because either alone leaks: a foreign fence whose keys all collide with ours passes the
first. This extends T38's warn-on-read rule, and the read path stays pure as T8 requires
(`test/foreign-fence.test.ts`, "does not rewrite a foreign fence file on get_board").

**`awaits_migration` was designed and never built.** T40 proposed a stored flag on every migrated
Ticket, cleared by the agent that read it, because the only marker then — fence presence — is
destroyed by the fence migration writes. Three markers already survive: Foreign before any write;
a missing `id`, which survives the normalizing write as `no id (N)` (`test/normalize-and-stale.test.ts`,
"stays flagged for migration after a write gives it frontmatter"); and `unrecognizedStatus` for a
status that will not map. Two cases miss all three. One is a fenceless Ticket whose id sat in its
heading, where the prose inference is most trustworthy — a labelled title and Status, and a Kind
read from a `Type:` line, else defaulted to `build`. The other is a foreign-fenced Ticket after
`migrate_effort`, whose title and status were read from keys that share our names. That one keeps a
marker, though not on the Board: `get_tickets` shows its Unimported keys until an agent drops them
with `drop_keys`. A stored field, its writer, its clearer and a wider tool surface were not worth
either.

## Rejected

- **A distinct migration-scoped tool.** It was to be gated on `awaits_migration` and to edit the
  quarantined block, and neither exists. What was left was `title`, `kind` and `type`, which a
  tracker's general write surface should reach anyway; a second tool writing them would break the
  eight-tool rule for nothing.
- **A validation function sourcing the flag.** Nothing in the driver validates, and validity is the
  wrong axis: a file the batch migrated is perfectly valid and is exactly the unreviewed one.
  Setting a flag on read would also make reads write.
- **Quarantining the foreign fence into the body** under `## Unmerged legacy frontmatter`, T40's
  answer. It writes a block a later pass must consume, needs a per-field vocabulary to ever empty,
  and asserts *unmerged* about a block that was merged. Showing the same bytes in `get_tickets`
  output writes nothing.
- **Legacy and Foreign as two terms.** That split is on provenance, which cannot be read.

## Consequences

The tracker needs no migration step before the server is useful, and an Effort is never rewritten
by anything but an agent working it or one explicit `migrate_effort`. The cost is that a foreign
fence's own keys stay on disk indefinitely, visible but inert, until an agent drops them with `drop_keys`.

The word carries a known imprecision: *foreign* suggests came-from-elsewhere, the provenance this
ruled out, and this project's own output from an older version is Foreign under it. A stated
definition is taken over an etymology. Foreign can also scale past the Ticket — an Effort or a whole
tracker that does not conform — and that vocabulary is reserved, not built.
