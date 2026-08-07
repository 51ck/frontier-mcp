import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map } from './support/fixtures.ts';
import {
  cleanupFixtures,
  connectFrontier,
  makeFixtureTree,
  makeLegacyWorkspace,
} from './support/harness.ts';

afterEach(cleanupFixtures);

/** A Legacy Ticket carrying a T-id in its heading — sobrina's shape. */
const LEGACY_WITH_ID = `# T30 — Grammy group boot

Status: open

**Problem:** Without a running group bot entry, no Telegram MVP path is real.

**Depends on:** T31 ([02-identity-bridge.md](02-identity-bridge.md))

**Tasks:**

- [ ] **T30.1** Bot factory reading the token
`;

/** A Legacy Ticket identified only by its filename number — tag-customizer's shape. */
const LEGACY_NO_ID = `# 01 — Is the colour-space fix a latent bug?

Type: research
Status: open
Blocked by: —

The measured value was wrong in the same way.
`;

/** Another id-less Ticket so minting can be checked for uniqueness. */
const LEGACY_NO_ID_TWO = `# 02 — Port the texture leak fix

Status: open
Blocked by: 01
`;

describe('migrate_effort', () => {
  it('normalizes an Effort of Legacy Tickets to the schema in one call', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-grammy-group-boot.md': LEGACY_WITH_ID,
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
    expect(board).not.toContain('are Legacy');
  });

  it('preserves existing ids verbatim, including T31-style ids from titles', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-grammy-group-boot.md': LEGACY_WITH_ID,
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
      '.scratch/alpha/issues/01-grammy-group-boot.md': LEGACY_WITH_ID,
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
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-colour.md': LEGACY_NO_ID,
      '.scratch/alpha/issues/02-texture.md': LEGACY_NO_ID_TWO,
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
      '.scratch/alpha/issues/01-grammy-group-boot.md': LEGACY_WITH_ID,
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
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-colour.md': LEGACY_NO_ID,
      '.scratch/alpha/issues/02-texture.md': LEGACY_NO_ID_TWO,
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
      '.scratch/alpha/issues/01-grammy-group-boot.md': LEGACY_WITH_ID,
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

  it('renames to NN-T<n>-<slug>.md only when rename is set', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-grammy-group-boot.md': LEGACY_WITH_ID,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('migrate_effort', { effort: 'alpha', rename: true });

    const names = await readdir(join(root, '.scratch/alpha/issues'));
    expect(names).toEqual(['01-T30-grammy-group-boot.md']);

    const onDisk = await readFile(
      join(root, '.scratch/alpha/issues/01-T30-grammy-group-boot.md'),
      'utf8',
    );
    expect(onDisk).toContain('id: T30');
  });

  it('preview reports every change and writes nothing', async () => {
    // No dangling Depends-on:T31 here — colour mints as T31 (max+1 after T30),
    // and a prose Edge naming T31 would make the report ambiguous.
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-grammy-group-boot.md': `# T30 — Grammy group boot

Status: open

**Problem:** Without a running group bot entry, no Telegram MVP path is real.
`,
      '.scratch/alpha/issues/02-colour.md': LEGACY_NO_ID,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const beforeBoot = await readFile(
      join(root, '.scratch/alpha/issues/01-grammy-group-boot.md'),
      'utf8',
    );
    const beforeColour = await readFile(join(root, '.scratch/alpha/issues/02-colour.md'), 'utf8');
    const report = await frontier.call('migrate_effort', {
      effort: 'alpha',
      preview: true,
    });

    expect(report.toLowerCase()).toContain('preview');
    // Both Tickets appear: preserved id and the id that would be minted.
    expect(report).toContain('T30');
    expect(report).toContain('Grammy group boot');
    expect(report).toContain('Is the colour-space fix a latent bug?');
    expect(report).toMatch(/\bmint(?:ed|s)?\b/i);
    // Workspace already holds T30 — the counter continues at max+1.
    expect(report).toContain('T31');

    expect(
      await readFile(join(root, '.scratch/alpha/issues/01-grammy-group-boot.md'), 'utf8'),
    ).toBe(beforeBoot);
    expect(await readFile(join(root, '.scratch/alpha/issues/02-colour.md'), 'utf8')).toBe(
      beforeColour,
    );

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('are Legacy');
  });

  it('ignores unrecognized files in the Effort directory', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-grammy-group-boot.md': LEGACY_WITH_ID,
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
      '.scratch/alpha/issues/02-legacy.md': LEGACY_WITH_ID,
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
      '.scratch/alpha/issues/01-no-id.md': LEGACY_NO_ID,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    // A write gives it frontmatter without an id — T7's job is the mint.
    await frontier.call('update_ticket', { id: 'alpha#1', claim: { by: 'agent-7' } });
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('no id (1)');

    await frontier.call('migrate_effort', { effort: 'alpha' });

    const onDisk = await readFile(join(root, '.scratch/alpha/issues/01-no-id.md'), 'utf8');
    expect(onDisk).toMatch(/^id: T\d+$/m);
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

describe('migrate_effort against real Legacy fixtures', () => {
  it('migrates sobrina telegram preserving every T-id', async () => {
    const root = await makeLegacyWorkspace({ telegram: 'sobrina-telegram' });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const report = await frontier.call('migrate_effort', { effort: 'telegram' });
    expect(report.toLowerCase()).toContain('migrated');

    const board = await frontier.call('get_board', { effort: 'telegram' });
    expect(board).not.toContain('are Legacy');
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
    const root = await makeLegacyWorkspace({ 'ship-0-5-0': 'tag-customizer-ship-0-5-0' });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const beforeResearch = await readFile(
      join(root, '.scratch/ship-0-5-0/research/01-srgb-data-maps.md'),
      'utf8',
    );

    const report = await frontier.call('migrate_effort', { effort: 'ship-0-5-0' });
    expect(report.toLowerCase()).toContain('migrated');
    expect(report).toMatch(/T\d+/);

    const board = await frontier.call('get_board', { effort: 'ship-0-5-0' });
    expect(board).not.toContain('are Legacy');
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
    const root = await makeLegacyWorkspace({ telegram: 'sobrina-telegram' });
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
