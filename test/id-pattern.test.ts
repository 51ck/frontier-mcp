import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map, spec, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

async function workspace(config: string | undefined) {
  const root = await makeFixtureTree({
    '.scratch/alpha/map.md': map('Somewhere.'),
    '.scratch/alpha/issues/01-T1-one.md': ticket('T1', 'One'),
    '.scratch/beta/issues/01-foreign.md': '# 01 — Old\n\nStatus: open\n',
    ...(config === undefined ? {} : { '.scratch/frontier.yml': config }),
  });
  return connectFrontier({ cwd: root, env: {} });
}

const create = { effort: 'alpha', tickets: [{ name: 'new', title: 'New' }] };
const claim = { id: 'T1', claim: { by: 'me' } };
/** beta holds one Ticket with no id, so a real migration mints exactly one. */
const mint = { effort: 'beta', preview: false };

/** One Ticket per digit, each carrying the id `x<digit>`. */
const taken = (digits: string) =>
  Object.fromEntries(
    [...digits].map((digit, index) => [
      `.scratch/alpha/issues/${String(index + 1).padStart(2, '0')}-x${digit}-t.md`,
      ticket(`x${digit}`, 'Taken'),
    ]),
  );

describe('frontier.yml id_pattern', () => {
  it.each([
    ['an absent file', undefined],
    ['an empty file', ''],
    ['a file with no id_pattern key', '# nothing here\nother: 1\n'],
    ['the default spelled out', 'id_pattern: T<b36{6}>\n'],
    ['a counter', 'id_pattern: T<N>\n'],
    ['a base16 token', 'id_pattern: x<b16{8}>\n'],
    ['a mixed pattern', 'id_pattern: AUTH-<N>-<b36{4}>\n'],
  ])('is quiet and writable for %s', async (_name, config) => {
    const frontier = await workspace(config);

    expect(await frontier.call('get_board', { effort: 'alpha' })).not.toContain('warnings:');
    await frontier.call('create_tickets', create);
  });

  it.each([
    ['<effort> with the reason', 'id_pattern: T<effort>-<N>\n', 'directory name'],
    ['a leading counter, citing T55', 'id_pattern: <N>T\n', 'T55'],
    ['a leading random token, citing T55', 'id_pattern: <b36{6}>\n', 'T55'],
    ['a leading digit, citing T55', 'id_pattern: 1<N>\n', 'T55'],
    ['an unknown token', 'id_pattern: T<b10{4}>\n', 'not a token'],
    ['an illegal literal', 'id_pattern: T:<N>\n', 'not a legal literal'],
    ['an all-literal pattern', 'id_pattern: TICKET\n', 'needs a <N> or a random token'],
    ['two counters', 'id_pattern: T<N>-<N>\n', 'at most one <N>'],
    ['an over-long id', 'id_pattern: T<b36{64}>\n', 'at most 64'],
    ['a non-string value', 'id_pattern: [a, b]\n', 'must be a string'],
    ['a null value', 'id_pattern:\n', 'must be a string'],
  ])('warns on read and refuses every write but creation for %s', async (_name, config, reason) => {
    const frontier = await workspace(config);

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('warnings:');
    expect(board).toContain(reason);
    // Reads keep working: the repo whose configuration is broken is the one to look at.
    expect(board).toContain('T1');
    expect(await frontier.call('get_tickets', { ids: ['T1'] })).toContain('Body prose.');

    expect(await frontier.callExpectingError('update_ticket', claim)).toContain(reason);
    expect(
      await frontier.callExpectingError('edit_map', { effort: 'alpha', destination: 'Elsewhere.' }),
    ).toContain(reason);
    expect(
      await frontier.callExpectingError('spec', { effort: 'alpha', content: '# Spec' }),
    ).toContain(reason);
    expect(
      await frontier.callExpectingError('migrate_effort', { effort: 'beta', preview: false }),
    ).toContain(reason);
    expect(await frontier.callExpectingError('update_ticket', claim)).toContain('restarted');

    // Creation mints nothing, so the pattern's configuration has no say in it.
    expect(await frontier.call('create_tickets', create)).toContain('alpha.new  New');
  });

  it('keeps every read path of a write-capable tool working under a broken config', async () => {
    const root = await makeFixtureTree({
      '.scratch/frontier.yml': 'id_pattern: <N>\n',
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-one.md': ticket('T1', 'One'),
      '.scratch/alpha/spec.md': spec('Alpha spec'),
      '.scratch/beta/issues/01-foreign.md': '# 01 — Old\n\nStatus: open\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('migrate_effort', { effort: 'beta', preview: true })).toContain(
      'preview',
    );
    expect(await frontier.call('edit_map', { effort: 'alpha' })).toContain('Somewhere.');
    expect(await frontier.call('edit_map', { effort: 'alpha', create: true })).toContain(
      'Somewhere.',
    );
    expect(await frontier.call('spec', { effort: 'alpha' })).toContain('alpha');
  });

  it.each([['T\\n<N>'], ['\\n<N>'], ['T<N\\n>']])(
    'keeps a control character in %j to one indented warning line',
    async value => {
      const frontier = await workspace(`id_pattern: "${value}"\n`);

      const board = await frontier.call('get_board', { effort: 'alpha' });
      const block = board.slice(board.indexOf('warnings:')).split('\n').slice(1);

      expect(block).toHaveLength(1);
      expect(block[0]).toMatch(/^ {2}\S/);
    },
  );

  it('keeps a yaml error to one indented warning line', async () => {
    const frontier = await workspace('id_pattern: [unclosed\nsecret: value\n');

    const board = await frontier.call('get_board', { effort: 'alpha' });
    const block = board.slice(board.indexOf('warnings:')).split('\n').slice(1);

    expect(block).toHaveLength(1);
    expect(block[0]).toMatch(/^ {2}\S/);
    expect(board).not.toContain('secret');
  });

  it('warns on read and refuses writes for an unparseable file', async () => {
    const frontier = await workspace('id_pattern: [unclosed\n');

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('is not valid YAML');
    expect(await frontier.callExpectingError('update_ticket', claim)).toContain(
      'is not valid YAML',
    );
  });

  it('warns on read and refuses writes for a file that is not a mapping', async () => {
    const frontier = await workspace('- T<N>\n');

    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain(
      'must be a YAML mapping',
    );
    await frontier.callExpectingError('update_ticket', claim);
  });

  it('mints the default T<b36{6}> and keeps existing T<n> ids', async () => {
    const frontier = await workspace(undefined);

    expect(await frontier.call('migrate_effort', mint)).toMatch(/\bT[0-9a-z]{6}\b/);

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('T1  One');
    expect(board).not.toContain('T1?');
  });

  it('redraws a random id already in use rather than failing', async () => {
    const root = await makeFixtureTree({
      '.scratch/frontier.yml': 'id_pattern: x<b16{1}>\n',
      '.scratch/beta/issues/01-foreign.md': '# 01 — Old\n\nStatus: open\n',
      ...taken('0123456789abcde'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    // Fifteen of sixteen are taken, so a first draw almost always hits.
    expect(await frontier.call('migrate_effort', mint)).toContain('xf');
  });

  it('refuses with its own message once the random space is full', async () => {
    const root = await makeFixtureTree({
      '.scratch/frontier.yml': 'id_pattern: x<b16{1}>\n',
      '.scratch/beta/issues/01-foreign.md': '# 01 — Old\n\nStatus: open\n',
      ...taken('0123456789abcdef'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('migrate_effort', mint);

    expect(error).toContain('random space is full or nearly full');
    expect(error).not.toContain('No free Ticket id within');
    expect(error).not.toContain('.guard');
    expect(await readdir(join(root, '.scratch'))).not.toContain(expect.stringMatching(/\.guard$/));
  });

  it('counts under T<N> from the highest id in its namespace', async () => {
    const frontier = await workspace('id_pattern: T<N>\n');

    expect(await frontier.call('migrate_effort', mint)).toMatch(/\bT2\b/);
  });

  it('counts under a mixed pattern and draws its random part', async () => {
    const frontier = await workspace('id_pattern: T<N>-<b36{4}>\n');

    // T1 is outside the mixed namespace, so the counter starts at 1.
    expect(await frontier.call('migrate_effort', mint)).toMatch(/\bT1-[0-9a-z]{4}\b/);
  });

  it('writes nothing while refusing', async () => {
    const frontier = await workspace('id_pattern: <N>\n');

    await frontier.callExpectingError('update_ticket', claim);

    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('T1  One  build/open');
  });
});

describe('a new name against ids of any pattern', () => {
  it.each(['id_pattern: AUTH-<N>\n', 'id_pattern: T<N>-<b36{4}>\n'])(
    'refuses a name equal to an existing id the pattern no longer accepts (%s)',
    async config => {
      const frontier = await workspace(config);

      const refused = await frontier.callExpectingError('create_tickets', {
        effort: 'alpha',
        tickets: [
          { name: 't1', title: 'Shadow' },
          { name: 'child', title: 'Child', blocked_by: ['t1'] },
        ],
      });

      expect(refused).toContain('name "t1", is already a Ticket of alpha');
      expect(await frontier.call('list_efforts')).toContain('tickets=1');
    },
  );
});

describe('create_tickets mints nothing, so it carries no pattern warning', () => {
  it.each([
    ['T<N>', 'id_pattern: T<N>\n'],
    ['AUTH-<N>', 'id_pattern: AUTH-<N>\n'],
    ['a mixed pattern', 'id_pattern: T<N>-<b36{4}>\n'],
    ['a random pattern', 'id_pattern: x<b16{8}>\n'],
    ['the default', undefined],
  ])('under %s', async (_name, config) => {
    const frontier = await workspace(config);

    const result = await frontier.call('create_tickets', create);
    expect(result).not.toContain('warnings:');
    expect(result).not.toContain('regression');
    expect(result).not.toContain('id pattern');
    expect(await frontier.call('get_board', { effort: 'alpha' })).not.toContain('regression');
  });
});
