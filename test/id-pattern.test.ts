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

const create = { effort: 'alpha', tickets: [{ title: 'New' }] };

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
  ])('warns on read and refuses every write for %s', async (_name, config, reason) => {
    const frontier = await workspace(config);

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('warnings:');
    expect(board).toContain(reason);
    // Reads keep working: the repo whose configuration is broken is the one to look at.
    expect(board).toContain('T1');
    expect(await frontier.call('get_tickets', { ids: ['T1'] })).toContain('Body prose.');

    expect(await frontier.callExpectingError('create_tickets', create)).toContain(reason);
    expect(
      await frontier.callExpectingError('update_ticket', { id: 'T1', claim: { by: 'me' } }),
    ).toContain(reason);
    expect(
      await frontier.callExpectingError('edit_map', { effort: 'alpha', destination: 'Elsewhere.' }),
    ).toContain(reason);
    expect(
      await frontier.callExpectingError('spec', { effort: 'alpha', content: '# Spec' }),
    ).toContain(reason);
    expect(
      await frontier.callExpectingError('migrate_effort', { effort: 'beta', preview: false }),
    ).toContain(reason);
    expect(await frontier.callExpectingError('create_tickets', create)).toContain('restarted');
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
    expect(await frontier.callExpectingError('create_tickets', create)).toContain(
      'is not valid YAML',
    );
  });

  it('warns on read and refuses writes for a file that is not a mapping', async () => {
    const frontier = await workspace('- T<N>\n');

    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain(
      'must be a YAML mapping',
    );
    await frontier.callExpectingError('create_tickets', create);
  });

  it('mints the default T<b36{6}> and keeps existing T<n> ids', async () => {
    const frontier = await workspace(undefined);

    const text = await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ title: 'New' }, { title: 'Newer', blocked_by: ['T1'] }],
    });

    const ids = text.match(/\bT[0-9a-z]{6}\b/g) ?? [];
    expect(new Set(ids).size).toBe(2);
    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('T1  One');
    expect(board).not.toContain('T1?');
  });

  it('redraws a random id already in use rather than failing', async () => {
    const root = await makeFixtureTree({
      '.scratch/frontier.yml': 'id_pattern: x<b16{1}>\n',
      ...Object.fromEntries(
        [...'0123456789abcde'].map((digit, index) => [
          `.scratch/alpha/issues/${String(index + 1).padStart(2, '0')}-x${digit}-t.md`,
          ticket(`x${digit}`, 'Taken'),
        ]),
      ),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    // Fifteen of sixteen are taken, so a first draw almost always hits.
    expect(await frontier.call('create_tickets', create)).toContain('xf');
  });

  it('refuses with its own message once the random space is full', async () => {
    const root = await makeFixtureTree({
      '.scratch/frontier.yml': 'id_pattern: x<b16{1}>\n',
      '.scratch/alpha/map.md': map('Somewhere.'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: Array.from({ length: 16 }, (_, index) => ({ title: `T ${String(index)}` })),
    });
    const error = await frontier.callExpectingError('create_tickets', create);

    expect(error).toContain('random space is full or nearly full');
    expect(error).not.toContain('No free Ticket id within');
    expect(error).not.toContain('.guard');
    expect(await readdir(join(root, '.scratch'))).not.toContain(expect.stringMatching(/\.guard$/));
  });

  it('counts under T<N> from the highest id in its namespace', async () => {
    const frontier = await workspace('id_pattern: T<N>\n');

    expect(await frontier.call('create_tickets', create)).toMatch(/\bT2\b/);
  });

  it('counts under a mixed pattern and draws its random part', async () => {
    const frontier = await workspace('id_pattern: T<N>-<b36{4}>\n');

    await frontier.call('create_tickets', create);
    const text = await frontier.call('create_tickets', create);

    // T1 is outside the mixed namespace, so the counter starts at 1, then 2.
    expect(text).toMatch(/\bT2-[0-9a-z]{4}\b/);
  });

  it('writes nothing while refusing', async () => {
    const frontier = await workspace('id_pattern: <N>\n');

    await frontier.callExpectingError('create_tickets', create);

    expect(await frontier.call('list_efforts')).toContain('tickets=1');
  });
});

describe('id-ness is the configured pattern', () => {
  it('refuses a key the configured pattern accepts and allows one it does not', async () => {
    const frontier = await workspace('id_pattern: AUTH-<N>\n');

    const refused = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [{ key: 'AUTH-7', title: 'Ambiguous' }],
    });
    expect(refused).toContain('looks like a Ticket id');

    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [
        { key: 'T8', title: 'Keyed' },
        { title: 'Child', blocked_by: ['T8'] },
      ],
    });
  });

  it.each(['id_pattern: AUTH-<N>\n', 'id_pattern: T<N>-<b36{4}>\n'])(
    'refuses a key naming an existing Ticket the pattern no longer accepts (%s)',
    async config => {
      const frontier = await workspace(config);

      const refused = await frontier.callExpectingError('create_tickets', {
        effort: 'alpha',
        tickets: [
          { key: 'T1', title: 'Shadow' },
          { title: 'Child', blocked_by: ['T1'] },
        ],
      });

      expect(refused).toContain('is the id of an existing Ticket');
      expect(await frontier.call('list_efforts')).toContain('tickets=1');
    },
  );

  it('keeps recognizing T<n> ids under the default pattern', async () => {
    const frontier = await workspace(undefined);

    const refused = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [{ key: 'T34', title: 'Ambiguous' }],
    });
    expect(refused).toContain('looks like a Ticket id');
    // A dangling Edge on an existing-style id is a forward reference, not a typo.
    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ title: 'Child', blocked_by: ['T34'] }],
    });
  });
});

describe('the counted-pattern warning on create_tickets', () => {
  it.each([
    ['T<N>', 'id_pattern: T<N>\n'],
    ['AUTH-<N>', 'id_pattern: AUTH-<N>\n'],
  ])('rides every create under %s and never a read', async (name, config) => {
    const frontier = await workspace(config);

    const first = await frontier.call('create_tickets', create);
    const second = await frontier.call('create_tickets', create);
    for (const result of [first, second]) {
      expect(result).toContain('warnings:');
      expect(result).toContain(`id pattern \`${name}\` mints by counting`);
      expect(result).toContain('T<N>-<b36{4}>');
      expect(result).toContain('regression');
      expect(result).toContain('Set in .scratch/frontier.yml.');
      expect(result).toContain('No action is required here — this describes the pattern');
      // One-way (T56): this warning never mentions a duplicate that has not happened.
      expect(result).not.toContain('duplicate');
    }
    expect(await frontier.call('get_board', { effort: 'alpha' })).not.toContain('regression');
    expect(await frontier.call('list_efforts', {})).not.toContain('regression');
  });

  it.each([
    ['a mixed pattern', 'id_pattern: T<N>-<b36{4}>\n'],
    ['a random pattern', 'id_pattern: x<b16{8}>\n'],
    ['the default', undefined],
  ])('is absent under %s', async (_name, config) => {
    const frontier = await workspace(config);

    const result = await frontier.call('create_tickets', create);
    expect(result).not.toContain('warnings:');
    expect(result).not.toContain('regression');
  });
});
