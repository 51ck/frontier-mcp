import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const ISSUES = '.scratch/alpha/issues';

async function setup(files: Record<string, string>) {
  const tree: Record<string, string> = { '.scratch/alpha/map.md': map('Somewhere.') };
  for (const [name, contents] of Object.entries(files)) tree[`${ISSUES}/${name}`] = contents;
  const root = await makeFixtureTree(tree);
  const frontier = await connectFrontier({ cwd: root, env: {} });
  const read = (name: string) => readFile(join(root, ISSUES, name), 'utf8');
  return { frontier, read };
}

/** Untouched entries no `yaml` render would reproduce: odd id spellings, padding, a kept block scalar. */
const ODD = [
  'frontier: ticket',
  'id: +02',
  'title: Odd',
  'kind: build',
  'status: open',
  '# a heading comment',
  'blocked_by: [+03]',
  'other:  [ 1,  2 ]   # keep',
  'hex: 0x1A',
  'kept: |+',
  '  text',
  '',
  'tail: x',
];
const BLOCKER = ['frontier: ticket', 'id: 0x1A', 'title: Blocker', 'status: open'];
const THIRD = [
  'frontier: ticket',
  'id: "+03"',
  'title: Third',
  'status: resolved',
  'answer_gist: done',
];

function file(lines: readonly string[], eol = '\n', body = 'Body prose.'): string {
  return ['---', ...lines, '---', '', body, ''].join(eol);
}

/** The fence's lines, by the line ending the file uses. */
function fenceLines(contents: string, eol = '\n'): string[] {
  const lines = contents.split(eol);
  return lines.slice(1, lines.indexOf('---', 1));
}

const WRITES: ReadonlyArray<[string, Record<string, unknown>, readonly string[]]> = [
  ['comment', { comment: 'A note.' }, []],
  ['claim', { claim: { by: 'agent' } }, ['status']],
  ['resolve', { resolve: { answer_gist: 'done' } }, ['status']],
  ['drop', { drop: { reason: 'out' } }, ['status']],
  ['title', { title: 'Renamed' }, ['title']],
  ['kind', { kind: 'decision' }, ['kind']],
  ['type', { kind: 'decision', type: 'spike' }, ['kind']],
  ['triage', { triage: 'ready-for-agent' }, []],
  ['blocked_by', { blocked_by: ['+03', '0x1A'] }, ['blocked_by']],
  ['tags', { tags: ['a'] }, []],
  ['extra', { extra: { note: 1 } }, []],
];

