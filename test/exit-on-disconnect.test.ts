import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import { cleanupFixtures, makeFixtureTree } from './support/harness.ts';

const run = promisify(execFile);

/**
 * The third deliberate exception to "every test enters through
 * `test/support/harness.ts`" (see `cross-process-claim.test.ts` and
 * `cross-process-create.test.ts` for the first two, under the same rule):
 * the harness connects a client to the server in-process over
 * `InMemoryTransport`, which is exactly the seam this file exists to bypass.
 * T95 is a defect in the real stdio entry point — `dist/bin.js`, the file
 * `package.json`'s `bin` field actually points at — so only spawning that
 * file as a real OS process and watching it die is evidence of anything.
 * A mocked transport would prove the mock's `onclose` fires, not that the
 * shipped binary exits.
 */
const REPO_ROOT = join(import.meta.dirname, '..');
const DIST_BIN = join(REPO_ROOT, 'dist', 'bin.js');

/**
 * `tsc`'s own entry script rather than `pnpm run build`: since Node 20.12.2,
 * spawning a `.cmd`/`.bat` shim (which is what `pnpm`, and `tsc`'s own
 * `node_modules/.bin` shim, both are on Windows) without `shell: true` throws
 * `ERR_CHILD_PROCESS_BAD_EXECUTABLE` — which would fail this `beforeAll` on
 * every platform this file does not explicitly skip. This is otherwise the
 * first test in the repo to shell out to anything, so avoiding a shell
 * entirely is preferable to reaching for one only here. `node
 * <path-to-tsc>` needs no shim and no shell: `bin/tsc` is a plain JS file
 * (`import "../lib/tsc.js"`) that Node runs directly, and its own relative
 * import resolves regardless of the `exports` field restricting the
 * package's *external* subpath resolution — that restriction only applies
 * to a bare `require('typescript/bin/tsc')`, not to running the file itself.
 */
const LOCAL_TSC = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

/**
 * `dist/` is gitignored and every other test enters in-process, so nothing
 * else in the suite has ever needed it to exist. `.github/workflows/runtime.yml`
 * runs `pnpm test` before `pnpm run build`, so a clean CI checkout has no
 * `dist/` when this file's tests would otherwise try to spawn it. Building
 * here — rather than relying on workflow order — is what makes `pnpm test`
 * on a fresh clone mean what it says, independent of any other job.
 *
 * A local `tsc` build of this package takes well under a second; 60s leaves
 * enormous room for a cold, contended CI runner without masking a genuine
 * hang (the default `beforeAll` timeout would otherwise fail this with a
 * generic "exceeded timeout" that says nothing about the build itself).
 */
beforeAll(async () => {
  await run(process.execPath, [LOCAL_TSC], { cwd: REPO_ROOT });
}, 60_000);

afterEach(cleanupFixtures);

/**
 * A workspace with one Effort, not an empty `.scratch/`. `warmUp()` scans it
 * on boot, which is what makes the markdown driver attach the *recursive*
 * storage watch (`watchStorage`'s `attachStorageWatcher`, over `.scratch/`)
 * that the capture in the Ticket describes, rather than the root-level
 * fallback watch it would hold over an empty or absent `.scratch/`
 * (`watchStorage`'s root-watch branch, `src/storage/markdown/watcher.ts:135`)
 * while waiting for one to appear. Both are live `fs.watch` handles either
 * way — measured directly: an empty workspace against an unwired binary
 * still exited cleanly on EOF, so an empty fixture would not have told this
 * file's cases apart from a working shutdown path. The point of this
 * fixture is coverage of the specific watch the bug report is about, not
 * ruling out a false pass.
 */
async function workspaceWithAnEffort(): Promise<string> {
  return makeFixtureTree({
    '.scratch/alpha/map.md': map('Ship it.'),
    '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First'),
  });
}

function spawnBinary(cwd: string): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [DIST_BIN], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
}

