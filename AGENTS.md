# FrontierMCP

The product is **FrontierMCP**; "Frontier" alone always means the set of takeable Tickets. MCP server
name `frontier`; npm package `frontier-mcp`; tools namespaced `mcp__frontier__*`.

This repository runs on the **DOX framework** — the AGENTS.md hierarchy defined below. This file is
the DOX rail: project-wide instructions, durable workflow rules, and the top-level Child DOX Index.

## Purpose

An MCP server exposing the markdown issue tracker under a repo's `.scratch/` as a queryable graph, so
agents stop re-parsing prose to find what is open, blocked, or takeable. Serves the engineering skills
(`/to-tickets`, `/wayfinder`, `/triage`, `/to-spec`, `/implement`) without forking them.

Vocabulary is defined in [CONTEXT.md](./CONTEXT.md) and is binding on code, tools, and docs.

## Ownership

Root owns the application, tracker, and project configuration. The children
[.agents/skills/AGENTS.md](./.agents/skills/AGENTS.md) and [scripts/AGENTS.md](./scripts/AGENTS.md)
own installed upstream skills and runtime/setup scripts respectively.

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
  truth and the only driver in v1. A driver is the workspace *cached and live*: what it holds, when
  that goes stale, and how it hears that another process wrote are answers about one physical model,
  so a layer above the seam settling them for every driver would be one model's policy wearing a
  generic interface. A SQLite driver with `md ↔ db` conversion is planned; the seam exists in v1 so
  it can land without touching the tool layer. See [ADR 0001](./docs/adr/0001-markdown-canonical-behind-a-storage-driver.md).
- **The server owns writes.** Full CRUD through tools; hand-editing stays legal but is what the
  schema drifts from.
- **Every tool states the side effects that are meaningful for it.** `destructiveHint` and
  `openWorldHint` both default to *true* when omitted, so silence declared a purely-local `.scratch/`
  editor open-world and the additive `create_tickets` destructive. All eight tools set
  `openWorldHint: false`. The five writers also set `destructiveHint` — `false` on `create_tickets`
  alone, `true` out loud on the four that replace or remove, so that the one `false` reads as a
  decision rather than an oversight. The three readers set neither `destructiveHint` nor
  `idempotentHint`: both are meaningless under `readOnlyHint: true`. Pinned in `test/ship.test.ts`.
- **The Ticket id pattern lives in `<storageDir>/frontier.yml`** (`id_pattern`, the only key), read
  once at driver construction and never watched. Tokens are `<N>`, `<b36{n}>`, `<b16{n}>` and
  literals in `[A-Za-z0-9._-]`; `<effort>` is refused, and every pattern must begin with a literal
  letter or underscore (T55). Absent file or key is the default `T<b36{6}>`, silently. An unparseable
  file or illegal pattern shows in the Board's warnings (`StorageDriver.workspaceWarnings()`) and
  makes every write refuse with `InvalidWorkspaceConfig` — never a fallback to the default. Read
  paths still work, including `migrate_effort` preview and `edit_map`/`spec` calls that change
  nothing; a fix takes effect after a server restart. The
  compiled pattern carries `needsCoordination` and `survivesMerge`, and compiles once into the
  minting plan. Id matching consumes it too: `StorageDriver.isId()` answers from the pattern (any
  length per random token, so existing `T<n>` ids still match the default), and `create_tickets`
  refuses a temporary key that would match it or that is an existing Ticket's id. Under a broken config `isId` answers from
  the default. Rules: T52–T55 in
  `.scratch/ids-patterns/`.
- **`.md` with YAML frontmatter.** Not `.mdc`.
- **Formal metadata in frontmatter, prose in the body.** Identity, status, edges, and kind are fields.
  Everything an agent reads as prose stays prose.
- **Stable `id`, cosmetic filename.** Ticket ids are minted from the id pattern — random
  `T<b36{6}>` by default — unique across every Effort, never reused or changed, though a counted
  one may be skipped. Existing `T<n>` ids stay valid. `<NN>-<id>-<slug>.md` carries
  sort order in `NN` only. Frontmatter is the authority — on disagreement the field wins, and the
  filename is never rewritten: another Effort's prose may link it by path. Edges are plain ids resolved repo-wide; there is no compound cross-Effort reference form.
- **A random pattern draws; a `<N>` pattern counts under a guard.** Random ids are drawn and checked
  against the batch's scan, redrawn on a hit up to a bounded limit, with no guard files. Any pattern
  containing `<N>`, mixed ones included, takes `max + 1` over the ids in its namespace, so there is
  no counter file to drift. The exclusive create is taken on a separate guard file keyed on the `<N>`
  value rather than on the Ticket file or the rendered id, because two sessions minting one counter
  into different Efforts, or with different random parts, write different paths and would collide
  over nothing. See [ADR 0006](./docs/adr/0006-ids-are-minted-by-pattern-and-guarded-only-when-counted.md).
- **Type what gets surgically mutated; leave the rest opaque.** The Map has typed sections because
  wayfinder edits them section by section. The Spec is an opaque body because nothing edits it.
- **Derive, don't store, what tickets already know.** The Map's Decisions-so-far renders from resolved
  tickets. The frontier is computed. Neither is written to disk as state. See
  [ADR 0002](./docs/adr/0002-map-decisions-derived-from-tickets.md).