describe('a field write edits only its own entries', () => {
  it.each(WRITES)(
    '%s leaves every other fence line byte-identical',
    async (_, request, touched) => {
      const { frontier, read } = await setup({
        'odd.md': file(ODD),
        'blocker.md': file(BLOCKER),
        'third.md': file(THIRD),
      });

      await frontier.call('update_ticket', { id: '+02', ...request });

      const after = fenceLines(await read('odd.md'));
      const kept = ODD.filter(line => !touched.some(key => line.startsWith(`${key}:`)));
      expect(after.filter(line => kept.includes(line))).toEqual(kept);
      // The id and Edges still resolve: nothing renamed the Ticket or its blocker.
      const board = await frontier.call('get_board', { effort: 'alpha' });
      expect(board).not.toContain('?');
      expect(await frontier.call('get_tickets', { ids: ['+02'] })).toContain('+02');
    },
  );

  it('keeps the id through release and reopen too', async () => {
    const { frontier, read } = await setup({ 'odd.md': file(ODD), 'third.md': file(THIRD) });
    await frontier.call('update_ticket', { id: '+02', claim: { by: 'agent' } });
    await frontier.call('update_ticket', { id: '+02', release: true });
    await frontier.call('update_ticket', { id: '+02', drop: { reason: 'out' } });
    await frontier.call('update_ticket', { id: '+02', reopen: { reason: 'back' } });

    const after = fenceLines(await read('odd.md'));
    for (const line of ODD.filter(kept => !kept.startsWith('status:'))) {
      expect(after).toContain(line);
    }
  });

  it('a comment leaves the fence of a CRLF file byte-identical', async () => {
    const original = file(ODD, '\r\n');
    const { frontier, read } = await setup({ 'odd.md': original, 'third.md': file(THIRD) });

    await frontier.call('update_ticket', { id: '+02', comment: 'A note.' });

    const after = await read('odd.md');
    expect(after.startsWith(original.slice(0, original.indexOf('\r\n\r\nBody')))).toBe(true);
    expect(after).toContain('A note.');
  });

  it('a tick leaves the fence of a CRLF file byte-identical', async () => {
    const original = file(ODD, '\r\n', '## Acceptance criteria\r\n\r\n- [ ] it works');
    const { frontier, read } = await setup({ 'odd.md': original, 'third.md': file(THIRD) });

    await frontier.call('update_ticket', { id: '+02', tick: ['it works'] });

    const after = await read('odd.md');
    expect(after.startsWith(original.slice(0, original.indexOf('\r\n\r\n##')))).toBe(true);
    expect(after).toContain('- [x] it works');
  });

  it('a claim in a CRLF file changes only status and appends CRLF lines', async () => {
    const { frontier, read } = await setup({
      'odd.md': file(ODD, '\r\n'),
      'third.md': file(THIRD),
    });

    await frontier.call('update_ticket', { id: '+02', claim: { by: 'agent' } });

    const after = await read('odd.md');
    expect(after.replace(/\r\n/g, '')).toBe(after.replace(/\r?\n/g, ''));
    const lines = fenceLines(after, '\r\n');
    expect(lines.slice(0, ODD.length)).toEqual(ODD.with(4, 'status: claimed'));
    expect(lines.slice(ODD.length).map(line => line.split(':')[0])).toEqual([
      'claimed_by',
      'claimed_at',
    ]);
    expect(after.endsWith('\r\n---\r\n\r\nBody prose.\r\n')).toBe(true);
  });

  it('a field write leaves the body byte-identical', async () => {
    const body = 'Line one.  \n\n\n  indented\n';
    const original = ['---', ...ODD, '---', body].join('\n');
    const { frontier, read } = await setup({ 'odd.md': original, 'third.md': file(THIRD) });

    await frontier.call('update_ticket', { id: '+02', title: 'Renamed' });

    expect((await read('odd.md')).endsWith(`---\n${body}`)).toBe(true);
  });
});

describe('extra keys by the reader key identity', () => {
  it('replaces a stored 12: in place rather than adding "12":, and drops it after', async () => {
    const lines = ['frontier: ticket', 'title: One', 'status: open', '12: old', 'after: x'];
    const { frontier, read } = await setup({ 'one.md': file(lines) });

    await frontier.call('update_ticket', { id: 'one', extra: { '12': 'new' } });
    expect(fenceLines(await read('one.md'))).toEqual(lines.with(3, '12: new'));

    await frontier.call('update_ticket', { id: 'one', drop_keys: ['12'] });
    expect(fenceLines(await read('one.md'))).toEqual(lines.toSpliced(3, 1));
  });
});

describe('trailing newlines in the last extra value', () => {
  it('survive on create', async () => {
    const { frontier } = await setup({});
    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'cache', title: 'Cache', extra: { a: 'abc\n\n' } }],
    });
    const shown = await frontier.call('get_tickets', { ids: ['cache'] });
    expect(shown).toContain('a: |+');
  });

  it('survive on update', async () => {
    const lines = ['frontier: ticket', 'title: One', 'status: open'];
    const { frontier, read } = await setup({ 'one.md': file(lines) });
    await frontier.call('update_ticket', { id: 'one', extra: { a: 'abc\n\n' } });
    const written = await read('one.md');
    expect(written).toContain('a: |+\n  abc\n\n\n---');
    expect(await frontier.call('get_tickets', { ids: ['one'] })).toContain('a: |+');
    // Appending after it would turn the delimiter's newline into its value: refused, not lossy.
    const error = await frontier.callExpectingError('update_ticket', {
      id: 'one',
      extra: { b: 1 },
    });
    expect(error).toContain("'a' cannot be written");
    expect(await read('one.md')).toBe(written);
  });
});