/** A plain delay — `bin.js` never writes a startup banner, so there is no
 * stdout event worth waiting on instead. Long enough for Node's own startup
 * and this repo's ~13ms warm-up scan (see the scan-cost paragraph in
 * AGENTS.md) to finish and `bin.ts` to reach its own listener registration,
 * so a signal sent afterward exercises that handler rather than racing it. */
function settled(ms = 300): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** The child's own reported exit, so a caller can tell a clean `process.exit(0)`
 * apart from Node's default signal disposition (`code: null, signal: 'SIGTERM'`
 * or `'SIGINT'`) or an early crash (a non-zero `code`). */
interface ExitOutcome {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

/**
 * Resolves on the child's own `exit` event — the earliest signal the OS
 * process actually died, ahead of `close` (which additionally waits for its
 * stdio streams to finish draining) — with the `(code, signal)` pair `exit`
 * carries. Rejects loudly on the bound instead of letting a regression hang
 * the suite until vitest's own test timeout, which would report "test timed
 * out" rather than "the process never exited".
 *
 * Resolving with `(code, signal)` rather than nothing is load-bearing, not
 * incidental: on a plain "did it exit" check, deleting `bin.ts`'s
 * `process.on('SIGTERM', ...)` / `process.on('SIGINT', ...)` lines still
 * passed the SIGTERM and SIGINT cases below, because Node's own default
 * disposition for an unhandled signal kills the process anyway — the
 * listener was never the thing being exercised. Measured: with the listener,
 * the child exits `code: 0, signal: null` (our own `process.exit(0)`);
 * without it, `code: null, signal: 'SIGTERM'` (Node's default action). Only
 * asserting on the pair tells those apart, and it also stops a binary that
 * crashes at startup with a non-zero exit from passing on `exit` firing at
 * all.
 *
 * 5s: comfortably above Node's own startup and module-resolution cost plus
 * this repo's ~13ms warm-up scan (see the scan-cost paragraph in AGENTS.md),
 * with a wide margin for a slow or contended CI runner. Every test that uses
 * this also raises its own vitest timeout past 5s, so this rejection — not
 * vitest's generic "test timed out" — is what a genuine regression reports.
 */
function exitsWithin(child: ChildProcessWithoutNullStreams, ms = 5_000): Promise<ExitOutcome> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`pid ${String(child.pid)} did not exit within ${String(ms)}ms`));
    }, ms);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

/** Past `exitsWithin`'s own 5s bound, so that bound's message — not vitest's
 * default 5s per-test timeout — is what a hung process reports. */
const TEST_TIMEOUT_MS = 10_000;

