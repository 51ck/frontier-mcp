import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const A = '.scratch/alpha/issues/01-T5-first.md';
const B = '.scratch/beta/issues/01-T5-second.md';
const SAME = '.scratch/alpha/issues/02-T5-again.md';

async function crossEffort() {
  const root = await makeFixtureTree({
    '.scratch/alpha/map.md': map('Somewhere.'),
    '.scratch/beta/map.md': map('Elsewhere.'),
    [A]: ticket('T5', 'First claimant'),
    [B]: ticket('T5', 'Second claimant'),
    '.scratch/alpha/issues/03-T6-other.md': ticket('T6', 'Unrelated'),
  });
  return { root, frontier: await connectFrontier({ cwd: root, env: {} }) };
}

describe('a duplicate id', () => {
  it('warns on the Board and names every claimant file, across Efforts', async () => {
    const { frontier } = await crossEffort();

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).toContain(
      'duplicate ids, each carried by more than one Ticket file (1): ' +
        'T5 (alpha/issues/01-T5-first.md, beta/issues/01-T5-second.md)',
    );
  });

  it('warns within one Effort, as one grouped line however many ids collide', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [A]: ticket('T5', 'First'),
      [SAME]: ticket('T5', 'Again'),
      '.scratch/alpha/issues/03-T7-a.md': ticket('T7', 'Seven'),
      '.scratch/alpha/issues/04-T7-b.md': ticket('T7', 'Seven again'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });
    const lines = board.split('\n').filter(line => line.includes('duplicate ids'));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('(2)');
    expect(lines[0]).toContain('T5 (alpha/issues/01-T5-first.md, alpha/issues/02-T5-again.md)');
    expect(lines[0]).toContain('T7 (alpha/issues/03-T7-a.md, alpha/issues/04-T7-b.md)');
  });

  it('says nothing when every id is carried once', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [A]: ticket('T5', 'Only'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('get_board', { effort: 'alpha' })).not.toContain('duplicate');
  });

  it('get_tickets shows every claimant and says there is more than one', async () => {
    const { frontier } = await crossEffort();

    const text = await frontier.call('get_tickets', { ids: ['T5'] });

    expect(text).toContain('T5 is carried by 2 Tickets');
    expect(text).toContain('First claimant');
    expect(text).toContain('Second claimant');
  });

  it('refuses an update and names both files, writing nothing', async () => {
    const { root, frontier } = await crossEffort();
    const before = await Promise.all([A, B].map(path => readFile(join(root, path), 'utf8')));

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T5',
      claim: { by: 'agent-1' },
    });

    expect(error).toContain('Nothing was written: T5 is carried by 2 Ticket files');
    expect(error).toContain('alpha/issues/01-T5-first.md, beta/issues/01-T5-second.md');
    expect(error).toContain('never renumbers');
    const after = await Promise.all([A, B].map(path => readFile(join(root, path), 'utf8')));
    expect(after).toEqual(before);
  });

  it('refuses before any rule judges the first claimant alone', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [A]: ticket('T5', 'First', { status: 'resolved' }),
      [SAME]: ticket('T5', 'Again'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T5',
      claim: { by: 'agent-1' },
    });

    expect(error).toContain('alpha/issues/01-T5-first.md, alpha/issues/02-T5-again.md');
  });

  it('leaves an unduplicated neighbour writable', async () => {
    const { frontier } = await crossEffort();

    expect(await frontier.call('update_ticket', { id: 'T6', claim: { by: 'agent-1' } })).toContain(
      'T6 updated',
    );
  });

  it('migrate_effort refuses when an inferred id already exists elsewhere', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': '',
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/beta/map.md': map('Elsewhere.'),
      '.scratch/alpha/issues/01-legacy.md': '# T5 — Legacy claimant\n\nStatus: open\n\nBody.\n',
      [B]: ticket('T5', 'Schema claimant'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const legacy = join(root, '.scratch/alpha/issues/01-legacy.md');
    const before = await readFile(legacy, 'utf8');

    const error = await frontier.callExpectingError('migrate_effort', { effort: 'alpha' });

    expect(error).toContain('Nothing was written: T5 is carried by 2 Ticket files');
    expect(error).toContain('alpha/issues/01-legacy.md, beta/issues/01-T5-second.md');
    expect(await readFile(legacy, 'utf8')).toBe(before);
  });
});
