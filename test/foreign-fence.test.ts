import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const FILE = '.scratch/alpha/issues/01-foreign.md';

function fenced(fields: Record<string, string>, body = 'Body prose.'): string {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`;
}

function marked(board: string): string[] {
  return board
    .split('\n')
    .filter(line => line.startsWith('> '))
    .map(line => line.slice(2).split('  ')[0] ?? '');
}

function ticketLine(board: string): string {
  return (
    board.split('\n').find(entry => entry.includes('GitHub') || entry.includes('Closed')) ?? ''
  );
}

describe('a non-conforming frontmatter fence on read', () => {
  it('flags a fence with no id and a foreign key as Legacy', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: fenced({ labels: 'bug', title: 'GitHub export' }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).toContain('are Legacy');
    expect(ticketLine(board)).toContain('alpha#1');
  });

  it('surfaces fenced status: closed as unrecognized and keeps it off the Frontier', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: fenced({ title: 'Closed export', status: 'closed' }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(ticketLine(board)).toContain('/open');
    expect(board).toContain('unrecognized status');
    expect(board).toContain('kept off the Frontier');
    expect(board).toContain('alpha#1 "closed"');
    expect(marked(board)).toEqual([]);
  });

  it('keeps a foreign fence with extra keys and status: closed off the Frontier', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: fenced({ github: '123', title: 'Both problems', status: 'closed' }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).toContain('are Legacy');
    expect(board).toContain('unrecognized status');
    expect(marked(board)).toEqual([]);
  });

  it('leaves a schema Ticket with id and status: open takeable', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-open.md': ticket('T1', 'Still takeable'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(marked(await frontier.call('get_board', { effort: 'alpha' }))).toEqual(['T1']);
  });

  it('does not rewrite a foreign fence file on get_board', async () => {
    const contents = fenced({ labels: 'bug', title: 'GitHub export' });
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: contents,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('get_board', { effort: 'alpha' });

    expect(await readFile(join(root, FILE), 'utf8')).toBe(contents);
  });
});
