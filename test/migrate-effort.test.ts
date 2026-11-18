import { access, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import {
  cleanupFixtures,
  connectFrontier,
  makeFixtureTree,
  makeForeignWorkspace,
} from './support/harness.ts';

afterEach(cleanupFixtures);

/** A Foreign Ticket carrying a T-id in its heading — sobrina's shape. */
const FOREIGN_WITH_ID = `# T30 — Grammy group boot

Status: open

**Problem:** Without a running group bot entry, no Telegram MVP path is real.

**Depends on:** T31 ([02-identity-bridge.md](02-identity-bridge.md))

**Tasks:**

- [ ] **T30.1** Bot factory reading the token
`;

/** A Foreign Ticket identified only by its filename number — tag-customizer's shape. */
const FOREIGN_NO_ID = `# 01 — Is the colour-space fix a latent bug?

Type: research
Status: open
Blocked by: —

The measured value was wrong in the same way.
`;

/** A second id-less Ticket, naming the first by its sort order. */
const FOREIGN_NO_ID_TWO = `# 02 — Port the texture leak fix

Status: open
Blocked by: 01
`;

function plain(title: string): string {
  return `---\ntitle: ${title}\nkind: build\nstatus: open\nblocked_by: []\n---\n`;
}

describe('migrate_effort', () => {
  it('normalizes an Effort of Foreign Tickets to the schema in one call', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-grammy-group-boot.md': FOREIGN_WITH_ID,
      '.scratch/alpha/issues/02-identity-bridge.md':
        '# T31 — Identity bridge\n\nStatus: open\n\nBody.\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const report = await frontier.call('migrate_effort', { effort: 'alpha' });

    expect(report).toContain('alpha:');
    expect(report.toLowerCase()).toContain('migrated');

    const onDisk = await readFile(
      join(root, '.scratch/alpha/issues/01-grammy-group-boot.md'),
      'utf8',
    );
    expect(onDisk.startsWith('---\n')).toBe(true);
    expect(onDisk).toContain('id: T30');
    expect(onDisk).toContain('title: Grammy group boot');
    expect(onDisk).toContain('status: open');
    expect(onDisk).toContain('blocked_by:');
    expect(onDisk).toContain('T31');

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).not.toContain('are Foreign');
  });

  it('preserves existing ids verbatim, including T31-style ids from titles', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-grammy-group-boot.md': FOREIGN_WITH_ID,
      '.scratch/alpha/issues/02-identity-bridge.md':
        '# T31 — Identity bridge\n\nStatus: open\n\nBody.\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('migrate_effort', { effort: 'alpha' });

    const t30 = await readFile(join(root, '.scratch/alpha/issues/01-grammy-group-boot.md'), 'utf8');
    const t31 = await readFile(join(root, '.scratch/alpha/issues/02-identity-bridge.md'), 'utf8');
    expect(t30).toContain('id: T30');
    expect(t31).toContain('id: T31');
  });

  it('turns Depends-on prose Edges into blocked_by entries', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-grammy-group-boot.md': FOREIGN_WITH_ID,
      '.scratch/alpha/issues/02-identity-bridge.md':
        '# T31 — Identity bridge\n\nStatus: open\n\nBody.\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('migrate_effort', { effort: 'alpha' });

    const onDisk = await readFile(
      join(root, '.scratch/alpha/issues/01-grammy-group-boot.md'),
      'utf8',
    );
    expect(onDisk).toMatch(/blocked_by:\s*\[T31\]/);
  });

  it('resolves a bare sort-order Blocked-by Edge to the name of the Ticket carrying that prefix', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-colour.md': FOREIGN_NO_ID,
      '.scratch/alpha/issues/02-texture.md': FOREIGN_NO_ID_TWO,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const before = await frontier.call('get_board', { effort: 'alpha' });
    expect(before).toContain('texture  Port the texture leak fix  build/open  blocked_by=01?');

    await frontier.call('migrate_effort', { effort: 'alpha' });

    const texture = await readFile(join(root, '.scratch/alpha/issues/02-texture.md'), 'utf8');
    expect(texture).toMatch(/blocked_by:\s*\[colour\]/);
    expect(texture).not.toMatch(/^id:/m);
    const after = await frontier.call('get_board', { effort: 'alpha' });
    expect(after).toContain('texture  Port the texture leak fix  build/open  blocked_by=colour');
    expect(after).not.toContain('dangling');
  });

  it('keeps inferred prose verbatim after normalization', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-grammy-group-boot.md': FOREIGN_WITH_ID,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('migrate_effort', { effort: 'alpha' });

    const onDisk = await readFile(
      join(root, '.scratch/alpha/issues/01-grammy-group-boot.md'),
      'utf8',
    );
    expect(onDisk).toContain('**Problem:** Without a running group bot entry');
    expect(onDisk).toContain('- [ ] **T30.1** Bot factory reading the token');
    expect(onDisk).toContain('**Depends on:** T31');
  });

  it('mints nothing: a Ticket with no id keeps its name, on disk, in the report and on the Board', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-colour.md': FOREIGN_NO_ID,
      '.scratch/alpha/issues/02-texture.md': FOREIGN_NO_ID_TWO,
      '.scratch/beta/map.md': map('Elsewhere.'),
      '.scratch/beta/issues/01-T5-existing.md': ticket('T5', 'Already there'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const report = await frontier.call('migrate_effort', { effort: 'alpha' });

    expect(report).not.toMatch(/\bT\d|mint|\bwas\b/);
    const written = await Promise.all(
      ['01-colour.md', '02-texture.md'].map(file =>
        readFile(join(root, '.scratch/alpha/issues', file), 'utf8'),
      ),
    );
    for (const onDisk of written) {
      expect(onDisk.startsWith('---\ntitle: ')).toBe(true);
      expect(onDisk).not.toMatch(/^id:/m);
    }

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('> colour  Is the colour-space fix a latent bug?');
    expect(board).toContain('texture  Port the texture leak fix');
    expect(await frontier.call('get_tickets', { ids: ['alpha.texture'] })).toContain(
      'Blocked by: 01',
    );
    expect(await readdir(join(root, '.scratch'))).not.toContain(expect.stringMatching(/guard/));
  });

  it('leaves filenames alone by default so relative links still resolve', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-grammy-group-boot.md': FOREIGN_WITH_ID,
      '.scratch/alpha/issues/02-identity-bridge.md':
        '# T31 — Identity bridge\n\nStatus: open\n\nSee [boot](01-grammy-group-boot.md).\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('migrate_effort', { effort: 'alpha' });

    const names = await readdir(join(root, '.scratch/alpha/issues'));
    expect(names.toSorted()).toEqual(['01-grammy-group-boot.md', '02-identity-bridge.md']);

    const linker = await readFile(
      join(root, '.scratch/alpha/issues/02-identity-bridge.md'),
      'utf8',
    );
    expect(linker).toContain('](01-grammy-group-boot.md)');
    await access(join(root, '.scratch/alpha/issues/01-grammy-group-boot.md'));
  });

  it('has no rename argument', async () => {
    const root = await makeFixtureTree({ '.scratch/alpha/map.md': map('Somewhere.') });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const tools = await frontier.client.listTools();
    const migrate = tools.tools.find(tool => tool.name === 'migrate_effort');
    expect(Object.keys(migrate?.inputSchema.properties ?? {}).toSorted()).toEqual([
      'effort',
      'preview',
      'root',
    ]);
  });

  it('preview names every Ticket by the name it has, linked reference-style', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-grammy-group-boot.md': `# T30 — Grammy group boot

Status: open

**Problem:** Without a running group bot entry, no Telegram MVP path is real.
`,
      '.scratch/alpha/issues/02-colour.md': FOREIGN_NO_ID,
      '.scratch/alpha/issues/03-texture.md': `# 03 — Port the texture leak fix

Status: open
Blocked by: 02, 01
`,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const before = await readFile(join(root, '.scratch/alpha/issues/02-colour.md'), 'utf8');
    const report = await frontier.call('migrate_effort', { effort: 'alpha', preview: true });

    expect(report).toBe(
      [
        'alpha: preview — would migrate 3',
        '[T30]  Grammy group boot  normalize',
        '[colour]  Is the colour-space fix a latent bug?  normalize',
        '[texture]  Port the texture leak fix  normalize+edges  blocked_by=[colour],[T30]',
        '',
        '[T30]: <.scratch/alpha/issues/01-grammy-group-boot.md>',
        '[colour]: <.scratch/alpha/issues/02-colour.md>',
        '[texture]: <.scratch/alpha/issues/03-texture.md>',
      ].join('\n'),
    );
    expect(report).not.toContain('#');
    expect(await readFile(join(root, '.scratch/alpha/issues/02-colour.md'), 'utf8')).toBe(before);
    expect(await readdir(join(root, '.scratch/alpha/issues'))).toHaveLength(3);
  });

  it('preview and real run report the same names line for line, and a second preview is identical', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-colour.md': FOREIGN_NO_ID,
      '.scratch/alpha/issues/02-texture.md': FOREIGN_NO_ID_TWO,
      '.scratch/alpha/issues/03-grammy.md': FOREIGN_WITH_ID,
      '.scratch/alpha/issues/04-T31-bridge.md': ticket('T31', 'Identity bridge'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const first = await frontier.call('migrate_effort', { effort: 'alpha', preview: true });
    const second = await frontier.call('migrate_effort', { effort: 'alpha', preview: true });
    const real = await frontier.call('migrate_effort', { effort: 'alpha' });

    expect(second).toBe(first);
    const [header, ...planned] = first.split('\n');
    expect(header).toBe('alpha: preview — would migrate 3, unchanged 1');
    expect(planned).toContain(
      '[texture]  Port the texture leak fix  normalize+edges  blocked_by=[colour]',
    );
    expect(real.split('\n')).toEqual([
      expect.stringMatching(/^root: /),
      'alpha: migrated 3, unchanged 1',
      ...planned,
    ]);
  });

  it('a real run labels each line by its name and links the unchanged file', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-colour.md': FOREIGN_NO_ID,
      '.scratch/alpha/issues/02-texture.md': FOREIGN_NO_ID_TWO,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const report = await frontier.call('migrate_effort', { effort: 'alpha' });

    expect(report).toContain('[colour]  Is the colour-space fix a latent bug?  normalize\n');
    expect(report).toContain(
      '[texture]  Port the texture leak fix  normalize+edges  blocked_by=[colour]',
    );
    expect(report).toContain('[colour]: <.scratch/alpha/issues/01-colour.md>');
    expect(report).toContain('[texture]: <.scratch/alpha/issues/02-texture.md>');
    expect(await readdir(join(root, '.scratch/alpha/issues'))).toEqual([
      '01-colour.md',
      '02-texture.md',
    ]);
  });

  it('ignores unrecognized files in the Effort directory', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-grammy-group-boot.md': FOREIGN_WITH_ID,
      '.scratch/alpha/research/notes.md': '# Scratch research, not a Ticket\n',
      '.scratch/alpha/backlog.md': '# Not a header doc\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('migrate_effort', { effort: 'alpha' });

    const research = await readFile(join(root, '.scratch/alpha/research/notes.md'), 'utf8');
    expect(research).toBe('# Scratch research, not a Ticket\n');
    const backlog = await readFile(join(root, '.scratch/alpha/backlog.md'), 'utf8');
    expect(backlog).toBe('# Not a header doc\n');
  });

  it('skips Tickets that are already schema-conformant with an id', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-done.md': `---
id: T1
title: Already migrated
kind: build
status: open
blocked_by: []
---

# T1 — Already migrated

Body.
`,
      '.scratch/alpha/issues/02-foreign.md': FOREIGN_WITH_ID,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const before = await readFile(join(root, '.scratch/alpha/issues/01-T1-done.md'), 'utf8');
    const report = await frontier.call('migrate_effort', { effort: 'alpha' });

    expect(report).toContain('T30');
    expect(report).not.toMatch(/\bT1\b.*migrat/i);

    const after = await readFile(join(root, '.scratch/alpha/issues/01-T1-done.md'), 'utf8');
    expect(after).toBe(before);
  });

  it('leaves a write-normalized file with no id exactly as it is', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-no-id.md': FOREIGN_NO_ID,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('update_ticket', { id: 'no-id', claim: { by: 'agent-7' } });
    const file = join(root, '.scratch/alpha/issues/01-no-id.md');
    const normalized = await readFile(file, 'utf8');

    const report = await frontier.call('migrate_effort', { effort: 'alpha' });

    expect(report).toBe('alpha: migrated 0, unchanged 1\n(nothing to migrate)');
    expect(await readFile(file, 'utf8')).toBe(normalized);
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('no-id  Is the colour');
  });

  it('writes nothing to an Effort where nothing needs doing, and says so without a root line', async () => {
    const files = {
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-one.md': ticket('T1', 'One'),
      '.scratch/alpha/issues/two.md':
        '---\ntitle: Two\nkind: build\nstatus: open\nblocked_by: [T1]\n---\n',
    };
    const root = await makeFixtureTree(files);
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const stamps = () =>
      Promise.all(Object.keys(files).map(async file => (await stat(join(root, file))).mtimeMs));
    const before = await stamps();

    expect(await frontier.call('migrate_effort', { effort: 'alpha', preview: true })).toBe(
      'alpha: preview — would migrate 0, unchanged 2\n(nothing to migrate)',
    );
    expect(await frontier.call('migrate_effort', { effort: 'alpha' })).toBe(
      'alpha: migrated 0, unchanged 2\n(nothing to migrate)',
    );

    expect(await stamps()).toEqual(before);
    expect(
      await Promise.all(Object.keys(files).map(file => readFile(join(root, file), 'utf8'))),
    ).toEqual(Object.values(files));
    expect((await readdir(join(root, '.scratch/alpha/issues'))).toSorted()).toEqual([
      '01-T1-one.md',
      'two.md',
    ]);
  });

  it('rewrites only the Edge list of a fenced Ticket whose sort-order Edge it resolves', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-base.md':
        '---\ntitle: Base\nstatus: open\nblocked_by: []\n---\n\nBase body.\n',
      '.scratch/alpha/issues/02-next.md':
        '---\n# kept\nowner: someone\ntitle: Next\nstatus: open\nblocked_by: [01, T9]\n---\n\nNext body.\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const report = await frontier.call('migrate_effort', { effort: 'alpha' });

    expect(report).toContain('alpha: migrated 1, unchanged 1');
    expect(report).toContain('[next]  Next  edges  blocked_by=base,T9');
    expect(await readFile(join(root, '.scratch/alpha/issues/02-next.md'), 'utf8')).toBe(
      '---\n# kept\nowner: someone\ntitle: Next\nstatus: open\nblocked_by: [base, T9]\n---\n\nNext body.\n',
    );
  });

  it('leaves a sort-order Edge to dangle when two files carry the prefix, or digits already name a Ticket', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-a.md': '# A\n\nStatus: open\n',
      '.scratch/alpha/issues/01-b.md': '# B\n\nStatus: open\n',
      '.scratch/alpha/issues/02-c.md': '# C\n\nStatus: open\n',
      '.scratch/alpha/issues/02.md': '# Two\n\nStatus: open\n',
      '.scratch/alpha/issues/03-d.md': '# D\n\nStatus: open\nBlocked by: 01, 02\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const report = await frontier.call('migrate_effort', { effort: 'alpha' });

    expect(report).toContain('[d]  D  normalize  blocked_by=01,[02]');
    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('d  D  build/open  blocked_by=01?,02');
  });

  it('puts a Ticket on the Frontier once its sort-order Edge names the resolved Ticket it meant', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/001-a.md':
        '---\ntitle: A\nkind: build\nstatus: resolved\nanswer_gist: Yes.\nblocked_by: []\n---\n',
      '.scratch/alpha/issues/c.md':
        '---\ntitle: C\nkind: build\nstatus: open\nblocked_by: [01]\n---\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const before = await frontier.call('get_board', { effort: 'alpha' });
    expect(before).toContain('frontier: none takeable in this Effort');
    expect(before).toContain('c  C  build/open  blocked_by=01?');

    expect(await frontier.call('migrate_effort', { effort: 'alpha' })).toContain(
      'alpha: migrated 1, unchanged 1\n[c]  C  edges  blocked_by=a\n',
    );

    expect(await readFile(join(root, '.scratch/alpha/issues/c.md'), 'utf8')).toContain(
      'blocked_by: [a]',
    );
    const after = await frontier.call('get_board', { effort: 'alpha' });
    expect(after).toContain('> c  C  build/open  blocked_by=a');
    expect(after).not.toContain('dangling');
  });

  it('never rewrites a sort-order Edge onto the Ticket carrying it, and reports it unresolved', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-a.md': '# A\n\nStatus: open\nBlocked by: 01\n',
      '.scratch/alpha/issues/02-b.md':
        '---\ntitle: B\nkind: build\nstatus: open\nblocked_by: [02, 09]\n---\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const fenced = await readFile(join(root, '.scratch/alpha/issues/02-b.md'), 'utf8');

    const preview = await frontier.call('migrate_effort', { effort: 'alpha', preview: true });
    const report = await frontier.call('migrate_effort', { effort: 'alpha' });

    expect(report.split('\n').slice(2)).toEqual(preview.split('\n').slice(1));
    expect(report).toContain('alpha: migrated 1, unchanged 1\n[a]  A  normalize  blocked_by=01\n');
    expect(report).toContain(
      '> sort-order Edges kept as declared, no one other Ticket carries the prefix (3): ' +
        '01 02 09 — they dangle; fix each with update_ticket blocked_by',
    );
    expect(await readFile(join(root, '.scratch/alpha/issues/01-a.md'), 'utf8')).toMatch(
      /blocked_by: \["?01"?\]/,
    );
    expect(await readFile(join(root, '.scratch/alpha/issues/02-b.md'), 'utf8')).toBe(fenced);
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain(
      'a  A  build/open  blocked_by=01?',
    );
  });

  it('counts only Tickets it would write: a conflict keeps its line and stays unchanged', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-foo.md': plain('First'),
      '.scratch/alpha/issues/foo.md': plain('Second'),
      '.scratch/alpha/issues/z.md': plain('Third'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const conflict =
      'duplicate name, carried by alpha/issues/01-foo.md, alpha/issues/foo.md — a real run refuses';
    expect(await frontier.call('migrate_effort', { effort: 'alpha', preview: true })).toBe(
      [
        'alpha: preview — would migrate 0, unchanged 3',
        '(nothing to migrate)',
        `[01-foo.md]  First  ${conflict}`,
        `[foo.md]  Second  ${conflict}`,
        '',
        '[01-foo.md]: <.scratch/alpha/issues/01-foo.md>',
        '[foo.md]: <.scratch/alpha/issues/foo.md>',
      ].join('\n'),
    );
  });

  it('leaves a full-name Edge from another Effort resolving, since no id replaces the name', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-dep.md': '# 01 — Dep\n\nStatus: resolved\n',
      '.scratch/alpha/issues/02-next.md': '# 02 — Next\n\nStatus: open\nBlocked by: 01\n',
      '.scratch/beta/map.md': map('Elsewhere.'),
      '.scratch/beta/issues/far.md':
        '---\ntitle: Far\nkind: build\nstatus: open\nblocked_by: [alpha.dep, alpha.next]\n---\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const far = join(root, '.scratch/beta/issues/far.md');
    const written = await readFile(far, 'utf8');
    const before = await frontier.call('get_board', { effort: 'beta' });
    expect(before).toContain('far  Far  build/open  blocked_by=alpha.dep,alpha.next');

    const report = await frontier.call('migrate_effort', { effort: 'alpha' });

    expect(report).toContain('[next]  Next  normalize+edges  blocked_by=[dep]');
    expect(report).not.toContain('another Effort');
    expect(await frontier.call('get_board', { effort: 'beta' })).toBe(before);
    expect(await readFile(far, 'utf8')).toBe(written);

    await frontier.call('update_ticket', { id: 'alpha.next', resolve: { answer_gist: 'Done.' } });
    expect(await frontier.call('get_board', { effort: 'beta' })).toMatch(/^> far {2}Far/m);
  });

  it('refuses an unknown Effort slug', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('migrate_effort', { effort: 'missing' });
    expect(error).toContain('missing');
  });
});

describe('migrate_effort against real Foreign fixtures', () => {
  it('migrates sobrina telegram preserving every T-id', async () => {
    const root = await makeForeignWorkspace({ telegram: 'sobrina-telegram' });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const report = await frontier.call('migrate_effort', { effort: 'telegram' });
    expect(report.toLowerCase()).toContain('migrated');

    const board = await frontier.call('get_board', { effort: 'telegram' });
    expect(board).not.toContain('are Foreign');
    // `Depends on: … core T18.4` and three like it — each parent lives in an Effort the fixture lacks, so it is
    // written as declared and dangles, rather than coarsened onto a `T18` this repo never had.
    expect(board).toMatch(/blocked_by=T32,T33,T18\.4\?/);
    expect(report).toContain(
      'sub-slice Edges kept as declared, parent not in this Effort (4): T11.1 T18.4 T21.4 T21.5',
    );
    // Every sobrina Ticket carries a T3x id in its heading, and keeps it.
    expect(report).toContain('telegram: migrated 15\n');
    expect(report).not.toMatch(/mint|\bwas\b/);
    for (const id of [
      'T30',
      'T31',
      'T32',
      'T33',
      'T34',
      'T35',
      'T36',
      'T37',
      'T38',
      'T39',
      'T40',
      'T41',
      'T42',
      'T43',
      'T44',
    ]) {
      expect(board).toContain(id);
      expect(report).toContain(id);
    }

    // Filenames stay put by default — Maps and Tickets link by relative path.
    const names = await readdir(join(root, '.scratch/telegram/issues'));
    expect(names).toContain('01-grammy-group-boot.md');
    expect(names).toContain('02-identity-bridge.md');

    const t30 = await readFile(
      join(root, '.scratch/telegram/issues/01-grammy-group-boot.md'),
      'utf8',
    );
    expect(t30.startsWith('---\n')).toBe(true);
    expect(t30).toContain('id: T30');
  });

  it('migrates tag-customizer under the names its files give, leaving research/ alone', async () => {
    const root = await makeForeignWorkspace({ 'ship-0-5-0': 'tag-customizer-ship-0-5-0' });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const beforeResearch = await readFile(
      join(root, '.scratch/ship-0-5-0/research/01-srgb-data-maps.md'),
      'utf8',
    );
    const files = await readdir(join(root, '.scratch/ship-0-5-0/issues'));

    const preview = await frontier.call('migrate_effort', { effort: 'ship-0-5-0', preview: true });
    const report = await frontier.call('migrate_effort', { effort: 'ship-0-5-0' });
    expect(report.split('\n').slice(2)).toEqual(preview.split('\n').slice(1));
    expect(report).toContain('ship-0-5-0: migrated 7\n');
    expect(report).not.toMatch(/mint|\bwas\b/);
    expect(report).toContain(
      '[release-0-5-0]  Release 0.5.0  normalize+edges  ' +
        'blocked_by=[park-the-branch-rebuild-dev],[land-the-cheap-independents]',
    );

    const board = await frontier.call('get_board', { effort: 'ship-0-5-0' });
    expect(board).not.toContain('are Foreign');
    expect(board).not.toContain('dangling');
    expect(board).not.toMatch(/blocked_by=\S*\?/);
    expect(board).toContain(
      'park-the-branch-rebuild-dev  Park the branch and rebuild `dev` from beta.2  decision/resolved  ' +
        'blocked_by=srgb-data-maps-verdict,texture-leak-fix-portability,split-the-mixed-commits',
    );

    // Nothing was minted: no file gained an id, and each answers to its stem.
    expect(await readdir(join(root, '.scratch/ship-0-5-0/issues'))).toEqual(files);
    const written = await Promise.all(
      files.map(file => readFile(join(root, '.scratch/ship-0-5-0/issues', file), 'utf8')),
    );
    for (const onDisk of written) {
      expect(onDisk.startsWith('---\ntitle: ')).toBe(true);
      expect(onDisk).not.toMatch(/^id:/m);
    }
    const names = files.map(file => file.replace(/^\d+-|\.md$/g, ''));
    const fetched = await Promise.all(
      names.map(name => frontier.call('get_tickets', { ids: [name] })),
    );
    expect(fetched.map(text => text.split(' — ')[0])).toEqual(
      names.map(name => `# ship-0-5-0.${name}`),
    );

    expect(
      await readFile(join(root, '.scratch/ship-0-5-0/research/01-srgb-data-maps.md'), 'utf8'),
    ).toBe(beforeResearch);
    expect(await readdir(join(root, '.scratch'))).toEqual(['ship-0-5-0']);
  });

  // The baseline was recorded from the minting implementation at 163e847: both
  // Efforts are wholly resolved, so nothing was takeable after migration, and
  // with every Ticket reopened sobrina still had none (T30 hangs on Edges into
  // Efforts the fixture lacks) while tag-customizer had the four below, then
  // under minted ids.
  it.each([
    ['telegram', 'sobrina-telegram', []],
    [
      'ship-0-5-0',
      'tag-customizer-ship-0-5-0',
      [
        'srgb-data-maps-verdict',
        'texture-leak-fix-portability',
        'split-the-mixed-commits',
        'peer-dependency-question',
      ],
    ],
  ])('puts the Tickets on the Frontier that minting did (%s)', async (slug, fixture, expected) => {
    const root = await makeForeignWorkspace({ [slug]: fixture });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    await frontier.call('migrate_effort', { effort: slug });
    const migrated = await frontier.call('get_board', { effort: slug });
    expect(takeable(migrated)).toEqual([]);

    const names = migrated
      .split('\n')
      .filter(line => line.includes('/resolved'))
      .map(line => line.split('  ')[0] ?? '');
    expect(names).toHaveLength(slug === 'telegram' ? 15 : 7);
    await Promise.all(
      names.map(id =>
        frontier.call('update_ticket', { id, reopen: { reason: 'Frontier baseline.' } }),
      ),
    );

    expect(takeable(await frontier.call('get_board', { effort: slug }))).toEqual(expected);
  });

  it('preview against sobrina writes nothing', async () => {
    const root = await makeForeignWorkspace({ telegram: 'sobrina-telegram' });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const before = await readFile(
      join(root, '.scratch/telegram/issues/01-grammy-group-boot.md'),
      'utf8',
    );
    const report = await frontier.call('migrate_effort', {
      effort: 'telegram',
      preview: true,
    });

    expect(report.toLowerCase()).toContain('preview');
    expect(report).toContain('T30');

    const after = await readFile(
      join(root, '.scratch/telegram/issues/01-grammy-group-boot.md'),
      'utf8',
    );
    expect(after).toBe(before);
  });
});

