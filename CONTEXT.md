# FrontierMCP

An MCP server giving agents deterministic, low-token access to the markdown issue tracker that the
engineering skills (`/to-tickets`, `/wayfinder`, `/triage`, `/to-spec`, `/implement`) read and write
under `.scratch/`. Markdown files stay canonical; the server owns the schema and the graph.

## Language

**Effort**:
One directory under `.scratch/` holding all work on a single line of enquiry — its header docs and its
tickets. The unit an agent session orients to.
_Avoid_: feature, domain, theme, project, epic

**Board**:
The view over an effort's tickets — their status, edges, and frontier. Not a place on disk; an effort
has a board the way a table has a query.
_Avoid_: using "board" for the directory itself

**Header doc**:
An effort's top-level document. An effort has zero, one, or two: a Map, a Spec, or a Map that later
gained a Spec.
_Avoid_: overview, readme, parent doc

**Map**:
The wayfinder header doc, `map.md`. A low-resolution index of an effort, mutated section by section as
the fog clears. An index, never a store.
_Avoid_: plan, roadmap

**Destination**:
The Map section stating where this line of enquiry is going. Orienting text for a Board; absent until
set.
_Avoid_: goal, vision, objective

**Notes**:
The Map section for free-form orientation that is not Destination, fog, or scope. Edited as a whole
section, never line by line.
_Avoid_: comments, journal

**Not yet specified** (fog):
The Map section listing fog patches — open questions still to be graduated into Tickets. A fog patch
is one bullet; graduating it removes that bullet and nowhere else.
_Avoid_: backlog, TODO, open questions (as a section name)

**Out of scope**:
The Map section for work ruled beyond the Destination. Hand-ruled bullets live outside GENERATED
markers; dropped Tickets render inside them.
_Avoid_: won't do, rejected, deferred (as a section name)

**Decisions so far**:
The Map section regenerated from resolved Tickets between GENERATED markers — gist plus link, one line
each. Never accepted as edit input; never read from the file as authority.
_Avoid_: changelog, history, progress log

**Spec**:
The `/to-spec` header doc, `spec.md`. Written once from a settled conversation and read whole
thereafter. Opaque document bytes across the storage seam.
_Avoid_: PRD, design doc, requirements

**Ticket**:
One markdown file directly in an Effort's `issues/` whose frontmatter carries the Marker and
validates, one unit of work or one question. Identified by its Name.
_Avoid_: issue, task, card, story

**Marker**:
The frontmatter line `frontier: ticket`. The only thing that makes a file a Ticket; it has no
version, and the server writes it only on files it creates, never on an existing one.
_Avoid_: tag, flag, schema version

**Diagnostic**:
What the server noticed about a file in a Ticket location that is not a valid Ticket: a code, the
file, and the fix, with the key and expected value where one applies. An **excluded** Diagnostic is
on a marked file kept off every Board, the Frontier and every write until fixed by hand; a
**suggestion** is on an unmarked file that looks like a Ticket. Unrelated Markdown has none.
_Avoid_: error, warning (a Board groups Diagnostics into warnings), lint

**Name**:
What identifies a Ticket: `<effort>.<name>`, the Effort's slug and the file's stem, written bare
inside its own Effort. Chosen by whoever creates the Ticket, one to three words for what it is, and
never changed. A Ticket whose frontmatter carries an `id` is named by that id instead, unique across
the whole repo.
_Avoid_: handle, key, slug (an Effort has a slug), minting or allocating one

**Kind**:
Which of the two shapes a ticket is. `build` — a tracer-bullet slice, from `/to-tickets`. `decision` —
a question whose resolution is a decision, from `/wayfinder`.
_Avoid_: type (reserved for wayfinder's `research`/`prototype`/`grilling`/`task`)

**Status**:
A ticket's position in the graph's lifecycle. Owned by the server.
_Avoid_: state; conflating with Triage role

**Triage role**:
A `/triage` label (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). A
separate field from Status — only `/triage` writes it.
_Avoid_: status, label

**Edge**:
A `blocked_by` entry: one Ticket declaring another must finish first. It holds the other Ticket's
Name — bare within the Effort, `<effort>.<name>` across Efforts, or its id.
_Avoid_: dependency, link, relation

**Frontier**:
The tickets takeable right now — open, unblocked, unclaimed. Computed, never stored. Always the set,
never the product.
_Avoid_: backlog, queue, ready list; using "Frontier" for the server

**FrontierMCP**:
This product — the MCP server that computes the Frontier and serves the Board. `FrontierMCP` in prose
and in code identifiers; `frontier-mcp` as the npm package and binary; `frontier` as the registered
MCP server name, which is why the tools are `mcp__frontier__*`.
_Avoid_: Frontier (that is the set), the frontier server, frontier-mcp in prose

**Unimported keys**:
Frontmatter keys outside the schema, which the server reads past and never writes. Counted on the
Board and shown by `get_tickets` for as long as a ticket carries them; removed only when an agent
names them.
_Avoid_: foreign keys, extra fields
