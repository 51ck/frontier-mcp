import { existsSync } from 'node:fs';
import { chmod, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';
import { map, spec, ticket } from './support/fixtures.ts';

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

/** A hand-written Ticket with no `id`, named by its file. */
const NAMED =
  '---\nfrontier: ticket\ntitle: Named\nkind: build\nstatus: open\nblocked_by: []\n---\n';

async function issuesIn(root: string, effort: string): Promise<string[]> {
  return (await readdir(join(root, '.scratch', effort, 'issues'))).toSorted();
}

describe('create_tickets', () => {
  it('writes each Ticket at the path its name implies, with no sort-order prefix', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [
        { name: 'parse', title: 'Parse the frontmatter', body: 'Split the fence.' },
        { name: 'render-board', title: 'Render the Board', kind: 'decision', type: 'research' },
      ],
    });

    expect(await issuesIn(root, 'alpha')).toEqual([...SEEDED, 'parse.md', 'render-board.md']);
  });

  it('writes schema-conformant frontmatter with no id, and the body verbatim', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [
        {
          name: 'parse',
          title: 'Parse the frontmatter',
          kind: 'decision',
          type: 'research',
          triage: 'ready-for-agent',
          body: '## Question\n\nWhich library?\n',
        },
      ],
    });

    expect(await readFile(join(root, '.scratch/alpha/issues/parse.md'), 'utf8')).toBe(
      [
        '---',
        'frontier: ticket',
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

  it('creates the first Effort when the repository has no tracker yet', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('create_tickets', {
      effort: 'probe',
      create: true,
      tickets: [{ name: 'runtime-probe', title: 'Runtime probe' }],
    });

    expect(await frontier.call('get_board', { effort: 'probe' })).toContain(
      'runtime-probe  Runtime probe  build/open',
    );
    // The path is the identity, so nothing beside the Effort guards it.
    expect(await readdir(join(root, '.scratch'))).toEqual(['probe']);
  });

  it('creates a batch whose siblings name each other, and lists each by full name', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [
        { name: 'parse', title: 'Parse the frontmatter' },
        { name: 'render', title: 'Render the Board', blocked_by: ['parse'] },
        { name: 'ship-it', title: 'Ship it', blocked_by: ['render', 'parse'] },
      ],
    });

    expect(text).toBe(
      [
        // A write names the workspace it resolved, per T11.
        `root: ${root}`,
        'alpha: 3 created',
        'alpha.parse  Parse the frontmatter',
        'alpha.render  Render the Board  blocked_by=parse',
        'alpha.ship-it  Ship it  blocked_by=render,parse',
      ].join('\n'),
    );

    expect(await issuesIn(root, 'alpha')).toEqual([
      ...SEEDED,
      'parse.md',
      'render.md',
      'ship-it.md',
    ]);
    const written = await Promise.all(
      ['parse', 'render', 'ship-it'].map(name =>
        readFile(join(root, `.scratch/alpha/issues/${name}.md`), 'utf8'),
      ),
    );
    for (const onDisk of written) expect(onDisk).not.toMatch(/^id:/m);
    expect(await readFile(join(root, '.scratch/alpha/issues/ship-it.md'), 'utf8')).toContain(
      'blocked_by: [render, parse]',
    );

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('> parse  Parse the frontmatter  build/open');
    expect(board).toContain('ship-it  Ship it  build/open  blocked_by=render,parse');
    expect(board).not.toContain('warnings:');
  });

  it('creates into an Effort of id-carrying Tickets, and Edges to those ids resolve', async () => {
    const root = await makeFixtureTree({
      ...WORKSPACE,
      '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', {
        status: 'resolved',
        answer_gist: 'Done.',
      }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [
        { name: 'after-first', title: 'After the first', blocked_by: ['T1'] },
        { name: 'after-second', title: 'After the second', blocked_by: ['T2'] },
      ],
    });
    expect(text).toContain('alpha.after-first  After the first  blocked_by=T1');

    const board = await frontier.call('get_board', { effort: 'alpha' });
    // T1 is resolved, so the Edge is satisfied and the new Ticket is takeable.
    expect(board).toContain('> after-first  After the first  build/open  blocked_by=T1');
    expect(board).toContain('\nafter-second  After the second  build/open  blocked_by=T2');
    expect(board).not.toContain('dangling');
  });

  it('takes an Edge on a Ticket in another Effort by its plain id', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'needs-beta', title: 'Needs beta first', blocked_by: ['T7'] }],
    });

    // The result renders the Edge as the Board does.
    expect(text).toContain('blocked_by=T7@beta');
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('blocked_by=T7@beta');
  });

  it("takes an Edge on another Effort's named Ticket by its full name", async () => {
    const root = await makeFixtureTree({ ...WORKSPACE, '.scratch/beta/issues/cache.md': NAMED });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'needs-cache', title: 'Needs the cache', blocked_by: ['beta.cache'] }],
    });

    expect(text).toContain('alpha.needs-cache  Needs the cache  blocked_by=beta.cache');
    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('blocked_by=beta.cache');
    expect(board).not.toContain('dangling');
  });

  it('takes an Edge on a named Ticket of the same Effort by its bare name', async () => {
    const root = await makeFixtureTree({
      ...WORKSPACE,
      '.scratch/alpha/issues/05-cache.md': NAMED,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'needs-cache', title: 'Needs the cache', blocked_by: ['cache'] }],
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('needs-cache  Needs the cache  build/open  blocked_by=cache');
    expect(board).not.toContain('dangling');
  });

  it('stores a reference that resolves to nothing as a dangling Edge', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [
        { name: 'parse', title: 'Parse the frontmatter' },
        { name: 'render', title: 'Render the Board', blocked_by: ['not-written-yet'] },
      ],
    });

    expect(text).toContain('blocked_by=not-written-yet?');
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('dangling Edges (1)');
  });

  it('refuses an entry that still passes key, saying name replaced it', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const errors = await Promise.all(
      [
        { key: 'parse', title: 'Parse the frontmatter' },
        { name: 'parse', key: 'parse', title: 'Parse the frontmatter' },
      ].map(entry =>
        frontier.callExpectingError('create_tickets', { effort: 'alpha', tickets: [entry] }),
      ),
    );
    for (const error of errors) expect(error).toContain('`key` was replaced by `name`');
    expect(await issuesIn(root, 'alpha')).toEqual(SEEDED);
  });

  it('refuses an entry with no name', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [{ title: 'Nameless' }],
    });

    expect(error).toContain('tickets.0.name');
    expect(await issuesIn(root, 'alpha')).toEqual(SEEDED);
  });

  it('carries no warning and writes no guard where a 1.x workspace still sets an id pattern', async () => {
    const root = await makeFixtureTree({
      '.scratch/frontier.yml': 'id_pattern: T<N>\n',
      ...WORKSPACE,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'parse', title: 'Parse the frontmatter' }],
    });

    expect(text).toBe(
      [`root: ${root}`, 'alpha: 1 created', 'alpha.parse  Parse the frontmatter'].join('\n'),
    );
    expect((await readdir(join(root, '.scratch'))).toSorted()).toEqual([
      'alpha',
      'beta',
      'frontier.yml',
    ]);
  });

  it('leaves no empty Effort behind when the batch it was created for is refused', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('create_tickets', {
      effort: 'brandnew',
      create: true,
      tickets: [
        { name: 'chicken', title: 'Chicken', blocked_by: ['egg'] },
        { name: 'egg', title: 'Egg', blocked_by: ['chicken'] },
      ],
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
      tickets: [{ name: 'nowhere', title: 'Nowhere to land' }],
    });

    expect(await frontier.call('list_efforts')).not.toContain('blocked');
    // The name was never taken: a batch that created nothing reserved nothing.
    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'nowhere', title: 'After the failure' }],
    });
    expect(await issuesIn(root, 'alpha')).toEqual([...SEEDED, 'nowhere.md']);
  });

  it('refuses an unknown Effort unless the call asks for it to be created', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('create_tickets', {
      effort: 'gamma',
      tickets: [{ name: 'thin-air', title: 'Into thin air' }],
    });
    expect(error).toContain('gamma');
    expect(await frontier.call('list_efforts')).not.toContain('gamma');

    await frontier.call('create_tickets', {
      effort: 'gamma',
      create: true,
      tickets: [{ name: 'thin-air', title: 'Into thin air' }],
    });
    expect(await issuesIn(root, 'gamma')).toEqual(['thin-air.md']);
  });

  it('lets two Efforts each hold a Ticket of the same name', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'cache', title: 'Cache for alpha' }],
    });
    await frontier.call('create_tickets', {
      effort: 'beta',
      tickets: [{ name: 'cache', title: 'Cache for beta' }],
    });

    expect(await frontier.call('get_tickets', { ids: ['beta.cache'] })).toContain('Cache for beta');
  });
});

