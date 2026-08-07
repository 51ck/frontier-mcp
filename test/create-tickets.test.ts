import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';
import { map, ticket } from './support/fixtures.ts';

afterEach(cleanupFixtures);

const WORKSPACE = {
  '.git/HEAD': 'ref: refs/heads/main\n',
  '.scratch/alpha/map.md': map('Ship alpha.'),
  '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First'),
  '.scratch/alpha/issues/02-T2-second.md': ticket('T2', 'Second'),
  '.scratch/beta/map.md': map('Ship beta.'),
  '.scratch/beta/issues/01-T7-seventh.md': ticket('T7', 'Seventh'),
};

async function issuesIn(root: string, effort: string): Promise<string[]> {
  return (await readdir(join(root, '.scratch', effort, 'issues'))).toSorted();
}

describe('create_tickets', () => {
  it('creates a whole set in one call, numbering ids from the highest in the repo', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [
        { title: 'Parse the frontmatter', body: 'Split the fence.' },
        { title: 'Render the Board', kind: 'decision', type: 'research' },
      ],
    });

    // T7 lives in another Effort, and the counter is repo-global.
    expect(text).toContain('T8');
    expect(text).toContain('T9');

    expect(await issuesIn(root, 'alpha')).toEqual([
      '01-T1-first.md',
      '02-T2-second.md',
      '03-T8-parse-the-frontmatter.md',
      '04-T9-render-the-board.md',
    ]);
  });

  it('writes schema-conformant frontmatter and the body verbatim', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [
        {
          title: 'Parse the frontmatter',
          kind: 'decision',
          type: 'research',
          triage: 'ready-for-agent',
          body: '## Question\n\nWhich library?\n',
        },
      ],
    });

    const onDisk = await readFile(
      join(root, '.scratch/alpha/issues/03-T8-parse-the-frontmatter.md'),
      'utf8',
    );

    expect(onDisk).toBe(
      [
        '---',
        'id: T8',
        'title: Parse the frontmatter',
        'kind: decision',
        'type: research',
        'status: open',
        'triage: ready-for-agent',
        'blocked_by: []',
        '---',
        '',
        '## Question',
        '',
        'Which library?',
        '',
      ].join('\n'),
    );
  });

  it('starts at T1 in a workspace holding no ids yet', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': map('Ship alpha.'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ title: 'First thing' }],
    });

    expect(await issuesIn(root, 'alpha')).toEqual(['01-T1-first-thing.md']);
  });

  it('shows the new Tickets on the Board it created them in', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ title: 'Parse the frontmatter' }],
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('T8  Parse the frontmatter  build/open');
  });
});
