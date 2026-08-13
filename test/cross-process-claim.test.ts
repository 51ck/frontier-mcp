import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const CLAIMANTS = 4;

/**
 * The one test that leaves the in-process seam, deliberately.
 *
 * The spec puts one process per client session, so two parallel sessions are
 * two OS processes. An in-process test cannot tell a real compare-and-set from
 * a shared cache and a shared write queue — and when this was measured properly
 * it turned out three of four processes reported winning a Ticket that only one
 * of them held. Nothing reachable through the tool layer alone would have
 * caught that.
 */
const CLAIMER = `
import { createFrontierMCP } from '%SRC%';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
const [who, at] = [process.argv[2], Number(process.argv[3])];
const frontier = createFrontierMCP({ cwd: process.argv[4], env: {} });
const client = new Client({ name: who, version: '0' });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([frontier.server.connect(b), client.connect(a)]);
await client.callTool({ name: 'get_board', arguments: { effort: 'alpha' } });
while (Date.now() < at) {}
const result = await client.callTool({
  name: 'update_ticket',
  arguments: { id: 'T1', claim: { by: who } },
});
console.log(result.isError ? 'REFUSED' : 'WON');
process.exit(0);
`;

const TICKET = `---
id: T1
title: Contested
kind: build
status: open
blocked_by: []
---

Body.
`;

let workspace: string | undefined;

afterEach(async () => {
  if (workspace !== undefined) await rm(workspace, { recursive: true, force: true });
  workspace = undefined;
});

describe('claims from separate processes', () => {
  it('produce exactly one winner, and it is the one holding the file', async () => {
    workspace = await mkdtemp(join(tmpdir(), 'frontier-cas-'));
    await mkdir(join(workspace, '.scratch/alpha/issues'), { recursive: true });
    await writeFile(join(workspace, '.scratch/alpha/issues/01-T1-contested.md'), TICKET, 'utf8');

    // The script lives inside the project so it can resolve the SDK, and points
    // at the temporary workspace rather than living in it.
    const scripts = join(import.meta.dirname, '..', 'node_modules', '.frontier-test');
    await mkdir(scripts, { recursive: true });
    const script = join(scripts, `claimer-${String(process.pid)}.mjs`);
    const src = join(import.meta.dirname, '..', 'src', 'server.ts');
    await writeFile(script, CLAIMER.replace('%SRC%', src), 'utf8');

    // Every process busy-waits to the same instant, so they collide for real.
    const at = Date.now() + 1500;
    const outcomes = await Promise.all(
      Array.from({ length: CLAIMANTS }, async (_, index) => {
        const { stdout } = await run(process.execPath, [
          script,
          `agent-${String(index)}`,
          String(at),
          workspace ?? '',
        ]);
        return { who: `agent-${String(index)}`, said: stdout.trim() };
      }),
    );

    const winners = outcomes.filter(outcome => outcome.said === 'WON');
    expect(winners).toHaveLength(1);

    // And the winner's belief matches the file: nobody was told they won a
    // Ticket somebody else ended up holding.
    const onDisk = await readFile(
      join(workspace, '.scratch/alpha/issues/01-T1-contested.md'),
      'utf8',
    );
    expect(onDisk).toContain(`claimed_by: ${winners[0]?.who ?? '?'}`);
  }, 60_000);
});
