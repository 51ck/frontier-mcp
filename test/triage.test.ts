import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const FILE = '.scratch/alpha/issues/01-T1-work.md';

async function oneTicket(fields = {}) {
  const root = await makeFixtureTree({
    '.scratch/alpha/map.md': map('Somewhere.'),
    [FILE]: ticket('T1', 'Work', fields),
  });
  return {
    root,
    frontier: await connectFrontier({ cwd: root, env: {} }),
    read: async () => readFile(join(root, FILE), 'utf8'),
  };
}

function marked(board: string): string[] {
  return board
    .split('\n')
    .filter(line => line.startsWith('> '))
    .map(line => line.slice(2).split('  ')[0] ?? '');
}

describe('the triage role', () => {
  it('is a separate field from Status, and setting it leaves Status alone', async () => {
    const { frontier, read } = await oneTicket({ status: 'claimed', claimed_by: 'agent-7' });

    await frontier.call('update_ticket', { id: 'T1', triage: 'needs-info' });

    const onDisk = await read();
    expect(onDisk).toContain('triage: needs-info');
    expect(onDisk).toContain('status: claimed');
    expect(onDisk).toContain('claimed_by: agent-7');
  });

  it('is left alone when Status changes', async () => {
    const { frontier, read } = await oneTicket({ triage: 'ready-for-agent' });

    await frontier.call('update_ticket', { id: 'T1', resolve: { answer_gist: 'Done.' } });

    const onDisk = await read();
    expect(onDisk).toContain('triage: ready-for-agent');
    expect(onDisk).toContain('status: resolved');
  });

  it('accepts wontfix as a role', async () => {
    const { frontier, read } = await oneTicket();

    await frontier.call('update_ticket', { id: 'T1', triage: 'wontfix' });

    expect(await read()).toContain('triage: wontfix');
  });

  it('rejects wontfix as a Status', async () => {
    const { frontier } = await oneTicket();

    // `wontfix` is a Triage role, not a Status. There is no lifecycle position
    // by that name, and the only way to close a Ticket is resolve or drop.
    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      status: 'wontfix',
    });

    expect(error.length).toBeGreaterThan(0);
  });

  it('does not change what is on the Frontier', async () => {
    const { frontier } = await oneTicket();

    const before = marked(await frontier.call('get_board', { effort: 'alpha' }));
    await frontier.call('update_ticket', { id: 'T1', triage: 'wontfix' });
    const after = marked(await frontier.call('get_board', { effort: 'alpha' }));

    // Story 29: /triage and the graph must not fight over one field. An
    // annotation is not a graph operation, so the Frontier is unmoved — the
    // Board says the Ticket is wontfix and lets the reader decide.
    expect(before).toEqual(['T1']);
    expect(after).toEqual(['T1']);
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('triage=wontfix');
  });
});
