# Issue tracker — FrontierMCP and file fallback

Tracker doc revision 15. To check a vendored copy, compare this number with the one in the
`frontier://tracker-doc` resource of the server you run; a lower number, or no revision line, is
stale.

Use **FrontierMCP** as the issue tracker. Its canonical storage is markdown under `.scratch/`.
Vocabulary is defined in the project's `CONTEXT.md` when present — Effort, Board, Header doc, Map,
Spec, Ticket, Name, Edge, Frontier.

When **FrontierMCP** (server name `frontier`) is loaded in your session, use the tools below. They
own the schema, compute the graph, and answer orientation questions for a fraction of the token cost
of reading every Ticket file. When it is **not** loaded, follow the [File conventions](#file-conventions)
literally — the same files, the same fields, written by hand.

Read this document once at setup. In Cursor it is also available as MCP resource `frontier://tracker-doc`.

## Workspace

FrontierMCP resolves which repository it serves on every call:

1. An explicit `root` argument on the call.
2. The `FRONTIER_ROOT` environment variable.
3. The server process working directory, walked upward to the nearest directory containing a
   `.scratch/` directory, or `.git` in either form — a git worktree and a submodule carry `.git` as a
   file, and each is its own workspace rather than part of the repository enclosing it.

Register FrontierMCP once at user scope. Opening a project is the only per-repo setup step — no
`.cursor/mcp.json` entry is required in each repository.

**The working directory is the one your client launched the server in, and it is fixed for the
session.** Moving to another worktree mid-session does not retarget it: pass `root` on the call, set
`FRONTIER_ROOT`, or restart the server. A worktree whose branch carries no `.scratch/` of its own
reports no Efforts — that is the worktree being served correctly, not the tracker going missing.

**Every call that writes opens with `root: <path>`**, naming the repository it just changed. Read it
— a Ticket's name is unique within a repository, not across them, so `T10 updated` looks the same
whichever repository answered, and this line is the only part of the result that tells you. Reads do not carry it, and neither do the
read paths of write-capable tools: `edit_map` with no section fields and `spec` with no `content`.
`check_tracker` never writes.

**`list_efforts` names the server you are talking to.** Its `root:` line ends with
`frontier-mcp <version>`, the version the MCP handshake reports — which your client sees and you do
not. A launch such as `pnpm dlx frontier-mcp@latest` can start an older release than the newest one
published; this is where to check which one is running. No other result carries it.

A repo with no `.scratch/` yet is not an error. Create an Effort by writing to it with `create: true`
on `create_tickets`, `edit_map`, or `spec`.

## MCP tools

Eight tools permanently. Optional arguments extend an existing tool; there is no ninth.

An argument a tool does not define — at the top level, inside `claim`, `resolve`, `drop` or
`reopen`, or in a `create_tickets` entry — fails the call before anything is read or written, and
the error names the key and where it sits (`resolve: Unrecognized key: "anwser"`). Only `extra`
takes keys of your choosing.

| Tool | Use when |
| --- | --- |
| `list_efforts` | Orient — list Efforts with Ticket counts, header doc kinds, and Frontier size; `excluded=N` and `unmarked=N` when an Effort holds files that are not Tickets (see [Diagnostics](#diagnostics)). A repository with no `.scratch/` at all gets `no tracker here`, the marker that located the root, and a `start one` line to copy; an empty `.scratch/` still reads `(no efforts)`. The `root:` line ends with the server version (see [Workspace](#workspace)). |
| `get_board` | See the whole Effort cheaply — Destination, one summary line per Ticket, Frontier marked. Never returns bodies. |
| `get_tickets` | Fetch full bodies for specific Tickets, by name or id, after the Board tells you which matter. Given the name of an excluded file, returns its diagnostics. |
| `create_tickets` | Publish a breakdown in one call. You give each Ticket its `name`, and optionally `tags` and `extra` keys; Edges may name a sibling from the same call. All are written or none. |
| `update_ticket` | Claim, resolve, drop, reopen, release, set title/kind/type, set triage, replace Edges or tags, comment, tick acceptance criteria, set `extra` keys, or `drop_keys` to delete Unimported frontmatter keys. One Ticket per call. |
| `edit_map` | Edit Map sections — Destination, Notes, fog, Out of scope. Decisions-so-far regenerates from resolved Tickets. |
| `spec` | Read or write a Spec as a whole document. |
| `check_tracker` | Learn how to write a Ticket and what is wrong with the files there: the frontmatter schema, the layout contract and its version, a valid example, and every diagnostic itemized with file, key, expected, found and fix. `effort` narrows the diagnostics to one Effort. Reads only; fix files by hand. |

### Typical agent flow

1. `list_efforts` — pick an Effort.
2. `get_board` on that Effort — read the Frontier (`>` marker).
3. `get_tickets` on the Tickets you will work — read bodies only for those.
4. `update_ticket` with `claim` before starting work.
5. `update_ticket` with `resolve` or `drop` when done; `reopen` when a closed Ticket needs another pass; `release` when a claim should be dropped without closing; tick criteria and comment as you go.
6. `create_tickets` when a skill publishes a new breakdown; `edit_map` / `spec` for header docs.

### Skill mapping

| Skill says | FrontierMCP call |
| --- | --- |
| publish to the issue tracker | `create_tickets` |
| fetch the relevant ticket | `get_tickets` |
| what can I work on / frontier | `get_board` |
| claim before work | `update_ticket` with `claim` |
| resolve with an answer | `update_ticket` with `resolve` |
| rule out of scope | `update_ticket` with `drop`, then `edit_map` `rule_out` if needed |
| reopen closed work | `update_ticket` with `reopen` |
| release a stale claim | `update_ticket` with `{ release: true }` |
| edit the Map | `edit_map` |
| write or read the Spec | `spec` |

### Names and references

A Ticket is named by its path: `<effort>.<name>`, the name being its file's stem. One whose
frontmatter carries `id:` is named by that id instead, repo-wide: existing ids keep working with no
action. Never add an `id` to a Ticket, and never remove one.

**Choose a name** for each Ticket in `create_tickets`. Say what the Ticket *is* — `token-cache`,
`retry-policy`, `login-form` — in one to three words. Not a sentence, not a verb phrase about the
code (`fix-parser`), not a number. Lowercase letters and digits joined by hyphens, a letter first,
at most 24 characters, no dot. Refused: a name the Effort already has, one equal to an existing id,
and the reserved `lock`, `true`, `false`, `null`, `yes`, `no`, `on`, `off` and Windows device names
(`con`, `nul`, `com1`). A name never changes; the title may.

**Reference a Ticket** by its bare name inside its own Effort (a sibling of the same `create_tickets`
call included), by `<effort>.<name>` across Efforts, or by an existing id anywhere. `blocked_by`,
`get_tickets` and `update_ticket` all take these, case ignored. Where a call names no Effort, a bare
name also works while only one Ticket has it; otherwise `AmbiguousName` lists the candidates — pass
one in full.

An Edge that resolves to nothing dangles — the Board shows `name?` and counts it — so a breakdown
can point at a Ticket not yet written. Three kinds are refused instead, writing nothing:

- `ProbableTypo` — a near miss of a name that exists, which the message gives. Write that name, or
  create the new Ticket first if the new name was meant.
- `NameInAnotherEffort` — a bare name only another Effort has. Write it in full.
- `BoardFormAsEdge` — `T9@beta` is how a Board shows an Edge into another Effort. Write `T9`.

**Two branches that chose the same name** both add `issues/<name>.md`, and git stops the merge with
an add/add conflict. Rename one side's file before merging and fix the Edges naming it; if both are
the same work, keep one. The server takes no part.

Two files carrying one `id`, or two of one Effort whose stems give one name (`cache.md` beside
`05-cache.md`), are a Board warning, and every write addressed to them is refused. Fix it by hand:
rename a file, or give all but one a new id.

When a Ticket's frontmatter carries keys outside the schema, the Board counts it and `get_tickets`
appends those entries as a fenced `yaml` block under `## Unimported frontmatter`. No ordinary write
removes them: pass `update_ticket` `drop_keys` with the names to delete. A schema key or a key the
fence does not carry fails the call and writes nothing; the rest of the fence stays byte-identical.

To write such keys on purpose, pass `extra` — per Ticket on `create_tickets`, or on `update_ticket`.
Each key of the object is written at the top level of the frontmatter, never under a key named
`extra`, to any JSON value; an update replaces a named key's value whole, with no merge, and leaves
the rest alone. They are Unimported keys like any other: shown, counted and dropped the same way,
and they never affect Status, Edges or the Frontier. Every schema key, `frontier` and `id` included,
is reserved: naming one in `extra` or `drop_keys` fails the whole call — no Ticket of a batch is
created — and the error names the argument that sets it, or says none does. `__proto__` is refused
in both, and `extra` as a key of `extra`; a hand-written `extra:` entry is dropped like any other.
A key must be non-blank, one line, with no control character. `-0`, an unpaired surrogate, and any
value that would not read back from YAML as given are refused. A key YAML reads the same as a
stored one (`"12"` against `12:`) replaces that entry.

Every write edits only the frontmatter entries it names; every other line, comment and line ending
stays byte-identical.
A Board counts `resolved` Tickets with no `answer_gist`, `dropped` with no `dropped_reason` and
`claimed` with no `claimed_by` or `claimed_at` in its warnings, so set the field with the Status.

A Ticket may carry `tags`, a list of strings set by `create_tickets` and replaced whole by
`update_ticket` `tags`; an empty list removes the key, and a Ticket given none is written without
one. Each tag is kept exactly as given — no case folding, trimming or deduplication — and a blank or
non-string tag is refused. `get_tickets` shows them in its header line as `tags=a,b`, quoting a tag
that holds a comma, whitespace, a quote, a control character or a line separator as a JSON string,
in which no control character or line separator is left raw. Tags never change Status, Edges or what is takeable. A
Board line does not show them: showing and filtering by tag is left to the `frontier-search` Effort.

Claims are compare-and-set — a parallel session that already holds the Ticket wins. Writes carry the
`revision` from the last read; a mismatch is refused, never retried over the caller's edit.

## Diagnostics

A file in a Ticket location that is not a valid Ticket is never written, never shown as a Ticket,
and never satisfies an Edge. What the server noticed about it is a diagnostic:

| Code | Effect | Raised for |
| --- | --- | --- |
| `yaml-unparseable` | excluded | a marked file whose frontmatter does not parse as a YAML mapping |
| `missing-key` | excluded | a marked file with no `title` or no `status` |
| `invalid-value` | excluded | `status` not one of the four, `kind` not `build`/`decision`, `triage` not one of the five roles (a blank `kind` or `triage` counts), `blocked_by` not a list of names, `tags` not a list of non-blank scalars (null is no tags, as an absent `tags` is), or `frontier` set to anything but `ticket` |
| `ticket-outside-issues` | excluded | a marked `.md` directly in an Effort directory, other than `map.md` and `spec.md` |
| `directory-in-issues` | excluded | a directory inside `issues/`, never entered |
| `symlinked-issues` | excluded | an `issues` that is a symbolic link, never followed, read or written through |
| `symlinked-header-doc` | excluded | a `map.md` or `spec.md` that is a symbolic link; `spec` and `edit_map` refuse it, and a resolve or drop leaves the Map's generated blocks stale with a warning |
| `unreadable` | excluded | a `.md` in `issues/` the server cannot open, such as one at mode `000` |
| `unmarked-ticket-like` | suggestion | an unmarked `.md` in `issues/` whose frontmatter holds the keys `title` and `status`, whatever their values |

Each names the file (workspace-root-relative), and where one applies the key, what was expected and
what was found, with the fix. A Board shows one line per code, naming three files and counting the
rest; `check_tracker` lists every one. `get_tickets` on a name the file would have — its `id` if it carries one, its stem less any
`NN-` prefix, or `<effort>.<stem>` — returns the diagnostics, for a suggestion as for an exclusion,
and `update_ticket` on it refuses with them. A linked `map.md` or `spec.md` is reported on the
Board and by `check_tracker` only. Fix the file by hand; the server never
repairs, marks or moves one. Any other unmarked Markdown — a README, notes — is ignored silently.
An Effort directory that is a symbolic link is not an Effort: nothing reads or writes through it,
and every Board names it in one `symlinked-effort` warning line.

## File conventions

These conventions are canonical whether FrontierMCP is loaded or not. FrontierMCP reads and writes
the same files; a session without the server still produces valid Tickets by following this section.

**Nothing allocates an id.** A new Ticket's name is its file's, chosen by whoever writes it — ADR
0008 in the frontier-mcp repository. Never scan for a next number and never write an `id:` field.
When FrontierMCP is loaded, still create through `create_tickets`: it checks each name and Edge,
which a file written straight to disk skips.

### What is a Ticket

A file is a Ticket when it is a `.md` file directly in `.scratch/<effort-slug>/issues/` and its
frontmatter carries the top-level line `frontier: ticket` (quoting allowed). Top level means column
0 of a block-mapping fence: a root mapping indented by spaces, or a fence written as one flow
mapping (`{frontier: ticket, ...}`), cannot be marked. A UTF-8 BOM before the opening `---` is
allowed. The marker has no version. Everything else is not a Ticket, and only these places are
looked at: `.scratch/`, each Effort directory, and each `issues/`. A subdirectory of `issues/`, or
any other directory of an Effort, is never read. `.scratch/` itself may be a symbolic link and is
followed; a linked Effort directory, `issues/`, `map.md` or `spec.md` is not. A directory holding
only a marked file outside `issues/` is not an Effort until a write with `create: true`
(`create_tickets`, `edit_map` or `spec`) names it exactly, which creates its `issues/`.

A marked file must also be valid: `title` and `status` present and not blank, and every value from
the schema below where it is set. A missing `kind` reads as `build`; other missing fields stay
unset. `blocked_by:` with no value is the same as no `blocked_by`: no Edges. A write that would
leave a file failing any of this is refused and writes nothing.

### Layout

- One Effort per directory: `.scratch/<effort-slug>/`.
- An Effort slug is one directory name: no path separator, no leading dot, no control character.
  A directory under `.scratch/` whose name breaks that is skipped: never an Effort, never read.
- The header doc is `spec.md` (from `/to-spec`) or `map.md` (from `/wayfinder`). An Effort charted as a
  Map may later gain a Spec — that is wayfinder's handoff, not a mistake.
- Tickets are one file per Ticket under `.scratch/<effort-slug>/issues/` — never a single combined
  tickets file.
- A Ticket file is `<name>.md`, and its stem is the Ticket's name, under the rules in
  [Names and references](#names-and-references). A leading `<digits>-` is read as a Board-order hint
  and is not part of the name: `05-cache.md` is `cache`. Write no prefix on a new file.
- A file carrying `id:` is named by that id whatever its filename. Rename a Ticket file only to
  settle the branch conflict above: Edges and prose name it.
- Formal metadata goes in YAML frontmatter. Prose stays prose.

### Ticket frontmatter

The contract `check_tracker` returns, generated from the definitions the server validates with.
`test/check-tracker.test.ts` fails when this block differs from them; paste the tool's output over
it, everything above its `diagnostics` line.

<!-- check_tracker contract -->
````text
schema: frontmatter between --- lines; keys any order, the marker first by convention
  frontier  required  exactly ticket — exactly the string ticket; detected as a top-level line at column 0; convention only: written first
  id  optional  text — a scalar kept as written (02 stays 02); null or blank is unset; when set it is the Ticket's name; convention only: only where a file already carries one; never add or change it
  title  required  text — a scalar as YAML reads it (02 is 2); absent, null or blank is missing-key; convention only: one line
  kind  optional  build | decision — absent or null is unset, read as build; a blank string is invalid-value; spaces trimmed
  type  optional  text — a scalar as YAML reads it (02 is 2); null or blank is unset; convention only: decision only: research | prototype | grilling | task
  status  required  open | claimed | resolved | dropped — absent, null or blank is missing-key; spaces trimmed; convention only: new Tickets are open
  triage  optional  needs-triage | needs-info | ready-for-agent | ready-for-human | wontfix — absent or null is unset; a blank string is invalid-value; spaces trimmed; convention only: a /triage role, never a Status
  blocked_by  optional  list of Ticket names — absent, null or [] is no Edges; a mapping or list entry is invalid-value; a null or blank entry is dropped; any other scalar entry is as written; convention only: each a name in this Effort, <effort>.<name>, or an id
  tags  optional  list of tags — absent, null or [] is no tags; else a list of non-blank scalars, or invalid-value; entries kept as written, never folded, trimmed or deduplicated; convention only: no effect on Status, Edges or the Frontier
  claimed_by  optional  text — a scalar as YAML reads it (02 is 2); null or blank is unset; convention only: set with status: claimed
  claimed_at  optional  text — a scalar as YAML reads it (02 is 2); null or blank is unset; convention only: an ISO timestamp, set with claimed_by
  answer_gist  optional  text — a scalar as YAML reads it (02 is 2); null or blank is unset; convention only: one line, set with status: resolved
  dropped_reason  optional  text — a scalar as YAML reads it (02 is 2); null or blank is unset; convention only: set with status: dropped
  other keys: any other top-level key is Unimported, not malformed: shown by get_tickets and left byte-identical by every write that does not name it; create_tickets or update_ticket extra sets one at the top level to a JSON value, replacing a stored value whole, never under a key named extra; update_ticket drop_keys removes one; a key is non-blank, one line, no control character, not __proto__; no schema key above, frontier and id included, is set or removed either way
layout v1:
  .scratch/  storage root; holds Effort directories; may be a symbolic link
  .scratch/<effort>/  an Effort once it holds map.md, spec.md or issues/; the slug is one directory name: not empty, not starting ., no / or \, no control character, and a directory whose name breaks that is never one
  .scratch/<effort>/map.md  the Map: typed sections, edited with edit_map
  .scratch/<effort>/spec.md  the Spec: one opaque document, written with spec
  .scratch/<effort>/issues/  Ticket files, listed and never recursed
  .scratch/<effort>/issues/<name>.md  a Ticket when marked and valid; named by its id when set, else by the stem less any <digits>- prefix, unless that leaves nothing
unsupported, diagnosed:
  yaml-unparseable (excluded)  a marked file whose frontmatter does not parse as a YAML mapping
  missing-key (excluded)  a marked file whose required key is absent, null, empty or blank
  invalid-value (excluded)  a marked file with a value outside its key's type or values; a set kind or triage that is blank counts
  ticket-outside-issues (excluded)  a marked .md directly in an Effort directory, other than map.md and spec.md, or in another directory under the storage root
  directory-in-issues (excluded)  a directory inside issues/, never entered
  symlinked-issues (excluded)  an issues that is a symbolic link, never followed
  symlinked-header-doc (excluded)  a map.md or spec.md that is a symbolic link, never read or written
  unreadable (excluded)  a .md in issues/ the server cannot open
  unmarked-ticket-like (suggestion)  an unmarked .md in issues/ whose frontmatter holds title and status
ignored, no diagnostic:
  files directly in .scratch/ but frontier.yml (read only for a Board warning), and every directory there whose name is not a slug, with all below it
  unmarked Markdown without title and status keys, and every file not ending .md, in issues/
  unmarked .md beside map.md and spec.md, and in other directories under .scratch/
  every directory of an Effort but issues/, and everything below a directory in issues/
symlinks: only .scratch/ itself is followed; a linked Effort directory is no Effort (a symlinked-effort Board warning), and a linked issues, map.md, spec.md or frontier.yml is never read or written
example .scratch/<effort>/issues/token-cache.md:
```markdown
---
frontier: ticket
title: Cache the auth token
kind: build
status: open
triage: ready-for-agent
blocked_by: [token-store]
tags: [auth]
---

## What to build

Keep the auth token in memory between requests.

## Acceptance criteria

- [ ] A second request reuses the token
```
````
<!-- /check_tracker contract -->

Only `frontier`, `title` and `status` are required. Body shape follows whichever skill produced the Ticket: Problem / Done when / acceptance criteria for
`build`, `## Question` / `## Acceptance criteria` / `## Answer` for `decision`. Comments append at the
bottom under `## Comments`.

### Status

`open` → `claimed` → `resolved` or `dropped`. Both terminal states are closed and differ in meaning:
`resolved` is a step on the route and contributes its `answer_gist` to the Map's Decisions-so-far;
`dropped` is work ruled beyond the destination and contributes its `dropped_reason` to Out of scope.
`wontfix` is a triage role, not a status.

A dropped Ticket does **not** unblock its dependents — flag them for a human instead.

### Map operations (wayfinder)

Used by `/wayfinder`. The **Map** is a file with one **child** file per Ticket.

- **Map**: `.scratch/<effort-slug>/map.md` — Destination, Notes, Decisions so far, Not yet specified,
  Out of scope.
- **Child ticket**: a file under `issues/` with the question in the body, `kind: decision`, and a
  `type:` recording which wayfinder type it is.
- **Blocking**: the `blocked_by` list. A Ticket is unblocked when every Ticket it lists is `resolved`.
- **Frontier**: Tickets that are `open`, unblocked, and unclaimed. A Board lists blockers first.
- **Claim**: set `status: claimed` with `claimed_by` and `claimed_at`, and save, before any work.
- **Resolve**: append the answer under `## Answer`, set `status: resolved` and a one-line
  `answer_gist`, then add the pointer line to the Map's Decisions-so-far.
- **Rule out of scope**: set `status: dropped` with a `dropped_reason`, and add the line to the Map's
  Out of scope. Do not put it in Decisions-so-far — that section records the route actually walked.

When FrontierMCP is loaded, prefer the MCP calls in the table above over hand-editing these fields.

### Hand publish (no FrontierMCP)

**Everything below holds only while FrontierMCP is absent from the session.** With the server
loaded, `create_tickets` publishes the breakdown, per the File conventions preamble.

When a skill says "publish to the issue tracker" and FrontierMCP is not loaded, create
`.scratch/<effort-slug>/issues/<name>.md` (creating directories as needed) with frontmatter matching
the example above. Choose the name as under [Names and references](#names-and-references), and
check it is free yourself: no file in `issues/` has that stem, case and any `<digits>-` prefix
ignored, and no Ticket carries it as an `id`. Write `frontier: ticket` as the first frontmatter
line: without it the file is not a Ticket.

**A hand edit carries no revision check.** The server refuses a write whose revision has moved, but
nothing refuses yours: an editor saving over a file the server, or another session, rewrote since
you opened it overwrites that write without a word. Hand-edit Tickets — adding the marker to
existing files after an upgrade included — only while you are the single writer.