- **Lenient on read, strict on write.** Foreign files — no fence, a fence that does not parse, or a fence with no
  `id` and a key outside the schema — parse best-effort and are flagged Foreign. A write normalizes
  one with no parseable fence; a foreign fence is governed by its own rendering rule below. Reads
  never mutate files. See
  [ADR 0007](./docs/adr/0007-conversion-is-lazy-and-foreign-is-a-conformance-predicate.md).
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

TypeScript, Node 24 development, stdio MCP server. pnpm — never npm or yarn. The emitted package
supports Node 20.20.2+ on 20.x, 22.17.1+ on 22.x, and 24.15.0+ on 24.x; `src/` still requires Node
24's native TypeScript execution.

Stack, settled:

- **`@modelcontextprotocol/server`** for the server, **zod** for tool input schemas. No protocol
  revision is pinned; the SDK negotiates. It settles on `2025-11-25` while the published spec is at
  `2026-07-28` — irrelevant here, because the only feature we cared about in that revision is Roots,
  which we deliberately do not use.
  - The v1 monolith `@modelcontextprotocol/sdk` is **not** what we depend on. It split into a scoped
    family at `2.0.0` — `/server`, `/client`, `/node` — and T30 moved us onto it. `/client` is a dev
    dependency, for the test harness only. `/node` is HTTP-only and has no place in a stdio server.
  - The move changed nothing on the wire; it was a dependency-line decision, measured in
    `docs/research/sdk-v2-family.md`.
