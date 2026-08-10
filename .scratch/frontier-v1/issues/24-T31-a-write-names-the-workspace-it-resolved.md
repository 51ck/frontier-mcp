---
id: T31
title: A write names the workspace it resolved
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: "`withWorkspace` prefixes `root: <path>` on the five write paths only; the read path of every write-capable tool pays nothing, and one shared rendering keeps `list_efforts` and writes from drifting"
---

**What to build:** every call that writes opens with `root: <path>`, in the form and position
`list_efforts` already uses. Reads carry no such line.

The build half of [T11](11-T11-should-a-mutating-call-report-the-workspace-it.md), which decided
it. The rule is *whether the call wrote*, not whether the tool can write: `edit_map` with no section
fields, `spec` with no `content`, and `migrate_effort` with `preview` are reads and pay nothing.

One rendering, shared, so `list_efforts` and the write path can never drift into two forms of the
same fact.

- [x] `update_ticket`, `create_tickets`, and the write paths of `edit_map`, `spec` and
      `migrate_effort` name the workspace they resolved
- [x] The read path of each write-capable tool does not, and neither do `get_board` and `get_tickets`
- [x] The line names what the call resolved, not the session default, when `root` redirects it
- [x] The cost is pinned by a test rather than left in prose
- [x] The DOX pass records the rule where an agent reading the shipped contract will meet it

## Answer

`src/tools/workspace-line.ts` holds the single rendering. `renderEfforts` uses it too, so the two
callers cannot drift into two forms of the same fact.

`server.ts` wraps only where a write happened. Three of the mutating-annotated tools have a pure
read path, and each is excluded on what the call did rather than on which tool it was:

- `edit_map` — a `wrote` flag, since the no-sections path can still create a missing Map.
- `spec` — `content === undefined` is the read.
- `migrate_effort` — `preview` is the read.

Twelve behavioural tests, plus two that pin the cost. Only one existing assertion moved: the exact
match in `test/create-tickets.test.ts`.

**Measured.** The line is 10 tokens on a representative checkout, against write responses of 20–34 —
so +30% to +82% on the response, and less than one Board across a forty-write session. The absolute
number is what decides; the percentage is large only because a write response is small. The token
helper moved to `test/support/tokens.ts` so every argument in this repo settled by a token count
counts the same way.
