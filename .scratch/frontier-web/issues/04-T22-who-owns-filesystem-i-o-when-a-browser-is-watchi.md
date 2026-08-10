---
id: T22
title: Who owns filesystem I/O when a browser is watching
kind: decision
type: grilling
status: resolved
triage: ready-for-agent
blocked_by: [T19, T21]
answer_gist: Option A for the web process, which ships standalone as a peer reader on the seam; the shared-driver question separates into the frontier-hive Effort with its architecture designed but its go/no-go gated on T19
---

## Question

The central decision of this Map. A long-lived HTTP process must exist for the browser regardless.
Does anything else change?

Candidates:

- **A — web server as peer.** Its own index, its own watcher, writing under the same ADR 0004 / 0005
  guards as every other writer. No new coordination protocol, no daemon lifecycle, MCP sessions
  untouched.
- **C — shared read cache, direct writes.** A hub serves reads to all sessions, eliminating the N
  redundant scans and N watchers, but every writer still writes directly under the existing guards.
  Targets the measured cost without claiming a single-writer guarantee.
- **B — full hive.** One process owns all filesystem I/O; MCP sessions become thin proxies.

The framing that must survive this grilling: **a broker can never be the only writer.** The editor,
`git checkout`, and any agent's plain file tools all mutate `.scratch/` without passing through it —
the user has already observed an agent going to disk to work out the next Ticket id by hand. So B
cannot deliver a single-writer guarantee, only the appearance of one, and the temptation that
follows — dropping the revision check because "we are the only writer" — is the regression to avoid
(`AGENTS.md:254-256`).

B must additionally answer: who starts and reaps the daemon; version skew when Cursor is pinned to
one published version and another client to a different one; and what happens when the hub is down.

Invoke `/grilling` and `/domain-modeling`. HITL.

## Acceptance criteria

- [ ] One of A, B or C is chosen, with the scan measurement and the transport research as inputs
- [x] The decision records what it does to `spec.md:399` — amended in place, or superseded by a new ADR
- [x] It is stated explicitly that ADR 0004 and ADR 0005 guards survive unchanged, and how the new
      process participates in them
- [x] The choice forecloses neither browser edits nor later multi-repo aggregation, and says how
- [x] If B is chosen, daemon lifecycle, version skew and degraded mode each have an answer

## Answer

Settled in a `/grilling` session. The Ticket had two halves and they come apart cleanly.

## The web half — option A, and it ships standalone

The web process is a **peer reader on the ADR 0001 driver seam**, holding its own driver, exactly as
T21's research recommended. It ships on its own, with no shared process in existence, and it must
stay shippable that way. If a shared driver is ever built, the leader absorbs the web listener and
today's standalone process becomes the degenerate one-member case of it — an evolution, never a
precondition. Sequencing matters here: the shared-driver work is gated on a measurement that may
kill it, and the web UI must not be hostage to an Effort whose honest outcome may be closure.

This unblocks T23, T24 and T26 as they stand.

## The hive half — separated into `frontier-hive`

Once the web question is answered, centralizing reads keeps exactly one motivation: the cost of N
processes each holding a full index, each re-scanning on every write from any process, each with its
own recursive `fs.watch`. That cost is unmeasured, and T19 measures it. The question moves to its own
Effort with the architecture below already designed, so that when T19 reports there is a decision to
take rather than a design to start.

**Two findings during the grilling shrank the case before T19 even runs.**

First, the largest of the three arguments — N cached copies of every Ticket body — turns out to be
fixable locally, with no shared process at all. `src/domain.ts` already splits `TicketSummary` from
`Ticket`, which adds only `body`; but `listTickets()` returns the full form and the index caches it
whole. Exactly one call site out of six reads a body: `src/tools/get-tickets.ts:66`. That is now T27
on `frontier-v1`. Scan cost is untouched by it — the driver still parses every file for frontmatter —
but retained memory is not.

Second, the layer the shared process would have centralized is not driver-agnostic. `workspace-index.ts`
imports a watcher that hardcodes `.scratch` and calls `node:fs.watch`, above a seam whose purpose is
to hide exactly that. Pushing the cache and the watcher into the driver is T28, and it makes the whole
question expressible in one sentence: share one driver instance across processes.

T19 now depends on both, so that it measures the shape that will exist rather than one already decided
against.

## The architecture, as designed

- **Two layers, not three.** Driver = the workspace, cached and live: physical model, revision
  semantics, guards, cache, change notification. Consumer = tools, rendering, transport.
- **The driver speaks JSON across the process boundary.** One IPC surface; MCP consumers render prose
  for an LLM, the web consumer renders for a browser. No second query surface, which was the wrinkle
  a tool-level seam would have forced.
- **The consumer process is a transport shim by necessity** — MCP hosts spawn a stdio child per
  session and that is not ours to change.
- **Election is a loopback TCP port**, and the leader is both the shared driver and the web host. A
  port is OS-reclaimed when its holder dies, so there is no stale inode and none of the
  read-decide-remove race ADR 0005 documents. A dead leader frees the port, the next consumer takes
  both roles, and `EventSource` reconnects to the same URL unaided.
- **Version-namespaced**, so differently pinned clients form separate groups rather than one group
  speaking two protocols.
- **Refcount plus a short idle grace** for lifetime, so a restart does not cold-start and an abandoned
  repo does not hold an index forever.
- **Degradation to today is an invariant.** A consumer that cannot reach a leader constructs its own
  driver and serves correctly. Split-brain is permitted in writing: two leaders is a slower group,
  never a wrong one.
- **Gated on T19**, and the go/no-go call is the user's.

## What survives unchanged

**The ADR 0004 and ADR 0005 guards.** Both are filesystem-level and cross-process — `open(..., 'wx')`
on a revision-keyed guard for claims, on a repo-global id guard for allocation. They do not know or
care how many processes hold a driver, which is precisely why the degraded path above is safe and why
split-brain cannot produce a wrong answer. The framing this Ticket asked to survive did survive: a
shared process can never be the only writer, so it may never be used to justify dropping the revision
check.

**One consequence to carry forward:** `CreateOptions.validate` is a callback the driver invokes back
into its caller mid-write while holding every id guard. It does not cross a process boundary. The
resolution is to move cycle validation into the driver, which already mints the ids and already
re-scans under the guards — ADR 0005 put the hook above the seam only because the tool layer could not
see the ids coming, and that reason disappears when the tool layer is in another process.

## `spec.md:399`

The line defers "HTTP transport, multi-repo aggregation, and any cross-repo Board." Separating the two
questions splits what each does to it. **The web UI reopens it**, narrowly: the process listens on a
socket to serve a browser, while MCP stays stdio-only, one server process per client session, with no
MCP-over-HTTP surface to secure or version. The amending ADR must say that explicitly or the next
reader takes the whole line as overturned. **A shared driver alone would not reopen it** — JSON over a
loopback port between our own processes is not the MCP-over-HTTP the line was written about. It only
becomes entangled if the leader hosts the web listener, which is the later evolution, not the first
step.

## Neither browser edits nor multi-repo are foreclosed

Read-only is a product decision, not a structural one: the driver interface already carries
`updateTicket`, `createTickets`, `editMap` and `putSpec`, so a writing web consumer joins the same
guards as every other writer and needs no new protocol. Multi-repo is likewise open — a driver is
bound to one workspace at construction, so aggregation is a consumer holding several, and election is
per workspace.
