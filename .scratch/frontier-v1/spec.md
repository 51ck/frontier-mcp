# FrontierMCP v1 — an MCP server over the markdown issue tracker

Status: ready-for-agent

## Problem Statement

Work in these repos is tracked as markdown under `.scratch/` — one directory per Effort, a Map or a
Spec as its header doc, one file per Ticket under `issues/`. It is a good format for humans: it diffs
in git, renders on GitHub, and can be hand-edited. It is a bad format for agents, in three separate
ways.

**It is expensive to read.** Answering "what can I work on" means reading every Ticket file in the
Effort. Measured on real data: tag-customizer's `ship-0-5-0` Effort is 7 Tickets / 52.7 KB ≈ **13k
tokens**, and sobrina's `telegram` Effort is 15 Tickets / 32.7 KB ≈ **8.2k tokens** — spent before any
work starts, on a question whose answer is one Ticket id. Resolved Tickets are the worst offenders
because they carry their full answers, so an Effort gets *more* expensive to navigate the further it
progresses. There are 159 Ticket files across three repos today.

**It is not deterministic.** Status, blocking Edges, and claims are prose. Blocking is a
`**Depends on:** T30 ([01-grammy-group-boot.md](...))` line — a sentence with relative links, parsed by
inference. Two agents reading the same Effort can reach different conclusions about what is takeable,
and an agent that misreads one Edge starts work on a blocked Ticket.

**The conventions are underspecified.** The skills define Ticket *content* well and Ticket *identity,
lifecycle, and graph* barely at all. Nothing enumerates Efforts. Closing has no local definition — the
convention `Status: resolved` was invented twice, independently, in two repos. Cross-Effort
dependencies have no defined form; sobrina needed one and wrote a relative path. `NN` is simultaneously
identity and sort order, ordered by dependency in one skill and by creation in another. Claiming has no
owner field, so two parallel sessions can both claim the same Ticket and neither notices.

## Solution

**FrontierMCP** — an MCP server that serves the same markdown files as a queryable graph. Files stay
canonical and hand-editable; the server owns the schema, computes the graph, and answers the questions
that currently cost thousands of tokens to infer.

The headline: `get_board` returns one summary line per Ticket with the Frontier marked, in roughly
**200 tokens** where reading the Effort costs 13k. Bodies are fetched by id, only when needed.

Three things a developer gets:

1. **Install it into an existing project** — registered once at user scope, resolving the workspace
   from the session's working directory, with no per-repo configuration.
2. **Migrate that project's existing tracker** — the 159 Legacy Tickets parse best-effort on day one
   and normalize to the schema on first write, with an explicit migration when wanted.
3. **Stop paying for prose parsing** — deterministic Status, Edges, Frontier, and claims, computed
   rather than inferred.

Skills reach it through `docs/agents/issue-tracker.md`, the extension point every skill already
honours. The skills themselves are never forked.

## User Stories

### Installing and pointing at a repo

1. As a developer, I want to register FrontierMCP once for all my repos, so that I do not maintain a
   per-repo MCP configuration that drifts out of version sync.
2. As a developer, I want the server to work out which repo it is serving from the session's working
   directory, so that opening a project is the only setup step.
3. As a developer, I want to override the workspace with an explicit argument on any call, so that a
   session in one repo can read an Effort in another.
4. As a developer, I want to override the workspace with an environment variable, so that a
   non-standard layout can be configured without touching every call.
5. As a developer, I want a pinned server version rather than an unpinned fetch, so that starting a
   session does not depend on a registry round-trip.
6. As a developer, I want the server to work on a repo that has no `.scratch/` yet, so that a fresh
   project is not an error case.
7. As a developer, I want a ready-made tracker configuration document exposed by the server itself, so
   that wiring the skills to FrontierMCP is a copy, not a writing exercise.
8. As a developer, I want that document to retain the plain-file conventions as a fallback, so that a
   skill run in a session without FrontierMCP loaded still works.

### Finding what to work on

9. As an agent, I want to list the Efforts in a repo, so that I can orient without globbing
   directories.
10. As an agent, I want each Effort in that list to report its Ticket count, its header docs, and the
    size of its Frontier, so that I can choose an Effort without opening it.
11. As an agent, I want a Board for an Effort as one summary line per Ticket, so that I learn the whole
    shape of the work for a fraction of the cost of reading it.
12. As an agent, I want the Board to open with the Effort's Destination, so that every Ticket line
    below it is interpretable without a second call.
13. As an agent, I want the Frontier marked inline on that Board, so that "what can I start" needs no
    second call and no reasoning.
