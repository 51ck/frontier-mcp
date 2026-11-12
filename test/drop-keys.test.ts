import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const FILE = '.scratch/alpha/issues/01-T1-one.md';

const FENCE = [
  'id: T1',
  'title: One',
  'kind: build',
  'status: open',
  '# about the tags',
  'tags: [a, b] # trailing note',
  'tag: z',
  'note: |',
  '  line one',
  '  line two',
  'nested:',
  '  a: 1',
  '  # inner',
  '  b: 2',
  'seq:',
  '  - x',
  '  - y',
  'blocked_by: [ T9 ]',
  "quoted: 'kept'",
].join('\n');

const BODY = '## Acceptance criteria\n\n- [ ] first thing\n';

function file(fence: string, body = BODY): string {
  return `---\n${fence}\n---\n\n${body}`;
}

async function setup(contents = file(FENCE), extra: Record<string, string> = {}) {
  const root = await makeFixtureTree({
    '.scratch/alpha/map.md': map('Somewhere.'),
    [FILE]: contents,
    ...extra,
  });
  const frontier = await connectFrontier({ cwd: root, env: {} });
  const read = () => readFile(join(root, FILE), 'utf8');
  return { root, frontier, read };
}

function without(...names: string[]): string {
  const lines = FENCE.split('\n');
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const name = /^([a-z_]+):/.exec(line)?.[1];
    if (name !== undefined && names.includes(name)) {
      while (/^\s/.test(lines[index + 1] ?? '')) index += 1;
      continue;
    }
    kept.push(line);
  }
  return kept.join('\n');
}

describe('update_ticket drop_keys', () => {
  it('deletes exactly the named keys and leaves the rest of the fence byte-identical', async () => {
    const { frontier, read } = await setup();

    const result = await frontier.call('update_ticket', {
      id: 'T1',
      drop_keys: ['tag', 'note', 'nested', 'seq', 'tag'],
    });

    expect(result).toMatch(/^root: /m);
    expect(result).toContain('T1 updated');
    // `tag` is a prefix of `tags`; only the exact key goes. A duplicate name is one drop.
    expect(await read()).toBe(file(without('tag', 'note', 'nested', 'seq')));
  });

  it('takes a trailing comment with its entry and leaves an own-line comment above', async () => {
    const { frontier, read } = await setup();

    await frontier.call('update_ticket', { id: 'T1', drop_keys: ['tags'] });

    const after = await read();
    expect(after).not.toContain('trailing note');
    expect(after).toContain('# about the tags\ntag: z');
    expect(after).toBe(file(without('tags')));
  });

  it('drops the last entry of a fence', async () => {
    const { frontier, read } = await setup();

    await frontier.call('update_ticket', { id: 'T1', drop_keys: ['quoted'] });

    expect(await read()).toBe(file(without('quoted')));
  });

  it('refuses a schema key by name and writes nothing', async () => {
    const { frontier, read } = await setup();
    const before = await read();

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      drop_keys: ['tags', 'blocked_by'],
    });

    expect(error).toContain('blocked_by is a schema key');
    expect(await read()).toBe(before);
  });

  it('fails the whole call on an absent key, alongside a comment and a tick', async () => {
    const { frontier, read } = await setup();
    const before = await read();

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      drop_keys: ['tags', 'nope'],
      comment: 'hello',
      tick: ['first thing'],
    });

    expect(error).toContain("no frontmatter key 'nope'");
    expect(await read()).toBe(before);
  });

  it('writes nothing when a tick in the same call fails', async () => {
    const { frontier, read } = await setup();
    const before = await read();

    await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      drop_keys: ['tags'],
      tick: ['no such criterion'],
    });

    expect(await read()).toBe(before);
  });

  it('rides along with a comment and a tick', async () => {
    const { frontier, read } = await setup();

    await frontier.call('update_ticket', {
      id: 'T1',
      drop_keys: ['tags'],
      comment: 'dropped the tags',
      tick: ['first thing'],
    });

    const after = await read();
    expect(after).not.toContain('tags:');
    expect(after).toContain('- [x] first thing');
    expect(after).toContain('dropped the tags');
  });

  it('removes the Unimported frontmatter block once the last unimported key is gone', async () => {
    const { frontier } = await setup();
    expect(await frontier.call('get_tickets', { ids: ['T1'] })).toContain(
      '## Unimported frontmatter',
    );

    await frontier.call('update_ticket', {
      id: 'T1',
      drop_keys: ['tags', 'tag', 'note', 'nested', 'seq', 'quoted'],
    });

    expect(await frontier.call('get_tickets', { ids: ['T1'] })).not.toContain(
      '## Unimported frontmatter',
    );
  });

  it('refuses an unfenced Ticket without normalizing it', async () => {
    const prose = '# T1 — One\n\nStatus: open\n\nProse only.\n';
    const { frontier, read } = await setup(prose);

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      drop_keys: ['tags'],
    });

    expect(error).toContain('no parseable frontmatter');
    expect(await read()).toBe(prose);
  });

  it('refuses a duplicated id with DuplicateId before judging the key', async () => {
    const { frontier, read } = await setup(file(FENCE), {
      '.scratch/alpha/issues/02-T1-two.md': file('id: T1\ntitle: Two\nkind: build\nstatus: open'),
    });
    const before = await read();

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      drop_keys: ['nope'],
    });

    expect(error).toContain('02-T1-two.md');
    expect(error).not.toContain('no frontmatter key');
    expect(await read()).toBe(before);
  });

  it('carries the revision check', async () => {
    const { frontier, read, root } = await setup();
    await frontier.call('get_board', { effort: 'alpha' });
    // A hand edit the cached scan has not seen, sized differently so the revision moves.
    await writeFile(join(root, FILE), (await read()).replace('title: One', 'title: One edited'));

    await frontier.callExpectingError('update_ticket', { id: 'T1', drop_keys: ['tags'] });

    expect(await read()).toContain('tags: [a, b]');
  });
});

