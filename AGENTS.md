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
- **A write never reformats what it did not touch.** Frontmatter round-trips through the `yaml`
  package's document API, not a frontmatter library that re-serializes the whole block. See
  [ADR 0003](./docs/adr/0003-frontmatter-round-trips-through-a-yaml-document.md).
- **Eight tools, permanently.** Every tool schema is context in every session, against a project
  whose whole purpose is token cost. A ninth tool is not a trade-off to weigh; an optional argument
  on an existing tool is the answer. The eight are named in the spec's Tool surface table.
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

TypeScript, Node 24, stdio MCP server. pnpm — never npm or yarn.

Stack, settled:

- **`@modelcontextprotocol/sdk`** for the server, **zod** for tool input schemas. No protocol
  revision is pinned; the SDK negotiates. It currently tops out at `2025-11-25` while the published
  spec is at `2026-07-28` — irrelevant here, because the only feature we cared about in that revision
  is Roots, which we deliberately do not use.
- **`yaml`** (`parseDocument`) for frontmatter, per ADR 0003. Not `gray-matter`.
- **`node:fs.watch` with `{ recursive: true }`** for T8 — supported on macOS and Windows, and on
  Linux since Node 19.1. A full scan is single-digit milliseconds at these volumes, so the watcher
  debounces and rebuilds the index wholesale; per-file event granularity, which is what chokidar
  actually buys, is worth nothing here.
- **`tsc` alone** for the build, no bundler. The only heavy dependency is the SDK, and bundling it
  would inline express and hono for a stdio server that needs neither.
- **`oxlint`** for linting and **`oxfmt`** for formatting. No ESLint, no Prettier.
  - `oxfmt` is configured to the style the repo already had — single quotes, `printWidth` 100 to
    match the prose in these docs, `arrowParens: avoid` — rather than the other way round.
  - It never touches markdown. `**/*.md` and `.scratch/**` are in `ignorePatterns`, because
    `.scratch/` is the tracker data this server exists to serve and becomes T2's fixtures; a
    formatter rewrapping it would corrupt the input under test.
  - `oxfmt` sorts `package.json` keys by default. That is left on.
  - Lint categories are `correctness`, `suspicious`, and `perf`. `pedantic`, `style`, and
    `restriction` are off — they need a suppression list before they say anything useful.
- Imports name `.ts` files and `rewriteRelativeImportExtensions` emits `.js`, so `node src/bin.ts`
  runs under Node's native type stripping with no build step. `erasableSyntaxOnly` keeps it that way
  — no enums, no namespaces, no parameter properties.
- TypeScript 7 needs `"types": ["node"]` set explicitly; it does not pick up `@types/node` on its own.

Source layout:

| Path | Holds |
| --- | --- |
| `src/domain.ts` | The CONTEXT.md vocabulary as types. Naming here is bound by the glossary, including its `_Avoid_` lines. |
| `src/frontier.ts` | The Frontier computation. Takes every Ticket in the workspace, because Edges resolve repo-wide. |
| `src/storage/driver.ts` | The ADR 0001 seam, its edit vocabulary, and its typed failures. |
| `src/storage/markdown/` | The only driver, and the only place that knows the `.scratch/` layout — `frontmatter.ts` splits the fence, `ticket.ts` parses a Ticket, `legacy.ts` infers one from prose, `header-doc.ts` reads the Map's sections, `serialize.ts` applies an edit, `write.ts` renames it into place. |
| `src/workspace.ts` | Workspace resolution — the one place above the driver that reads the filesystem, and only to locate a repository root. |
| `src/workspace-index.ts` | The in-memory index, one per resolved workspace. |
| `src/tools/` | One module per tool: its input schema, its description, and how its result renders. |
| `src/server.ts` | Wires the above into an `McpServer`. |
| `src/index.ts` | The package's library surface. Deliberately narrow — below-seam modules are not exported. |
| `src/bin.ts` | The stdio entry point. |

Nothing under `src/tools/` may import from `src/storage/`.

Rendering rules that are load-bearing, not cosmetic:

- **A Board never carries a body.** Bodies come from `get_tickets`, by id, only for the Tickets
  actually being worked.
- **Warnings are grouped, never itemized per Ticket.** An Effort of Legacy Tickets carries a dangling Edge
  on nearly every Ticket; itemizing produced a warnings block longer than the Board it annotated,
  which undoes the saving the Board exists to deliver.
- **A foreign blocker renders `T9@beta`, a local one bare.** There is no compound cross-Effort
  reference form, so the Board is the only thing that can make a foreign Edge followable.
- **An unresolvable Edge renders `T9?`** and is counted in the warnings block. It never silently
  makes a Ticket look takeable.
- **Every Ticket is nameable.** A Legacy Ticket with no id gets an `<effort>#<order>` handle, which
  `get_tickets` accepts. It is an address, not an id — not repo-stable, and never usable as an Edge —
  but without it a whole Effort has no route to its own bodies.
- **A Spec-only Effort opens with its Spec's first paragraph**, labelled `spec:` rather than
  `destination:`. Destination is a Map section; calling a Spec's opening one would be a lie in the
  vocabulary. Multi-line header prose has its continuation lines indented so it can never be read as
  further Ticket lines.

Write rules, equally load-bearing:

- **Atomic or not at all.** Write a temporary file in the same directory, rename over the target.
  No lock files, ever — a crashed session must never be able to wedge the tracker.
