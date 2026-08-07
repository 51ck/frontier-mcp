# Frontier

MCP server name `frontier`; npm package `frontier-mcp`; tools namespaced `mcp__frontier__*`.

This repository runs on the **DOX framework** — the AGENTS.md hierarchy defined below. This file is
the DOX rail: project-wide instructions, durable workflow rules, and the top-level Child DOX Index.

## Purpose

An MCP server exposing the markdown issue tracker under a repo's `.scratch/` as a queryable graph, so
agents stop re-parsing prose to find what is open, blocked, or takeable. Serves the engineering skills
(`/to-tickets`, `/wayfinder`, `/triage`, `/to-spec`, `/implement`) without forking them.

Vocabulary is defined in [CONTEXT.md](./CONTEXT.md) and is binding on code, tools, and docs.

## Ownership

Root owns everything in this repository. No child `AGENTS.md` yet.

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay
  understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and
   continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update
child docs when parent changes alter local rules. Remove stale or contradictory text immediately.
Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still
must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow
  rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules,
  responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are
  no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty
  and update it when one exists

Default section order:

- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer
  exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## Local Contracts

Design decisions settled and binding until an ADR revises them:

- **Markdown is canonical, behind a storage driver seam.** Files under `.scratch/` are the source of
  truth and the only driver in v1. Any index the server keeps is derived and rebuildable, invalidated
  by an fs watcher. A SQLite driver with `md ↔ db` conversion is planned; the seam exists in v1 so it
  can land without touching the tool layer. See [ADR 0001](./docs/adr/0001-markdown-canonical-behind-a-storage-driver.md).
- **The server owns writes.** Full CRUD through tools; hand-editing stays legal but is what the
  schema drifts from.
- **`.md` with YAML frontmatter.** Not `.mdc`.
- **Formal metadata in frontmatter, prose in the body.** Identity, status, edges, and kind are fields.
  Everything an agent reads as prose stays prose.
- **Stable `id`, cosmetic filename.** Ticket ids are `T<n>` from a repo-global counter, unique across
  every Effort, never reused or changed. `<NN>-T<n>-<slug>.md` carries sort order in `NN` only.
  Frontmatter is the authority — on disagreement the file is renamed, never the field. Edges are plain
  ids resolved repo-wide; there is no compound cross-Effort reference form.
- **Type what gets surgically mutated; leave the rest opaque.** The Map has typed sections because
  wayfinder edits them section by section. The Spec is an opaque body because nothing edits it.
- **Derive, don't store, what tickets already know.** The Map's Decisions-so-far renders from resolved
  tickets. The frontier is computed. Neither is written to disk as state. See
  [ADR 0002](./docs/adr/0002-map-decisions-derived-from-tickets.md).
- **Lenient on read, strict on write.** Legacy files parse best-effort and are flagged; a write
  normalizes them. Reads never mutate files.
- **Scope stops at `.scratch/`.** `CONTEXT.md` and `docs/adr/` are out — they have no graph and low
  volume. Tickets reference ADRs as plain links.
- **Never fork the engineering skills.** They update upstream. Adapt them through
  `docs/agents/issue-tracker.md`, which every skill already treats as the extension point.

Structure served:

```
.scratch/<effort>/
├── map.md            # wayfinder header doc — typed sections
├── spec.md           # to-spec header doc — opaque body
└── issues/
    └── NN-slug.md    # tickets
```

Anything else in an effort directory is ignored, never an error.

## Work Guidance

TypeScript, Node 24, stdio MCP server.

## Verification

No verification framework yet.

## Agent skills

### Issue tracker

Local markdown under `.scratch/<effort-slug>/`. See [docs/agents/issue-tracker.md](./docs/agents/issue-tracker.md).

### Triage labels

The five canonical roles, unchanged. See [docs/agents/triage-labels.md](./docs/agents/triage-labels.md).

### Domain docs

Single-context — root `CONTEXT.md` + `docs/adr/`. See [docs/agents/domain.md](./docs/agents/domain.md).

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md.

## Child DOX Index

- No child AGENTS.md files are needed for the current repository structure.
- Root-owned files: [CONTEXT.md](./CONTEXT.md) (glossary), [docs/adr/](./docs/adr/) (decision records),
  [docs/agents/](./docs/agents/) (skill configuration — tracker conventions, triage labels, domain docs).
- `.scratch/` holds this repo's own Efforts, in the same layout Frontier serves — currently
  [frontier-v1](./.scratch/frontier-v1/spec.md). It is work tracking, not source; no child AGENTS.md.
