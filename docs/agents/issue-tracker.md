# Issue tracker — FrontierMCP and file fallback

Tracker doc revision 8. To check a vendored copy, compare this number with the one in the
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
read paths of write-capable tools: `edit_map` with no section fields, `spec` with no `content`, and
`migrate_effort` with `preview`.

A repo with no `.scratch/` yet is not an error. Create an Effort by writing to it with `create: true`
on `create_tickets`, `edit_map`, or `spec`.

## MCP tools

Eight tools permanently. Optional arguments extend an existing tool; there is no ninth.

| Tool | Use when |
| --- | --- |
| `list_efforts` | Orient — list Efforts with Ticket counts, header doc kinds, and Frontier size. A repository with no `.scratch/` at all gets `no tracker here`, the marker that located the root, and a `start one` line to copy; an empty `.scratch/` still reads `(no efforts)`. |
| `get_board` | See the whole Effort cheaply — Destination, one summary line per Ticket, Frontier marked. Never returns bodies. |
| `get_tickets` | Fetch full bodies for specific Tickets, by name or id, after the Board tells you which matter. |
| `create_tickets` | Publish a breakdown in one call. You give each Ticket its `name`; Edges may name a sibling from the same call. All are written or none. |
| `update_ticket` | Claim, resolve, drop, reopen, release, set title/kind/type, set triage, replace Edges, comment, tick acceptance criteria, or `drop_keys` to delete Unimported frontmatter keys. One Ticket per call. |
| `edit_map` | Edit Map sections — Destination, Notes, fog, Out of scope. Decisions-so-far regenerates from resolved Tickets. |
| `spec` | Read or write a Spec as a whole document. |
| `migrate_effort` | Normalize an Effort: give Foreign Tickets — files with no parseable frontmatter — the schema block, and rewrite bare sort-order Edges (`01`) to names. Names and filenames never change. Preview writes nothing. |

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
| normalize foreign files | `migrate_effort` |

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
A Board counts `resolved` Tickets with no `answer_gist`, `dropped` with no `dropped_reason` and
`claimed` with no `claimed_by` or `claimed_at` in its warnings, so set the field with the Status.

Claims are compare-and-set — a parallel session that already holds the Ticket wins. Writes carry the
`revision` from the last read; a mismatch is refused, never retried over the caller's edit.

## File conventions

These conventions are canonical whether FrontierMCP is loaded or not. FrontierMCP reads and writes
the same files; a session without the server still produces valid Tickets by following this section.

**Nothing allocates an id.** A new Ticket's name is its file's, chosen by whoever writes it — ADR
0008 in the frontier-mcp repository. Never scan for a next number and never write an `id:` field.
When FrontierMCP is loaded, still create through `create_tickets`: it checks each name and Edge,
which a file written straight to disk skips.

### Layout

- One Effort per directory: `.scratch/<effort-slug>/`.
- An Effort slug is one directory name: no path separator, no leading dot.
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

```yaml
---
title: Parse tickets without frontmatter   # no id: the filename is the name
kind: build                 # build | decision
type: research              # decision only: research | prototype | grilling | task
status: open                # open | claimed | resolved | dropped
triage: ready-for-agent     # see triage-labels.md
blocked_by: [fence-split, auth.token-cache, T9]  # name here, <effort>.<name>, or an existing id
claimed_by:                 # required when status: claimed
claimed_at:                 # timestamp, set with claimed_by
answer_gist:                # required when status: resolved — one line, every kind
dropped_reason:             # required when status: dropped
---
```

Body shape follows whichever skill produced the Ticket: Problem / Done when / acceptance criteria for
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
the template above. Choose the name as under [Names and references](#names-and-references), and
check it is free yourself: no file in `issues/` has that stem, case and any `<digits>-` prefix
ignored, and no Ticket carries it as an `id`.
