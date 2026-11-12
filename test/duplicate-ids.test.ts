import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createMarkdownDriver } from '../src/storage/markdown/driver.ts';
import { map, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const A = '.scratch/alpha/issues/01-T5-first.md';
const B = '.scratch/beta/issues/01-T5-second.md';
const SAME = '.scratch/alpha/issues/02-T5-again.md';

async function crossEffort() {
  const root = await makeFixtureTree({
    '.scratch/alpha/map.md': map('Somewhere.'),
    '.scratch/beta/map.md': map('Elsewhere.'),
    [A]: ticket('T5', 'First claimant'),
    [B]: ticket('T5', 'Second claimant'),
    '.scratch/alpha/issues/03-T6-other.md': ticket('T6', 'Unrelated'),
  });
  return { root, frontier: await connectFrontier({ cwd: root, env: {} }) };
}

describe('a duplicate id', () => {
  it('warns on the Board and names every claimant file, across Efforts', async () => {
    const { frontier } = await crossEffort();

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).toContain(
      'duplicate ids, each carried by more than one Ticket file (1): ' +
        'T5 (alpha/issues/01-T5-first.md, beta/issues/01-T5-second.md)',
    );
  });

  it('warns within one Effort, as one grouped line however many ids collide', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [A]: ticket('T5', 'First'),
      [SAME]: ticket('T5', 'Again'),
      '.scratch/alpha/issues/03-T7-a.md': ticket('T7', 'Seven'),
      '.scratch/alpha/issues/04-T7-b.md': ticket('T7', 'Seven again'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });
    const lines = board.split('\n').filter(line => line.includes('duplicate ids'));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('(2)');
    expect(lines[0]).toContain('T5 (alpha/issues/01-T5-first.md, alpha/issues/02-T5-again.md)');
    expect(lines[0]).toContain('T7 (alpha/issues/03-T7-a.md, alpha/issues/04-T7-b.md)');
  });

  it('says nothing when every id is carried once', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [A]: ticket('T5', 'Only'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('get_board', { effort: 'alpha' })).not.toContain('duplicate');
  });

  it('get_tickets shows every claimant and says there is more than one', async () => {
    const { frontier } = await crossEffort();

    const text = await frontier.call('get_tickets', { ids: ['T5'] });

    expect(text).toContain('T5 is carried by 2 Tickets');
    expect(text).toContain('First claimant');
    expect(text).toContain('Second claimant');
  });

  it('refuses an update and names both files, writing nothing', async () => {
    const { root, frontier } = await crossEffort();
    const before = await Promise.all([A, B].map(path => readFile(join(root, path), 'utf8')));

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T5',
      claim: { by: 'agent-1' },
    });

    expect(error).toContain('Nothing was written: T5 is carried by 2 Ticket files');
    expect(error).toContain('alpha/issues/01-T5-first.md, beta/issues/01-T5-second.md');
    expect(error).toContain('never renumbers');
    const after = await Promise.all([A, B].map(path => readFile(join(root, path), 'utf8')));
    expect(after).toEqual(before);
  });

  it('refuses before any rule judges the first claimant alone', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [A]: ticket('T5', 'First', { status: 'resolved' }),
      [SAME]: ticket('T5', 'Again'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T5',
      claim: { by: 'agent-1' },
    });

    expect(error).toContain('alpha/issues/01-T5-first.md, alpha/issues/02-T5-again.md');
  });

  it('leaves an unduplicated neighbour writable', async () => {
    const { frontier } = await crossEffort();

    expect(await frontier.call('update_ticket', { id: 'T6', claim: { by: 'agent-1' } })).toContain(
      'T6 updated',
    );
  });

  it('migrate_effort refuses when an inferred id already exists elsewhere', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': '',
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/beta/map.md': map('Elsewhere.'),
      '.scratch/alpha/issues/01-foreign.md': '# T5 — Foreign claimant\n\nStatus: open\n\nBody.\n',
      [B]: ticket('T5', 'Schema claimant'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const foreign = join(root, '.scratch/alpha/issues/01-foreign.md');
    const before = await readFile(foreign, 'utf8');

    const error = await frontier.callExpectingError('migrate_effort', { effort: 'alpha' });

    expect(error).toContain('Nothing was written: T5 is carried by 2 Ticket files');
    expect(error).toContain('alpha/issues/01-foreign.md, beta/issues/01-T5-second.md');
    expect(await readFile(foreign, 'utf8')).toBe(before);
  });

  it('keeps every open claimant of a duplicated id off the Frontier, since none can be taken', async () => {
    const { frontier } = await crossEffort();

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).toMatch(/^T5 {2}First claimant /m);
    expect(board).toMatch(/^> T6 {2}Unrelated /m);
  });

  it('keeps both same-Effort claimants on the real id, with no handle reaching just one', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [A]: ticket('T5', 'First', { body: 'Prose of the first.' }),
      [SAME]: ticket('T5', 'Again', { body: 'Prose of the second.' }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const before = await Promise.all([A, SAME].map(path => readFile(join(root, path), 'utf8')));

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toMatch(/^(> )?T5 {2}First /m);
    expect(board).toMatch(/^(> )?T5 {2}Again /m);
    expect(board).not.toContain('T5.2');
    expect(board).toContain('T5 (alpha/issues/01-T5-first.md, alpha/issues/02-T5-again.md)');

    const refused = await frontier.callExpectingError('update_ticket', {
      id: 'T5',
      claim: { by: 'agent-1' },
    });
    expect(refused).toContain('alpha/issues/01-T5-first.md, alpha/issues/02-T5-again.md');
    // The fix is a human renumbering one file by hand; no handle routes around it.
    const errors = await Promise.all(
      ['T5.2', 'alpha#2', 'alpha#1'].map(handle =>
        frontier.callExpectingError('update_ticket', { id: handle, claim: { by: 'agent-1' } }),
      ),
    );
    for (const error of errors) expect(error).not.toContain('updated');
    const after = await Promise.all([A, SAME].map(path => readFile(join(root, path), 'utf8')));
    expect(after).toEqual(before);

    const text = await frontier.call('get_tickets', { ids: ['T5'] });
    expect(text).toContain('T5 is carried by 2 Tickets');
    expect(text.match(/Prose of the first\./g)).toHaveLength(1);
    expect(text.match(/Prose of the second\./g)).toHaveLength(1);
  });

  it('never lets a write probe the duplicate: a duplicate fixed by hand under a stale scan just writes', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [A]: ticket('T5', 'First'),
      [SAME]: ticket('T5', 'Again'),
    });
    const frontier = await connectFrontier({
      cwd: root,
      env: {},
      // The watcher never invalidates within the test, so the cached scan
      // still shows the duplicate after the hand fix.
      createDriver: driverRoot =>
        createMarkdownDriver(driverRoot, { watcherDebounceMs: 60_000, watcherSettleMs: [] }),
    });
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('duplicate ids');

    await unlink(join(root, SAME));

    expect(await frontier.call('update_ticket', { id: 'T5', claim: { by: 'agent-1' } })).toContain(
      'T5 updated',
    );
    expect(await readFile(join(root, A), 'utf8')).toContain('claimed_by: agent-1');
  });

  it('ties the Board warning to the scan its lines come from, not to a later fresh walk', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      [A]: ticket('T5', 'First'),
      [SAME]: ticket('T5', 'Again'),
    });
    const frontier = await connectFrontier({
      cwd: root,
      env: {},
      createDriver: driverRoot =>
        createMarkdownDriver(driverRoot, { watcherDebounceMs: 60_000, watcherSettleMs: [] }),
    });
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('duplicate ids');

    await unlink(join(root, SAME));
    // get_tickets walks fresh and sees one claimant; the cached Board must not
    // drop its warning while it still prints both lines.
    expect(await frontier.call('get_tickets', { ids: ['T5'] })).not.toContain('carried by');
    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('Again');
    expect(board).toContain('duplicate ids');
  });

  it('caps the warning at three ids with files, ten more by name, then a count', async () => {
    const tree: Record<string, string> = { '.scratch/alpha/map.md': map('Somewhere.') };
    for (let n = 10; n < 40; n += 1) {
      tree[`.scratch/alpha/issues/${String(n)}-T${String(n)}-a.md`] = ticket(`T${String(n)}`, 'A');
      tree[`.scratch/beta/issues/${String(n)}-T${String(n)}-b.md`] = ticket(`T${String(n)}`, 'B');
    }
    const frontier = await connectFrontier({ cwd: await makeFixtureTree(tree), env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });
    const lines = board.split('\n').filter(line => line.includes('duplicate ids'));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      '  duplicate ids, each carried by more than one Ticket file (30): ' +
        'T10 (alpha/issues/10-T10-a.md, beta/issues/10-T10-b.md); ' +
        'T11 (alpha/issues/11-T11-a.md, beta/issues/11-T11-b.md); ' +
        'T12 (alpha/issues/12-T12-a.md, beta/issues/12-T12-b.md); ' +
        'also T13 T14 T15 T16 T17 T18 T19 T20 T21 T22 and 17 more — ' +
        'writes to them are refused; renumber all but one by hand',
    );
  });

  it('names a counted pattern as the likely cause, and only under one', async () => {
    const files = {
      '.scratch/alpha/map.md': map('Somewhere.'),
      [A]: ticket('T5', 'First'),
      [SAME]: ticket('T5', 'Again'),
    };
    const counted = await connectFrontier({
      cwd: await makeFixtureTree({ ...files, '.scratch/frontier.yml': 'id_pattern: T<N>\n' }),
      env: {},
    });
    const random = await connectFrontier({
      cwd: await makeFixtureTree({
        ...files,
        '.scratch/frontier.yml': 'id_pattern: T<N>-<b36{4}>\n',
      }),
      env: {},
    });

    expect(await counted.call('get_board', { effort: 'alpha' })).toContain(
      'renumber all but one by hand; the counted id pattern T<N> is the likely cause',
    );
    expect(await random.call('get_board', { effort: 'alpha' })).not.toContain('likely cause');
  });

  it('keeps a Ticket blocked by a duplicated id off the Frontier until every claimant resolves', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/beta/map.md': map('Elsewhere.'),
      [A]: ticket('T5', 'Done here', { status: 'resolved', answer_gist: 'yes' }),
      [B]: ticket('T5', 'Open there'),
      '.scratch/alpha/issues/03-T6-waits.md': ticket('T6', 'Waits', { blocked_by: ['T5'] }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('frontier: none takeable in this Effort');
    expect(board).not.toMatch(/^> T6/m);
  });

  it('refuses an Edge closing a cycle through a claimant other than the first scanned', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/beta/map.md': map('Elsewhere.'),
      [A]: ticket('T5', 'First'),
      [B]: ticket('T5', 'Second', { blocked_by: ['T7'] }),
      '.scratch/alpha/issues/03-T7-other.md': ticket('T7', 'Other'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T7',
      blocked_by: ['T5'],
    });
    expect(error).toContain('T7 -> T5 -> T7');
  });

  it('migrate_effort preview reports an inferred duplicate beside the rest of the plan, writing nothing', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': '',
      '.scratch/frontier.yml': 'id_pattern: T<N>\n',
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/beta/map.md': map('Elsewhere.'),
      '.scratch/alpha/issues/01-foreign.md': '# T5 — Foreign claimant\n\nStatus: open\n\nBody.\n',
      '.scratch/alpha/issues/02-plain.md': '# Untitled work\n\nStatus: open\n\nBody.\n',
      [B]: ticket('T5', 'Schema claimant'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const foreign = join(root, '.scratch/alpha/issues/01-foreign.md');
    const before = await readFile(foreign, 'utf8');

    const preview = await frontier.call('migrate_effort', { effort: 'alpha', preview: true });

    expect(preview).toContain('preview — would migrate 2');
    expect(preview).toContain(
      'duplicate id, carried by alpha/issues/01-foreign.md, beta/issues/01-T5-second.md — ' +
        'a real run refuses',
    );
    expect(preview).toContain('T6  Untitled work');
    expect(await readFile(foreign, 'utf8')).toBe(before);
    expect(await frontier.callExpectingError('migrate_effort', { effort: 'alpha' })).toContain(
      'Nothing was written: T5 is carried by 2 Ticket files',
    );
  });
});

describe('a refused update on a Foreign Ticket', () => {
  it.each([
    ['resolving one already resolved', 'Status: resolved', { resolve: { gist: 'again' } }],
    ['releasing one nobody holds', 'Status: open', { release: true }],
  ])('leaves the file byte-identical when %s', async (_name, status, request) => {
    const file = '.scratch/alpha/issues/01-foreign.md';
    const root = await makeFixtureTree({
      '.git/HEAD': '',
      '.scratch/alpha/map.md': map('Somewhere.'),
      [file]: `# T5 — Foreign\n\n${status}\n\nBody.\n`,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const before = await readFile(join(root, file), 'utf8');

    await frontier.callExpectingError('update_ticket', { id: 'T5', ...request });

    expect(await readFile(join(root, file), 'utf8')).toBe(before);
  });
});