14. As an agent, I want Blocked-by Edges shown on each line, so that I can see why a Ticket is not
    takeable without opening it.
15. As an agent, I want a blocker that lives in another Effort annotated with its owning Effort, so
    that a foreign Edge is followable.
16. As an agent, I want to fetch the full bodies of specific Tickets by id, so that I pay for detail
    only on the Tickets I actually work.
17. As an agent, I want to fetch several Ticket bodies in one call, so that reviewing a blocked chain
    is one round-trip.
18. As an agent, I want the Board to be correct the instant a file changes on disk, so that a
    hand-edit or a `git checkout` in another window does not serve me stale state.

### Working a Ticket

19. As an agent, I want to claim a Ticket before starting, so that a parallel session does not
    duplicate my work.
20. As an agent, I want a claim to record who holds it and when it was taken, so that a claim
    identifies its holder rather than merely existing.
21. As an agent, I want claiming an already-claimed Ticket to fail, so that two sessions cannot both
    believe they hold it.
22. As a developer, I want stale claims flagged rather than auto-released, so that a long-running agent
    is never silently robbed of its Ticket.
23. As an agent, I want to tick an acceptance criterion as I satisfy it, so that progress is visible
    without rewriting the body.
24. As an agent, I want to append a comment to a Ticket, so that conversation accumulates where the
    skills expect to find it.
25. As an agent, I want my comment stored exactly as written, so that nothing is injected into content
    I authored.
26. As an agent, I want to resolve a Ticket with an answer and a one-line gist, so that the decision is
    recorded once, in the Ticket, where it belongs.
27. As an agent, I want to drop a Ticket with a reason, so that work ruled beyond the destination
    leaves the Frontier without being mistaken for a decision on the route.
28. As an agent, I want a Ticket blocked by a dropped Ticket to be reported as broken rather than
    silently promoted, so that I never start work whose stated precondition was never answered.
29. As an agent, I want to set a triage role independently of Status, so that `/triage` and the graph
    do not fight over one field.

### Creating work

30. As an agent, I want to create a whole set of Tickets in one call, so that publishing a breakdown is
    one operation rather than a file-writing loop.
31. As an agent, I want to declare Edges between Tickets that do not exist yet, using my own temporary
    keys, so that I do not have to create Tickets and then wire them in a second pass.
32. As an agent, I want the server to assign ids and filename numbers, so that numbering is consistent
    whether Tickets arrive in dependency order or one at a time as fog clears.
33. As a developer, I want Ticket ids to be visibly ids — prefixed, not bare numbers — so that an id in
    a commit message is never mistaken for a sort position.
34. As a developer, I want ids unique across the whole repo, so that a bare id in prose, a commit
    message, or a conversation resolves without naming its Effort.
35. As an agent, I want to reference a Ticket in another Effort as a blocker by its plain id, so that a
    cross-Effort dependency needs no compound reference form.
36. As a developer, I want two parallel sessions creating Tickets at the same moment to never collide
    on an id, so that concurrent work does not corrupt identity.
37. As an agent, I want to create an Effort by writing to it, guarded by an explicit flag, so that
    starting work is one call and a mistyped slug is not one.
38. As an agent, I want a cycle in the Edge graph rejected at the moment I write it, so that the
    Frontier is never undefined.
39. As an agent, I want dangling Edges reported rather than dropped, so that a broken reference
    surfaces instead of quietly making a Ticket look takeable.

### Maps and Specs

40. As an agent, I want to read a Map's Destination and Notes without reading its whole body, so that
    orienting to an Effort is cheap.
41. As an agent, I want to edit one section of a Map — Notes, Not yet specified, Out of scope — without
    rewriting the file, so that concurrent sessions do not clobber each other's edits.
42. As an agent, I want the Map's Decisions-so-far generated from the resolved Tickets, so that it
    cannot disagree with them.
43. As a developer, I want that generated list written back into `map.md` between visible markers, so
    that the file still reads as a complete document on GitHub.
44. As a developer, I want the markers to state that their contents are overwritten, so that nobody
    hand-edits a block that is about to be regenerated.
45. As a developer, I want the server never to write to my files without an action of mine behind it,
    so that a `git checkout` does not produce edits I did not ask for.
46. As an agent, I want to move a fog patch out of Not yet specified as I graduate it into Tickets, so
    that the Map does not carry the same item twice.
47. As an agent, I want to write and read a Spec as a whole document, so that the one thing nobody
    edits section-by-section is not burdened with section machinery.
48. As an agent, I want an Effort to hold both a Map and a Spec, so that wayfinder's handoff to
    `/to-spec` does not force the work into two disconnected Efforts.

