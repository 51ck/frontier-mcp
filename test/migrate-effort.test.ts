import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { COUNTED, map } from './support/fixtures.ts';
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

/** Another id-less Ticket so minting can be checked for uniqueness. */
const FOREIGN_NO_ID_TWO = `# 02 — Port the texture leak fix

Status: open
Blocked by: 01
`;

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

  it('resolves bare sort-order Blocked-by Edges to the minted ids', async () => {
    const root = await makeFixtureTree({
      ...COUNTED,
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-colour.md': FOREIGN_NO_ID,
      '.scratch/alpha/issues/02-texture.md': FOREIGN_NO_ID_TWO,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('migrate_effort', { effort: 'alpha' });

    const texture = await readFile(join(root, '.scratch/alpha/issues/02-texture.md'), 'utf8');
    // `Blocked by: 01` named the colour Ticket by sort order; colour mints first as T1.
    expect(texture).toMatch(/blocked_by:\s*\[T1\]/);
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

  it('mints repo-global ids for Tickets that have none', async () => {
    const root = await makeFixtureTree({
      ...COUNTED,
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-colour.md': FOREIGN_NO_ID,
      '.scratch/alpha/issues/02-texture.md': FOREIGN_NO_ID_TWO,
      // Highest minted id in the workspace is T5 — fresh ids continue from there.
      '.scratch/beta/map.md': map('Elsewhere.'),
      '.scratch/beta/issues/01-T5-existing.md': `---
id: T5
title: Already there
kind: build
status: open
blocked_by: []
---

# T5 — Already there
`,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const report = await frontier.call('migrate_effort', { effort: 'alpha' });

    expect(report).toContain('T6');
    expect(report).toContain('T7');

    const first = await readFile(join(root, '.scratch/alpha/issues/01-colour.md'), 'utf8');
    const second = await readFile(join(root, '.scratch/alpha/issues/02-texture.md'), 'utf8');
    expect(first).toContain('id: T6');
    expect(second).toContain('id: T7');

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).not.toContain('no id');
    expect(board).toContain('T6');
    expect(board).toContain('T7');
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

  it('preview names unminted Tickets by unpadded handle, linked reference-style', async () => {
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
        '[alpha#2]  Is the colour-space fix a latent bug?  normalize+mint',
        '[alpha#3]  Port the texture leak fix  normalize+mint  blocked_by=[alpha#2],[T30]',
        '',
        '[T30]: .scratch/alpha/issues/01-grammy-group-boot.md',
        '[alpha#2]: .scratch/alpha/issues/02-colour.md',
        '[alpha#3]: .scratch/alpha/issues/03-texture.md',
      ].join('\n'),
    );
    expect(report).not.toContain('#02');
    expect(await readFile(join(root, '.scratch/alpha/issues/02-colour.md'), 'utf8')).toBe(before);
    expect(await readdir(join(root, '.scratch/alpha/issues'))).toHaveLength(3);
  });

  it.each([
    ['random', {}],
    ['counted', COUNTED],
  ])('preview run twice against unchanged files is identical (%s pattern)', async (_, config) => {
    const root = await makeFixtureTree({
      ...config,
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-colour.md': FOREIGN_NO_ID,
      '.scratch/alpha/issues/02-texture.md': FOREIGN_NO_ID_TWO,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const first = await frontier.call('migrate_effort', { effort: 'alpha', preview: true });
    const second = await frontier.call('migrate_effort', { effort: 'alpha', preview: true });

    expect(second).toBe(first);
    expect(first).toContain(
      '[alpha#2]  Port the texture leak fix  normalize+mint  blocked_by=[alpha#1]',
    );
    expect(first).not.toMatch(/\bT[0-9a-z]+\b/);
  });

  it('a real run labels each line by its id and links the unchanged file', async () => {
    const root = await makeFixtureTree({
      ...COUNTED,
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-colour.md': FOREIGN_NO_ID,
      '.scratch/alpha/issues/02-texture.md': FOREIGN_NO_ID_TWO,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const report = await frontier.call('migrate_effort', { effort: 'alpha' });

    expect(report).toContain(
      '[T1]  Is the colour-space fix a latent bug?  normalize+mint  was alpha#1',
    );
    expect(report).toContain(
      '[T2]  Port the texture leak fix  normalize+mint  was alpha#2  blocked_by=[T1]',
    );
    expect(report).toContain('[T1]: .scratch/alpha/issues/01-colour.md');
    expect(report).toContain('[T2]: .scratch/alpha/issues/02-texture.md');
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

  it('mints an id onto a write-normalized file that still has none', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-no-id.md': FOREIGN_NO_ID,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    // A write gives it frontmatter without an id — T7's job is the mint.
    await frontier.call('update_ticket', { id: 'alpha#1', claim: { by: 'agent-7' } });
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('no id (1)');

    await frontier.call('migrate_effort', { effort: 'alpha' });

    const onDisk = await readFile(join(root, '.scratch/alpha/issues/01-no-id.md'), 'utf8');
    expect(onDisk).toMatch(/^id: T[0-9a-z]{6}$/m);
    expect(onDisk).toContain('claimed_by: agent-7');

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).not.toContain('no id');
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
    // Every sobrina Ticket carries a T3x id in its heading — none are minted.
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

  it('migrates tag-customizer by minting ids and leaving research/ alone', async () => {
    const root = await makeForeignWorkspace({ 'ship-0-5-0': 'tag-customizer-ship-0-5-0' });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const beforeResearch = await readFile(
      join(root, '.scratch/ship-0-5-0/research/01-srgb-data-maps.md'),
      'utf8',
    );

    const report = await frontier.call('migrate_effort', { effort: 'ship-0-5-0' });
    expect(report.toLowerCase()).toContain('migrated');
    expect(report).toMatch(/\bT[0-9a-z]{6}\b/);

    const board = await frontier.call('get_board', { effort: 'ship-0-5-0' });
    expect(board).not.toContain('are Foreign');
    expect(board).not.toContain('no id');
    // Former handle is gone; every Ticket now has a real id.
    expect(board).not.toContain('ship-0-5-0#');

    const afterResearch = await readFile(
      join(root, '.scratch/ship-0-5-0/research/01-srgb-data-maps.md'),
      'utf8',
    );
    expect(afterResearch).toBe(beforeResearch);

    const names = await readdir(join(root, '.scratch/ship-0-5-0/issues'));
    expect(names).toContain('01-srgb-data-maps-verdict.md');
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

/** Migration mints an id where the handle stood; everything else on the line must match. */
function ticketLines(board: string): string[] {
  return board
    .split('\n')
    .filter(entry => entry.includes('Port') || entry.startsWith('frontier:'))
    .map(entry => entry.replace(/^(> )?\S+/, '$1'));
}

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

      await frontier.call('update_ticket', { id: 'rewrite#1', ...edit });
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
      '.scratch/rewrite/issues/01-fenced.md':
        '---\ntitle: Fenced\nblocked_by: [T7.2]\nowner: someone\n---\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const report = await frontier.call('migrate_effort', { effort: 'rewrite', preview: true });
    expect(report).toContain('blocked_by=T7.2');
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
