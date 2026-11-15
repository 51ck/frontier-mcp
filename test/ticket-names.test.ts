import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import {
  cleanupFixtures,
  connectFrontier,
  makeFixtureTree,
  type FixtureTree,
} from './support/harness.ts';

afterEach(cleanupFixtures);

/** A hand-written Ticket: schema frontmatter and no `id`, so it is named by its file. */
function named(
  title: string,
  fields: { status?: string; blocked_by?: string[]; answer_gist?: string } = {},
): string {
  const fence = [`title: ${title}`, 'kind: build', `status: ${fields.status ?? 'open'}`];
  if (fields.answer_gist !== undefined) fence.push(`answer_gist: ${fields.answer_gist}`);
  fence.push(`blocked_by: [${(fields.blocked_by ?? []).join(', ')}]`);
  return `---\n${fence.join('\n')}\n---\n\nProse of ${title}.\n`;
}

async function workspace(tree: FixtureTree) {
  const root = await makeFixtureTree({ '.git/HEAD': '', ...tree });
  return { root, frontier: await connectFrontier({ cwd: root, env: {} }) };
}

/** The Ticket lines of a Board, without the Frontier marker. */
function lines(board: string): string[] {
  return board
    .split('\n')
    .filter(line => /  (build|decision)\//.test(line))
    .map(line => line.replace(/^> /, ''));
}

function takeable(board: string): string[] {
  return board
    .split('\n')
    .filter(line => line.startsWith('> '))
    .map(line => line.slice(2).split('  ')[0] ?? '');
}

const HAND_WRITTEN: FixtureTree = {
  '.scratch/alpha/map.md': map('Somewhere.'),
  '.scratch/alpha/issues/token-cache.md': named('Cache the token'),
  '.scratch/alpha/issues/02-retry-budget.md': named('Bound the retries', {
    blocked_by: ['token-cache'],
  }),
  '.scratch/alpha/issues/10-prose-only.md': '# Written as prose\n\nStatus: open\n\nJust prose.\n',
};

describe('an Effort of hand-written files with no id', () => {
  it('shows every Ticket by its name, the sort-order prefix removed', async () => {
    const { frontier } = await workspace(HAND_WRITTEN);

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(lines(board).toSorted()).toEqual([
      'prose-only  Written as prose  build/open',
      'retry-budget  Bound the retries  build/open  blocked_by=token-cache',
      'token-cache  Cache the token  build/open',
    ]);
    expect(board).not.toContain('no id');
    expect(board).not.toContain('#');
  });

  it('fetches each by that name, headed with its full name', async () => {
    const { frontier } = await workspace(HAND_WRITTEN);

    const text = await frontier.call('get_tickets', {
      ids: ['token-cache', 'retry-budget', 'prose-only'],
    });

    expect(text).toContain('# alpha.token-cache — Cache the token\n');
    expect(text).toContain('# alpha.retry-budget — Bound the retries\n');
    expect(text).toContain('# alpha.prose-only — Written as prose\n');
    expect(text).toContain('Prose of Cache the token.');
    expect(text).not.toContain('not found');
  });

  it('updates each by that name, and writes no id', async () => {
    const { root, frontier } = await workspace(HAND_WRITTEN);

    const claimed = await frontier.call('update_ticket', {
      id: 'token-cache',
      claim: { by: 'agent-1' },
    });
    await frontier.call('update_ticket', { id: 'prose-only', comment: 'Seen.' });
    await frontier.call('update_ticket', {
      id: 'alpha.token-cache',
      resolve: { answer_gist: 'Cached for an hour.' },
    });

    expect(claimed).toContain('alpha.token-cache updated\nstatus=claimed');
    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('token-cache  Cache the token  build/resolved');
    const written = await readFile(join(root, '.scratch/alpha/issues/token-cache.md'), 'utf8');
    expect(written).toContain('answer_gist: Cached for an hour.');
    expect(written).not.toMatch(/^id:/m);
    const prose = await readFile(join(root, '.scratch/alpha/issues/10-prose-only.md'), 'utf8');
    expect(prose).toContain('Seen.');
    expect(prose).not.toMatch(/^id:/m);
    expect(lines(board)).toContain('prose-only  Written as prose  build/open');
  });

  it('lists a resolved one in the Map by its name', async () => {
    const { root, frontier } = await workspace(HAND_WRITTEN);

    await frontier.call('update_ticket', {
      id: 'token-cache',
      resolve: { answer_gist: 'Cached for an hour.' },
    });

    expect(await readFile(join(root, '.scratch/alpha/map.md'), 'utf8')).toContain(
      '- [token-cache — Cache the token](issues/token-cache.md)',
    );
  });

  it('no longer produces or accepts an <effort>#<order> handle', async () => {
    const { frontier } = await workspace(HAND_WRITTEN);

    expect(await frontier.call('get_tickets', { ids: ['alpha#1', 'alpha#2'] })).toBe(
      'not found: alpha#1 alpha#2',
    );
    expect(
      await frontier.callExpectingError('update_ticket', { id: 'alpha#2', comment: 'x' }),
    ).toContain("No Ticket 'alpha#2'");
  });

  it('compares names without regard to case, and shows the stored spelling', async () => {
    const { frontier } = await workspace({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/Token-Cache.md': named('Cache the token', { status: 'resolved' }),
      '.scratch/alpha/issues/retry.md': named('Retry', { blocked_by: ['token-cache'] }),
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).toContain('> retry  Retry  build/open  blocked_by=Token-Cache');
    expect(await frontier.call('get_tickets', { ids: ['ALPHA.TOKEN-CACHE'] })).toContain(
      '# alpha.Token-Cache — Cache the token',
    );
    expect(
      await frontier.call('update_ticket', { id: 'TOKEN-CACHE', comment: 'Found.' }),
    ).toContain('alpha.Token-Cache updated');
  });
});

describe('a bare Edge between two named Tickets', () => {
  it('keeps the dependent off the Frontier until its target resolves, then lets it on', async () => {
    const { frontier } = await workspace(HAND_WRITTEN);

    const before = await frontier.call('get_board', { effort: 'alpha' });
    expect(takeable(before)).toEqual(['prose-only', 'token-cache']);
    expect(before).not.toContain('dangling');

    await frontier.call('update_ticket', {
      id: 'token-cache',
      resolve: { answer_gist: 'Cached.' },
    });

    const after = await frontier.call('get_board', { effort: 'alpha' });
    expect(takeable(after)).toEqual(['prose-only', 'retry-budget']);
    expect(await frontier.call('list_efforts')).toContain('alpha  tickets=3  docs=map  frontier=2');
  });

  it('means the Ticket of its own Effort, before an id elsewhere of the same spelling', async () => {
    const { frontier } = await workspace({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/cache.md': named('Local cache', { status: 'resolved' }),
      '.scratch/alpha/issues/next.md': named('Next', { blocked_by: ['cache'] }),
      '.scratch/beta/map.md': map('Elsewhere.'),
      '.scratch/beta/issues/01-cache-other.md': ticket('cache', 'An id spelled cache'),
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).toContain('> next  Next  build/open  blocked_by=cache');
  });

  it('falls back to an id anywhere when its own Effort has no such name', async () => {
    const { frontier } = await workspace({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/next.md': named('Next', { blocked_by: ['T9'] }),
      '.scratch/beta/map.md': map('Elsewhere.'),
      '.scratch/beta/issues/01-T9-done.md': ticket('T9', 'Done', {
        status: 'resolved',
        answer_gist: 'Done.',
      }),
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).toContain('> next  Next  build/open  blocked_by=T9@beta');
  });

  it('still renders an Edge that resolves to nothing as dangling', async () => {
    const { frontier } = await workspace({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/next.md': named('Next', { blocked_by: ['not-written-yet'] }),
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(lines(board)).toEqual(['next  Next  build/open  blocked_by=not-written-yet?']);
    expect(takeable(board)).toEqual([]);
    expect(board).toContain('dangling Edges (1), pointing at no Ticket in this workspace:');
  });

  it('refuses an Edge update that closes a cycle through named Tickets', async () => {
    const { root, frontier } = await workspace(HAND_WRITTEN);
    const file = join(root, '.scratch/alpha/issues/token-cache.md');
    const before = await readFile(file, 'utf8');

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'token-cache',
      blocked_by: ['retry-budget'],
    });

    expect(error).toContain('alpha.token-cache -> alpha.retry-budget -> alpha.token-cache');
    expect(await readFile(file, 'utf8')).toBe(before);
  });
});

describe('an Edge into another Effort', () => {
  const CROSS: FixtureTree = {
    '.scratch/alpha/map.md': map('Somewhere.'),
    '.scratch/alpha/issues/consumer.md': named('Consumer', {
      blocked_by: ['beta.token-cache', 'T9'],
    }),
    '.scratch/beta/map.md': map('Elsewhere.'),
    '.scratch/beta/issues/03-token-cache.md': named('Cache the token', { status: 'resolved' }),
    '.scratch/beta/issues/04-T9-done.md': ticket('T9', 'Done', {
      status: 'resolved',
      answer_gist: 'Done.',
    }),
    '.scratch/beta/issues/05-local.md': named('Local', { blocked_by: ['beta.token-cache'] }),
  };

  it('renders a named Ticket in full and keeps an id as id@effort', async () => {
    const { frontier } = await workspace(CROSS);

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).toContain(
      '> consumer  Consumer  build/open  blocked_by=beta.token-cache,T9@beta',
    );
  });

  it('shows an Edge stored in full bare when it stays within the Effort', async () => {
    const { frontier } = await workspace(CROSS);

    const board = await frontier.call('get_board', { effort: 'beta' });

    expect(board).toContain('> local  Local  build/open  blocked_by=token-cache');
  });

  it('renders a form that works pasted back as input', async () => {
    const { frontier } = await workspace({
      ...CROSS,
      '.scratch/alpha/issues/other.md': named('Other'),
    });
    const board = await frontier.call('get_board', { effort: 'alpha' });
    const shown = /blocked_by=([^,\s]+)/.exec(board)?.[1] ?? '';
    expect(shown).toBe('beta.token-cache');

    expect(await frontier.call('get_tickets', { ids: [shown] })).toContain(
      '# beta.token-cache — Cache the token',
    );
    expect(await frontier.call('update_ticket', { id: shown, comment: 'Read.' })).toContain(
      'beta.token-cache updated',
    );
    await frontier.call('update_ticket', { id: 'other', blocked_by: [shown] });
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain(
      '> other  Other  build/open  blocked_by=beta.token-cache',
    );
  });

  it('matches the longest Effort slug, so a slug may itself contain a dot', async () => {
    const { frontier } = await workspace({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/consumer.md': named('Consumer', { blocked_by: ['proj.v2.cache'] }),
      '.scratch/proj/map.md': map('The short slug.'),
      '.scratch/proj/issues/cache.md': named('In the short Effort'),
      '.scratch/proj.v2/map.md': map('The long slug.'),
      '.scratch/proj.v2/issues/cache.md': named('In the dotted Effort', { status: 'resolved' }),
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).toContain('> consumer  Consumer  build/open  blocked_by=proj.v2.cache');
    expect(await frontier.call('get_tickets', { ids: ['proj.v2.cache'] })).toContain(
      '# proj.v2.cache — In the dotted Effort',
    );
  });
});

describe('a bare name several Efforts have', () => {
  const SHARED: FixtureTree = {
    '.scratch/alpha/map.md': map('Somewhere.'),
    '.scratch/alpha/issues/cache.md': named('Alpha cache'),
    '.scratch/alpha/issues/only-here.md': named('Only here'),
    '.scratch/beta/map.md': map('Elsewhere.'),
    '.scratch/beta/issues/07-cache.md': named('Beta cache'),
    '.scratch/gamma/map.md': map('Further.'),
    '.scratch/gamma/issues/Cache.md': named('Gamma cache'),
  };

  it('is refused by get_tickets with every candidate named in full', async () => {
    const { frontier } = await workspace(SHARED);

    const error = await frontier.callExpectingError('get_tickets', { ids: ['only-here', 'cache'] });

    expect(error).toContain("'cache' names 3 Tickets: alpha.cache, beta.cache, gamma.Cache.");
  });

  it('is refused by update_ticket the same way, and writes nothing', async () => {
    const { root, frontier } = await workspace(SHARED);
    const files = ['alpha/issues/cache.md', 'beta/issues/07-cache.md', 'gamma/issues/Cache.md'];
    const read = () =>
      Promise.all(files.map(file => readFile(join(root, '.scratch', file), 'utf8')));
    const before = await read();

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'cache',
      claim: { by: 'agent-1' },
    });

    expect(error).toContain('alpha.cache, beta.cache, gamma.Cache');
    expect(await read()).toEqual(before);
  });

  it('is accepted in full, and bare where one Effort alone has it', async () => {
    const { frontier } = await workspace(SHARED);

    expect(await frontier.call('get_tickets', { ids: ['beta.cache', 'only-here'] })).toMatch(
      /^# beta\.cache — Beta cache\n[^]*# alpha\.only-here — Only here\n/,
    );
    expect(
      await frontier.call('update_ticket', { id: 'gamma.cache', claim: { by: 'agent-1' } }),
    ).toContain('gamma.Cache updated');
  });

  it('is refused when it is also an id another Ticket carries, both named in full', async () => {
    const { root, frontier } = await workspace({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T5-x.md': ticket('T5', 'The id'),
      '.scratch/beta/map.md': map('Elsewhere.'),
      '.scratch/beta/issues/t5.md': named('The name'),
    });
    const files = ['alpha/issues/01-T5-x.md', 'beta/issues/t5.md'];
    const read = () =>
      Promise.all(files.map(file => readFile(join(root, '.scratch', file), 'utf8')));
    const before = await read();
    expect(await frontier.call('get_board', { effort: 'beta' })).toContain('> t5  The name  ');

    const claim = await frontier.callExpectingError('update_ticket', {
      id: 't5',
      claim: { by: 'agent-1' },
    });
    const fetch = await frontier.callExpectingError('get_tickets', { ids: ['T5'] });

    expect(claim).toContain("'t5' names 2 Tickets: T5, beta.t5.");
    expect(fetch).toContain("'T5' names 2 Tickets: T5, beta.t5.");
    expect(await read()).toEqual(before);
    expect(await frontier.call('get_tickets', { ids: ['beta.t5'] })).toMatch(
      /^# beta\.t5 — The name\n/,
    );
    expect(
      await frontier.call('update_ticket', { id: 'alpha.T5', claim: { by: 'agent-1' } }),
    ).toContain('T5 updated');
  });
});

describe('two files of one Effort that reduce to one name', () => {
  const FIRST = '.scratch/alpha/issues/01-cache.md';
  const SECOND = '.scratch/alpha/issues/02-cache.md';
  const DUPLICATED: FixtureTree = {
    '.scratch/alpha/map.md': map('Somewhere.'),
    [FIRST]: named('First', { status: 'resolved' }),
    [SECOND]: named('Second'),
    '.scratch/alpha/issues/03-next.md': named('Next', { blocked_by: ['cache'] }),
    '.scratch/alpha/issues/04-free.md': named('Free'),
  };

  it('are one grouped warning on the Board, naming both files', async () => {
    const { frontier } = await workspace(DUPLICATED);

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).toContain(
      '  duplicate names, each the full name of more than one Ticket file (1): ' +
        'alpha.cache (alpha/issues/01-cache.md, alpha/issues/02-cache.md) — writes to them ' +
        'are refused; rename all but one file by hand',
    );
    expect(board).toContain('cache  First  build/resolved');
    expect(board).toContain('cache  Second  build/open');
    expect(board).not.toContain('cache.2');
  });

  it('are never takeable, and an Edge to the name waits for every claimant', async () => {
    const { frontier } = await workspace(DUPLICATED);

    expect(takeable(await frontier.call('get_board', { effort: 'alpha' }))).toEqual(['free']);
  });

  it('satisfy an Edge once every claimant is resolved', async () => {
    const { frontier } = await workspace({
      ...DUPLICATED,
      [SECOND]: named('Second', { status: 'resolved' }),
    });

    expect(takeable(await frontier.call('get_board', { effort: 'alpha' }))).toEqual([
      'next',
      'free',
    ]);
  });

  it('refuse a write addressed to the name, bare or full, with DuplicateId', async () => {
    const { root, frontier } = await workspace(DUPLICATED);
    const read = () => Promise.all([FIRST, SECOND].map(file => readFile(join(root, file), 'utf8')));
    const before = await read();

    const errors = await Promise.all(
      ['cache', 'alpha.cache', 'CACHE'].map(async id => ({
        id,
        error: await frontier.callExpectingError('update_ticket', {
          id,
          claim: { by: 'agent-1' },
        }),
      })),
    );
    for (const { id, error } of errors) {
      expect(error).toContain(
        `Nothing was written: ${id} is carried by 2 Ticket files — alpha/issues/01-cache.md, ` +
          'alpha/issues/02-cache.md — so which one is meant cannot be told. Rename all but one ' +
          'file by hand',
      );
    }
    await Promise.all(
      ['cache.2', 'alpha#1', 'alpha#2'].map(id =>
        frontier.callExpectingError('update_ticket', { id, claim: { by: 'agent-1' } }),
      ),
    );
    expect(await read()).toEqual(before);
  });

  it('are both returned by get_tickets under a line saying so', async () => {
    const { frontier } = await workspace(DUPLICATED);

    const text = await frontier.call('get_tickets', { ids: ['cache'] });

    expect(text).toMatch(
      /^cache is carried by 2 Tickets — writes to it are refused until all but one are renamed by hand\n/,
    );
    expect(text).toContain('# alpha.cache — First');
    expect(text).toContain('# alpha.cache — Second');
  });

  it('are not a duplicate across Efforts, where the name is local to each', async () => {
    const { frontier } = await workspace({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/cache.md': named('Alpha cache'),
      '.scratch/beta/map.md': map('Elsewhere.'),
      '.scratch/beta/issues/cache.md': named('Beta cache'),
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).not.toContain('duplicate');
    expect(takeable(board)).toEqual(['cache']);
  });
});

describe('Tickets that carry ids', () => {
  const WITH_IDS: FixtureTree = {
    '.scratch/alpha/map.md': map('Somewhere.'),
    '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', {
      status: 'resolved',
      answer_gist: 'Done.',
    }),
    '.scratch/alpha/issues/02-T2-second.md': ticket('T2', 'Second', { blocked_by: ['T1', 'T3'] }),
    '.scratch/beta/map.md': map('Elsewhere.'),
    '.scratch/beta/issues/01-T3-third.md': ticket('T3', 'Third'),
  };

  it('are named by the id, never by the file', async () => {
    const { frontier } = await workspace(WITH_IDS);

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(lines(board)).toEqual([
      'T1  First  build/resolved  gist=Done.',
      'T2  Second  build/open  blocked_by=T1,T3@beta',
    ]);
    expect(await frontier.call('get_tickets', { ids: ['T3'] })).toMatch(/^# T3 — Third\n/);
    expect(await frontier.call('get_tickets', { ids: ['T3-third', 'third'] })).toBe(
      'not found: T3-third third',
    );
    expect(await frontier.call('update_ticket', { id: 'T3', comment: 'x' })).toContain(
      'T3 updated',
    );
  });

  it('still refuse a pasted id@effort, naming the bare id back', async () => {
    const { frontier } = await workspace(WITH_IDS);

    expect(await frontier.call('get_tickets', { ids: ['T3@beta'] })).toBe(
      "not found: T3@beta (name it 'T3')",
    );
    expect(
      await frontier.callExpectingError('update_ticket', { id: 'T3@beta', comment: 'x' }),
    ).toContain("name it 'T3'");
  });

  it('are one id whatever the case, so two spellings are a duplicate', async () => {
    const { frontier } = await workspace({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T5-upper.md': ticket('T5', 'Upper'),
      '.scratch/beta/map.md': map('Elsewhere.'),
      '.scratch/beta/issues/01-t5-lower.md': ticket('t5', 'Lower'),
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).toContain(
      'duplicate ids, each carried by more than one Ticket file (1): ' +
        'T5 (alpha/issues/01-T5-upper.md, beta/issues/01-t5-lower.md)',
    );
    expect(takeable(board)).toEqual([]);
    expect(
      await frontier.callExpectingError('update_ticket', { id: 't5', claim: { by: 'a' } }),
    ).toContain('Give all but one a new id by hand');
  });

  it('may be blocked by a named Ticket, and a named Ticket by them', async () => {
    const { frontier } = await workspace({
      ...WITH_IDS,
      '.scratch/alpha/issues/03-cache.md': named('Cache', { blocked_by: ['T1'] }),
    });

    await frontier.call('update_ticket', { id: 'T3', blocked_by: ['alpha.cache'] });

    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain(
      '> cache  Cache  build/open  blocked_by=T1',
    );
    expect(await frontier.call('get_board', { effort: 'beta' })).toContain(
      'T3  Third  build/open  blocked_by=alpha.cache',
    );
  });
});

describe('two Tickets in different Efforts with one full name', () => {
  const DOTTED: FixtureTree = {
    '.scratch/a/map.md': map('The short slug.'),
    '.scratch/a/issues/b.foo.md': named('In a'),
    '.scratch/a.b/map.md': map('The dotted slug.'),
    '.scratch/a.b/issues/foo.md': named('In a.b'),
    '.scratch/a.b/issues/free.md': named('Free'),
  };
  const FILES = 'a/issues/b.foo.md, a.b/issues/foo.md';

  it('are warned as duplicates on both Boards, without calling them one Effort', async () => {
    const { frontier } = await workspace(DOTTED);

    const boards = await Promise.all(
      ['a', 'a.b'].map(effort => frontier.call('get_board', { effort })),
    );

    for (const board of boards) {
      expect(board).toContain(
        `  duplicate names, each the full name of more than one Ticket file (1): a.b.foo (${FILES})`,
      );
      expect(board).not.toContain('in its Effort');
    }
  });

  it('are never takeable', async () => {
    const { frontier } = await workspace(DOTTED);

    expect(takeable(await frontier.call('get_board', { effort: 'a' }))).toEqual([]);
    expect(takeable(await frontier.call('get_board', { effort: 'a.b' }))).toEqual(['free']);
  });

  it('refuse a write by any spelling with every file named, and write nothing', async () => {
    const { root, frontier } = await workspace(DOTTED);
    const read = () =>
      Promise.all(FILES.split(', ').map(file => readFile(join(root, '.scratch', file), 'utf8')));
    const before = await read();

    const errors = await Promise.all(
      ['b.foo', 'foo', 'a.b.foo'].map(id =>
        frontier.callExpectingError('update_ticket', { id, claim: { by: 'agent-1' } }),
      ),
    );

    for (const error of errors) {
      expect(error).toContain(`is carried by 2 Ticket files — ${FILES} —`);
      expect(error).not.toContain('changed on disk');
    }
    expect(await read()).toEqual(before);
  });
});

describe('migrate_effort on an Effort holding a duplicated name', () => {
  const FIRST = '.scratch/alpha/issues/01-cache.md';
  const SECOND = '.scratch/alpha/issues/02-cache.md';
  const DEP = '.scratch/alpha/issues/03-dep.md';
  const TREE: FixtureTree = {
    '.scratch/alpha/map.md': map('Somewhere.'),
    [FIRST]: named('First'),
    [SECOND]: named('Second', { status: 'resolved' }),
    [DEP]: named('Dependent', { blocked_by: ['cache'] }),
  };
  const FILES = 'alpha/issues/01-cache.md, alpha/issues/02-cache.md';

  it('refuses a real run with every file named, leaving the files and the Frontier alone', async () => {
    const { root, frontier } = await workspace(TREE);
    const read = () =>
      Promise.all([FIRST, SECOND, DEP].map(file => readFile(join(root, file), 'utf8')));
    const before = await read();
    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(takeable(board)).toEqual([]);

    const error = await frontier.callExpectingError('migrate_effort', { effort: 'alpha' });

    expect(error).toContain(
      `Nothing was written: alpha.cache is carried by 2 Ticket files — ${FILES} — so which ` +
        'one is meant cannot be told. Rename all but one file by hand',
    );
    expect(await read()).toEqual(before);
    expect(takeable(await frontier.call('get_board', { effort: 'alpha' }))).toEqual([]);
  });

  it('reports the conflict on both lines of a preview, beside the rest of the plan', async () => {
    const { root, frontier } = await workspace(TREE);
    const before = await readFile(join(root, FIRST), 'utf8');

    const preview = await frontier.call('migrate_effort', { effort: 'alpha', preview: true });

    const conflict = `duplicate name, carried by ${FILES} — a real run refuses`;
    expect(preview).toBe(
      [
        'alpha: preview — would migrate 0, unchanged 3',
        '(nothing to migrate)',
        `[01-cache.md]  First  ${conflict}`,
        `[02-cache.md]  Second  ${conflict}`,
        '',
        '[01-cache.md]: <.scratch/alpha/issues/01-cache.md>',
        '[02-cache.md]: <.scratch/alpha/issues/02-cache.md>',
      ].join('\n'),
    );
    expect(await readFile(join(root, FIRST), 'utf8')).toBe(before);
  });
});
