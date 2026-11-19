import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const FILE = '.scratch/alpha/issues/01-foreign.md';

/** A marked fence; `status: open` unless the fields say otherwise. */
function fenced(fields: Record<string, string>, body = 'Body prose.'): string {
  const all = { status: 'open', ...fields };
  const lines = Object.entries(all).map(([key, value]) => `${key}: ${value}`);
  return `---\nfrontier: ticket\n${lines.join('\n')}\n---\n\n${body}\n`;
}

function marked(board: string): string[] {
  return board
    .split('\n')
    .filter(line => line.startsWith('> '))
    .map(line => line.slice(2).split('  ')[0] ?? '');
}

function ticketLine(board: string): string {
  return (
    board.split('\n').find(entry => entry.includes('GitHub') || entry.includes('Closed')) ?? ''
  );
}

const UNIMPORTED =
  'Tickets hold Unimported keys — frontmatter outside the schema; get_tickets shows them, ' +
  'update_ticket drop_keys removes them.';

describe('a fence with a key outside the schema on read', () => {
  it('counts a fence with no id and a stray key as holding Unimported keys', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: fenced({ labels: 'bug', title: 'GitHub export' }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).toContain(`  1/1 ${UNIMPORTED}`);
    expect(ticketLine(board)).toMatch(/^> foreign  GitHub export  /);
  });

  it('excludes a fence with a stray key and status: closed rather than counting its keys', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: fenced({ github: '123', title: 'Both problems', status: 'closed' }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).not.toContain(UNIMPORTED);
    expect(board).toContain('invalid-value: ');
    expect(marked(board)).toEqual([]);
  });

  it('leaves a schema Ticket with id and status: open takeable', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-open.md': ticket('T1', 'Still takeable'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(marked(await frontier.call('get_board', { effort: 'alpha' }))).toEqual(['T1']);
  });

  it('does not rewrite a file holding Unimported keys on get_board', async () => {
    const contents = fenced({ labels: 'bug', title: 'GitHub export' });
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: contents,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('get_board', { effort: 'alpha' });

    expect(await readFile(join(root, FILE), 'utf8')).toBe(contents);
  });
});

const HEADING = '## Unimported frontmatter';

describe('get_tickets on a fence with Unimported keys', () => {
  it('appends only the unimported entries of a fence with no id, each as the file has it', async () => {
    const raw =
      'frontier: ticket\nlabels: [bug, "ui"]   # trailing comment\ntitle: GitHub export\nstatus: open\nnumber: 0042';
    const contents = `---\n${raw}\n---\n\nBody prose.\n`;
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: contents,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const out = await frontier.call('get_tickets', { ids: ['foreign'] });

    expect(
      out.endsWith(
        `Body prose.\n\n${HEADING}\n\n\`\`\`yaml\nlabels: [bug, "ui"]   # trailing comment\nnumber: 0042\n\`\`\``,
      ),
    ).toBe(true);
  });

  it('outruns a backtick fence inside an entry of a fence with no id', async () => {
    const raw =
      'frontier: ticket\ntitle: GitHub export\nstatus: open\nlabels: bug\nnote: |\n  ```\n  code\n  ````';
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: `---\n${raw}\n---\n\nBody prose.\n`,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const out = await frontier.call('get_tickets', { ids: ['foreign'] });

    expect(out).toContain(
      `${HEADING}\n\n\`\`\`\`\`yaml\nlabels: bug\nnote: |\n  \`\`\`\n  code\n  \`\`\`\`\n\`\`\`\`\``,
    );
  });

  it('leaves the file bytes and mtime unchanged', async () => {
    const contents = fenced({ labels: 'bug', title: 'GitHub export' });
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: contents,
    });
    const before = await stat(join(root, FILE));
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('get_tickets', { ids: ['foreign'] });

    expect(await readFile(join(root, FILE), 'utf8')).toBe(contents);
    expect((await stat(join(root, FILE))).mtimeMs).toBe(before.mtimeMs);
  });

  it('adds nothing to a conforming Ticket', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-open.md': ticket('T1', 'Still takeable'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const out = await frontier.call('get_tickets', { ids: ['T1'] });

    expect(out).not.toContain('Unimported frontmatter');
    expect(out).not.toContain('```');
  });

  it('keeps the block and the count after a comment, which drops no key', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: fenced({ labels: 'bug', title: 'GitHub export' }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('update_ticket', { id: 'foreign', comment: 'Migrating.' });

    expect(await frontier.call('get_tickets', { ids: ['foreign'] })).toContain(HEADING);
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain(`  1/1 ${UNIMPORTED}`);
  });

  it('shows a hand-annotated Ticket its stray entries verbatim, not id or status', async () => {
    const contents =
      '---\nfrontier: ticket\nid: T1\nlabels: [bug,  "ui"]  # kept\ntitle: Annotated\nstatus: open\nmilestone:\n  name: v2\n  due: 2026-12-01\nblocked_by: []\n---\n\nBody prose.\n';
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-annotated.md': contents,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const out = await frontier.call('get_tickets', { ids: ['T1'] });

    expect(out).not.toContain('foreign');
    expect(
      out.endsWith(
        `Body prose.\n\n${HEADING}\n\n\`\`\`yaml\nlabels: [bug,  "ui"]  # kept\nmilestone:\n  name: v2\n  due: 2026-12-01\n\`\`\``,
      ),
    ).toBe(true);
    expect(await readFile(join(root, '.scratch/alpha/issues/01-T1-annotated.md'), 'utf8')).toBe(
      contents,
    );
  });

  it.each([
    ['a non-scalar key', '[a, b]: c'],
    ['an explicit key', '? labels\n: bug'],
  ])('shows the whole fence when %s cannot be cut out cleanly', async (_, entry) => {
    const fence = `frontier: ticket\nid: T1\ntitle: A\nstatus: open\n${entry}`;
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-a.md': `---\n${fence}\n---\n\nBody.\n`,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const out = await frontier.call('get_tickets', { ids: ['T1'] });

    expect(out.endsWith(`${HEADING}\n\n\`\`\`yaml\n${fence}\n\`\`\``)).toBe(true);
  });

  it('outruns a backtick run inside an unimported entry', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-a.md':
        '---\nfrontier: ticket\nid: T1\ntitle: A\nstatus: open\nnote: "````x"\n---\n\nBody.\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const out = await frontier.call('get_tickets', { ids: ['T1'] });

    expect(out).toContain(`${HEADING}\n\n\`\`\`\`\`yaml\nnote: "\`\`\`\`x"\n\`\`\`\`\``);
  });

  it('never names an unimported key on a Board', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-a.md':
        '---\nfrontier: ticket\nid: T1\ntitle: A\nstatus: open\nlabels: bug\n---\n\nBody.\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const out = await frontier.call('get_board', { effort: 'alpha' });

    expect(out).not.toContain('labels');
    expect(out).not.toContain(HEADING);
  });
});