describe('__proto__', () => {
  const lines = ['frontier: ticket', 'title: One', 'status: open'];

  it('is refused in create_tickets extra', async () => {
    const { frontier } = await setup({});
    const error = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'cache', title: 'Cache', extra: JSON.parse('{"__proto__":1,"a":2}') }],
    });
    expect(error).toContain('Ticket 1 of this call, name "cache": ');
    expect(error).toContain('__proto__');
    expect(await frontier.call('get_tickets', { ids: ['cache'] })).toContain('not found');
  });

  it('is refused in update_ticket extra and drop_keys', async () => {
    const original = file(lines);
    const { frontier, read } = await setup({ 'one.md': original });
    const errors = await Promise.all(
      [
        { extra: JSON.parse('{"__proto__":1}') },
        { extra: JSON.parse('{"__proto__":1,"a":2}') },
        { drop_keys: ['__proto__'] },
      ].map(request => frontier.callExpectingError('update_ticket', { id: 'one', ...request })),
    );
    for (const error of errors) {
      expect(error).toContain('alpha.one: ');
      expect(error).toContain('__proto__');
    }
    expect(await read('one.md')).toBe(original);
  });
});

describe('a hand-written key named extra', () => {
  it('is an Unimported key drop_keys removes', async () => {
    const lines = ['frontier: ticket', 'title: One', 'status: open', 'extra: {legacy: true}'];
    const { frontier, read } = await setup({ 'one.md': file(lines) });
    await frontier.call('update_ticket', { id: 'one', drop_keys: ['extra'] });
    expect(fenceLines(await read('one.md'))).toEqual(lines.slice(0, 3));
  });
});

describe('a comment or blank line after an entry belongs to no entry', () => {
  const lines = [
    'frontier: ticket',
    'title: One',
    'status: open',
    'claimed_by:',
    '# keep me',
    'notes: x',
  ];

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ])('a claim over an empty claimed_by keeps the comment after it (%s)', async (_, eol) => {
    const { frontier, read } = await setup({ 'one.md': file(lines, eol) });

    await frontier.call('update_ticket', { id: 'one', claim: { by: 'agent' } });

    const after = fenceLines(await read('one.md'), eol);
    expect(after.slice(0, 6)).toEqual([
      'frontier: ticket',
      'title: One',
      'status: claimed',
      'claimed_by: agent',
      '# keep me',
      'notes: x',
    ]);
    expect(after.slice(6).map(line => line.split(':')[0])).toEqual(['claimed_at']);
  });

  it('drop_keys of an empty entry keeps the comment after it', async () => {
    const { frontier, read } = await setup({ 'one.md': file([...lines, 'gone:', '# also']) });

    await frontier.call('update_ticket', { id: 'one', drop_keys: ['gone'] });

    expect(fenceLines(await read('one.md'))).toEqual([...lines, '# also']);
  });

  it('drop_keys keeps the blank lines before a dropped last entry', async () => {
    const before = ['frontier: ticket', 'title: One', 'status: open', 'notes: x', '', ''];
    const { frontier, read } = await setup({ 'one.md': file([...before, 'extra: old']) });

    await frontier.call('update_ticket', { id: 'one', drop_keys: ['extra'] });

    expect(fenceLines(await read('one.md'))).toEqual(before);
  });

  it('drop_keys that would leave a |+ scalar last is refused, not lossy', async () => {
    const fence = ['frontier: ticket', 'title: One', 'status: open', 'lit: |+', '  a', '', ''];
    const { frontier, read } = await setup({ 'one.md': file([...fence, 'z: 1']) });
    const before = await read('one.md');

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'one',
      drop_keys: ['z'],
    });
    expect(error).toContain('z');
    expect(await read('one.md')).toBe(before);
  });
});

describe('fences HEAD wrote still edit', () => {
  it('a claim lands its new entries before a closing ...', async () => {
    const lines = ['frontier: ticket', 'title: One', 'status: open', '...'];
    const { frontier, read } = await setup({ 'one.md': file(lines) });

    await frontier.call('update_ticket', { id: 'one', claim: { by: 'agent' } });

    const after = fenceLines(await read('one.md'));
    expect(after.slice(0, 3)).toEqual(lines.slice(0, 2).concat('status: claimed'));
    expect(after.slice(3, 5).map(line => line.split(':')[0])).toEqual(['claimed_by', 'claimed_at']);
    expect(after.at(-1)).toBe('...');
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('claimed');
  });

  it.each([
    ['split over lines', ['?', '  title', ': One']],
    ['on one line', ['? title', ': One']],
  ])('a title written as an explicit key %s is rewritten plain', async (_, key) => {
    const lines = ['frontier: ticket', ...key, 'status: open', 'tail: x'];
    const { frontier, read } = await setup({ 'one.md': file(lines) });

    await frontier.call('update_ticket', { id: 'one', title: 'Renamed' });

    expect(fenceLines(await read('one.md'))).toEqual([
      'frontier: ticket',
      'title: Renamed',
      'status: open',
      'tail: x',
    ]);
  });
});