function takeable(board: string): (string | undefined)[] {
  return board
    .split('\n')
    .filter(line => line.startsWith('> '))
    .map(line => line.slice(2).split('  ')[0]);
}

function ticketLines(board: string): string[] {
  return board.split('\n').filter(entry => entry.includes('Port') || entry.startsWith('frontier:'));
}

describe('migrate_effort preview is a faithful plan', () => {
  it('keeps a sub-slice whose parent is not in the Effort as declared, in preview and real run alike', async () => {
    const root = await makeFixtureTree({
      '.scratch/rewrite/map.md': map('Somewhere.'),
      '.scratch/rewrite/issues/01-port.md': '# Port\n\nStatus: open\nBlocked by: T1.4\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const preview = await frontier.call('migrate_effort', { effort: 'rewrite', preview: true });
    expect(preview).toContain('[port]  Port  normalize  blocked_by=T1.4');

    const report = await frontier.call('migrate_effort', { effort: 'rewrite' });
    expect(report).toContain('[port]  Port  normalize  blocked_by=T1.4');
    expect(await readFile(join(root, '.scratch/rewrite/issues/01-port.md'), 'utf8')).toMatch(
      /blocked_by: \[["']?T1\.4["']?\]/,
    );
  });

  it('labels two files carrying one id by filename, and brackets a spaced path', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01 x y.md': '# T31 — One\n\nStatus: open\n',
      '.scratch/alpha/issues/02-z.md': '# T31 — Two\n\nStatus: open\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const preview = await frontier.call('migrate_effort', { effort: 'alpha', preview: true });

    expect(preview).toContain('[01 x y.md]: <.scratch/alpha/issues/01 x y.md>');
    expect(preview).toContain('[02-z.md]: <.scratch/alpha/issues/02-z.md>');
    expect(preview).not.toContain('[T31]');
  });
});

describe('a prose sub-slice is coarsened only within its own Effort (T82)', () => {
  const OTHER_T1 = '---\nid: T1\ntitle: Unrelated\nstatus: resolved\nblocked_by: []\n---\n';

  async function crossEffort(blockedBy: string) {
    const root = await makeFixtureTree({
      '.scratch/consume/map.md': map('Elsewhere.'),
      '.scratch/consume/issues/01-T1-unrelated.md': OTHER_T1,
      '.scratch/rewrite/map.md': map('Somewhere.'),
      '.scratch/rewrite/issues/01-port.md': `# 01 — Port\n\nStatus: open\nBlocked by: ${blockedBy}\n`,
    });
    return { root, frontier: await connectFrontier({ cwd: root, env: {} }) };
  }

  const PORT = '.scratch/rewrite/issues/01-port.md';

  it('never coarsens a milestone label onto another Effort’s Ticket', async () => {
    const { root, frontier } = await crossEffort('T1.4');

    const preview = await frontier.call('migrate_effort', { effort: 'rewrite', preview: true });
    expect(preview).toContain('blocked_by=T1.4');
    expect(preview).toContain(
      'sub-slice Edges kept as declared, parent not in this Effort (1): T1.4 — they dangle; ' +
        'fix each with update_ticket blocked_by',
    );
    expect(preview).not.toContain('Edges to another Effort');

    await frontier.call('migrate_effort', { effort: 'rewrite' });
    const written = await readFile(join(root, PORT), 'utf8');
    expect(written).toMatch(/blocked_by: \[["']?T1\.4["']?\]/);
  });

  it('shows the same Board and Frontier before and after migration', async () => {
    const { frontier } = await crossEffort('T1.4');

    const before = await frontier.call('get_board', { effort: 'rewrite' });
    expect(before).toContain('blocked_by=T1.4?');
    expect(before).toContain('frontier: none takeable in this Effort');
    expect(before).not.toContain('coarsened');

    await frontier.call('migrate_effort', { effort: 'rewrite' });
    const after = await frontier.call('get_board', { effort: 'rewrite' });
    expect(ticketLines(after)).toEqual(ticketLines(before));
    expect(after).toContain('blocked_by=T1.4?');
    expect(after).toContain('frontier: none takeable in this Effort');
  });

  for (const [name, edit] of [
    ['comment', { comment: 'hi' }],
    ['claim', { claim: { by: 'agent' } }],
  ] as const) {
    it(`keeps the sub-slice as declared when a ${name} normalizes the file`, async () => {
      const { root, frontier } = await crossEffort('T1.4');

      await frontier.call('update_ticket', { id: 'port', ...edit });
      const written = await readFile(join(root, PORT), 'utf8');
      expect(written).toMatch(/blocked_by: \[["']?T1\.4["']?\]/);

      // A later migration has nothing left to coarsen.
      await frontier.call('migrate_effort', { effort: 'rewrite' });
      expect(await readFile(join(root, PORT), 'utf8')).toMatch(/blocked_by: \[["']?T1\.4["']?\]/);
    });
  }

  it('keeps an explicit plain Edge beside a sub-slice of the same id', async () => {
    const { root, frontier } = await crossEffort('T1, T1.4');

    const board = await frontier.call('get_board', { effort: 'rewrite' });
    expect(board).toContain('blocked_by=T1@consume,T1.4?');

    const report = await frontier.call('migrate_effort', { effort: 'rewrite' });
    expect(report).toContain('blocked_by=T1,T1.4');
    expect(report).toContain('Edges to another Effort (1) — check each is meant: T1@consume');
    const written = await readFile(join(root, PORT), 'utf8');
    expect(written).toMatch(/blocked_by: \[T1, ["']?T1\.4["']?\]/);
  });

  it('coarsens a same-Effort sub-slice on the Board, on a lazy write and on migration', async () => {
    const files = {
      '.scratch/rewrite/map.md': map('Somewhere.'),
      '.scratch/rewrite/issues/01-base.md': '# T7 — Base\n\nStatus: open\n',
      '.scratch/rewrite/issues/02-next.md': '# T8 — Next\n\nStatus: open\nBlocked by: T7.2, T7\n',
    };
    const lazyRoot = await makeFixtureTree(files);
    const lazy = await connectFrontier({ cwd: lazyRoot, env: {} });
    const board = await lazy.call('get_board', { effort: 'rewrite' });
    expect(board).toContain('T8  Next  build/open  blocked_by=T7');
    expect(board).not.toContain('T7,T7');
    expect(board).toContain('sub-slice Edges coarsened to their parent Ticket (1): T7.2');

    await lazy.call('update_ticket', { id: 'T8', comment: 'hi' });
    const next = join(lazyRoot, '.scratch/rewrite/issues/02-next.md');
    expect(await readFile(next, 'utf8')).toMatch(/blocked_by: \[T7\]/);

    const migrateRoot = await makeFixtureTree(files);
    const migrating = await connectFrontier({ cwd: migrateRoot, env: {} });
    const report = await migrating.call('migrate_effort', { effort: 'rewrite' });
    expect(report).toContain('blocked_by=[T7]');
    expect(report).not.toContain('kept as declared');
    expect(report).not.toContain('another Effort');
  });

  it('never calls a fenced T7.2 a kept sub-slice', async () => {
    const root = await makeFixtureTree({
      '.scratch/rewrite/map.md': map('Somewhere.'),
      '.scratch/rewrite/issues/01-base.md': '---\ntitle: Base\nblocked_by: []\n---\n',
      '.scratch/rewrite/issues/02-fenced.md':
        '---\ntitle: Fenced\nblocked_by: [T7.2, 01]\nowner: someone\n---\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const report = await frontier.call('migrate_effort', { effort: 'rewrite', preview: true });
    expect(report).toContain('[fenced]  Fenced  edges  blocked_by=T7.2,base');
    expect(report).not.toContain('kept as declared');
  });

  it('caps both report lines, naming ten and counting the rest', async () => {
    const files: Record<string, string> = {
      '.scratch/rewrite/map.md': map('Somewhere.'),
      '.scratch/consume/map.md': map('Elsewhere.'),
    };
    for (let n = 1; n <= 12; n++) {
      const pad = String(n).padStart(2, '0');
      files[`.scratch/consume/issues/${pad}-T${String(100 + n)}.md`] =
        `---\nid: T${String(100 + n)}\ntitle: Other\nstatus: open\nblocked_by: []\n---\n`;
      files[`.scratch/rewrite/issues/${pad}-port.md`] =
        `# ${pad} — Port\n\nBlocked by: T${String(100 + n)}, T${String(200 + n)}.1\n`;
    }
    const frontier = await connectFrontier({ cwd: await makeFixtureTree(files), env: {} });

    const report = await frontier.call('migrate_effort', { effort: 'rewrite', preview: true });
    const cross = report.split('\n').find(entry => entry.startsWith('> Edges to another'));
    expect(cross).toMatch(/\(12\) — check each is meant: (T1\d\d@consume ){10}and 2 more$/);
    const kept = report.split('\n').find(entry => entry.includes('kept as declared'));
    expect(kept).toMatch(/\(12\): (T2\d\d\.1 ){10}and 2 more — they dangle/);
  });

  it('names Edges written across Efforts', async () => {
    const root = await makeFixtureTree({
      '.scratch/consume/map.md': map('Elsewhere.'),
      '.scratch/consume/issues/01-T1-unrelated.md': OTHER_T1,
      '.scratch/rewrite/map.md': map('Somewhere.'),
      '.scratch/rewrite/issues/01-base.md': '# T7 — Base\n\nStatus: open\n',
      '.scratch/rewrite/issues/02-next.md': '# T8 — Next\n\nStatus: open\nBlocked by: T7.2, T1\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const report = await frontier.call('migrate_effort', { effort: 'rewrite' });
    expect(report).toContain('blocked_by=[T7],T1');
    expect(report).toContain('Edges to another Effort (1) — check each is meant: T1@consume');
    expect(report).not.toContain('kept as declared');
  });
});