describe('the Unimported count', () => {
  it('counts stray keys with or without an id, and never a file that is not a Ticket', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-a.md': fenced({ labels: 'bug', title: 'Export A' }),
      '.scratch/alpha/issues/02-T2-b.md': fenced({ id: 'T2', labels: 'bug', title: 'Export B' }),
      '.scratch/alpha/issues/03-c.md': '# Prose only\n\nStatus: open\n',
      '.scratch/alpha/issues/04-d.md':
        '---\n- not\n- a mapping\n---\n\n# Bad fence\n\nStatus: open\n',
      '.scratch/alpha/issues/05-e.md': fenced({ title: 'Conforming' }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });
    const warnings = board.slice(board.indexOf('warnings:')).split('\n');

    // 03 is prose and 04 is unmarked: neither is a Ticket, neither is counted.
    expect(warnings).toEqual(['warnings:', `  2/3 ${UNIMPORTED}`]);
  });

  it('shows no Unimported line when no Ticket holds a key outside the schema', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-a.md': fenced({ title: 'Conforming' }),
      '.scratch/alpha/issues/02-T2-b.md': ticket('T2', 'Also conforming'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('get_board', { effort: 'alpha' })).not.toContain('Unimported');
  });
});

const stray = (id: string | undefined): string =>
  `---\nfrontier: ticket\n${id === undefined ? '' : `id: ${id}\n`}title: Same\nlabels: [bug,  "ui"]  # kept\nstatus: open\nmilestone:\n  name: v2\n---\n\nBody prose.\n`;

async function reported(file: string, id: string | undefined, name: string) {
  const root = await makeFixtureTree({
    '.scratch/alpha/map.md': map('Somewhere.'),
    [`.scratch/alpha/issues/${file}`]: stray(id),
  });
  const frontier = await connectFrontier({ cwd: root, env: {} });
  const anonymous = (text: string): string =>
    text.replaceAll(`alpha.${name}`, 'NAME').replaceAll(name, 'NAME');

  const board = anonymous(await frontier.call('get_board', { effort: 'alpha' }));
  const shown = anonymous(await frontier.call('get_tickets', { ids: [name] }));
  await frontier.call('update_ticket', { id: name, drop_keys: ['labels'] });
  const partly = anonymous(await frontier.call('get_board', { effort: 'alpha' }));
  await frontier.call('update_ticket', { id: name, drop_keys: ['milestone'] });
  const cleared = anonymous(await frontier.call('get_board', { effort: 'alpha' }));
  const after = anonymous(await frontier.call('get_tickets', { ids: [name] }));
  const written = await readFile(join(root, '.scratch/alpha/issues', file), 'utf8');

  return { board, shown, partly, cleared, after, written };
}

describe('a stray key with and without an id', () => {
  it('reports the two identically apart from their names', async () => {
    const bare = await reported('01-plain.md', undefined, 'plain');
    const withId = await reported('01-T7-plain.md', 'T7', 'T7');

    expect(bare.board).toContain(`  1/1 ${UNIMPORTED}`);
    expect(
      bare.shown.endsWith(
        `${HEADING}\n\n\`\`\`yaml\nlabels: [bug,  "ui"]  # kept\nmilestone:\n  name: v2\n\`\`\``,
      ),
    ).toBe(true);
    expect(bare.partly).toContain(`  1/1 ${UNIMPORTED}`);
    expect(bare.cleared).not.toContain('warnings:');
    expect(bare.after).not.toContain(HEADING);
    expect(bare.written).toBe(
      '---\nfrontier: ticket\ntitle: Same\nstatus: open\n---\n\nBody prose.\n',
    );

    expect({ ...withId, written: withId.written.replace('id: T7\n', '') }).toEqual(bare);
  });
});
