# A Ticket is recognized by an explicit marker

Supersedes [ADR 0007](./0007-conversion-is-lazy-and-foreign-is-a-conformance-predicate.md) and
amends [ADR 0008](./0008-a-ticket-is-named-by-its-path.md) for 3.0. Decided by the owner on Ticket
T79, built as `ticket-contract.explicit-ticket-marker`.

A file is a Ticket when it is a `.md` file directly in `<storage>/<effort>/issues/` and its
frontmatter fence carries the top-level key `frontier: ticket`. The marker has no version. Every
other file is not a Ticket.

## Why

Through 2.x every `.md` in `issues/` was a Ticket. A file with no fence was parsed from prose and
flagged Foreign; a write normalized it; `migrate_effort` normalized a whole Effort. That made a README
or a page of notes beside the Tickets into a Ticket with an inferred title and status, put guessed
Edges on the Frontier, and let an ordinary comment rewrite a file nobody had asked the server to own.
The prose parser grew a rule per repository it met — `Status:` lines with trailing prose, struck
Edges, sub-slice coarsening — and each was a guess the next repository could break.

An explicit marker turns "is this a Ticket" from inference into a lookup. What is not marked is left
alone; what is marked is held to the schema.

## The rules

**Detected on text, before YAML.** The marker is a top-level `frontier:` line in the fence, quoting
allowed, found before the fence is parsed, so a marked file whose YAML is broken is diagnosed as
broken rather than read as unmarked. Top level is column 0 of a block-mapping fence: a root mapping
indented by spaces, or a fence written as a flow mapping, cannot be marked. A UTF-8 BOM before the
opening fence is not content and is skipped.

**A marked file is valid or excluded.** It is excluded from the Board, the Frontier, Edge resolution
as a target, and every write when its fence does not parse as a mapping, `title` or `status` is
missing, `status` is not one of the four Statuses, `kind` is set and not `build` or `decision`,
`triage` is set and not one of the five roles, `blocked_by` is set and not a list of scalars, a
schema text field (`title`, `status`, `id` and the lifecycle fields) holds a mapping or list — a
tagged scalar such as `!!timestamp` is read as its source text and is valid — or
`frontier` holds anything but `ticket`. Every other field keeps its 2.x default, and a lifecycle gap
such as `resolved` without `answer_gist` stays a counted Board warning. An unrecognized status, which
2.x kept on the Board and off the Frontier, is now an exclusion.

**Only known locations are inspected.** The storage directory, each Effort directory, and each
`issues/` are listed. A subdirectory of `issues/` is noticed from its entry and never entered; no
other directory of an Effort is read. A marked file directly in an Effort directory is diagnosed as
outside `issues/`; so is one directly in a storage subdirectory that is not otherwise an Effort,
which is scanned for that diagnostic alone and never becomes an Effort unless a write with
`create: true` (`create_tickets`, `edit_map` or `spec`) starts one there by its exact name. A file in `issues/` that cannot be opened is
diagnosed `unreadable`; a loose file read only for the marker reads as unmarked. Only the storage
directory itself may be a symbolic link: a linked Effort directory is not served by any read or
write and is named in a `symlinked-effort` Board warning, and a linked `map.md` or `spec.md` is
never read or written, the Map refresh after a resolve or drop included. A linked `frontier.yml`
is not read either. The checks are not atomic against a concurrent swap of a directory for a link;
for a local server running with its user's rights that is accepted.

**Diagnostics are structured and above the seam.** `{ code, effect, file, key?, expected?, found?,
fix }`, with `file` workspace-root-relative. The codes are `yaml-unparseable`, `missing-key`,
`invalid-value`, `ticket-outside-issues`, `directory-in-issues`, `symlinked-issues` (an
`issues` that is a symbolic link, never followed), `symlinked-header-doc` (a linked `map.md` or
`spec.md`) and `unreadable` (an `issues/` file the server cannot open), which exclude, and
`unmarked-ticket-like`, a suggestion for an unmarked file whose fence holds the keys `title` and `status`, whatever their
values.
Other unmarked Markdown has no diagnostic. A Board groups them one line per code; `list_efforts`
counts `excluded=` and `unmarked=`; `get_tickets` and `update_ticket` on a name a diagnosed file
would have — its id, or its stem bare or as `<effort>.<stem>` — return or refuse with its
diagnostics. A linked Header doc is diagnosed on the Board only.

**Nothing is auto-modified.** No file is normalized, migrated, marked or moved by the server.
`create_tickets` writes the marker as the first frontmatter line. `migrate_effort` stays registered,
so the surface stays at eight tools, and writes nothing.

## What it amends in ADR 0008

- No id is read from prose: a fenceless file is not a Ticket.
- "Any stem is a name" holds only for a marked, valid file directly in `issues/`.

Ids, Edges, names, Board order, claims, revisions and Unimported keys are unchanged.

## Cost

Every 2.x tracker stops having Tickets on upgrade until each file is marked. The server never does
it; a person or an agent adds the line by hand, guided by the `unmarked=` count and the
`unmarked-ticket-like` lines. A hand edit carries no revision check, so it is safe only with a single
writer. This is a breaking change and ships as 3.0.
