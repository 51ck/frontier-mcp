import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
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

  it('resolves Edges declared by temporary key into the ids it minted', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [
        { key: 'parse', title: 'Parse the frontmatter' },
        { key: 'render', title: 'Render the Board', blocked_by: ['parse'] },
        { title: 'Ship it', blocked_by: ['render', 'parse'] },
      ],
    });

    expect(text).toBe(
      [
        // A write names the workspace it resolved, per T11.
        `root: ${root}`,
        'alpha: 3 created',
        'T8  Parse the frontmatter',
        'T9  Render the Board  blocked_by=T8',
        'T10  Ship it  blocked_by=T9,T8',
      ].join('\n'),
    );

    const onDisk = await readFile(
      join(root, '.scratch/alpha/issues/04-T9-render-the-board.md'),
      'utf8',
    );
    // The key was the caller's, for the length of the call. Nothing keeps it.
    expect(onDisk).toContain('blocked_by: [T8]');
    expect(onDisk).not.toContain('parse');
  });

  it('takes an Edge on a Ticket in another Effort by its plain id', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ title: 'Needs beta first', blocked_by: ['T7'] }],
    });

    // There is no compound cross-Effort reference form, so the Board is what
    // makes a foreign blocker followable.
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('blocked_by=T7@beta');
  });

  it('creates nothing when one Edge names a key that was never declared', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [
        { key: 'parse', title: 'Parse the frontmatter' },
        { title: 'Render the Board', blocked_by: ['parser'] },
      ],
    });

    expect(error).toContain('parser');
    // Not even the draft that was fine: the batch is the unit.
    expect(await issuesIn(root, 'alpha')).toEqual(['01-T1-first.md', '02-T2-second.md']);
  });

  it('refuses a temporary key shaped like a real id', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [{ key: 'T8', title: 'Ambiguous' }],
    });

    expect(error).toContain('T8');
    expect(await issuesIn(root, 'alpha')).toEqual(['01-T1-first.md', '02-T2-second.md']);
  });

  it('leaves no empty Effort behind when the batch it was created for is refused', async () => {
    const root = await makeFixtureTree({
      ...WORKSPACE,
      // A dangling Edge on an id nobody has minted: a Board warning, not an
      // error — until the batch mints exactly that id and closes the loop.
      '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', { blocked_by: ['T8'] }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('create_tickets', {
      effort: 'brandnew',
      create: true,
      tickets: [{ title: 'Closes the loop', blocked_by: ['T1'] }],
    });
    expect(error).toContain('cycle');

    // A bare issues/ directory is enough to make an Effort, so a refusal that
    // left one would have invented an Effort nobody asked for.
    expect(await frontier.call('list_efforts')).not.toContain('brandnew');
    expect(existsSync(join(root, '.scratch/brandnew'))).toBe(false);
  });

  it('leaves no Effort behind when the write itself fails', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    // A file where the Effort's issues/ directory has to go. mkdir fails with
    // ENOTDIR, which is the closest a test at this seam can get to a disk that
    // refuses the write.
    await writeFile(join(root, '.scratch/blocked'), 'not a directory\n', 'utf8');

    await frontier.callExpectingError('create_tickets', {
      effort: 'blocked',
      create: true,
      tickets: [{ title: 'Nowhere to land' }],
    });

    expect(await frontier.call('list_efforts')).not.toContain('blocked');
    // The next id is untouched: a batch that created nothing consumed nothing
    // but the numbers it reserved and gave back.
    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ title: 'After the failure' }],
    });
    expect(await issuesIn(root, 'alpha')).toContain('03-T8-after-the-failure.md');
  });

  it('refuses an unknown Effort unless the call asks for it to be created', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('create_tickets', {
      effort: 'gamma',
      tickets: [{ title: 'Into thin air' }],
    });
    expect(error).toContain('gamma');
    expect(await frontier.call('list_efforts')).not.toContain('gamma');

    await frontier.call('create_tickets', {
      effort: 'gamma',
      create: true,
      tickets: [{ title: 'Into thin air' }],
    });
    expect(await issuesIn(root, 'gamma')).toEqual(['01-T8-into-thin-air.md']);
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
