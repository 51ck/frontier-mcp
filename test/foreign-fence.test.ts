import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const FILE = '.scratch/alpha/issues/01-foreign.md';

function fenced(fields: Record<string, string>, body = 'Body prose.'): string {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`;
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

describe('a non-conforming frontmatter fence on read', () => {
  it('flags a fence with no id and a foreign key as Foreign', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: fenced({ labels: 'bug', title: 'GitHub export' }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).toContain(
      '1/1 Tickets have a foreign fence — title, status and Edges came from frontmatter that was not imported',
    );
    expect(board).not.toContain('are Foreign');
    expect(ticketLine(board)).toContain('alpha#1');
  });

  it('surfaces fenced status: closed as unrecognized and keeps it off the Frontier', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: fenced({ title: 'Closed export', status: 'closed' }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(ticketLine(board)).toContain('/open');
    expect(board).toContain('unrecognized status');
    expect(board).toContain('kept off the Frontier');
    expect(board).toContain('alpha#1 "closed"');
    expect(marked(board)).toEqual([]);
  });

  it('keeps a foreign fence with extra keys and status: closed off the Frontier', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: fenced({ github: '123', title: 'Both problems', status: 'closed' }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).toContain(
      '1/1 Tickets have a foreign fence — title, status and Edges came from frontmatter that was not imported',
    );
    expect(board).not.toContain('are Foreign');
    expect(board).toContain('unrecognized status');
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

  it('does not rewrite a foreign fence file on get_board', async () => {
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

describe('get_tickets on a foreign fence', () => {
  it('appends the raw fence as a yaml block, byte-identical', async () => {
    const raw = 'labels: [bug, "ui"]   # trailing comment\ntitle: GitHub export\nnumber: 0042';
    const contents = `---\n${raw}\n---\n\nBody prose.\n`;
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: contents,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const out = await frontier.call('get_tickets', { ids: ['alpha#1'] });

    expect(out.endsWith(`Body prose.\n\n${HEADING}\n\n\`\`\`yaml\n${raw}\n\`\`\``)).toBe(true);
  });

  it('outruns a backtick fence inside the raw yaml', async () => {
    const raw = 'title: GitHub export\nlabels: bug\nnote: |\n  ```\n  code\n  ````';
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: `---\n${raw}\n---\n\nBody prose.\n`,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const out = await frontier.call('get_tickets', { ids: ['alpha#1'] });

    expect(out).toContain(`${HEADING}\n\n\`\`\`\`\`yaml\n${raw}\n\`\`\`\`\``);
  });

  it('leaves the file bytes and mtime unchanged', async () => {
    const contents = fenced({ labels: 'bug', title: 'GitHub export' });
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: contents,
    });
    const before = await stat(join(root, FILE));
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('get_tickets', { ids: ['alpha#1'] });

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

  it('keeps the block after a comment, which leaves the fence foreign', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: fenced({ labels: 'bug', title: 'GitHub export' }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('update_ticket', { id: 'alpha#1', comment: 'Migrating.' });

    expect(await frontier.call('get_tickets', { ids: ['alpha#1'] })).toContain(HEADING);
  });

  it('keeps only the unimported entries once migrate_effort has minted an id', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [FILE]: fenced({ labels: 'bug', title: 'GitHub export' }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const report = await frontier.call('migrate_effort', { effort: 'alpha', preview: false });
    // The minted id leads its report line as a reference label, whatever shape
    // the pattern gives it.
    const id = report
      .split('\n')
      .find(line => line.includes('  GitHub export  '))
      ?.split('  ')[0]
      ?.slice(1, -1);

    expect(id).toBeDefined();
    const out = await frontier.call('get_tickets', { ids: [id ?? ''] });
    expect(out).toContain('GitHub export');
    expect(out.endsWith(`${HEADING}\n\n\`\`\`yaml\nlabels: bug\n\`\`\``)).toBe(true);
  });

  it('shows a hand-annotated Ticket its stray entries verbatim, not id or status', async () => {
    const contents =
      '---\nid: T1\nlabels: [bug,  "ui"]  # kept\ntitle: Annotated\nstatus: open\nmilestone:\n  name: v2\n  due: 2026-12-01\nblocked_by: []\n---\n\nBody prose.\n';
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

  it('outruns a backtick run inside an unimported entry', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-a.md': '---\nid: T1\ntitle: A\nnote: "````x"\n---\n\nBody.\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const out = await frontier.call('get_tickets', { ids: ['T1'] });

    expect(out).toContain(`${HEADING}\n\n\`\`\`\`\`yaml\nnote: "\`\`\`\`x"\n\`\`\`\`\``);
  });

  it('never puts unimported keys on a Board', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-a.md': '---\nid: T1\ntitle: A\nlabels: bug\n---\n\nBody.\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const out = await frontier.call('get_board', { effort: 'alpha' });

    expect(out).not.toContain('labels');
    expect(out).not.toContain(HEADING);
  });
});

describe("where a Foreign Ticket's fields came from (T104)", () => {
  it('counts a foreign fence and an unfenced file in separate grouped warnings', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-a.md': fenced({ labels: 'bug', title: 'Export A' }),
      '.scratch/alpha/issues/02-b.md': fenced({ labels: 'bug', title: 'Export B' }),
      '.scratch/alpha/issues/03-c.md': '# Prose only\n\nStatus: open\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });
    const warnings = board.slice(board.indexOf('warnings:')).split('\n');

    expect(warnings).toContain(
      '  1/3 Tickets are Foreign — title, status and Edges are inferred, not read from schema ' +
        'frontmatter. Run migrate_effort to normalize.',
    );
    expect(warnings).toContain(
      '  2/3 Tickets have a foreign fence — title, status and Edges came from frontmatter that ' +
        'was not imported; get_tickets shows the rest of it. Run migrate_effort to normalize.',
    );
    expect(warnings.filter(line => line.includes('foreign fence'))).toHaveLength(1);
    expect(warnings.some(line => line.includes('alpha#1') && line.includes('fence'))).toBe(false);
  });
});