describe('an extra key is matched by the key the reader gives an entry', () => {
  const base = ['frontier: ticket', 'title: One', 'status: open'];

  it.each([
    ['null: old', '"null": new'],
    ['~: old', '"null": new'],
  ])('%s reads as the key "", so extra "null" adds %s beside it', async (stored, added) => {
    const { frontier, read } = await setup({ 'one.md': file([...base, stored]) });

    await frontier.call('update_ticket', { id: 'one', extra: { null: 'new' } });

    expect(fenceLines(await read('one.md'))).toEqual([...base, stored, added]);
    expect(await frontier.call('get_tickets', { ids: ['one'] })).toContain(added);
  });

  it('true: is the key "true" and is replaced in place', async () => {
    const { frontier, read } = await setup({ 'one.md': file([...base, 'true: old', 'z: 1']) });

    await frontier.call('update_ticket', { id: 'one', extra: { true: 'new' } });

    expect(fenceLines(await read('one.md'))).toEqual([...base, 'true: new', 'z: 1']);
  });

  it('1.0: is the key "1": extra "1" replaces it, extra "1.0" adds a quoted key', async () => {
    const { frontier, read } = await setup({ 'one.md': file([...base, '1.0: old']) });

    await frontier.call('update_ticket', { id: 'one', extra: { '1': 'new' } });
    expect(fenceLines(await read('one.md'))).toEqual([...base, '1.0: new']);

    await frontier.call('update_ticket', { id: 'one', extra: { '1.0': 'other' } });
    expect(fenceLines(await read('one.md'))).toEqual([...base, '1.0: new', '"1.0": other']);
  });

  it('"": stays untouched by extra "null", and drop_keys "null" does not reach it', async () => {
    const original = file([...base, '"": old']);
    const { frontier, read } = await setup({ 'one.md': original });

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'one',
      drop_keys: ['null'],
    });
    expect(error).toContain('null');
    expect(await read('one.md')).toBe(original);

    await frontier.call('update_ticket', { id: 'one', extra: { null: 'new' } });
    expect(fenceLines(await read('one.md'))).toEqual([...base, '"": old', '"null": new']);
  });
});

describe('the guard compares untouched bytes exactly', () => {
  const base = ['frontier: ticket', 'title: One', 'status: open'];
  /** A fence whose last two lines end CRLF then LF, and the rest LF. */
  const mixed = `---\n${base.join('\n')}\nx: 1\r\ny: 2\n---\n\nBody.\n`;

  it('a claim keeps the LF ending the last line before its new entries', async () => {
    const { frontier, read } = await setup({ 'one.md': mixed });
    await frontier.call('update_ticket', { id: 'one', claim: { by: 'agent' } });
    const after = await read('one.md');
    expect(after).toContain('x: 1\r\ny: 2\nclaimed_by: agent\n');
    expect(after.replace(/claimed_by: .*\nclaimed_at: .*\n/, '')).toBe(
      mixed.replace('status: open', 'status: claimed'),
    );
  });

  it('dropping the last entry keeps the CRLF of the one before it', async () => {
    const { frontier, read } = await setup({ 'one.md': mixed });
    await frontier.call('update_ticket', { id: 'one', drop_keys: ['y'] });
    expect(await read('one.md')).toBe(mixed.replace('y: 2\n', ''));
  });

  it.each(['|+', '>+'])('a claim after a trailing %s scalar is refused, not lossy', async style => {
    const contents = `---\n${base.join('\n')}\nx: ${style}\n  a\n\n---\n\nBody.\n`;
    const { frontier, read } = await setup({ 'one.md': contents });
    const error = await frontier.callExpectingError('update_ticket', {
      id: 'one',
      claim: { by: 'agent' },
    });
    expect(error).toContain("'x'");
    expect(await read('one.md')).toBe(contents);
  });

  it.each([
    ['replacing', { extra: { x: 'b' } }, 'x: b\n\n# keep\n'],
    ['dropping', { drop_keys: ['x'] }, '\n# keep\n'],
  ])('%s a |+ scalar keeps the blank line before a comment', async (_, request, tail) => {
    const contents = `---\n${base.join('\n')}\nx: |+\n  a\n\n# keep\nz: 1\n---\n\nBody.\n`;
    const { frontier, read } = await setup({ 'one.md': contents });
    await frontier.call('update_ticket', { id: 'one', ...request });
    expect(await read('one.md')).toBe(`---\n${base.join('\n')}\n${tail}z: 1\n---\n\nBody.\n`);
  });
});