describe('the packaged binary exits when its client disconnects', () => {
  it(
    'exits when stdin reaches EOF',
    async () => {
      const cwd = await workspaceWithAnEffort();
      const child = spawnBinary(cwd);
      const waiting = exitsWithin(child);

      child.stdin.end();

      const { code, signal } = await waiting;
      expect(code).toBe(0);
      expect(signal).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  /**
   * Distinct from the EOF case above in what it drives through the process,
   * not just in how it ends it. `StdioClientTransport.close()` also ends the
   * child's stdin under the hood — this SDK's stdio server transport has no
   * other client-observable close signal to give it, which is exactly the
   * defect this Ticket is about — so at the OS level both tests end in the
   * same pipe event. What differs is everything leading up to it: this test
   * runs a real MCP handshake through `Client`/`StdioClientTransport` and a
   * live tool call against a workspace with an Effort in it, so the
   * process under test is the one the bug report actually describes — a
   * session that scanned a workspace and is holding a live `fs.watch` — and
   * only then disconnects through the client library's own `close()`,
   * rather than a freshly spawned process whose stdin closes before it has
   * done anything at all.
   *
   * The bound is 1500ms, not the 5s used elsewhere: `StdioClientTransport
   * .close()` races its own `stdin.end()` against a 2000ms timer before it
   * ever tries `SIGTERM` (see `stdio.mjs` in `@modelcontextprotocol/client`).
   * If `bin.ts`'s own EOF handling were missing or broken, this `close()`
   * call would still eventually return — but not before that internal
   * fallback fired — so a bound comfortably under 2000ms is what stops the
   * client library's own resilience from quietly passing a broken binary.
   */
  it(
    'exits when the transport closes, after a real session',
    async () => {
      const cwd = await workspaceWithAnEffort();
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [DIST_BIN],
        cwd,
        stderr: 'inherit',
      });
      const client = new Client({ name: 'exit-on-disconnect-test', version: '0.0.0' });
      await client.connect(transport);

      const board = await client.callTool({ name: 'list_efforts', arguments: {} });
      expect(board.isError).not.toBe(true);

      const pid = transport.pid;
      expect(pid).not.toBeNull();

      const startedClosingAt = Date.now();
      await client.close();
      expect(Date.now() - startedClosingAt).toBeLessThan(1_500);

      // Belt over the timing bound: the pid is actually gone, not merely that
      // `close()` returned quickly for some unrelated reason.
      expect(() => process.kill(pid ?? -1, 0)).toThrow();
    },
    TEST_TIMEOUT_MS,
  );

  /**
   * Node terminates a process on an unhandled SIGTERM/SIGINT by default, so
   * merely observing `exit` fire proves nothing about `bin.ts`'s own
   * `process.on('SIGTERM', ...)` — measured directly: deleting that line (and
   * the SIGINT one below) from `bin.ts` still lets the child exit on this
   * signal, because Node's default disposition kills it regardless. What
   * distinguishes the two is `(code, signal)`: our handler runs
   * `frontier.close()` then calls `process.exit(0)` itself, which reports
   * `code: 0, signal: null`; Node's default action reports `code: null,
   * signal: 'SIGTERM'`. Asserting the pair is what makes this a regression
   * check on the listener rather than on Node's own default behavior.
   *
   * `process.exit(0)` rather than the conventional `128 + signal number` is
   * a deliberate choice for a supervised server process, not an oversight —
   * and it is exactly what makes `code: 0` available as that discriminator.
   *
   * Windows note, since this file runs under plain `pnpm test` there and not
   * only in the Windows leg of the packaged-runtime matrix: POSIX signals do
   * not exist on Windows, and Node's docs for `ChildProcess.kill(signal)` say
   * plainly that there the signal argument is ignored and the process is
   * killed forcefully regardless of what it names or whether anything is
   * listening. Both this test and the SIGINT one below would pass on Windows
   * whether or not `bin.ts`'s handler ever ran, so both are skipped there
   * rather than left to quietly assert something false.
   */
  it.skipIf(process.platform === 'win32')(
    'exits on SIGTERM',
    async () => {
      const cwd = await workspaceWithAnEffort();
      const child = spawnBinary(cwd);
      const waiting = exitsWithin(child);

      // A live child, not one already dying: SIGTERM racing process startup
      // would test Node's startup path more than the signal handler.
      await settled();
      child.kill('SIGTERM');

      const { code, signal } = await waiting;
      expect(code).toBe(0);
      expect(signal).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  /**
   * Signals arriving together — as they do on an ordinary Ctrl-C exit, where
   * a terminal often delivers both SIGINT and a parent's own SIGTERM to a
   * process group — is exactly the `shuttingDown` guard's reason to exist.
   * Sending SIGINT alone here still exercises the same shared `shutdown()`
   * as the SIGTERM case above, so this test only earns its place by not
   * being that one: it pins the *other* signal `bin.ts` names explicitly,
   * which SIGTERM alone would leave completely unverified. Same `(code,
   * signal)` discriminator as the SIGTERM case, against the same measured
   * baseline: Node's default disposition here reports `code: null, signal:
   * 'SIGINT'` rather than our handler's `code: 0, signal: null`. Skipped on
   * `win32` for the same reason as the SIGTERM case above.
   */
  it.skipIf(process.platform === 'win32')(
    'exits on SIGINT',
    async () => {
      const cwd = await workspaceWithAnEffort();
      const child = spawnBinary(cwd);
      const waiting = exitsWithin(child);

      await settled();
      child.kill('SIGINT');

      const { code, signal } = await waiting;
      expect(code).toBe(0);
      expect(signal).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );
});