- **`yaml`** (`parseDocument`) for frontmatter, per ADR 0003. Not `gray-matter`.
- **`node:fs.watch`** for T8 — recursive on macOS and Windows, one watch per directory on Linux,
  for the reason at the end of this bullet. A re-scan costs ~13ms at this repo's size — see the scan-cost paragraph
  below — cheap enough that the watcher debounces and drops the driver's whole scan; per-file event
  granularity, which is what chokidar actually buys, is worth nothing here. A watch is **not live
  when `watch()` returns** — on macOS libuv registers the FSEvents stream off-thread, and a change
  landing in that window is dropped outright rather than replayed. So every attach also schedules a
  few unconditional invalidations on a settle schedule; without them a server started and
  hand-edited immediately serves a stale Board until the next edit.
  `{ recursive: true }` is used only on macOS and Windows, where it is native. On Linux it is
  Node's JavaScript emulation, which from 24.22.0 throws `ENOTDIR` inside its own event callback
  when a watched directory is replaced by a same-named file — uncatchable, so the server died
  (T99, nodejs/node#66791). There the watcher keeps one non-recursive watch per directory and
  re-syncs that set before each debounced invalidation.
- **`tsc` alone** for the build, no bundler. The SDK stopped being a heavy dependency at the scoped
  split: `/server` brings a runtime closure of three packages — itself, `/core` and zod — where the
  v1 monolith brought 91, express and hono among them. There is nothing left that bundling would
  collapse, and `/server` ships its validator pre-bundled rather than resolving one.
- **`oxlint`** for linting and **`oxfmt`** for formatting. No ESLint, no Prettier.
  - `oxfmt` is configured to the style the repo already had — single quotes, `printWidth` 100 to
    match the prose in these docs, `arrowParens: avoid` — rather than the other way round.
  - It never touches markdown or installed upstream skills. `**/*.md`, `.scratch/**`, and
    `.agents/skills/**` are in `ignorePatterns`: tracker data is input under test, and skill files
    stay as their upstream copies.
  - `oxfmt` sorts `package.json` keys by default. That is left on.
  - Lint categories are `correctness`, `suspicious`, and `perf`. `pedantic`, `style`, and
    `restriction` are off — they need a suppression list before they say anything useful.
- Imports name `.ts` files and `rewriteRelativeImportExtensions` emits `.js`, so `node src/bin.ts`
  runs under Node's native type stripping with no build step. `erasableSyntaxOnly` keeps it that way
  — no enums, no namespaces, no parameter properties.
- TypeScript 7 needs `"types": ["node"]` set explicitly; it does not pick up `@types/node` on its own.
- **`release-it`** with **`@release-it/conventional-changelog`** cuts releases, configured in
  `.release-it.json` and driven by `.github/workflows/release.yml`. **This bullet is the only place
  the release rationale is written down**; the README tells a releaser what to do and points here for
  why, so a change lands in one file rather than three. Six things in that config and workflow are
  load-bearing and will look like cruft to anyone who does not know the reason:
  - It publishes through **`pnpm publish`**, not npm — `npm.publishPackageManager`. No step needs a
    globally installed npm, and whatever OIDC needs has to come from pnpm.
  - Auth is npm **Trusted Publishing (OIDC)**, so the workflow sets no `NODE_AUTH_TOKEN` *and* no
    `registry-url`. Both write credentials — a token from a secret that may not exist expands to an
    empty one, and `setup-node`'s `registry-url` writes an `.npmrc` whose `${NODE_AUTH_TOKEN}`
    placeholder pnpm cannot expand, at which point it discards the whole file with a warning.
  - **`npm.skipChecks` is on.** Release-it's pre-publish checks run `npm whoami` (`isAuthenticated`)
    and `npm access list collaborators` (`isCollaborator`). Neither has an answer when the only
    credential is a short-lived OIDC token, so leaving the checks on fails every release.
  - **`npm.publishArgs` carries `--no-git-checks`**, which is a *different* check from the one above:
    that one is release-it's, this one is pnpm's own refusal to publish from a dirty tree. Release-it
    bumps the version and rewrites `CHANGELOG.md`, then publishes, and only *then* commits and tags —
    so the tree is dirty at publish time by construction, with release-it's own two files and nothing
    else. Left on, it fails every release with `ERR_PNPM_GIT_UNCLEAN`. Turning it off here rather
    than in an `.npmrc` keeps the guard alive for every other `pnpm publish` in the repo.
  - **pnpm is pinned to 10** in the workflow. 11 404s on OIDC publish (pnpm/pnpm#11513).
  - **Node is pinned to 24.15.0** in the workflow, the floor `runtime.yml`'s development job
    tests on. That job also tests the newest 24, but a floating `24` here can resolve to a release
    newer than the gate's last run, which is how a release once failed on a Node the gate had never
    seen (T99). Move the floor pin in both files together.

  The CHANGELOG intro lives in the plugin's `header` option, because the plugin strips and
  re-prepends only the header it is given and would otherwise bury any prose beneath the newest
  release. Keep that string byte-identical to the head of `CHANGELOG.md`.

**A full workspace scan costs 9–13ms at this repo's size, and this paragraph is the only place those
numbers are written down** — the watcher comments and ADRs 0005 and 0006 cite it rather than restating it.
Harness: [`bench/scan-cost.ts`](./bench/scan-cost.ts), `pnpm run bench:scan`; throwaway by intent
and not shipped. On Node v24.15.0, darwin arm64, Apple M4 Pro, 12 cores, 24GB, n=30 per group,
against this repo's own `.scratch/` — 33 Tickets, 3 Efforts, 102KB — a cold scan is 8.91ms median /
14.97ms p95, the re-scan an invalidation provokes is 12.94ms / 17.28ms, and a warm read off the
cache is 0.01ms. **The re-scan is the operative number** for anything reacting to a write, and it is
not single-digit. Cost is roughly linear in Ticket count above a ~7ms floor: 18.80ms cold / 31.96ms
re-scan at 200 Tickets, 78.73ms / 100.88ms at 1000. A completed scan retains 1.2MB of heap here and
5.2MB at 1000 Tickets; the much larger RSS deltas — 5.5MB and 96.5MB — are transient scan buffers
Node has not handed back to the OS, not retained cost. Two caveats travel with every citation of
these: no scan is OS-cold, because dropping the page cache needs root, so they are the optimistic
end; and the re-scan is slower than the cold scan at every size because `invalidate()` drops the
previous scan just as an equally sized one is allocated, leaving both briefly live — production does
exactly that, so the number is representative rather than an artifact. The volume at which any of
this starts to matter is ~1000 Tickets, thirty times every Ticket in this repo put together and
forty times its largest single Effort.

**Every number above is a floor, not a typical value**, because the machine is a fast one. What the
scan is actually spending is CPU on parsing, not time on disk: re-run under `UV_THREADPOOL_SIZE=1`,
which serializes every file read, and the numbers do not move (9.94ms cold at this repo's size
against 8.91ms). So the cost tracks single-core speed almost exactly, and the honest way to state it
is per Ticket. Re-run pinned to the same machine's efficiency cores — `taskpolicy -b pnpm run
bench:scan`, which is background QoS and the slowest core available here — and the marginal cost is
**~0.46ms per Ticket against ~0.08ms on a performance core, a factor of about six**. Both are flat
in Ticket count; the ~7ms floor above only shows up when a performance core makes the per-Ticket
work small enough to see it. In whole numbers, on efficiency cores this repo's re-scan is 17.93ms
median but 41.71ms p95, and 1000 Tickets is 457.91ms. Assume a reader's machine is somewhere in that
band rather than at the fast end, and note that variance widens far more than the median does — the
worst single cold scan at 1000 Tickets was 1883ms.

To place another machine in that band, the harness prints a **core index**: a fixed unit of the
string and object work a scan is made of, timed. It reads **11ms on this machine's performance cores
and 52ms on its efficiency ones**, and the scan cost between those two runs moved by about the same
factor — so scaling the numbers above by your own index is a fair first estimate. It is printed
because the CPU model is not enough: `cpus()[0].model` returns the same string however the run was
slowed down, so two result files would otherwise be indistinguishable and equally quotable.

Source layout:

| Path | Holds |
| --- | --- |
| `src/domain.ts` | The CONTEXT.md vocabulary as types. Naming here is bound by the glossary, including its `_Avoid_` lines. Ids are opaque here; their shape is the driver's (`isId`). |
| `src/frontier.ts` | The Frontier computation. Takes every Ticket in the workspace, because Edges resolve repo-wide. |
| `src/edges.ts` | Cycle detection over the Edge graph. Above the seam, because a cycle is a rule about the domain rather than about storage — the same reason the Status model is checked in the tool layer. |
| `src/storage/driver.ts` | The ADR 0001 seam, its edit vocabulary, and its typed failures. A driver is the workspace cached and live, so `close()` sits here beside the reads and writes. |
| `src/storage/markdown/` | The only driver, and the only place that knows the `.scratch/` layout, which it takes as a construction parameter — `frontmatter.ts` splits the fence, `ticket.ts` parses a Ticket, `legacy.ts` infers one from prose when there is no parseable fence (named for that one shape, not for Foreign), `header-doc.ts` reads and edits the Map's typed sections and regenerates Decisions-so-far / dropped Out-of-scope between GENERATED markers, `serialize.ts` applies an edit, `create.ts` allocates ids and writes a new batch, `migrate.ts` normalizes an Effort at once, `schema.ts` is the one list of schema frontmatter keys, `id-pattern.ts` reads `<storageDir>/frontier.yml` once at construction and compiles `id_pattern`, `write.ts` renames it into place, `watcher.ts` tells the driver another process moved the workspace under it. |
| `src/workspace.ts` | Workspace resolution — the only module above the driver that reads a *served* repository, and only to locate its root. `.scratch` is a marker only as a directory; `.git` counts as a file too, so a worktree or submodule resolves to itself rather than to the repository enclosing it. |
| `src/driver-registry.ts` | One driver per resolved workspace, and the `closeAll()` that shuts them. A lookup, not a layer: it hands back the driver itself, so no read or write passes through it. |
| `src/tools/` | One module per tool: its input schema, its description, and how its result renders. `workspace-line.ts` is the exception — the single rendering of which repository a call served, shared by `list_efforts` and every write. |
| `src/server.ts` | Wires the above into an `McpServer`. |
| `src/tracker-doc.ts` | Loads the shipped tracker configuration document for the `tracker-doc` MCP resource, from beside `dist/` in the installed package rather than from the working directory. |
| `src/index.ts` | The package's library surface. Deliberately narrow — below-seam modules are not exported. |
| `src/bin.ts` | The stdio entry point. Owns process lifecycle: it exits on client disconnect — the transport closing, stdin EOF, `SIGTERM`, `SIGINT` — so every driver's watcher gets released rather than orphaning the process (T95). |

Nothing under `src/tools/` may import from `src/storage/`.

Exactly two modules above the seam import `node:fs`. `src/workspace.ts` walks for a root marker,
which is asked before there is a driver to ask; `src/tracker-doc.ts` reads a document shipped inside
this package. Neither reads a served repository's tracker data, so neither is a route around the
seam. A third wanting one is a design signal, not a third exception.

Rendering rules that are load-bearing, not cosmetic:

- **A Board never carries a body.** Bodies come from `get_tickets`, by id, only for the Tickets
  actually being worked. The read path is built that way and not merely rendered that way:
  `listTickets` yields `TicketSummary`, so a scan parses frontmatter and keeps no prose, and the
  driver caches exactly what a Board is built from. `readTickets(handles)` opens the named files and
  is the only route to a body — it walks fresh rather than reading the cached scan, which is why
  `get_tickets` can never serve prose another process has already rewritten.
- **A write names the workspace it resolved; a read does not** ([T11](./.scratch/frontier-v1/issues/11-T11-should-a-mutating-call-report-the-workspace-it-r.md)).
  Ticket ids are unique within a repository, not across repositories, so `T10 updated` is as plausible
  against the wrong repository as the right one, and it is the one result a caller cannot check from
  what it got back. A read needs no such line: the wrong repository returns visibly wrong content.
  What decides is *whether the call wrote*, not whether the tool can — `edit_map` with no section
  fields, `spec` with no content, and `migrate_effort` in preview are reads, and pay nothing.
  Measured at ~10 tokens on a typical checkout; a forty-write session costs less than one Board.
- **Warnings are grouped, never itemized per Ticket.** An Effort of Foreign Tickets carries a dangling Edge
  on nearly every Ticket; itemizing produced a warnings block longer than the Board it annotated,
  which undoes the saving the Board exists to deliver.
- **A foreign blocker renders `T9@beta`, a local one bare.** There is no compound cross-Effort
  reference form, so the Board is the only thing that can make a foreign Edge followable. The
  `@<effort>` is never input: a pasted `T9@beta` fails — `NoSuchTicket` on a write, the `not found:` line on
  `get_tickets` — and both name `T9` back.
- **An unresolvable Edge renders `T9?`** and is counted in the warnings block. It never silently
  makes a Ticket look takeable.
- **A duplicate id is one grouped warning**, on every Board, computed from the cached scan the Board
  is built from. One id is one exact string. It names the files of at most 3 ids, 10 more ids bare,
  then counts the rest; the total stays exact. Under a counted pattern it names that pattern as the
  likely cause. Every claimant answers to the real id — only id-less Tickets get a `.2` handle
  suffix — so no handle reaches one claimant. `get_tickets` returns every claimant once under a line
  saying so. An Edge to a duplicated id is satisfied only when every claimant is resolved, and cycle
  checks follow every claimant's Edges: a duplicate never enlarges the Frontier. A Ticket whose own
  id is duplicated is never takeable, because every write to it is refused.
- **A Foreign Ticket is counted by where its fields came from** (T104). One with no parseable
  fence keeps `are Foreign — … inferred`; a foreign-fenced one is counted apart, as fields that
  `came from frontmatter that was not imported`. The distinction crosses the seam as
  `TicketSummary.foreignFenced`.
- **A lifecycle Status missing its field is counted, per Status** (T85): `N/M resolved Tickets
  carry no answer_gist`, likewise `dropped` / `dropped_reason` and `claimed` / `claimed_by` and `claimed_at`. M is
  that Status's count; no handles are listed. A Ticket with no parseable fence is left out of all of them,
  since its answer is prose. Computed from the cached scan. `list_efforts` stays silent on it.
- **An unrecognized status is counted in the warnings block and is never takeable.** The Board line
  may still show `/open`, but the Ticket is kept off the Frontier until a write normalizes it.
- **A `<N>`-only id pattern warns on every `create_tickets` result, never on a read, never
  suppressed** (T56, T68). The tool learns the pattern and its config file from
  `StorageDriver.mergeCollidingIdPattern()`; the text names both, names `T<N>-<b36{4}>`, says
  *regression*, and closes by saying no action is required on this call. It never mentions
  duplicates — the cross-reference runs one way, from the duplicate warning to the pattern.
- **Every Ticket is nameable.** A Ticket with no id gets an `<effort>#<order>` handle, which
  `get_tickets` accepts. It is an address, not an id — not repo-stable, and never usable as an Edge —
  but without it a whole Effort has no route to its own bodies.
- **Unimported keys are shown until an agent drops them.** `get_tickets` appends a Ticket's frontmatter keys
  outside the schema (`Ticket.unimported`, body path only) under `## Unimported frontmatter` as a
  `yaml` block whose backtick delimiter outruns any run inside it. A foreign fence (no `id`) shows
  whole, byte for byte; a Ticket with an `id` shows only its unimported entries, each sliced from the
  file's own text. Conforming Tickets gain nothing. No ordinary write removes them: a comment or
  claim leaves a fence foreign, and `migrate_effort` mints the id but keeps the stray keys, which
  then show as entries. Only `update_ticket` `drop_keys` removes one (T103), cutting each named
  entry out of the fence's text — block scalars, nested maps and sequences whole, a comment on its
  line with it, an own-line comment above it kept — so a drop alone leaves the rest byte-identical.
  A schema key (`SchemaKeyNotDroppable`), an absent key (`NoSuchKey`) or a Ticket with no parseable
  fence (`NoFrontmatterToDrop`, file left un-normalized) fails the whole call. The cut is read back
  before it is written, and refused with `KeyNotCleanlyDroppable` unless exactly the other entries
  survive with the values they had — an alias left without its anchor, a flow mapping sharing the
  entry's line, or an alias falling back to an earlier anchor of the same name would land a fence
  that no longer parses, or one whose `status` quietly changed. A fence left with no key gets the schema block a fenceless
  file gets, never an empty fence. It is allowed on an
  id-less foreign fence: dropping its last unimported key ends the Foreign predicate, so the Ticket
  becomes a schema fence with no id — not Foreign, still in the Board's `no id (N)` warning, and
  no id is minted. The schema key list is single-sourced in `src/storage/markdown/schema.ts`.
- **A missing storage directory explains itself; an empty one does not** (T105). Only when
  `.scratch/` does not exist, `list_efforts` returns four lines: the root line suffixed
  `(resolved by <source>)`, `no tracker here`, a `start one` line naming real `create_tickets` /
  `edit_map` arguments, and the tracker-doc URI. The source comes from `locateWorkspace()` in
  `src/workspace.ts`; existence crosses the seam as `StorageDriver.absentStorage()`, which never
  creates the directory. An empty `.scratch/` keeps `(no efforts)`, and no other result carries the
  `resolved by` suffix — a populated tracker is its own proof of the root.
- **A `migrate_effort` preview predicts no id** (T69). It takes no guard, so a counted prediction
  could be stolen and a random one is discarded; an unminted Ticket is named by its unpadded
  handle everywhere, `blocked_by=` included, so two previews of unchanged files are identical.
  Every report line is labelled reference-style and resolved once in a closing block of
  workspace-root-relative paths. Migration never renames a file: another Effort's prose may link it
  by path, and the server cannot see that link.
- **A Spec-only Effort opens with its Spec's first paragraph**, labelled `spec:` rather than
  `destination:`. Destination is a Map section; calling a Spec's opening one would be a lie in the
  vocabulary. Multi-line header prose has its continuation lines indented so it can never be read as
  further Ticket lines.

Write rules, equally load-bearing:

- **Atomic or not at all.** Write a temporary file in the same directory, rename over the target.
  No lock files, ever — a crashed session must never be able to wedge the tracker.
- **A transient Windows `EPERM` retries the filesystem replace, not the write.** Ticket replacement
  keeps the same staged file and revision guard, rechecks the expected revision before each retry,
  and stops after 10, 20, 40, and 80ms delays. A changed target becomes a revision mismatch; every
  other error and every write without an expected revision fails on its first rename.
- **Claims are guarded by a revision-keyed exclusive create**, per [ADR 0004](./docs/adr/0004-claims-are-guarded-by-a-revision-keyed-exclusive-create.md). An optimistic check alone is not compare-and-set across processes — measured, four sessions claiming one Ticket produced three false winners.
- **Every write carries the revision it read.** `TicketSummary.revision` is opaque above the seam;
  the markdown driver builds it from modification time and size, a SQLite driver would use a
  rowversion. The check runs against the file immediately before the write, not against the cached
  scan, because the scan may be stale.
- **A write never reorders frontmatter.** New fields are appended; only a block this driver creates is in schema order. `flowCollectionPadding: false` matters — without it an untouched `[a, b]` comes back `[ a, b ]`.
- **A write never touches a body section it does not own.** The answer replaces up to the next `##`, so the comment log survives.
- **A Map value that would split its section is refused, never demoted.** A `##` line in
  `destination`, `notes`, `add_fog` or `rule_out` — matched by the reader's own section-break regex,
  fenced code included — fails with `SectionBreakInValue` and writes nothing (T96). So does a
  GENERATED marker in any of the four, which the reader would take for a block the server owns.
  A newline in `add_fog` or `rule_out` fails with `MultiLineBullet` (T98): a bullet is one line
  to the reader, so the rest could never be graduated. Both name the argument, not the section.
- **A write addressed to a duplicated id refuses** with `DuplicateId`, naming every file, before
  any other rule judges one claimant. `update_ticket` asks `StorageDriver.assertAddressable()`
  first, which never writes. A real `migrate_effort` refuses the same way when an inferred id is
  already carried elsewhere; its preview is a read, so it reports the conflict on that Ticket's
  line and still shows the plan. Nothing renumbers: a new id cannot reach the commit messages and
  PR bodies already naming the old one, so a human renumbers all but one file by hand.
- **A mismatch is never retried.** It is re-read only to produce a better message — usually
  "already claimed by X" — and then the original failure is raised. A mismatch may equally be
  somebody's hand edit, and overwriting that is what the check exists to prevent.
- **Writes are serialized per workspace.** Otherwise two calls racing on one Ticket both pass the
  revision check before either renames, and the loser's edit is lost rather than refused.
- **Resolve/drop Map refresh is best-effort.** After the Ticket write lands, regenerating
  Decisions-so-far / dropped Out-of-scope must not make a completed lifecycle change look like a
  failure. The tool returns success with a warning that those blocks may be stale; a later
  successful refresh or Map mutation catches them up.
- **A prose sub-slice coarsens only within its own Effort, decided once at scan** (T82). The prose
  parser keeps what was declared — `T38.1` and a plain `T38` separately — and the markdown driver
  resolves each Effort after every file in it is parsed, so ids from prose headings count. `T38.1`
  becomes `T38` only when `T38` is a Ticket of that Effort (`collapsedRefs`, the Board's coarsened
  warning); otherwise it stays `T38.1` (`keptSubSlices`), dangles as `T38.1?` and keeps the Ticket
  off the Frontier. A plain `T38` is always its own Edge. The Board, the Frontier, a lazy
  normalization on any write and `migrate_effort` all write or show these resolved Edges, so
  migrating never changes a Frontier through a sub-slice. A bare sort-order Edge is different: it
  dangles (`01?`) until migration resolves it, which can put its Ticket on the Frontier. The migration report, preview and real, ends with grouped
  lines for sub-slices kept as declared (with the `update_ticket blocked_by` fix) and for written
  Edges that land on another Effort (`T9@beta`), each naming ten and counting the rest.
- **A write normalizes the Foreign file it touches when that file has no parseable fence**, and keeps
  the prose it inferred from verbatim. A foreign-fenced file keeps its fence, per the rendering rule.
- **Claims are flagged when stale, never auto-released.** 24h; use `release` to drop a claim explicitly.
- **A batch creation is all or none.** Every reference resolves before anything is written, so an
  undeclared temporary key or a cycle leaves the workspace untouched. Temporary keys exist for the
  length of the call and never reach a file.
- **A cycle is refused on both write paths**, creation and Edge update, and only when it runs through
  the node being written. A cycle already in the workspace is somebody's hand edit; refusing it here
  would make an unrelated Effort unwritable, and the Board already reports the damage it does.
- **A dangling Edge is never refused.** It is a Board warning, and pointing at a Ticket not yet
  written is how a breakdown gets built up. An Edge naming an undeclared *temporary key* is refused,
  because that is a typo rather than a forward reference.

Annotation rules — a comment, a ticked criterion, and a Triage role are records of work, not moves
in the graph:

- **Nothing is injected into content an agent wrote.** A comment is stored byte-for-byte, including
  `/triage`'s mandatory disclaimer, which is the skill's own to write.
- **Ticking a criterion changes only its checkbox.** Every other line of the body stays
  byte-identical, and the criterion keeps its own indentation and wording. Wrapped criteria
  match both as `get_tickets` returns them and re-joined onto one line — comparison collapses
  whitespace, so house-style continuations are not a silent miss.
- **Naming a criterion that does not exist fails**, rather than writing nothing and reporting success.
- **A Triage role never moves the Frontier.** Only Status and Edges decide what is takeable, so
  `/triage` and the graph never compete for one field. A `wontfix` Ticket stays takeable and is named
  in the warnings block instead, leaving the judgement to the reader.

`superseded` and `deferred` are a different matter: read from a Foreign file's `Status:` line they map to
`dropped`, and so do orphan their dependents. That is not inconsistent with the rule above — they are
Statuses being inferred, where `wontfix` is a Triage role being respected as one. Inference gets to
lean conservative because it is guessing; a role the caller set explicitly does not, because it was
never a guess.

## Verification

```
pnpm run check        # typecheck + lint + format:check — what pre-commit runs
pnpm test             # vitest, the MCP tool layer only
pnpm run build        # tsc emit to dist/
pnpm run release:dry  # needs a clean tree and an upstream branch
```

`.github/workflows/runtime.yml` runs `check`, `test`, and `build` on Node 24 for every push
and pull request, twice: on the 24.15.0 floor, which alone packs the tarball the downstream jobs
use, and on the newest 24.x, so a Node regression on Linux surfaces in the gate rather than in a
release (T99). The newest-24.x leg floats, so a new Node release can turn it red on a change that
touched nothing relevant — check the Node version the leg printed before blaming the change. Its
development job is the test gate; keep failures blocking the downstream
package compatibility and setup jobs. The setup matrix provisions real fnm and verifies registration
and saved launches on macOS, Linux, and Windows; scripts DOX owns the checks. Reuse this gate rather than adding a second test workflow. The release
workflow remains a separate manual publish path.

`release:dry` is the odd one out: `.release-it.json` sets `requireCleanWorkingDir` and
`requireUpstream`, so unlike the three above it will not run against uncommitted work. Commit first.
It skips the `before:init` hooks rather than running them — release-it prints a skipped command with
a `!` — so it is cheap, and it is not a substitute for `check` and `test`. The script carries `--ci`
because release-it prompts without it; a `pnpm run release:dry -- --ci` does not reach release-it.

Releases are cut from GitHub Actions (`Release` workflow, `workflow_dispatch`), from `master` only —
the job refuses any other ref before checkout, because release-it commits, tags and pushes as part of
the run, so a dispatch from a feature branch would rewrite that branch. That job runs
`release-it --ci`, which bumps the version and updates package `CHANGELOG.md`, publishes with `pnpm`,
then commits, tags, pushes, and opens a GitHub Release. **Publishing genuinely comes before the
commit** — release-it runs its plugins in the order `['npm', 'git', 'github', …]` — which is why the
tree is dirty at publish time and why `--no-git-checks` is needed; see the release-it bullet in Work
Guidance. Do not treat that changelog as tracker vocabulary — see `CONTEXT.md`. MCP install pins in
the README stay manual after each release.

The dispatch takes an increment of `auto`, `patch`, `minor` or `major`, defaulting to `auto`. `auto`
passes **no** `--increment`, which is what hands the decision to `@release-it/conventional-changelog`
— it derives the bump from the conventional commits since the last tag, so `feat:` gives a minor and
`fix:` a patch. The explicit three exist to override that, not to substitute for it. Two things about
`auto` are worth knowing before dispatching it:

- **Nothing releasable is a green no-op.** With no qualifying commits since the last tag, release-it
  prints `No new version to release` and **exits 0**. The job succeeds having shipped nothing, so a
  green run is not by itself evidence that a version went out — check the tags.
- It reads the same commit range the changelog does, so everything below about a missing `v*` tag
  applies to the version choice too, not just to the changelog prose.

Every release needs the previous one to carry a `v*` tag: `@release-it/conventional-changelog` takes
"every commit since the last tag", so a missing tag makes the next changelog restate the whole
history and can recommend a bump from a breaking change that already shipped. `v0.1.0` was tagged
retroactively onto `5f57754`, the commit 0.1.0 was published from by hand before this workflow
existed — which is why that one tag has no `chore(release)` commit of its own.

**Publishing is CI-only.** There is no local `release` script and should not be one: CI authenticates
by OIDC, which issues no credential a laptop can hold, so a local publish path means minting the
long-lived npm token the setup exists to avoid. An emergency release is the same one dispatch as any
other. Why the release config looks the way it does is in Work Guidance, not here.

Individually: `typecheck` (tsc over src and test), `lint` / `lint:fix` (oxlint), `format` /
`format:check` (oxfmt), `release:dry` (release-it wrapper in `package.json`).

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

**Three deliberate exceptions** spawn real OS processes. `test/cross-process-claim.test.ts` for the
compare-and-set claim and `test/cross-process-create.test.ts` for id allocation share one shape:
concurrency needs real concurrency — one process shares a scan, a write queue and module state, all
of which hand an in-process test a pass it has not earned, which is how the claim guarantee came to
hold only in-process. Both were checked against a deliberately broken implementation to confirm they
bite. `test/exit-on-disconnect.test.ts` (T95) is a different shape: the defect it guards is in
`dist/bin.js` itself — the file `package.json`'s `bin` field points at — not in anything the tool
layer runs, so only spawning the packaged binary and watching the OS process die is evidence of
anything; a mocked transport would prove the mock's callback fires, not that the shipped binary
exits. Its `beforeAll` runs `pnpm run build` itself, since `dist/` is gitignored and
`runtime.yml` builds after `pnpm test` — that keeps `pnpm test` on a clean clone self-contained
rather than depending on workflow step order. Add a fourth only for something that needs the real
process for one of these two reasons — genuine concurrency, or a defect below the in-process seam
entirely — not merely because a test would be more convenient to write out-of-process.

`test/fixtures/legacy/` holds two Efforts copied **verbatim** out of sobrina and tag-customizer.
Never tidy them, and refresh them by re-copying rather than editing: they are the real input, and
every awkward shape in them is a case the parser has to survive — `T31` ids in headings,
tag-customizer Tickets with no id at all, `Blocked by: —`, bare `Blocked by: 01, 02` sort orders,
sub-slice references like `T38.1`, `Status:` lines with trailing prose, and a `research/` directory
the schema does not recognize.

Shapes the parser handles that these two Efforts happen **not** to contain — struck-through Edges,
`Status: done` / `fixed` / `superseded`, bold field labels — are covered by synthetic files in
`test/prose-shapes.test.ts`. Put new shapes there; never add them to the fixtures.

`docs/agents/issue-tracker.md` opens with `Tracker doc revision <n>`, pinned in form only by
`test/ship.test.ts`; raise it by hand whenever the doc's contract changes.

`test/read-path-cost.test.ts` asserts the spec's token measurements. They are the argument for the
project existing, so they are checked rather than restated.

## Agent skills

Matt Pocock's skills are installed for Codex in `.agents/skills/`; `skills-lock.json` records their
upstream source and hashes. See [.agents/skills/AGENTS.md](./.agents/skills/AGENTS.md) for maintenance.
The repository-specific configuration stays in `docs/agents/` below.

### Issue tracker

Use **FrontierMCP** (server `frontier`) as this repository's issue tracker. Before tracker work, read
[docs/agents/issue-tracker.md](./docs/agents/issue-tracker.md) for tool usage and the file fallback.

### Triage labels

The five canonical roles, unchanged. See [docs/agents/triage-labels.md](./docs/agents/triage-labels.md).

### Domain docs

Single-context — root `CONTEXT.md` + `docs/adr/`. See [docs/agents/domain.md](./docs/agents/domain.md).

### Friction

FrontierMCP call awkward, wrong-shaped, or costly mid-work — file consumer signal.
See [docs/agents/frontier-consumer.md](./docs/agents/frontier-consumer.md).

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md.

- Overnight auto shipping processes takeable `ready-for-agent` Tickets sequentially, using builders,
  reviewers, required checks, and commits. Re-evaluate the Frontier after each Ticket; leave existing
  claims and human decisions pending.
- Runtime setup must preserve the consumer project's Node version, discover existing version
  managers, and recommend fnm when no manager or suitable Node is available. Prefer a project's
  Bun or Deno only after FrontierMCP compatibility is verified. Recommend automated setup in the
  installation guide and retain complete manual instructions. T88 verifies the emitted package on
  the 20.x, 22.x, and 24.x release lines from floors 20.20.2, 22.17.1, and 24.15.0; T89–T92 build
  the installation flow around that contract.

## Child DOX Index

- [.agents/skills/AGENTS.md](./.agents/skills/AGENTS.md) covers installed upstream skills and their
  maintenance. Root retains ownership of `.agents/mcp.json`, `skills-lock.json`, and `docs/agents/`.
- `src/` and `test/` remain root-owned; Work Guidance above covers them. `src/storage/` earns its own
  doc the day a second driver lands.
- [scripts/AGENTS.md](./scripts/AGENTS.md) covers runtime compatibility and setup scripts.
- Root-owned files: [CONTEXT.md](./CONTEXT.md) (glossary), [docs/adr/](./docs/adr/) (decision records),
  [docs/agents/](./docs/agents/) (skill configuration — tracker conventions, triage labels, domain docs,
  FrontierMCP consumer friction), [docs/research/](./docs/research/) (dated findings behind a decision
  — see the rule below), [README.md](./README.md) (the package's public face — install, pinning,
  and how a release is cut), [docs/installation.md](./docs/installation.md) (the detailed public
  setup guide — automatic and manual runtime selection, client configuration, and recovery),
  [CHANGELOG.md](./CHANGELOG.md) (package release notes, generated by
  release-it; not tracker vocabulary), [LICENSE](./LICENSE) (the MIT grant itself — `package.json`'s
  SPDX string and the README's License section are declarations, not the grant, and npm ships this
  file whatever `files` says), [.release-it.json](./.release-it.json) and
  [.github/workflows/](./.github/workflows/) (release and runtime CI — read the
  release-it bullet in Work Guidance before editing either), [bench/](./bench/) (throwaway harnesses
  behind a measured claim — typechecked and linted with everything else, deliberately absent from
  `package.json`'s `files`, and never a place results are committed).
- `pnpm run bench:scan --group=create` compares current driver creation with an independent
  single scan on disposable copies. Its difference of medians is arithmetic, not a measurement of
  another allocation strategy. Dated create-path findings live in `docs/research/`; the scan
  measurements in Work Guidance remain their original snapshot.
- **`docs/research/` is dated snapshots, not contracts.** `docs/adr/` and `docs/agents/` are current
  by construction — an ADR holds until superseded, and the agent docs are the shipped contract. A
  research document is neither. It records what primary sources said on a stated date, as the
  evidence behind a decision that has already been taken elsewhere. Never update one in place and
  never cite one as authority against a live source; re-fetch, and add a new dated document that
  supersedes it. Every file here opens with its date and the Ticket it answered.
- `.scratch/` holds this repo's own Efforts, in the same layout FrontierMCP serves —
  [frontier-v1](./.scratch/frontier-v1/spec.md) (the server itself),
  [frontier-web](./.scratch/frontier-web/map.md) (serving the tracker to a browser), and
  [frontier-hive](./.scratch/frontier-hive/map.md) (whether processes share one driver). It is work
  tracking, not source; no child AGENTS.md.
