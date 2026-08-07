# FrontierMCP consumer

You are a **consumer** of FrontierMCP while you work. When a tool call is awkward, slow, or fails
the job, that is **friction** — treat it as product signal, not something to work around in silence.

## Goals

Judge every friction against these. Name which ones it hurts.

| Goal | Hurt when |
| --- | --- |
| **usable** | Schema, wording, or flow makes the next correct call hard to choose |
| **effective** | The tool cannot express the move the work needs, or returns the wrong shape |
| **fast** | Extra round-trips or waiting the Board/body split should have avoided |
| **token-effective** | Reply or schema burns tokens without earning the agent's next move |

A suggestion earns its place when it would move at least one goal for the next agent in the same spot.

## When friction hits

1. **Capture the moment.** Record the tool name, the arguments you passed, what you expected, and what
   you got (error text, missing field, surprise shape, or the workaround you took).
   Done when that capture is concrete enough that someone who never saw the session can reproduce the
   awkwardness.
2. **Name the goal.** Tag the capture with `usable`, `effective`, `fast`, and/or `token-effective`.
   Done when at least one goal is named.
3. **Scan before filing.** `get_board` on `frontier-v1` (and `get_tickets` on near matches) for an
   open Ticket that already covers this friction.
   Done when you either have a matching Ticket id or know none exists.
4. **Land the signal.**
   - Match found → append a comment with your capture (tool, args, expectation, result, goal tags).
   - No match → `create_tickets` on `frontier-v1`: `kind: build`, triage `needs-triage`, title that
     states the desired behaviour, body with Problem / Done when / the capture from step 1.
   - You cannot write the tracker → tell the user the same content in one short block and stop.
   Done when a Ticket holds the signal, a comment enriched an existing one, or the user has the block.

Do this mid-session when the friction is still sharp. Do not batch a retrospective at the end.

## What a good Ticket looks like

- **Title** names the behaviour you wanted ("Board shows stale claim holder after hand-edit"), not the
  feeling ("claim UX is confusing").
- **Problem** is the capture from step 1.
- **Done when** is observable from a tool call or a Board line — a next agent can tell pass from fail.
- **Goal tags** appear once, in the Problem or as a short line (`goals: usable, token-effective`).

One friction → one Ticket. Bundle only when the same root cause forces the same fix.
