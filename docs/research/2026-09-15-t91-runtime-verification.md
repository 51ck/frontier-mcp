# Bun and Deno verification after watcher settling

Date: **2026-09-15**. Ticket: **T91**. Measurements: **2026-09-14–15**, macOS arm64.

This snapshot supplements [the September 4 investigation](./2026-09-04-runtime-setup.md).
It does not expand the Node engine contract or enable automatic runtime selection.

## Results

Under unrestricted filesystem access, Bun **1.3.14** and Deno **2.9.6** passed the strengthened
MCP/process probe against both the compiled worktree based on `a1b966d` and released **0.3.1**. The
strengthened probe itself was an uncommitted worktree change. The actual npm launchers also passed.
The stale Board reproduced inside the agent sandbox, but disappeared when the same commands ran
outside it. These measurements do not establish a runtime watcher defect or support on Windows,
Linux, other architectures, or other runtime/package versions.

| Package and command | MCP tools/resource, create/read | Nested external edit | New directory and edit inside it | Concurrent claims and ids |
| --- | --- | --- | --- | --- |
| Current compiled package, Node 24.15.0 | Pass | Pass | Pass | Pass |
| Current compiled package, Bun 1.3.14 | Pass | Pass | Pass | Pass |
| Current compiled package, Deno 2.9.6, local dependencies | Pass | Pass | Pass | Pass |
| Released 0.3.1, Bun 1.3.14, installed entry | Pass | Pass | Pass | Pass |
| Released 0.3.1, Deno 2.9.6, local dependencies | Pass | Pass | Pass | Pass |
| Released 0.3.1, `bun x --bun` | Pass | Pass | Pass | Pass |
| Released 0.3.1, isolated Deno `npm:` entry | Pass | Pass | Pass | Pass |

The current-package runs additionally passed claim, release, resolve and reopen. Released 0.3.1
does not implement release/reopen and fails first creation if `.scratch/` does not exist (T87).
Its disposable full probe therefore precreated `.scratch/` and omitted those two newer transitions;
its concurrent-claim check still exercised a real claim. A second disposable fixture started from
a Legacy Ticket, then claimed and resolved it through each npm launcher. Both runs normalized the
Ticket, stored the answer gist, and preserved its body.

All results above are direct measurements through
[`runtime-check.mjs`](../../scripts/runtime-check.mjs), with a disposable copy adapting only those
two old-package prerequisites. Four server processes contested one Ticket; exactly one reported
success and matched its on-disk holder. Four other processes each created three Tickets, with no
missing files or duplicate ids. The Node baseline also passed through an installed production
tarball using `pnpm run test:runtime`.

## Why the old probe gave false confidence

The probe originally read a Board, waited 1.3 seconds, edited its Ticket externally, and polled.
The driver's unconditional attach-settle timers had already invalidated that cached Board during
the wait. Its next read could see the edit even if no filesystem event arrived.

The strengthened probe primes the Board **after** the 1.3-second wait. It then verifies an external
edit, an externally created Effort and Ticket, and a later edit inside that new directory after
another settle-and-prime step. No MCP write occurs during these watcher checks.
The driver's normal settle schedule is 50, 250 and 1000 milliseconds.
[`watcher.ts`](../../src/storage/markdown/watcher.ts)

A disposable compiled copy replaced both watcher event calls to `scheduleInvalidate()` with
no-ops while retaining settle timers. Outside the sandbox, Node 24.15.0 then failed with
`Timed out waiting for an external nested Ticket edit reaches the Board after watcher settling`,
still displaying `Runtime lifecycle`. The unmodified Node package passed under the same conditions.
This mutation establishes that the strengthened check detects missing event-driven invalidation.

Inside the sandbox, that deliberately broken Node copy unexpectedly passed. Temporary stack
instrumentation showed repeated invalidations from the settle callback beyond the initial schedule:
watcher errors cleared the handle, a settle callback attached again, and each attachment scheduled
another set of timers. Those repeated invalidations hid the disabled event path. Bun and Deno
instead timed out with a stale Board in sandboxed runs. Their unrestricted runs passed, including
the exact Deno npm command which had failed sandboxed after its packages were cached.
This is a measured environment difference; it does not prove that every sandbox blocks watching
or establish the precise operating-system restriction responsible for each runtime's behavior.

## Commands actually exercised

The installed-entry forms used an absolute executable and absolute `dist/bin.js` path. Deno's local
dependency-tree form was:

```sh
deno run --no-config --no-lock --node-modules-dir=manual --no-prompt \
  --allow-read --allow-write --allow-env /absolute/installed/frontier-mcp/dist/bin.js
```

The released npm launch forms were:

```sh
bun x --bun frontier-mcp@0.3.1
deno run --no-config --no-lock --node-modules-dir=none --no-prompt \
  --allow-read --allow-write --allow-env npm:frontier-mcp@0.3.1
```

Deno used a disposable `DENO_DIR`; its npm launcher ignored the local entry argument supplied to
the probe and resolved the exact npm pin itself. Every server worked in a temporary repository.
Wrapper diagnostics and package downloads went to stderr, leaving stdout to MCP.

The final npm-launcher fixture put Node **16.20.2** first on `PATH` while its MCP client ran through
an absolute Node 24.15.0 executable. `bun x --bun` still completed the lifecycle check, which would
have failed on Node 16 in this package. The Deno run used the official 2.9.6
`aarch64-apple-darwin` archive; its SHA-256, `213a2f304f04d3c9cb5220669afad138f60a5aab1fe80962abdeb8f35807a472`,
matched the [checksum published with that release](https://github.com/denoland/deno/releases/download/v2.9.6/deno-aarch64-apple-darwin.zip.sha256sum).
Both temporary consumer repositories contained
malformed `deno.json` and `deno.lock` sentinels. Their bytes were unchanged afterward, and neither
repository gained `node_modules`.

Bun documents `--bun` as forcing Bun despite a Node shebang.
[Bun package execution](https://bun.com/docs/pm/bunx)
Deno's flags disable automatic config/lock discovery, use cached npm resolution rather than a
consumer `node_modules`, and fail instead of prompting for missing permissions. The tested grants
were read, write and environment; no `--allow-run`, application network, or native-library grant
was supplied. [Deno run reference](https://docs.deno.com/runtime/reference/cli/run/)
The completed sentinel fixture confirms consumer config and dependency-tree isolation for this exact
command, version, platform, and architecture.

## Remaining T91 work

Finish launch-workspace marker selection, conflict/override behavior, supported-Node fallback, and
the user-scope multi-project launch.
Verify the final saved launcher against the exact package version it will select before enabling
it. These successful 0.3.1 measurements cannot authorize a future release pin or another platform.
Keep the stronger watcher check in the ordinary package compatibility matrix and run runtime
comparisons with matched filesystem permissions.
