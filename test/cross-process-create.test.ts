import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const SESSIONS = 4;
const PER_SESSION = 3;

/**
 * The second test that leaves the in-process seam, for the same reason as
 * `cross-process-claim.test.ts` and under the same exception.
 *
 * The spec puts one process per client session, so parallel sessions are
 * parallel OS processes. Id allocation shares a scan, a write queue and a
 * module-level state within one process, every one of which would hand an
 * in-process test a pass it had not earned — exactly how the claim guarantee
 * came to hold only in-process. Two sessions issuing one id is the failure this
 * has to rule out, and only real processes can.
 */
const CREATOR = `
import { createFrontier } from '%SRC%';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
const [who, at, cwd] = [process.argv[2], Number(process.argv[3]), process.argv[4]];
const frontier = createFrontier({ cwd, env: {} });
const client = new Client({ name: who, version: '0' });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([frontier.server.connect(b), client.connect(a)]);
// Warm every cache before the starting gun, so the collision is over the write
// and not over who finished scanning first.
await client.callTool({ name: 'get_board', arguments: { effort: 'alpha' } });
const tickets = Array.from({ length: ${String(PER_SESSION)} }, (_, i) => ({
  title: who + ' thing ' + String(i),
}));
while (Date.now() < at) {}
const result = await client.callTool({
  name: 'create_tickets',
  arguments: { effort: 'alpha', tickets },
});
console.log(result.isError ? 'FAILED: ' + JSON.stringify(result.content) : 'OK');
process.exit(0);
`;

const SEED = `---
id: T1
title: Already here
kind: build
status: open
blocked_by: []
---

Body.
`;

/** Every `T<n>` in a filename. The frontmatter is the authority; this checks both agree. */
const IN_FILENAME = /-(T\d+)-/;

let workspace: string | undefined;

afterEach(async () => {
  if (workspace !== undefined) await rm(workspace, { recursive: true, force: true });
  workspace = undefined;
});

describe('creation from separate processes', () => {
  it('never issues one id twice', async () => {
    workspace = await mkdtemp(join(tmpdir(), 'frontier-alloc-'));
    const issues = join(workspace, '.scratch/alpha/issues');
    await mkdir(issues, { recursive: true });
    await writeFile(join(issues, '01-T1-already-here.md'), SEED, 'utf8');

    // The script lives inside the project so it can resolve the SDK, and points
    // at the temporary workspace rather than living in it.
    const scripts = join(import.meta.dirname, '..', 'node_modules', '.frontier-test');
    await mkdir(scripts, { recursive: true });
    const script = join(scripts, `creator-${String(process.pid)}.mjs`);
    const src = join(import.meta.dirname, '..', 'src', 'server.ts');
    await writeFile(script, CREATOR.replace('%SRC%', src), 'utf8');

    // Every process busy-waits to the same instant, so they collide for real.
    const at = Date.now() + 1500;
    const outcomes = await Promise.all(
      Array.from({ length: SESSIONS }, async (_, index) => {
        const { stdout } = await run(process.execPath, [
          script,
          `agent-${String(index)}`,
          String(at),
          workspace ?? '',
        ]);
        return stdout.trim();
      }),
    );

    // Contention is resolved by bumping, never by refusing: every session gets
    // the whole batch it asked for.
    expect(outcomes).toEqual(Array.from({ length: SESSIONS }, () => 'OK'));

    const files = (await readdir(issues)).filter(name => name.endsWith('.md'));
    expect(files).toHaveLength(SESSIONS * PER_SESSION + 1);

    const ids = files.map(name => IN_FILENAME.exec(name)?.[1]);
    expect(ids.filter(id => id === undefined)).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  }, 60_000);

  it('leaves no allocation guard behind', async () => {
    workspace = await mkdtemp(join(tmpdir(), 'frontier-alloc-'));
    await mkdir(join(workspace, '.scratch/alpha/issues'), { recursive: true });

    const scripts = join(import.meta.dirname, '..', 'node_modules', '.frontier-test');
    await mkdir(scripts, { recursive: true });
    const script = join(scripts, `creator-solo-${String(process.pid)}.mjs`);
    const src = join(import.meta.dirname, '..', 'src', 'server.ts');
    await writeFile(script, CREATOR.replace('%SRC%', src), 'utf8');

    await run(process.execPath, [script, 'agent-solo', String(Date.now()), workspace]);

    // A guard is held only across the write. One surviving it would name an id
    // that can never be minted again until it is swept.
    expect(await readdir(join(workspace, '.scratch'))).toEqual(['alpha']);
  }, 60_000);
});