- **Claims are guarded by a revision-keyed exclusive create**, per [ADR 0004](./docs/adr/0004-claims-are-guarded-by-a-revision-keyed-exclusive-create.md). An optimistic check alone is not compare-and-set across processes — measured, four sessions claiming one Ticket produced three false winners.
- **Every write carries the revision it read.** `TicketSummary.revision` is opaque above the seam;
  the markdown driver builds it from modification time and size, a SQLite driver would use a
  rowversion. The check runs against the file immediately before the write, not against the index,
  because the index may be stale.
- **A write never reorders frontmatter.** New fields are appended; only a block this driver creates is in schema order. `flowCollectionPadding: false` matters — without it an untouched `[a, b]` comes back `[ a, b ]`.
- **A write never touches a body section it does not own.** The answer replaces up to the next `##`, so the comment log survives.
- **A mismatch is never retried.** It is re-read only to produce a better message — usually
  "already claimed by X" — and then the original failure is raised. A mismatch may equally be
  somebody's hand edit, and overwriting that is what the check exists to prevent.
- **Writes are serialized per workspace.** Otherwise two calls racing on one Ticket both pass the
  revision check before either renames, and the loser's edit is lost rather than refused.
- **A write normalizes the Legacy file it touches**, and keeps the prose it inferred from verbatim.
- **Claims are flagged when stale, never released.** 24h; auto-expiry is out of scope.

Annotation rules — a comment, a ticked criterion, and a Triage role are records of work, not moves
in the graph:

- **Nothing is injected into content an agent wrote.** A comment is stored byte-for-byte, including
  `/triage`'s mandatory disclaimer, which is the skill's own to write.
- **Ticking a criterion changes only its checkbox.** Every other line of the body stays
  byte-identical, and the criterion keeps its own indentation and wording.
- **Naming a criterion that does not exist fails**, rather than writing nothing and reporting success.
- **A Triage role never moves the Frontier.** Only Status and Edges decide what is takeable, so
  `/triage` and the graph never compete for one field. A `wontfix` Ticket stays takeable and is named
  in the warnings block instead, leaving the judgement to the reader.

`superseded` and `deferred` are a different matter: read from a Legacy `Status:` line they map to
`dropped`, and so do orphan their dependents. That is not inconsistent with the rule above — they are
Statuses being inferred, where `wontfix` is a Triage role being respected as one. Inference gets to
lean conservative because it is guessing; a role the caller set explicitly does not, because it was
never a guess.

## Verification

```
pnpm run check        # typecheck + lint + format:check — what pre-commit runs
pnpm test             # vitest, the MCP tool layer only
pnpm run build        # tsc emit to dist/
```

Individually: `typecheck` (tsc over src and test), `lint` / `lint:fix` (oxlint), `format` /
`format:check` (oxfmt).

`.githooks/pre-commit` runs `check` — never `test`, which is slow enough to make people reach for
`--no-verify` out of habit. The hook **checks and never rewrites**: a hook that reformats mid-commit
can stage changes you deliberately left unstaged. When it fails, run `pnpm run format` or
`pnpm run lint:fix` yourself.

It checks the working tree, not the staged content, so staging a fix while leaving a broken version
on disk still fails. `git commit --no-verify` skips it.

Hooks are wired by `core.hooksPath`, set by the `prepare` script on `pnpm install` — so a fresh
clone needs one `pnpm install` before the hook is live, and nothing needs to be committed into
`.git/`. The hook shells out to `pnpm`, so it needs `pnpm` on `PATH`; a GUI git client with a
stripped environment will not find it.

Tests enter through `test/support/harness.ts` — a real MCP client speaking to the server in-process
over a linked transport pair, against a temporary fixture tree. That is the only test seam, per the
spec's testing decisions. Nothing below the tool layer gets a test entry point of its own, and a test
that would need one is a design signal, not a reason to add a seam.

`test/fixtures/legacy/` holds two Efforts copied **verbatim** out of sobrina and tag-customizer.
Never tidy them, and refresh them by re-copying rather than editing: they are the real input, and
every awkward shape in them is a case the parser has to survive — `T31` ids in headings,
tag-customizer Tickets with no id at all, `Blocked by: —`, bare `Blocked by: 01, 02` sort orders,
sub-slice references like `T38.1`, `Status:` lines with trailing prose, and a `research/` directory
the schema does not recognize.

Shapes the parser handles that these two Efforts happen **not** to contain — struck-through Edges,
`Status: done` / `fixed` / `superseded`, bold field labels — are covered by synthetic files in
`test/legacy-shapes.test.ts`. Put new shapes there; never add them to the fixtures.

`test/read-path-cost.test.ts` asserts the spec's token measurements. They are the argument for the
project existing, so they are checked rather than restated.

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

- No child AGENTS.md files are needed for the current repository structure. `src/` and `test/` are
  small enough that Work Guidance above covers them; `src/storage/` earns its own doc the day a second
  driver lands.
- Root-owned files: [CONTEXT.md](./CONTEXT.md) (glossary), [docs/adr/](./docs/adr/) (decision records),
  [docs/agents/](./docs/agents/) (skill configuration — tracker conventions, triage labels, domain docs).
- `.scratch/` holds this repo's own Efforts, in the same layout Frontier serves — currently
  [frontier-v1](./.scratch/frontier-v1/spec.md). It is work tracking, not source; no child AGENTS.md.