### Migrating what already exists

49. As a developer, I want FrontierMCP to read my existing Tickets on the day I install it, so that
    adoption does not begin with a rewrite of 159 files.
50. As an agent, I want a Legacy Ticket's title, status, and dependencies inferred from its prose, so
    that an unmigrated Effort still produces a usable Board.
51. As an agent, I want Legacy Tickets flagged as such on the Board, so that I know which inferences to
    distrust.
52. As a developer, I want reads never to modify files, so that querying the tracker is not a source of
    git noise.
53. As a developer, I want a write through the server to normalize the file it touches, so that the
    tracker converts itself as I work rather than in one risky pass.
54. As a developer, I want an explicit migration for a whole Effort when I want one, so that converting
    is a decision I make rather than a side effect.
55. As a developer, I want to preview a migration before it writes, so that I can see what it would do
    to files I care about.
56. As a developer, I want migration to preserve ids my Tickets already carry, so that references
    written in prose and commit messages keep resolving.
57. As a developer, I want migration to mint ids for Tickets that have none, so that every Ticket in
    the repo is uniquely addressable.
58. As a developer, I want migration to leave my filenames alone by default, so that the relative links
    my Maps and Tickets are full of do not break.
59. As a developer, I want renaming files to the new convention available as an opt-in, so that I can
    choose tidiness and accept the link churn deliberately.
60. As a developer, I want files the schema does not recognize to be ignored rather than rejected, so
    that an Effort directory holding research notes or scratch output still works.

### Not losing data

61. As a developer, I want every write to be atomic, so that an interrupted operation cannot leave a
    half-written Ticket.
62. As a developer, I want a write to fail loudly when the file changed since it was read, so that a
    concurrent session's edit is never silently overwritten.
63. As a developer, I want no lock files, so that a crashed session cannot wedge the tracker.

## Implementation Decisions

### Shape

- A stdio MCP server in TypeScript on Node 24, published to npm as `frontier-mcp`, registered under the
  server name `frontier`.
- One process per client session — there is no shared daemon. The in-memory index and the filesystem
  watcher both live and die with that process, which matches the session's lifetime.
- Registered at user scope, once, for all repos.

### Workspace resolution

Resolved per call, first match wins:

1. An explicit `root` argument on the call.
2. The `FRONTIER_ROOT` environment variable.
3. The server process's working directory, walked upward to the nearest directory containing
   `.scratch/` or `.git/`.

MCP Roots is deliberately not used: it is deprecated as of protocol revision `2026-07-28` (SEP-2577),
which directs implementations to pass directories via tool parameters or server configuration instead.

### Storage

Per ADR 0001, every read and write goes through a storage driver interface. The markdown driver is the
only one in v1. The interface must not leak markdown concepts — no paths, no frontmatter, no section
names — because a SQLite driver with two-way conversion is planned and would otherwise be impossible to
write against it.

Above the driver sits an in-memory index, built by a full scan at startup and invalidated per file by a
filesystem watcher. At ~50 Tickets per repo a full scan is single-digit milliseconds; SQLite as an
index would add a migration story and a stale-database failure mode for no gain at this volume.

**The watcher never writes.** It invalidates index entries and nothing else. Background writes to
git-tracked files with no user action behind them would appear as unexplained diffs, and a branch
switch touching forty files would fire forty of them.

Writes are atomic — write to a temporary file, rename over the target. Every read-modify-write carries
an optimistic check against the file's modification time and size as read, and fails loudly on
mismatch. No lock files.

### Identity and numbering

A Ticket id is `T<n>` — visibly an id, so it is never mistaken for a sort position. `<n>` comes from a
**repo-global** counter, so ids are unique across every Effort in the workspace and a bare `T47`
resolves without naming its Effort. This matches what sobrina already does by hand.

The consequence is that Edges are plain ids. There is no `<effort>/<id>` compound form; `get_board`
annotates a blocker that lives in another Effort with its owning Effort so it stays followable.

The counter is **derived, not stored** — `max(existing ids) + 1` from the scan, consistent with the
rest of the design. Allocation is made safe against parallel sessions by creating the Ticket file with
an exclusive-create flag: on collision, bump and retry. The filesystem provides the mutual exclusion,
so there is no counter file to drift and no lock to go stale.

New Ticket files are named `<NN>-T<n>-<slug>.md`. `NN` remains sort order only and may be rewritten;
`T<n>` never changes. Frontmatter is the authority — when the filename and the frontmatter disagree,
the file is renamed, never the field.

### Schema

Formal metadata lives in YAML frontmatter; everything an agent reads as prose stays prose.