describe('a name create_tickets refuses', () => {
  const TREE = {
    ...WORKSPACE,
    '.scratch/alpha/issues/05-cache.md': NAMED,
    '.scratch/alpha/issues/Mixed.md': NAMED,
  };
  const EXISTING = [...SEEDED, '05-cache.md', 'Mixed.md'].toSorted();

  async function refusal(names: readonly string[], effort = 'alpha'): Promise<string> {
    const root = await makeFixtureTree(TREE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('create_tickets', {
      effort,
      create: true,
      // The first entry is always fine: one refused entry must take it down too.
      tickets: [
        { name: 'fine', title: 'Fine' },
        ...names.map(name => ({ name, title: `Titled ${name}` })),
      ],
    });

    expect(await issuesIn(root, 'alpha')).toEqual(EXISTING);
    expect(await issuesIn(root, 'beta')).toEqual(['01-T7-seventh.md']);
    expect(existsSync(join(root, '.scratch/gamma'))).toBe(false);
    return error;
  }

  it.each([
    ['an uppercase letter', 'Token-cache'],
    ['an underscore', 'token_cache'],
    ['a space', 'token cache'],
    ['a dot', 'token.cache'],
    ['a leading digit', '1st-pass'],
    ['a leading hyphen', '-cache'],
    ['a trailing hyphen', 'cache-'],
    ['a doubled hyphen', 'token--cache'],
    ['four words', 'one-two-three-four'],
    ['twenty-five characters', 'abcdefghijkl-mnopqrstuvwx'],
    ['a non-ASCII letter', 'café'],
    ['a path separator', '../escape'],
  ])('breaks the grammar with %s', async (_what, name) => {
    const error = await refusal([name]);

    expect(error).toContain(`Ticket 2 of this call, name "${name}", is not a Ticket name`);
    expect(error).toContain('one to three words of lowercase letters and digits');
  });

  it.each(['a', 'cache2', 'token-cache', 'x1-y2-z3', 'abcdefghijk-mnopqrstuvwx'])(
    'accepts %s',
    async name => {
      const root = await makeFixtureTree(WORKSPACE);
      const frontier = await connectFrontier({ cwd: root, env: {} });

      await frontier.call('create_tickets', {
        effort: 'alpha',
        tickets: [{ name, title: 'Fine' }],
      });

      expect(await issuesIn(root, 'alpha')).toContain(`${name}.md`);
    },
  );

  it.each([
    ['lock', 'git ref'],
    ['true', 'YAML'],
    ['false', 'YAML'],
    ['null', 'YAML'],
    ['yes', 'YAML'],
    ['no', 'YAML'],
    ['on', 'YAML'],
    ['off', 'YAML'],
    ['con', 'Windows device'],
    ['prn', 'Windows device'],
    ['aux', 'Windows device'],
    ['nul', 'Windows device'],
    ['com1', 'Windows device'],
    ['com9', 'Windows device'],
    ['lpt1', 'Windows device'],
    ['lpt9', 'Windows device'],
    ['NUL', 'Windows device'],
  ])('is reserved: %s', async (name, why) => {
    const error = await refusal([name]);

    expect(error).toContain(`Ticket 2 of this call, name "${name}", is reserved`);
    expect(error).toContain(why);
  });

  it('is already a Ticket of the Effort, by the name the read path derives', async () => {
    // 05-cache.md is named cache: the sort-order prefix is not part of the name.
    expect(await refusal(['cache'])).toContain(
      'Ticket 2 of this call, name "cache", is already a Ticket of alpha',
    );
  });

  it('is already a Ticket of the Effort under another case', async () => {
    expect(await refusal(['mixed'])).toContain(
      'Ticket 2 of this call, name "mixed", is already a Ticket of alpha',
    );
  });

  it('equals an existing id of the same Effort, whatever its case', async () => {
    expect(await refusal(['t1'])).toContain(
      'Ticket 2 of this call, name "t1", is already a Ticket of alpha',
    );
  });

  it("equals an existing id in another Effort, whatever the id's case", async () => {
    expect(await refusal(['t7'])).toContain(
      'Ticket 2 of this call, name "t7", is the id of an existing Ticket, T7 in beta',
    );
    expect(await refusal(['t1'], 'gamma')).toContain(
      'is the id of an existing Ticket, T1 in alpha',
    );
  });

  it('would land on a file that already exists under another name', async () => {
    // cache.md carries an id, so the read path names it T50 and the name is
    // free. The path is not, and the exclusive create is what notices.
    const held = ticket('T50', 'Holds the path');
    const root = await makeFixtureTree({ ...WORKSPACE, '.scratch/alpha/issues/cache.md': held });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [
        { name: 'fine', title: 'Fine' },
        { name: 'cache', title: 'Cache' },
        { name: 'also-fine', title: 'Also fine' },
      ],
    });

    expect(error).toContain('alpha.cache could not be created');
    expect(await issuesIn(root, 'alpha')).toEqual([...SEEDED, 'cache.md']);
    expect(await readFile(join(root, '.scratch/alpha/issues/cache.md'), 'utf8')).toBe(held);
  });

  it('repeats within the call', async () => {
    expect(await refusal(['parse', 'parse'])).toContain(
      'Ticket 3 of this call, name "parse", repeats the name of Ticket 2',
    );
  });
});

