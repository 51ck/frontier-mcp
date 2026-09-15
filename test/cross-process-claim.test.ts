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
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
const [who, at, root, fault = 'none'] = [
  process.argv[2],
  Number(process.argv[3]),
  process.argv[4],
  process.argv[5],
];
const target = join(root, '.scratch', 'alpha', 'issues', '01-T1-contested.md');
const realRename = fs.promises.rename.bind(fs.promises);
let faulted = false;
fs.promises.rename = async (from, to) => {
  if (!faulted && to === target && fault !== 'none') {
    faulted = true;
    if (fault === 'mutate') {
      setTimeout(() => fs.appendFileSync(target, '\\nHand edit during retry.\\n'), 1);
    }
    throw Object.assign(new Error('injected Windows sharing failure'), { code: 'EPERM' });
  }
  return realRename(from, to);
};
syncBuiltinESMExports();

const { createFrontierMCP } = await import('%SRC%');
const frontier = createFrontierMCP({ cwd: root, env: {} });
const client = new Client({ name: who, version: '0' });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([frontier.server.connect(b), client.connect(a)]);
await client.callTool({ name: 'get_board', arguments: { effort: 'alpha' } });
while (Date.now() < at) {}
const result = await client.callTool({
  name: 'update_ticket',
  arguments: { id: 'T1', claim: { by: who } },
});
const detail = result.content?.find(item => item.type === 'text')?.text ?? '';
console.log(result.isError ? 'REFUSED ' + detail : 'WON');
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
let scriptPath: string | undefined;

afterEach(async () => {
  if (workspace !== undefined) await rm(workspace, { recursive: true, force: true });
  if (scriptPath !== undefined) await rm(scriptPath, { force: true });
  workspace = undefined;
  scriptPath = undefined;
});

describe('claims from separate processes', () => {
  it('produce exactly one winner, and it is the one holding the file', async () => {
    const { outcomes, ticket } = await raceClaims(CLAIMANTS);

    const winners = outcomes.filter(outcome => outcome.said === 'WON');
    expect(winners).toHaveLength(1);

    // And the winner's belief matches the file: nobody was told they won a
    // Ticket somebody else ended up holding.
    const onDisk = await readFile(ticket, 'utf8');
    expect(onDisk).toContain(`claimed_by: ${winners[0]?.who ?? '?'}`);
  }, 60_000);

  it('keeps exactly one winner when the first atomic replace gets EPERM', async () => {
    const { outcomes, ticket } = await raceClaims(CLAIMANTS, 'eperm');

    const winners = outcomes.filter(outcome => outcome.said === 'WON');
    expect(winners).toHaveLength(1);
    expect(await readFile(ticket, 'utf8')).toContain(`claimed_by: ${winners[0]?.who ?? '?'}`);
  }, 60_000);

  it('refuses an EPERM retry when a hand edit changes the target', async () => {
    const { outcomes, ticket } = await raceClaims(1, 'mutate');

    expect(outcomes[0]?.said).toContain('REFUSED T1 changed on disk since it was read');
    const onDisk = await readFile(ticket, 'utf8');
    expect(onDisk).toContain('Hand edit during retry.');
    expect(onDisk).not.toContain('claimed_by:');
  }, 60_000);
});

async function raceClaims(count: number, fault = 'none') {
  workspace = await mkdtemp(join(tmpdir(), 'frontier-cas-'));
  const issues = join(workspace, '.scratch/alpha/issues');
  const ticket = join(issues, '01-T1-contested.md');
  await mkdir(issues, { recursive: true });
  await writeFile(ticket, TICKET, 'utf8');

  // The script lives inside the project so it can resolve the SDK, and points
  // at the temporary workspace rather than living in it.
  const scripts = join(import.meta.dirname, '..', 'node_modules', '.frontier-test');
  await mkdir(scripts, { recursive: true });
  const script = join(scripts, `claimer-${String(process.pid)}.mjs`);
  scriptPath = script;
  const src = join(import.meta.dirname, '..', 'src', 'server.ts');
  await writeFile(script, CLAIMER.replace('%SRC%', src), 'utf8');

  // Every process busy-waits to the same instant, so they collide for real.
  const at = Date.now() + (count > 1 ? 1500 : 0);
  const outcomes = await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const who = `agent-${String(index)}`;
      const { stdout } = await run(process.execPath, [
        script,
        who,
        String(at),
        workspace ?? '',
        fault,
      ]);
      return { who, said: stdout.trim() };
    }),
  );
  return { outcomes, ticket };
}