Ticket frontmatter:

| Field | Notes |
| --- | --- |
| `id` | `T<n>`, unique repo-wide, never reused, never changed. Arbitrary pre-existing strings are preserved through migration. |
| `title` | |
| `kind` | `build` or `decision`. |
| `type` | `research` / `prototype` / `grilling` / `task`. Only when `kind: decision`. |
| `status` | `open` / `claimed` / `resolved` / `dropped`. |
| `triage` | A triage role. Separate field from `status`; only `/triage` writes it. |
| `blocked_by` | List of Edges, each a plain Ticket id, resolved repo-wide. |
| `claimed_by` | Required when `status: claimed`. |
| `claimed_at` | Timestamp, set with `claimed_by`. |
| `answer_gist` | Required when `status: resolved`, on **every** kind — a build Ticket's one line of what landed is what makes a Board of finished work readable. |
| `dropped_reason` | Required when `status: dropped`. This is what the Out-of-scope section renders. |
| `schema` | Set to `legacy` by the lenient parser; absent on schema-conformant files. |

Header doc frontmatter carries the header kind (`map` or `spec`). An Effort may hold both, `map` first
— that is wayfinder's designed handoff into `/to-spec`, not an error.

### Status model

`open` → `claimed` → `resolved` or `dropped`. Both terminal states are closed, and they differ in what
they render into: `resolved` contributes its `answer_gist` to the Map's Decisions-so-far, `dropped`
contributes its `dropped_reason` to Out of scope. `wontfix` is a triage role, not a Status.

A dropped Ticket does **not** unblock its dependents. Dependents are reported as broken Edges for a
human to resolve, because promoting them would start work whose stated precondition was never answered.

### Derived state

Per ADR 0002, the Map's Decisions-so-far is computed from resolved Tickets and never read from the
file. It is written back into `map.md` inside generated markers, the whole block replaced on every
mutation through the server — a cache for human readers, with the markers stating that their contents
are overwritten. The Frontier is likewise computed and never stored.

The Map's other sections — Destination, Notes, Not yet specified, Out of scope — are typed and
individually addressable, because wayfinder edits them section by section. The Spec is an opaque body
with frontmatter, because nothing ever edits one section of it. Ticket bodies are opaque except for
three mutation points: the answer, the comment log, and the acceptance checkboxes.

### Tool surface

Eight tools. The count is a design constraint, not an outcome: every tool schema is permanent context
in every session, and a 24-tool surface would cost several thousand tokens against a project whose
entire purpose is token cost.

| Tool | Contract |
| --- | --- |
| `list_efforts` | Efforts in the workspace, with Ticket counts, header kinds, and Frontier size. |
| `get_board` | The Effort's Destination, then one summary line per Ticket — id, title, kind, status, Edges — with the Frontier marked, foreign blockers annotated with their Effort, and a warnings block for broken Edges and Legacy Tickets. No bodies, ever. |
| `get_tickets` | Full bodies for a list of ids. |
| `create_tickets` | A whole set in one call. Edges reference caller-chosen temporary keys; the server assigns ids and filename numbers and resolves the keys atomically. This removes wayfinder's mandated create-then-wire second pass. |
| `update_ticket` | One mutator taking any of status, triage, claim, answer, comment, criteria, title, Edges. Claiming is compare-and-set and fails if another holder exists. Content is stored verbatim — nothing is injected, including `/triage`'s mandatory comment disclaimer, which is the skill's business to write. |
| `edit_map` | A section operation on a Map: set Destination, set Notes, add or graduate a fog patch, rule something out of scope. |
| `spec` | Get or put a Spec as a whole document. |
| `migrate_effort` | Normalize Legacy Tickets in an Effort. Preview mode writes nothing. Filename rewriting is opt-in. |

`create_tickets`, `spec`, and `edit_map` will create an Effort that does not exist, but only when the
call passes an explicit `create` flag — so starting work is one call while a mistyped slug is not.

The rewritten tracker configuration document is exposed as an **MCP resource**, not a tool — it is read
once at setup, and resources cost no tool-schema tokens.

### Migration

Reads are lenient: a Ticket with no frontmatter is parsed best-effort — title from the heading, status
from a `Status:` line, Edges from `Depends on:` / `Blocked by:` prose — and flagged `schema: legacy` in
the returned model. Reads never write. Writes are strict: any write through the server normalizes the
file it touches. `migrate_effort` does the whole Effort at once for those who want it done
deliberately.

Ids that already exist are preserved verbatim — sobrina's `T31` survives, along with every prose and
commit-message reference to it. Tickets identified only by their filename number get a fresh id minted
from the global counter, because a per-Effort `01` is not unique repo-wide and would break bare-id
resolution.