describe('a write never renames a Ticket or moves its Edges', () => {
  it('a drop that would let id: *a fall back to an earlier anchor is refused', async () => {
    const lines = [
      'frontier: ticket',
      'x: &a 2',
      'y: &a 02',
      'id: *a',
      'title: One',
      'status: open',
    ];
    const { frontier, read } = await setup({ 'one.md': file(lines) });
    const before = await read('one.md');

    const error = await frontier.callExpectingError('update_ticket', {
      id: '02',
      drop_keys: ['y'],
    });
    expect(error).toContain("'id'");
    expect(await read('one.md')).toBe(before);
    expect(await frontier.call('get_tickets', { ids: ['02'] })).toContain('02');
  });
});

describe('an explicit key with a comment on its ? line', () => {
  it('keeps the comment as a line of its own above the rewritten entry', async () => {
    const lines = ['frontier: ticket', '? # note', '  title', ': A', 'status: open'];
    const { frontier, read } = await setup({ 'one.md': file(lines) });
    await frontier.call('update_ticket', { id: 'one', title: 'B' });
    expect(fenceLines(await read('one.md'))).toEqual([
      'frontier: ticket',
      '# note',
      'title: B',
      'status: open',
    ]);
  });

  it('keeps it through a claim, CRLF included', async () => {
    const lines = ['frontier: ticket', 'title: One', '? # lifecycle policy', '  status', ': open'];
    const { frontier, read } = await setup({ 'one.md': file(lines, '\r\n') });
    await frontier.call('update_ticket', { id: 'one', claim: { by: 'agent' } });
    const fence = fenceLines(await read('one.md'), '\r\n');
    expect(fence.slice(0, 4)).toEqual([
      'frontier: ticket',
      'title: One',
      '# lifecycle policy',
      'status: claimed',
    ]);
  });

  it('keeps a comment after a key sharing the ? line', async () => {
    const lines = ['frontier: ticket', 'title: One', '? status # why', ': open'];
    const { frontier, read } = await setup({ 'one.md': file(lines) });
    await frontier.call('update_ticket', { id: 'one', claim: { by: 'agent' } });
    expect(fenceLines(await read('one.md')).slice(2, 4)).toEqual(['# why', 'status: claimed']);
  });
});

describe('a comment below a block list ending in an empty item', () => {
  const lines = ['frontier: ticket', 'title: One', 'status: open', 'x:', '-', '# keep'];

  it('survives an extra write to the list', async () => {
    const { frontier, read } = await setup({ 'one.md': file(lines) });
    await frontier.call('update_ticket', { id: 'one', extra: { x: 'done' } });
    expect(fenceLines(await read('one.md'))).toEqual([...lines.slice(0, 3), 'x: done', '# keep']);
  });

  it('survives dropping the list', async () => {
    const { frontier, read } = await setup({ 'one.md': file(lines) });
    await frontier.call('update_ticket', { id: 'one', drop_keys: ['x'] });
    expect(fenceLines(await read('one.md'))).toEqual([...lines.slice(0, 3), '# keep']);
  });
});

