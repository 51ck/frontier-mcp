---
header: map
---

# Map

## Destination

A measured decision on whether the FrontierMCP processes on one machine should share a single driver
instance rather than each holding its own, and — only if they should — an ADR recording its shape.
Arriving at "measured, and not worth it" closes this Effort. No code is written before T19 reports.

## Notes

**Domain:** the `.scratch/` markdown tracker, the FrontierMCP stdio server, Node 24, pnpm.

**Every session** consults `/grilling` and `/domain-modeling`. `AGENTS.md` Local Contracts are
binding until an ADR revises them.

**Why this Effort exists, and what it is not.** It was T22 on `frontier-web`, entangled with the web
UI. T21 separated them: the browser is served by a plain reader on the ADR 0001 seam, which needs no
shared process at all. What is left is a single motivation — the cost of N processes each holding a
full index, each re-scanning on every write from any process, each with its own recursive `fs.watch`.
That cost is unmeasured. **This Effort is not "build a hive."** It is "is that cost worth
centralizing reads", and closing with a no is a real arrival, not a failure.

**The case is already smaller than it looks.** Two `frontier-v1` Tickets remove the strongest
argument locally, with no shared process involved: T27 stops the index caching Ticket bodies — one
call site out of six reads one — and T28 pushes the cache and the watcher down into the driver. T19
depends on both, so it measures the shape that will exist rather than one already decided against.
It measures against `AGENTS.md:167-168`, `src/workspace-index.ts:19-26` and ADR 0005, all three of
which assert a full scan is single-digit milliseconds without citing a measurement.

**Standing constraints — not up for decision in this Effort:**

- Markdown files stay canonical (ADR 0001). Any cache is derived, in-memory, and rebuildable from a
  scan. There is one source of truth and several caches; caches go stale, they do not diverge.
- The ADR 0004 claim guard and the ADR 0005 id guard are not weakened. Both are filesystem-level and
  cross-process, so neither knows nor cares how many processes hold a driver. A shared driver can
  never be the only writer — the editor, `git checkout` and any agent's plain file tools all mutate
  `.scratch/` without passing through it — so it may never be used to justify dropping the revision
  check (`AGENTS.md:254-256`).
- Nothing a crashed process leaves behind may require a human to clean it up. `AGENTS.md:246` reads
  "no lock files, ever", but `spec.md:198` states the actual reason: so that a crashed session cannot
  wedge the tracker. ADR 0004 and ADR 0005 both create guard files and say so on the record; they
  pass because nothing ever waits on a guard.
- Eight tools, permanently (`AGENTS.md:135-136`). Nothing here adds one.

**The architecture, settled in T22's grilling. Not reopened without cause:**

- **Two layers.** Driver = the workspace, cached and live: physical model, revision semantics,
  guards, cache, change notification. Consumer = tools, rendering, transport.
- **The driver speaks JSON across a process boundary.** One IPC surface; MCP consumers render prose
  for an LLM, a web consumer renders for a browser. No second query surface.
- **The consumer process is a transport shim by necessity** — MCP hosts spawn a stdio child per
  session, and that is not ours to change.
- **Election is a loopback TCP port**, and the leader is both shared driver and web host. A port is
  OS-reclaimed when its holder dies, so there is no stale inode and none of the read-decide-remove
  race ADR 0005 documents.
- **Version-namespaced**, so differently pinned clients form separate groups rather than one group
  speaking two protocols.
- **Refcount plus a short idle grace** for lifetime.
- **Degradation to today is an invariant.** A consumer that cannot reach a leader constructs its own
  driver and serves correctly. Split-brain is permitted in writing: two leaders is a slower group,
  never a wrong one. This is what keeps the whole design off the correctness surface — it is a pure
  optimization, and its failure modes cost speed rather than truth.
- **The web UI ships standalone first**; the leader absorbs the listener later, and the standalone
  process becomes the degenerate one-member case.

**Decided before charting:** the go/no-go is the user's call, taken after reading T19, not an
agent's. Design work happens now because it is free; construction waits on the measurement.

## Decisions so far

<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
<!-- /GENERATED -->

## Not yet specified

- A safe protocol for reclaiming an abandoned leader. Deliberately absent for now, because split-brain costs only speed — but every scheme has the read-decide-remove shape ADR 0005 measured going stale between deciding and removing, and a PID liveness test narrows that window without closing it.
- How the driver's typed errors cross the wire. `RevisionMismatch`, `GuardHeld`, `NoSuchEffort`, `NoSuchMap`, `NoSuchSpec` and `NoSuchTicket` are caught by type in `src/server.ts`; JSON carries no classes, so they need a discriminated wire form and reconstruction on the consumer side.
- Where cycle validation moves. `CreateOptions.validate` (`src/storage/driver.ts:26-41`) is a callback the driver invokes back into its caller mid-write while holding every id guard, and it cannot cross a process boundary. Moving it into the driver is the expected answer — the driver already mints the ids and re-scans under the guards — but it revises ADR 0005's stated reason for putting the hook above the seam.
- Whether a leader serves one workspace or several. A driver is bound to its workspace at construction, and election is currently conceived per workspace — but a consumer carrying an explicit `root` reads a workspace that is not its session's own, so one process may need to reach several leaders, or one leader may need to hold several drivers.
- Whether change notification is pushed to consumers or polled, and what it carries — a bare "something changed", or enough to update without a re-read. It interacts with the 50ms debounce (`src/workspace-watcher.ts:27`) and with `spec.md:398`, which keeps watcher-triggered writes out of scope.
- The security posture of a loopback TCP port when it is not also the web listener. A port is reachable by any local process or user, where a unix socket in a mode-0700 directory is not — and the leader holds read and write access to the user's repository. T26 answers this for the web listener; a leader that exists without one still has to answer it.
- Whether a loopback port serves every platform, or Windows needs its own primitive. Named pipes have no stale state either, but they are a second code path and a second test matrix for a mechanism whose failure mode is only slowness.

## Out of scope

- A shared process justified as a fix for write races — the race is closed by ADR 0004 and ADR 0005 and tested cross-process by tests that spawn real OS processes. Centralization earns its place from measured scan cost or not at all.
- Making a shared process the single writer. It can never be one: the editor, `git checkout` and any agent's plain file tools all write `.scratch/` directly, and the user has already observed an agent going to disk to work out the next Ticket id by hand.
- The web UI itself — `frontier-web` owns what the browser shows, how it learns of a change, where it ships, and its security posture. This Effort owns only whether a leader eventually hosts that listener.
- The SQLite driver and `md` / `db` conversion — already deferred by ADR 0001. The two-layer collapse makes a second driver easier to write, which is a consequence rather than a goal.
- Multi-repo aggregation and cross-repo Boards — `spec.md:399` stands here too. One workspace per call.


<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
<!-- /GENERATED -->
