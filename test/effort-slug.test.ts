import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';
import { map, ticket } from './support/fixtures.ts';

afterEach(cleanupFixtures);

// The workspace sits two levels inside its own temporary directory, so a slug
// climbing out of it lands somewhere this test owns rather than in the shared
// temporary directory other test files are writing to.
const WORKSPACE = {
  'nest/ws/.git/HEAD': 'ref: refs/heads/main\n',
  'nest/ws/.scratch/alpha/map.md': map('Ship alpha.'),
  'nest/ws/.scratch/alpha/spec.md': '# Alpha\n\nThe spec.\n',
  'nest/ws/.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First'),
};

const REFUSED: ReadonlyArray<readonly [name: string, slug: string]> = [
  ['an empty slug', ''],
  ['a single dot', '.'],
  ['a double dot', '..'],
  ['a leading dot', '.hidden'],
  ['a climb out of the workspace', '../../escaped'],
  ['a climb to a sibling Effort', '../alpha'],
  ['a forward slash', 'a/issues'],
  ['a backslash', 'a\\issues'],
  ['a NUL', 'a\u0000b'],
  ['a newline', 'a\nb'],
  ['a DEL', 'a\u007fb'],
];

const CALLS: ReadonlyArray<readonly [name: string, tool: string, args: Record<string, unknown>]> = [
  ['edit_map read', 'edit_map', {}],
  ['spec read', 'spec', {}],
  ['migrate_effort preview', 'migrate_effort', { preview: true }],
  [
    'create_tickets create',
    'create_tickets',
    { create: true, tickets: [{ name: 'escapee', title: 'Escapee' }] },
  ],
  ['edit_map create', 'edit_map', { create: true }],
  ['edit_map create with a section', 'edit_map', { create: true, destination: 'Out.' }],
  ['spec create', 'spec', { create: true, content: '# Out\n' }],
  ['migrate_effort', 'migrate_effort', {}],
];

async function snapshot(root: string): Promise<Record<string, string>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = await Promise.all(
    entries.map(async entry => {
      const path = join(entry.parentPath, entry.name);
      return [path, entry.isFile() ? await readFile(path, 'utf8') : '<dir>'] as const;
    }),
  );
  return Object.fromEntries(files.toSorted(([a], [b]) => a.localeCompare(b)));
}

describe('an Effort slug that is not one directory name', () => {
  describe.each(REFUSED)('%s', (_name, slug) => {
    it.each(CALLS)('is refused by %s, writing nothing', async (_call, tool, args) => {
      const root = await makeFixtureTree(WORKSPACE);
      const frontier = await connectFrontier({ cwd: join(root, 'nest', 'ws'), env: {} });
      const before = await snapshot(root);

      const error = await frontier.callExpectingError(tool, { effort: slug, ...args });

      // The message is all a typed failure shows across the tool layer.
      expect(error).toContain(`${JSON.stringify(slug)} is not an Effort slug`);
      expect(await snapshot(root)).toEqual(before);
      expect(existsSync(join(root, 'nest', 'escaped'))).toBe(false);
      expect(existsSync(join(root, 'nest', 'ws', '.scratch', 'a'))).toBe(false);
      expect(existsSync(join(root, 'nest', 'ws', '.scratch', 'issues'))).toBe(false);
    });
  });
});

describe('an Effort slug that is one directory name', () => {
  it.each(['PROJ-123', 'v1.2.x', 'Mixed_Case', 'with space', 'café'])(
    'serves %s on every Effort-addressed tool',
    async slug => {
      const root = await makeFixtureTree(WORKSPACE);
      const frontier = await connectFrontier({ cwd: join(root, 'nest', 'ws'), env: {} });
      const dir = join(root, 'nest', 'ws', '.scratch', slug);

      await frontier.call('create_tickets', {
        effort: slug,
        create: true,
        tickets: [{ name: 'kept', title: 'Kept' }],
      });
      expect(await readdir(join(dir, 'issues'))).toHaveLength(1);

      await frontier.call('edit_map', { effort: slug, create: true, destination: 'Somewhere.' });
      expect(await frontier.call('edit_map', { effort: slug })).toContain('Somewhere.');

      await frontier.call('spec', { effort: slug, content: '# Kept\n' });
      expect(await frontier.call('spec', { effort: slug })).toContain('# Kept');
      expect(await readFile(join(dir, 'spec.md'), 'utf8')).toBe('# Kept\n');

      await frontier.call('migrate_effort', { effort: slug, preview: true });
      await frontier.call('migrate_effort', { effort: slug });
      expect(await frontier.call('get_board', { effort: slug })).toContain('Kept');
    },
  );
});