describe('drop_keys refuses a cut that would damage the fence', () => {
  it.each([
    [
      'an anchor another entry aliases',
      'id: T1\ntitle: One\nstatus: open\nbase: &b x\nother: *b',
      'base',
    ],
    [
      'an entry sharing its line in a flow mapping',
      '{id: T1, title: One, status: open, z: 2}',
      'z',
    ],
    [
      'an anchor whose alias would fall back to an earlier one',
      'id: T1\ntitle: One\nx: &s open\nz: &s resolved\nstatus: *s',
      'z',
    ],
    ['the entry after a keep-chomped scalar', 'id: T1\ntitle: One\nlit: |+\n  a\n\nz: 1', 'z'],
  ])('refuses %s and writes nothing', async (_, fence, key) => {
    const { frontier, read } = await setup(file(fence));
    const before = await read();

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      drop_keys: [key],
    });

    expect(error).toContain(`'${key}' cannot be cut out`);
    expect(await read()).toBe(before);
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('T1  One');
  });

  it('refuses a fence the reader cannot parse with the typed failure', async () => {
    const { frontier, read } = await setup(file('id: T1\ntitle: One\nw: *q\nz: 1'));
    const before = await read();

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'alpha#1',
      drop_keys: ['z'],
    });

    expect(error).toContain('no parseable frontmatter');
    expect(await read()).toBe(before);
  });

  it('refuses an empty list rather than writing a no-op', async () => {
    const { frontier, read } = await setup();
    const before = await read();

    await frontier.callExpectingError('update_ticket', { id: 'T1', drop_keys: [] });

    expect(await read()).toBe(before);
  });
});

describe('drop_keys on a foreign fence', () => {
  const FOREIGN = '.scratch/alpha/issues/01-foreign.md';
  const fence = 'title: GitHub export\nlabels: bug\nstatus: open';

  it('makes the Ticket a schema fence with no id: no longer Foreign, still named no id', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FOREIGN]: file(fence, 'Body.\n'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('foreign fence');

    await frontier.call('update_ticket', { id: 'alpha#1', drop_keys: ['labels'] });

    expect(await readFile(join(root, FOREIGN), 'utf8')).toBe(
      file('title: GitHub export\nstatus: open', 'Body.\n'),
    );
    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).not.toContain('foreign fence');
    expect(board).toContain('no id (1)');
    expect(await frontier.call('get_tickets', { ids: ['alpha#1'] })).not.toContain(
      '## Unimported frontmatter',
    );
  });
  it('gives a fence left with no key the schema block, never an empty fence', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FOREIGN]: file('labels: bug', '# Export\n\nBody.\n'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('update_ticket', { id: 'alpha#1', drop_keys: ['labels'] });
    await frontier.call('update_ticket', { id: 'alpha#1', comment: 'Still fine.' });

    const written = await readFile(join(root, FOREIGN), 'utf8');
    expect(written).not.toContain('null');
    expect(written).toMatch(/^---\ntitle: /);
    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).not.toContain('Foreign');
    expect(board).not.toContain('foreign fence');
    expect(board).toContain('no id (1)');
  });
});