Filenames are **not** rewritten by default. The 159 existing files are linked to by relative markdown
links throughout the Maps and Tickets, and the filename is cosmetic anyway — a legacy name costs
nothing once the frontmatter is right. Renaming to `<NN>-T<n>-<slug>.md` is available as an opt-in flag
for someone who wants tidiness and accepts the link churn.

Unrecognized files in an Effort directory are ignored, never an error.

### Validation

Cycles in the Edge graph are rejected at write time — a cycle is never intentional and makes the
Frontier undefined. Dangling Edges and dependents orphaned by a drop are surfaced as warnings on
`get_board` rather than through a separate validation tool, because a validation tool nobody calls is a
validator that does not exist.

## Testing Decisions

**One seam: the MCP tool layer, against a fixture `.scratch/` tree.** The server is constructed
in-process pointed at a temporary directory; tests call tools and assert on both the returned payload
and the resulting files on disk. Everything below — frontmatter parsing, Frontier computation,
generated markers, id allocation, atomic writes, the storage driver — is exercised through that one
entry point and gets no test entry point of its own.

What makes a good test here: it names an observable outcome a user of the tools would care about — "a
Ticket blocked by a dropped Ticket appears in the warnings block, not the Frontier" — and it would
still pass if the parser, the index, or the driver were rewritten. Tests that assert on internal
structure are the failure mode to avoid, because the storage driver seam exists precisely so those
internals can be replaced.

**Fixtures come from the real repos.** Copy Efforts verbatim out of sobrina and tag-customizer — the
`T31` ids, the `**Depends on:**` prose with relative links, the `Blocked by: —` em-dash, the resolved
Tickets carrying long answers. Those 159 files are the actual input, and hand-written fixtures will be
more polite than the real thing. The token claims in this spec are measurements against those same
files and should be re-measured as assertions, not restated.

**Concurrency needs real concurrency.** Id allocation and the compare-and-set claim are the two places
parallel sessions can corrupt state, and both are defended by primitives the filesystem provides.
Exercise them with genuinely concurrent calls, not sequential ones — a sequential test of an
exclusive-create retry proves nothing.

**The storage driver gets no conformance suite yet.** With one driver, the tool-layer tests are that
suite. It earns its own seam the day the SQLite driver starts.

**Prior art: none.** This is a greenfield repository — the test conventions established here are the
prior art for everything that follows.

## Out of Scope

- **The SQLite driver and `md ↔ db` conversion.** Planned and explicitly deferred; v1 ships the seam it
  will attach to, and nothing more.
- **`CONTEXT.md` and `docs/adr/`.** They have no graph and low volume — a glossary is meant to be read
  whole, and nine three-sentence ADRs beat any index. Tickets reference ADRs as plain markdown links.
- **GitHub, GitLab, or any remote tracker driver.** FrontierMCP serves local markdown.
- **Forking the engineering skills.** Adaptation happens through the tracker configuration document.
- **Conventions invented outside the skills** — `backlog.md`, `research/`, the `T31.1` sub-slice
  numbering. Acceptance-criteria checkboxes stay, because both skills define them.
- **Injecting content into what an agent wrote**, including `/triage`'s comment disclaimer.
- **Mass-renaming existing files.** Opt-in only.
- **Auto-expiry of claims.** Stale claims are flagged, never released.
- **Writes triggered by the filesystem watcher.**
- **HTTP transport, multi-repo aggregation, and any cross-repo Board.** One workspace per call.
- **A `validate` tool.** Validation is on write and in `get_board` warnings.

## Further Notes

The measurements in the Problem Statement are real: `wc -c` over `.scratch/*/issues/*.md` in
tag-customizer and sobrina on 2026-08-07, converted at roughly four bytes per token. They are the whole
argument for the project, so they belong in the test suite rather than only in prose.

The tool count is the subtlest constraint in this spec. Every decision that adds a tool needs to
justify its permanent context cost against the alternative of an optional argument on an existing one —
the surface expanding from eight to twenty over time would quietly undo the saving `get_board`
delivers.

This repo's own tracker configuration already describes the target schema, so the Tickets that slice
this spec are born schema-conformant. FrontierMCP will have no Legacy Tickets in its own repository —
which also means its migration path gets no accidental dogfooding and must be tested against the
fixtures deliberately.

Two upstream dependencies worth watching: the engineering skills evolve independently, and the tracker
configuration document is the only contract between them and FrontierMCP. If a skill changes what it asks
of its tracker, that document is where the change lands.
