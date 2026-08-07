import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

async function oneOpenTicket() {
  const root = await makeFixtureTree({
    '.scratch/alpha/map.md': map('Somewhere.'),
    '.scratch/alpha/issues/01-T1-takeable.md': ticket('T1', 'Takeable'),
  });
  return { root, frontier: await connectFrontier({ cwd: root, env: {} }) };
}

function fileFor(root: string): string {
  return join(root, '.scratch/alpha/issues/01-T1-takeable.md');
}

describe('claiming a Ticket', () => {
  it('records who holds it and when they took it', async () => {
    const { root, frontier } = await oneOpenTicket();

    await frontier.call('update_ticket', { id: 'T1', claim: { by: 'agent-7' } });

    const onDisk = await readFile(fileFor(root), 'utf8');
    expect(onDisk).toContain('status: claimed');
    expect(onDisk).toContain('claimed_by: agent-7');
    expect(onDisk).toMatch(/claimed_at: \d{4}-\d{2}-\d{2}T/);
  });

  it('takes the Ticket off the Frontier', async () => {
    const { frontier } = await oneOpenTicket();

    await frontier.call('update_ticket', { id: 'T1', claim: { by: 'agent-7' } });
    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board.split('\n').filter(line => line.startsWith('> '))).toEqual([]);
    expect(board).toContain('claimed_by=agent-7');
  });

  it('refuses a Ticket someone else already holds', async () => {
    const { frontier } = await oneOpenTicket();

    await frontier.call('update_ticket', { id: 'T1', claim: { by: 'first' } });
    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      claim: { by: 'second' },
    });

    expect(error).toContain('first');
  });

  it('leaves the prose of the file it touched alone', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-takeable.md': ticket('T1', 'Takeable', {
        body: 'Problem prose.\n\n- [ ] A criterion\n\nMore prose.',
      }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('update_ticket', { id: 'T1', claim: { by: 'agent-7' } });

    const onDisk = await readFile(fileFor(root), 'utf8');
    expect(onDisk).toContain('Problem prose.\n\n- [ ] A criterion\n\nMore prose.');
  });

  it('creates no lock file', async () => {
    const { root, frontier } = await oneOpenTicket();

    await frontier.call('update_ticket', { id: 'T1', claim: { by: 'agent-7' } });

    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(join(root, '.scratch/alpha/issues'));

    expect(entries).toEqual(['01-T1-takeable.md']);
  });
});