describe('a batch that cannot be completed', () => {
  it('refuses a path already held before any file of the batch appears', async () => {
    // cache.md carries an id, so the name is free and only the path is taken.
    // The directory is read-only: a refusal that came after staging or linking
    // would be a permission error instead, so this one came before either.
    const root = await makeFixtureTree({
      ...WORKSPACE,
      '.scratch/alpha/issues/cache.md': ticket('T5', 'Holds the path'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const issues = join(root, '.scratch/alpha/issues');

    await chmod(issues, 0o555);
    try {
      const error = await frontier.callExpectingError('create_tickets', {
        effort: 'alpha',
        tickets: [
          { name: 'aaa', title: 'Before it' },
          { name: 'cache', title: 'Cache' },
          { name: 'zzz', title: 'After it' },
        ],
      });

      expect(error).toContain('alpha.cache could not be created');
      expect(error).toContain('Nothing was created');
      expect(await issuesIn(root, 'alpha')).toEqual([...SEEDED, 'cache.md']);
    } finally {
      await chmod(issues, 0o755);
    }
  });

  it('says so when issues is a file rather than a directory', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': map('Ship alpha.'),
      '.scratch/alpha/issues': 'not a directory\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'parse', title: 'Parse the frontmatter' }],
    });

    expect(error).toContain(join(root, '.scratch/alpha/issues'));
    expect(error).toContain('exists as a file');
    expect(error).not.toMatch(/EEXIST|ENOTDIR/);
  });
});

