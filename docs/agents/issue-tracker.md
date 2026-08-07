# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`. Vocabulary is defined in
[CONTEXT.md](../../CONTEXT.md) — Effort, Board, Header doc, Map, Spec, Ticket, Edge, Frontier.

This repo builds Frontier, an MCP server over exactly this layout. Until it ships, the conventions
below are followed by hand. They are written to Frontier's target schema deliberately, so the Tickets
written now are schema-conformant and need no migration later.

## Conventions

- One Effort per directory: `.scratch/<effort-slug>/`
- The header doc is `spec.md` (from `/to-spec`) or `map.md` (from `/wayfinder`). An Effort charted as a
  Map may later gain a Spec — that is wayfinder's handoff, not a mistake.
- Tickets are one file per Ticket under `.scratch/<effort-slug>/issues/` — never a single combined
  tickets file.
- Ticket filenames are `<NN>-T<n>-<slug>.md`. `NN` is sort order only and may be rewritten. `T<n>` is
  the identity and never changes.
- **Ticket ids are `T<n>`, unique across the whole repo.** Before creating one, scan every
  `.scratch/*/issues/` for the highest existing `T` number and continue from there — ids do not restart
  per Effort. A bare `T47` therefore resolves anywhere in the repo, including in commit messages.
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

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<effort-slug>/`, creating the directory if needed.

## When a skill says "fetch the relevant ticket"

Read the file whose frontmatter `id` matches. The user will normally pass the id (`T12`) or the path.

## Wayfinding operations

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

## Once Frontier ships

The conventions above stay true and become the fallback. The MCP tools replace hand-parsing: a Board
query instead of reading every Ticket, batch creation instead of a file-writing loop, compare-and-set
claims instead of hoping no parallel session took the same Ticket. A skill run in a session without the
server loaded still works by following this document literally.