describe('a drop that would rebind an anchor', () => {
  it('refuses when the Edges would change entry by entry', async () => {
    const lines = [
      'frontier: ticket',
      'title: One',
      'status: open',
      'a: &a !!binary "YQ=="',
      'b: &b !!binary "\\0Yg=="',
      'x: [&a !!binary "YQ==\\0", &b !!binary "Yg=="]',
      'blocked_by: [*a, *b]',
    ];
    const { frontier, read } = await setup({ 'one.md': file(lines) });
    const before = await read('one.md');
    const error = await frontier.callExpectingError('update_ticket', {
      id: 'one',
      drop_keys: ['x'],
    });
    expect(error).toContain("'blocked_by'");
    expect(await read('one.md')).toBe(before);
  });

  it('refuses when an untouched tag would change spelling', async () => {
    const lines = ['frontier: ticket', 'title: One', 'status: open', 'a: &a 2', 'x: &a 02'];
    const { frontier, read } = await setup({ 'one.md': file([...lines, 'tags: [*a]']) });
    const before = await read('one.md');
    const error = await frontier.callExpectingError('update_ticket', {
      id: 'one',
      drop_keys: ['x'],
    });
    expect(error).toContain("'tags'");
    expect(await read('one.md')).toBe(before);
  });

  it('refuses when an untouched Unimported value would change spelling', async () => {
    const lines = ['frontier: ticket', 'title: One', 'status: open', 'a: &a 2', 'x: &a 02'];
    const { frontier, read } = await setup({ 'one.md': file([...lines, 'y: *a']) });
    const before = await read('one.md');
    const error = await frontier.callExpectingError('update_ticket', {
      id: 'one',
      drop_keys: ['x'],
    });
    expect(error).toContain("'y'");
    expect(await read('one.md')).toBe(before);
  });
});

describe('a file that is not valid UTF-8', () => {
  it('is never written, and names the file', async () => {
    const bytes = Buffer.concat([
      Buffer.from('---\nfrontier: ticket\ntitle: One\nstatus: open\n# '),
      Buffer.from([0xff]),
      Buffer.from('\n---\n\nBody.\n'),
    ]);
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [`${ISSUES}/one.md`]: 'placeholder',
    });
    await writeFile(join(root, ISSUES, 'one.md'), bytes);
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const error = await frontier.callExpectingError('update_ticket', {
      id: 'one',
      comment: 'note',
    });
    expect(error).toContain('alpha/issues/one.md is not valid UTF-8');
    expect((await readFile(join(root, ISSUES, 'one.md'))).equals(bytes)).toBe(true);
    // A read stays lenient.
    expect(await frontier.call('get_tickets', { ids: ['one'] })).toContain('One');
  });
});

describe('a stored null: key', () => {
  const lines = ['frontier: ticket', 'title: One', 'status: open', 'null: x'];

  it('is dropped by drop_keys [""]', async () => {
    const { frontier, read } = await setup({ 'one.md': file(lines) });
    await frontier.call('update_ticket', { id: 'one', drop_keys: [''] });
    expect(fenceLines(await read('one.md'))).toEqual(lines.slice(0, 3));
  });

  it('stays refused as an extra key', async () => {
    const { frontier } = await setup({ 'one.md': file(lines) });
    const error = await frontier.callExpectingError('update_ticket', {
      id: 'one',
      extra: { '': 1 },
    });
    expect(error).not.toBe('');
  });
});

describe('a body written in CRLF', () => {
  const head = '---\r\nfrontier: ticket\r\ntitle: One\r\nstatus: open\r\n---\r\n\r\n';
  const body = '- [ ] Record the result\r\n\r\nKeep the previous build available.\r\n';

  it('takes a tick on a criterion followed by more prose, changing only the checkbox', async () => {
    const { frontier, read } = await setup({ 'one.md': head + body });
    await frontier.call('update_ticket', { id: 'one', tick: ['Record the result'] });
    expect(await read('one.md')).toBe(head + body.replace('- [ ]', '- [x]'));
  });

  it('keeps every existing line ending when a comment is appended', async () => {
    const { frontier, read } = await setup({ 'one.md': head + body });
    await frontier.call('update_ticket', { id: 'one', comment: 'Follow up after review.' });
    const after = await read('one.md');
    expect(after.startsWith(head + body)).toBe(true);
    expect(after).not.toMatch(/(?<!\r)\n/);
    expect(after).toContain('Follow up after review.\r\n');
  });
});

describe('an untouched key named __proto__', () => {
  it('is compared on read-back, so a drop that rebinds its alias is refused', async () => {
    const lines = [
      'frontier: ticket',
      'title: One',
      'status: open',
      'base: &a 2',
      'replace: &a 02',
      '__proto__: *a',
    ];
    const { frontier, read } = await setup({ 'one.md': file(lines) });
    const before = await read('one.md');
    const error = await frontier.callExpectingError('update_ticket', {
      id: 'one',
      drop_keys: ['replace'],
    });
    expect(error).toContain('__proto__');
    expect(await read('one.md')).toBe(before);
  });
});
