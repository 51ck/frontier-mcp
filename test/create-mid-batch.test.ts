import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';
import { map, ticket } from './support/fixtures.ts';

/**
 * In a file of its own so `vitest.config.ts` can run it in the isolated group:
 * the window it holds open is a 1,502-Ticket batch, which starves every test
 * sharing the pool with it on a slow core.
 */

afterEach(cleanupFixtures);

const WORKSPACE = {
  '.git/HEAD': 'ref: refs/heads/main\n',
  '.scratch/alpha/map.md': map('Ship alpha.'),
  '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First'),
  '.scratch/alpha/issues/02-T2-second.md': ticket('T2', 'Second'),
  '.scratch/beta/map.md': map('Ship beta.'),
  '.scratch/beta/issues/01-T7-seventh.md': ticket('T7', 'Seventh'),
};

const SEEDED = ['01-T1-first.md', '02-T2-second.md'];

async function issuesIn(root: string, effort: string): Promise<string[]> {
  return (await readdir(join(root, '.scratch', effort, 'issues'))).toSorted();
}

describe('a batch that cannot be completed', () => {
  it('leaves a Ticket another session claimed mid-batch, and names it', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const [creator, rival] = await Promise.all(
      [1, 2].map(() => connectFrontier({ cwd: root, env: {} })),
    );
    const issues = join(root, '.scratch/alpha/issues');
    const appeared = (filename: string) =>
      new Promise<void>(resolve => {
        const look = () => (existsSync(join(issues, filename)) ? resolve() : setImmediate(look));
        look();
      });

    // Links are taken in name order, so a0 lands first and zz last, with
    // enough between them that the batch is still linking when zz is taken.
    const creating = creator?.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [
        { name: 'a0', title: 'Claimed at once' },
        ...Array.from({ length: 1500 }, (_, index) => ({
          name: `m${String(index).padStart(4, '0')}`,
          title: 'Filler',
        })),
        { name: 'zz', title: 'Contested' },
      ],
    });

    await appeared('a0.md');
    // Connected only now, so the claimer's first scan already holds a0.
    const claimer = await connectFrontier({ cwd: root, env: {} });
    await claimer.call('update_ticket', { id: 'alpha.a0', claim: { by: 'session-c' } });
    await rival?.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'zz', title: 'Taken by the rival' }],
    });

    const error = await creating;
    expect(error).toContain('alpha.zz could not be created');
    expect(error).toContain('The batch was not fully undone: alpha.a0 remains on disk');
    expect(error).not.toContain('Nothing was created');

    // The claim was a rename over a0.md, so the path no longer held the
    // creator's file, and taking the batch back had to leave it alone.
    expect(await issuesIn(root, 'alpha')).toEqual([...SEEDED, 'a0.md', 'zz.md']);
    const survivor = await readFile(join(issues, 'a0.md'), 'utf8');
    expect(survivor).toContain('claimed_by: session-c');
    expect(await readFile(join(issues, 'zz.md'), 'utf8')).toContain('Taken by the rival');
  }, 60_000);
});
