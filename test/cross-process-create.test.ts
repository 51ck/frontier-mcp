import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const SESSIONS = 4;

/**
 * The second test that leaves the in-process seam, for the same reason as
 * `cross-process-claim.test.ts` and under the same exception.
 *
 * The spec puts one process per client session, so parallel sessions are
 * parallel OS processes. Within one process creation shares a scan and a write
 * queue, either of which would hand an in-process test a pass it had not
 * earned — exactly how the claim guarantee came to hold only in-process. Two
 * sessions both believing they created one name is the failure this has to
 * rule out, and only real processes can.
 */
const CREATOR = `
import { createFrontierMCP } from '%SRC%';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
const [who, at, cwd] = [process.argv[2], Number(process.argv[3]), process.argv[4]];
const names = JSON.parse(process.argv[5]);
const frontier = createFrontierMCP({ cwd, env: {} });
const client = new Client({ name: who, version: '0' });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([frontier.server.connect(b), client.connect(a)]);
// Warm every cache before the starting gun, so the collision is over the write
// and not over who finished scanning first.
await client.callTool({ name: 'get_board', arguments: { effort: 'alpha' } });
const tickets = names.map(name => ({ name, title: who }));
while (Date.now() < at) {}
const result = await client.callTool({
  name: 'create_tickets',
  arguments: { effort: 'alpha', tickets },
});
console.log(result.isError ? 'FAILED: ' + JSON.stringify(result.content) : 'OK');
process.exit(0);
`;

const SEED_FILE = '01-T1-already-here.md';
const SEED = `---
id: T1
title: Already here
kind: build
status: open
blocked_by: []
---

Body.
`;

const TITLE = /^title:[ \t]*(\S+)$/m;

let workspace: string | undefined;

afterEach(async () => {
  if (workspace !== undefined) await rm(workspace, { recursive: true, force: true });
  workspace = undefined;
});

/** Start every session busy-waiting to one instant, so they collide for real. */
async function race(
  label: string,
  root: string,
  namesFor: (who: string) => readonly string[],
): Promise<{ who: string; outcome: string }[]> {
  // The script lives inside the project so it can resolve the SDK, and points
  // at the temporary workspace rather than living in it.
  const scripts = join(import.meta.dirname, '..', 'node_modules', '.frontier-test');
  await mkdir(scripts, { recursive: true });
  const script = join(scripts, `creator-${label}-${String(process.pid)}.mjs`);
  const src = join(import.meta.dirname, '..', 'src', 'server.ts');
  await writeFile(script, CREATOR.replace('%SRC%', src), 'utf8');

  const at = Date.now() + 1500;
  return Promise.all(
    Array.from({ length: SESSIONS }, async (_, index) => {
      const who = `agent-${String(index)}`;
      const { stdout } = await run(process.execPath, [
        script,
        who,
        String(at),
        root,
        JSON.stringify(namesFor(who)),
      ]);
      return { who, outcome: stdout.trim() };
    }),
  );
}

describe('creation from separate processes', () => {
  it('gives one name to exactly one session, and leaves nothing of the others', async () => {
    workspace = await mkdtemp(join(tmpdir(), 'frontier-create-'));
    const issues = join(workspace, '.scratch/alpha/issues');
    await mkdir(issues, { recursive: true });
    await writeFile(join(issues, SEED_FILE), SEED, 'utf8');

    // The contested name sits mid-batch, so a loser that had already landed its
    // own first file has to take it back.
    const outcomes = await race('same', workspace, who => [
      `${who}-before`,
      'shared',
      `${who}-after`,
    ]);

    const winners = outcomes.filter(entry => entry.outcome === 'OK');
    const refused = outcomes.filter(entry => entry.outcome.startsWith('FAILED: '));
    expect(winners).toHaveLength(1);
    expect(refused).toHaveLength(SESSIONS - 1);
    for (const { outcome } of refused) expect(outcome).toMatch(/shared/);

    const winner = winners[0]?.who ?? '';
    // The whole directory, so a staged file or a guard left behind would show.
    expect((await readdir(issues)).toSorted()).toEqual(
      [SEED_FILE, `${winner}-after.md`, `${winner}-before.md`, 'shared.md'].toSorted(),
    );
    expect(TITLE.exec(await readFile(join(issues, 'shared.md'), 'utf8'))?.[1]).toBe(winner);
    expect(await readdir(join(workspace, '.scratch'))).toEqual(['alpha']);
  }, 60_000);

  it('lets every session land its own names, taking no guard and leaving a 1.x one where it lies', async () => {
    workspace = await mkdtemp(join(tmpdir(), 'frontier-create-'));
    const issues = join(workspace, '.scratch/alpha/issues');
    await mkdir(issues, { recursive: true });
    await writeFile(join(workspace, '.scratch/frontier.yml'), 'id_pattern: T<N>\n', 'utf8');
    await writeFile(join(workspace, '.scratch/.frontier-id-N-2.guard'), '4242\n', 'utf8');
    await writeFile(join(issues, SEED_FILE), SEED, 'utf8');

    const outcomes = await race('own', workspace, who => [`${who}-one`, `${who}-two`]);

    // Different names never contend: nothing is shared for them to collide over.
    expect(outcomes.map(entry => entry.outcome)).toEqual(
      Array.from({ length: SESSIONS }, () => 'OK'),
    );
    expect((await readdir(issues)).toSorted()).toEqual(
      [SEED_FILE, ...outcomes.flatMap(({ who }) => [`${who}-one.md`, `${who}-two.md`])].toSorted(),
    );
    expect((await readdir(join(workspace, '.scratch'))).toSorted()).toEqual([
      '.frontier-id-N-2.guard',
      'alpha',
      'frontier.yml',
    ]);
  }, 60_000);
});
