# Issue tracker — FrontierMCP and file fallback

Issues and specs live as markdown under `.scratch/`. Vocabulary is defined in the project's
`CONTEXT.md` when present — Effort, Board, Header doc, Map, Spec, Ticket, Edge, Frontier.

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
— a Ticket id is not repo-unique, so `T10 updated` looks the same whichever repository answered, and
this line is the only part of the result that tells you. Reads do not carry it, and neither do the
read paths of write-capable tools: `edit_map` with no section fields, `spec` with no `content`, and
`migrate_effort` with `preview`.

A repo with no `.scratch/` yet is not an error. Create an Effort by writing to it with `create: true`
on `create_tickets`, `edit_map`, or `spec`.

## MCP tools

Eight tools permanently. Optional arguments extend an existing tool; there is no ninth.

| Tool | Use when |
| --- | --- |
| `list_efforts` | Orient — list Efforts with Ticket counts, header doc kinds, and Frontier size. |
| `get_board` | See the whole Effort cheaply — Destination, one summary line per Ticket, Frontier marked. Never returns bodies. |
| `get_tickets` | Fetch full bodies for specific ids after the Board tells you which Tickets matter. |
| `create_tickets` | Publish a breakdown in one call. Declare Edges with temporary keys; the server assigns ids and numbers. |
| `update_ticket` | Claim, resolve, drop, set triage, replace Edges, comment, or tick acceptance criteria. One Ticket per call. |
| `edit_map` | Edit Map sections — Destination, Notes, fog, Out of scope. Decisions-so-far regenerates from resolved Tickets. |
| `spec` | Read or write a Spec as a whole document. |
| `migrate_effort` | Normalize Legacy Tickets in an Effort. Preview writes nothing; filename rename is opt-in. |

### Typical agent flow

1. `list_efforts` — pick an Effort.
2. `get_board` on that Effort — read the Frontier (`>` marker).
3. `get_tickets` on the ids you will work — read bodies only for those Tickets.
4. `update_ticket` with `claim` before starting work.
5. `update_ticket` with `resolve` or `drop` when done; tick criteria and comment as you go.
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
| edit the Map | `edit_map` |
| write or read the Spec | `spec` |
| normalize legacy files | `migrate_effort` |

Claims are compare-and-set — a parallel session that already holds the Ticket wins. Writes carry the
`revision` from the last read; a mismatch is refused, never retried over the caller's edit.

## File conventions

These conventions are canonical whether FrontierMCP is loaded or not. FrontierMCP reads and writes
the same files; a session without the server still produces valid Tickets by following this section.

**Canonical is not licence to allocate ids by hand.** When FrontierMCP is loaded, ids come from
`create_tickets` and are never derived by scanning. The server allocates each candidate under a
repo-global `.scratch/.frontier-id-T<n>.guard` and re-scans while holding every guard; a file
written straight to disk takes part in none of that, so it is the naive `max + 1` that
[ADR 0005](../adr/0005-ids-are-allocated-under-a-guard-and-a-rescan.md) was written against —
measured there, four processes creating three Tickets each produced thirteen files carrying four
distinct ids, and duplicates are silent. A *guessed* id passed to `create_tickets` costs nothing;
the server allocates and discards the guess. Only the hand-written file breaks.

### Layout

- One Effort per directory: `.scratch/<effort-slug>/`
- The header doc is `spec.md` (from `/to-spec`) or `map.md` (from `/wayfinder`). An Effort charted as a
  Map may later gain a Spec — that is wayfinder's handoff, not a mistake.
- Tickets are one file per Ticket under `.scratch/<effort-slug>/issues/` — never a single combined
  tickets file.
- Ticket filenames are `<NN>-T<n>-<slug>.md`. `NN` is sort order only and may be rewritten. `T<n>` is
  the identity and never changes.
- **Ticket ids are `T<n>`, unique across the whole repo.** With FrontierMCP loaded, `create_tickets`
  assigns them and you never scan for the next one. Only when the server is absent: before creating
  a Ticket by hand, scan every `.scratch/*/issues/` for the highest existing `T` number and continue
  from there — ids do not restart per Effort. A bare `T47` therefore resolves anywhere in the repo,
  including in commit messages.
- Formal metadata goes in YAML frontmatter. Prose stays prose.

### Ticket frontmatter

```yaml
---
id: T12                     # T<n>, repo-unique, never reused
title: Parse legacy tickets without frontmatter
kind: build                 # build | decision
type: research              # decision only: research | prototype | grilling | task
status: open                # open | claimed | resolved | dropped
triage: ready-for-agent     # see triage-labels.md
blocked_by: [T09, T11]      # plain ids, resolved repo-wide
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
- **Blocking**: the `blocked_by` list. A Ticket is unblocked when every id it lists is `resolved`.
- **Frontier**: Tickets that are `open`, unblocked, and unclaimed; lowest `NN` first.
- **Claim**: set `status: claimed` with `claimed_by` and `claimed_at`, and save, before any work.
- **Resolve**: append the answer under `## Answer`, set `status: resolved` and a one-line
  `answer_gist`, then add the pointer line to the Map's Decisions-so-far.
- **Rule out of scope**: set `status: dropped` with a `dropped_reason`, and add the line to the Map's
  Out of scope. Do not put it in Decisions-so-far — that section records the route actually walked.

When FrontierMCP is loaded, prefer the MCP calls in the table above over hand-editing these fields.

### Hand publish (no FrontierMCP)

**Everything below holds only while FrontierMCP is absent from the session.** With the server
loaded, `create_tickets` publishes the breakdown and is the only thing that may allocate an id;
hand-writing the file bypasses the guards, per the File conventions preamble.

When a skill says "publish to the issue tracker" and FrontierMCP is not loaded, create
`.scratch/<effort-slug>/issues/<NN>-T<n>-<slug>.md` (creating directories as needed), assign the next
repo-global `T<n>` by scanning as described above, and write frontmatter matching the template above.