async function everythingUnder(dir: string): Promise<string[]> {
  return (await readdir(dir, { recursive: true })).toSorted();
}

describe('an Effort slug that is not one directory name', () => {
  const TREE = {
    ...WORKSPACE,
    '.scratch/alpha/spec.md': spec('Alpha'),
  };

  const REFUSED: readonly (readonly [string, string])[] = [
    ['empty', ''],
    ['a single dot', '.'],
    ['two dots', '..'],
    ['a leading dot', '.hidden'],
    ['a climb out of the storage directory', '../../escaped'],
    ['a climb from inside', 'alpha/../../../escaped'],
    ['a path into another Effort', 'alpha/issues'],
    ['a backslash', 'alpha\\issues'],
    ['a NUL', 'al\u0000pha'],
    ['a newline', 'al\npha'],
    ['a DEL', 'al\u007fpha'],
  ];

  it.each(REFUSED)('refuses %s on every read', async (_what, effort) => {
    const root = await makeFixtureTree(TREE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const errors = await Promise.all([
      frontier.callExpectingError('edit_map', { effort }),
      frontier.callExpectingError('spec', { effort }),
    ]);

    for (const error of errors) {
      expect(error).toContain(`${JSON.stringify(effort)} is not an Effort slug`);
    }
    // get_board never builds a path from the slug: it looks it up among the Efforts found.
    expect(await frontier.callExpectingError('get_board', { effort })).toContain('No Effort');
  });

  it.each(REFUSED)('refuses %s on every creating write', async (_what, effort) => {
    const root = await makeFixtureTree(TREE);
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const before = await everythingUnder(root);

    const errors = await Promise.all([
      frontier.callExpectingError('create_tickets', {
        effort,
        create: true,
        tickets: [{ name: 'ok', title: 'Should land nowhere' }],
      }),
      frontier.callExpectingError('edit_map', { effort, create: true, destination: 'Nowhere.' }),
      frontier.callExpectingError('spec', { effort, create: true, content: '# Nowhere' }),
    ]);

    for (const error of errors) {
      expect(error).toContain(`${JSON.stringify(effort)} is not an Effort slug`);
    }
    expect(await everythingUnder(root)).toEqual(before);
    // Beside the workspace is where `../../escaped` would land.
    expect(existsSync(join(root, '..', 'escaped'))).toBe(false);
  });

  it.each(['PROJ-123', 'v1.2.x', 'Mixed_Case', 'with space', 'café'])(
    'still accepts %s',
    async effort => {
      const root = await makeFixtureTree(TREE);
      const frontier = await connectFrontier({ cwd: root, env: {} });

      await frontier.call('create_tickets', {
        effort,
        create: true,
        tickets: [{ name: 'first', title: 'First of its Effort' }],
      });
      await frontier.call('edit_map', { effort, create: true, destination: 'Somewhere.' });

      expect(await frontier.call('get_board', { effort })).toContain('first  First of its Effort');
      expect(await frontier.call('get_tickets', { ids: [`${effort}.first`] })).toContain(
        'First of its Effort',
      );
    },
  );
});
