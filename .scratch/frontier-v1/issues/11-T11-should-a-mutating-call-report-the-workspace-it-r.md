---
id: T11
title: Should a mutating call report the workspace it resolved?
kind: decision
type: grilling
status: resolved
triage: ready-for-agent
blocked_by: [T10]
answer_gist: Yes — a write names the workspace it resolved, a read does not, and what decides is whether the call wrote rather than whether the tool can; measured at ~10 tokens, under one Board across a write-heavy session
---

# T11 — Should a mutating call report the workspace it resolved?

## Question

Only `list_efforts` echoes the workspace it resolved. A successful `update_ticket` or
`create_tickets` against the wrong repository says nothing — which is how the worktree escape in
T10 stayed invisible until it was probed for deliberately. Should a write name where it went?

Against: every character is a token on every call, and cutting token cost is the whole reason this
server exists. The eight-tool ceiling is held for the same reason.

For: a silent write to the wrong repository is the one failure a caller cannot detect from the
result it gets back. T10 closes the known route to it, not the class.

## Acceptance criteria

- [x] Decided, with the token cost of the chosen answer measured rather than assumed
- [x] If a write should report it, a build Ticket exists for that work; if not, the answer records
      why the remaining risk is acceptable

## Answer

**Decision: yes.** Every call that writes opens with `root: <path>`, in the form and position
`list_efforts` already uses. Built as T31.

## Measured, not assumed

Real responses from the harness, at the four-bytes-per-token approximation this repo settles token
arguments with:

| Response | tokens |
| --- | --- |
| `update_ticket` claim / comment | 20.5 |
| `update_ticket` resolve | 28.0 |
| `create_tickets` ×3 | 23.5 |
| `edit_map` create | 33.8 |

The line costs **10.0** tokens on a plain checkout and **16.8** on a worktree path — **+30% to +82%**
on the response it rides. That percentage is the honest number and it is large. It is also the wrong
number to decide on: it is large only because a write response is small. In absolute terms a
forty-write session pays under 400 tokens, less than one `get_board` at 466.

## Why the cost is not the objection it looks like

The eight-tool ceiling and the Board's no-bodies rule are held for token reasons, so the tension is
real and worth naming. It resolves on *which budget*: a tool's schema text is paid on **every**
session, in the context window, whether or not the tool is ever called. A response field is paid only
when the call happens. Adding a ninth tool spends the permanent budget; naming the workspace on a
write spends the per-call one. They are not the same money.

## What the line buys

**Ticket ids are not repo-unique.** Every Effort numbers from T1, so `T10 updated` is exactly as
plausible against the wrong repository as the right one. A write is the one call whose result cannot
be checked from what came back — the content is not wrong-looking, because there is barely any
content.

## The strongest case against, and why it loses

For a call with no `root`, the resolved workspace is process-constant: `server.ts` captures `cwd`
once at construction and the environment does not move under it. So `list_efforts` — which already
reports the root, and which the shipped agent flow opens with — tells you where every later write
will land. On that reading the line is redundant *by construction*, not merely usually.

It loses on the evidence of T10. That information **was** available and **was** not consumed: the
worktree escape was visible to any `list_efforts` call and stayed invisible for weeks until somebody
probed for it deliberately. A design that depends on an agent retaining and cross-referencing one
session-opening read — across compaction, across a long transcript — is a design for an agent that
does not exist. T10 closed the known route to a wrong-repository write; this closes the class by
making every write self-identifying.

## What was rejected

**Basename instead of the full path** (3–4 tokens rather than 10–17). It catches T10's own case
(`t9-merge` against `frontier-mcp`) but misses same-named repositories under different parents, and
it renders the same fact in a second form that `list_efforts` does not use. Seven tokens is not worth
either.

**Echo on the first write and on change.** Information-theoretically the tightest — it reports only
when the answer is news, and would cost 10 tokens a session. Rejected because it makes a response
depend on the calls before it. Every rendering rule in `AGENTS.md` is content-driven — a foreign
Edge, an unresolvable Edge, grouped warnings. A history-driven one would be the first of its kind,
it would make two identical calls return different text, and it earns a few hundred tokens for that.

## Where it does not apply

What decides is whether the call wrote, not whether the tool can. `edit_map` with no section fields,
`spec` with no `content`, and `migrate_effort` with `preview` are reads through write-capable tools
and carry nothing. Beyond cost, a `root:` line on a read would assert a write that never happened.
