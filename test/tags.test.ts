// oxlint-disable no-await-in-loop -- each call reads the state the one before it left
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const ISSUES = '.scratch/alpha/issues';

function fence(lines: readonly string[], body = 'Body prose.'): string {
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`;
}

async function workspace(files: Record<string, string> = {}) {
  const tree: Record<string, string> = { '.scratch/alpha/map.md': map('Somewhere.') };
  for (const [name, contents] of Object.entries(files)) tree[`${ISSUES}/${name}`] = contents;
  const root = await makeFixtureTree(tree);
  return {
    frontier: await connectFrontier({ cwd: root, env: {} }),
    read: async (name: string) => readFile(join(root, ISSUES, name), 'utf8'),
  };
}

function header(text: string): string {
  return text.split('\n')[1] ?? '';
}

describe('tags through create_tickets and get_tickets', () => {
  it('writes the tags given, and no key when none are', async () => {
    const { frontier, read } = await workspace();

    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [
        { name: 'tagged', title: 'Tagged', tags: ['auth', 'needs review'] },
        { name: 'plain', title: 'Plain' },
      ],
    });

    expect(await read('tagged.md')).toContain('tags: [auth, needs review]\n');
    expect(await read('plain.md')).not.toContain('tags');

    const shown = await frontier.call('get_tickets', { ids: ['tagged', 'plain'] });
    const [tagged, plain] = shown.split('\n\n---\n\n');
    expect(header(tagged ?? '')).toMatch(/ {2}tags=auth,"needs review"$/);
    expect(plain).not.toContain('tags');
  });

  it('keeps tags exactly as given: no folding, trimming or deduplication', async () => {
    const { frontier } = await workspace();
    const tags = ['Auth', 'auth', 'auth', ' padded '];

    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'one', title: 'One', tags }],
    });

    const shown = await frontier.call('get_tickets', { ids: ['one'] });
    expect(header(shown)).toContain('tags=Auth,auth,auth," padded "');
  });

  it('refuses a blank or non-string tag at input and writes nothing', async () => {
    const { frontier } = await workspace();

    for (const bad of [['ok', ''], ['  '], [3], [null]]) {
      const error = await frontier.callExpectingError('create_tickets', {
        effort: 'alpha',
        tickets: [{ name: 'one', title: 'One', tags: bad }],
      });
      expect(error).toContain('tags');
    }
    expect(await frontier.call('get_tickets', { ids: ['one'] })).toBe('not found: one');
  });
});

describe('tags through update_ticket', () => {
  const plain = fence(['frontier: ticket', 'title: One', 'status: open']);

  it('replaces the list whole, and an empty list removes the key', async () => {
    const { frontier, read } = await workspace({ 'one.md': plain });

    await frontier.call('update_ticket', { id: 'one', tags: ['a', 'b'] });
    expect(await read('one.md')).toContain('tags: [a, b]\n');

    await frontier.call('update_ticket', { id: 'one', tags: ['c'] });
    expect(await read('one.md')).toContain('tags: [c]\n');

    await frontier.call('update_ticket', { id: 'one', tags: [] });
    expect(await read('one.md')).toBe(plain);
    expect(header(await frontier.call('get_tickets', { ids: ['one'] }))).not.toContain('tags');
  });

  it('leaves the key absent on every other write', async () => {
    const { frontier, read } = await workspace({ 'one.md': plain });

    await frontier.call('update_ticket', { id: 'one', claim: { by: 'me' }, comment: 'noted' });
    await frontier.call('update_ticket', { id: 'one', resolve: { answer_gist: 'done' } });

    expect(await read('one.md')).not.toContain('tags');
  });

  it('refuses a blank tag and writes nothing', async () => {
    const { frontier, read } = await workspace({ 'one.md': plain });

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'one',
      tags: ['a', ' '],
    });
    expect(error).toContain('a tag must not be blank');
    expect(await read('one.md')).toBe(plain);
  });

  it('changes no other frontmatter line', async () => {
    // Written as the yaml package renders, so the pre-existing re-render
    // defect (frontier-v1.comment-reformats-fence: CRLF, inline-comment
    // spacing, `[a,b]` padding) cannot show here.
    const before = [
      'frontier: ticket',
      'title: One',
      '# a heading comment',
      'status: open',
      'tags:',
      '  - old',
      'blocked_by: [two]',
      'owner: someone # note',
      'kind: build',
    ];
    const { frontier, read } = await workspace({
      'one.md': fence(before),
      'two.md': fence(['frontier: ticket', 'title: Two', 'status: open']),
    });

    await frontier.call('update_ticket', { id: 'one', tags: ['new', 'other'] });

    // The block style the author chose survives, as with blocked_by.
    const after = before.with(5, '  - new').toSpliced(6, 0, '  - other');
    expect(await read('one.md')).toBe(fence(after));
  });
});

describe('tags and the Frontier', () => {
  it('never change what is takeable', async () => {
    const { frontier } = await workspace({
      'a.md': fence(['frontier: ticket', 'title: A', 'status: open']),
      'b.md': fence(['frontier: ticket', 'title: B', 'status: open', 'blocked_by: [a]']),
      'c.md': fence(['frontier: ticket', 'title: C', 'status: resolved', 'answer_gist: x']),
    });
    const board = async () => frontier.call('get_board', { effort: 'alpha' });
    const efforts = async () => frontier.call('list_efforts');

    const before = [await board(), await efforts()];
    for (const id of ['a', 'b', 'c']) {
      await frontier.call('update_ticket', { id, tags: ['blocked', 'done', 'takeable'] });
    }
    expect([await board(), await efforts()]).toEqual(before);

    for (const id of ['a', 'b', 'c']) await frontier.call('update_ticket', { id, tags: [] });
    expect([await board(), await efforts()]).toEqual(before);
  });
});

describe('a tags value in a marked file', () => {
  const base = ['frontier: ticket', 'title: T', 'status: open'];

  it('is valid when absent, null, empty, or a list of non-blank scalars, each read as written', async () => {
    const { frontier } = await workspace({
      'absent.md': fence(base),
      'null.md': fence([...base, 'tags:']),
      'empty.md': fence([...base, 'tags: []']),
      'scalars.md': fence([...base, 'tags: [01, true, 2026-11-19, x]']),
    });

    const shown = await frontier.call('get_tickets', {
      ids: ['absent', 'null', 'empty', 'scalars'],
    });
    expect(shown).not.toContain('not a Ticket');
    expect(shown).toContain('tags=01,true,2026-11-19,x');
    expect(shown.match(/tags=/g)).toHaveLength(1);
  });

  it('is invalid-value on tags when anything else', async () => {
    const bad = {
      'text.md': 'tags: auth',
      'mapping.md': 'tags: {a: 1}',
      'blank.md': "tags: [a, '']",
      'spaces.md': "tags: [a, '  ']",
      'nulled.md': 'tags: [a, null]',
      'nested.md': 'tags: [[a]]',
    };
    const { frontier } = await workspace(
      Object.fromEntries(Object.entries(bad).map(([name, line]) => [name, fence([...base, line])])),
    );

    const checked = await frontier.call('check_tracker');
    for (const name of Object.keys(bad)) {
      expect(checked).toMatch(
        new RegExp(
          `invalid-value \\(excluded\\) {2}${ISSUES}/${name} {2}key=tags {2}expected=a list of non-blank tags`,
        ),
      );
    }
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('(no tickets)');
  });
});

const AWKWARD = [
  '-\n---\n-',
  '---',
  '...',
  '[x]',
  '{x}',
  'a, b',
  'a: b',
  '#x',
  'x #y',
  "'",
  '"',
  ' lead',
  'trail ',
  'a\tb',
  'a\nb',
];

async function tagsOf(frontier: Awaited<ReturnType<typeof connectFrontier>>, id: string) {
  const checked = await frontier.call('check_tracker');
  expect(checked.split('\n').filter(l => l.includes(ISSUES))).toEqual([]);
  return header(await frontier.call('get_tickets', { ids: [id] }));
}

describe('tags that YAML could misread', () => {
  it('round-trip through create_tickets', async () => {
    const { frontier } = await workspace();
    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'odd', title: 'Odd', tags: AWKWARD }],
    });
    expect(await tagsOf(frontier, 'odd')).toContain(
      `tags=${AWKWARD.map(t => (/[\s,"]/.test(t) ? JSON.stringify(t) : t)).join(',')}`,
    );
  });

  it('round-trip through update_ticket on a Ticket with an empty list', async () => {
    const { frontier } = await workspace({
      'one.md': fence(['frontier: ticket', 'title: One', 'status: open', 'tags: []']),
    });
    for (const tag of AWKWARD) {
      await frontier.call('update_ticket', { id: 'one', tags: [tag] });
      const shown = /[\s,"]/.test(tag) ? JSON.stringify(tag) : tag;
      expect((await tagsOf(frontier, 'one')).endsWith(`  tags=${shown}`)).toBe(true);
    }
  });
});

describe('a tag shown in the get_tickets header', () => {
  it('never carries a raw control or separator character', async () => {
    const { frontier } = await workspace();
    const tags = [
      'fake\u0085status=resolved',
      'line\u2028sep',
      'para\u2029sep',
      'x\u001b[2Jy',
      'd\u007f',
    ];
    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'evil', title: 'Evil', tags }],
    });
    const line = header(await frontier.call('get_tickets', { ids: ['evil'] }));
    expect(line).toMatch(
      / {2}tags="fake\\u0085status=resolved","line\\u2028sep","para\\u2029sep","x\\u001b\[2Jy","d\\u007f"$/,
    );
    expect(line).not.toMatch(/[\p{Cc}\u2028\u2029]/u);
  });
});

describe('a tags list another field aliases', () => {
  const cases: ReadonlyArray<readonly [name: string, lines: readonly string[]]> = [
    ['the whole list', ['tags: &labels [two]', 'blocked_by: *labels']],
    ['one item, whose spelling an Edge keeps', ['tags: [&item 02]', 'blocked_by: [*item]']],
    [
      'a list whose inner anchor a later one of the same name would shadow',
      ['tags: &tags [&item old, *item]', 'other: &item other', 'meta: {nested: [*tags, *item]}'],
    ],
  ];

  describe.each(cases)('through %s', (_name, lines) => {
    const aliased = fence(['frontier: ticket', 'title: One', 'status: open', ...lines]);

    it.each([
      ['replaced', ['new']],
      ['cleared', []],
    ])('is refused when %s, naming the anchor, and the file is untouched', async (_how, tags) => {
      const { frontier, read } = await workspace({ 'one.md': aliased });
      const error = await frontier.callExpectingError('update_ticket', { id: 'one', tags });
      expect(error).toMatch(/tags holds the anchor &\w+, which another field/);
      expect(await read('one.md')).toBe(aliased);
    });
  });
});
