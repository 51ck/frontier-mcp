# Frontier

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
One markdown file under an Effort's `issues/`, one unit of work or one question. Identified by a
stable `id` of the form `T<n>`, unique across the whole repo and never by its filename.
_Avoid_: issue, task, card, story

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
A `blocked_by` entry: one Ticket declaring another must finish first. Always a plain Ticket id,
resolved repo-wide — an Edge across Efforts looks no different from a local one.
_Avoid_: dependency, link, relation

**Frontier**:
The tickets takeable right now — open, unblocked, unclaimed. Computed, never stored. Also the name of
this server, which exists to answer exactly this query — say "the frontier" for the set, "Frontier"
for the product.
_Avoid_: backlog, queue, ready list

**Legacy ticket**:
A ticket file predating the schema, with no frontmatter. Parsed best-effort on read, normalized on
first write through the server.
_Avoid_: unmigrated, old-format
