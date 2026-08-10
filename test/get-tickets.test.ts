import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { spec, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

describe('get_tickets', () => {
  it('returns the full body of a Ticket by id', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/spec.md': spec('Alpha'),
      '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', {
        body: 'The whole problem statement, which a Board never shows.',
      }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('get_tickets', { ids: ['T1'] });

    expect(text).toContain('T1');
    expect(text).toContain('First');
    expect(text).toContain('The whole problem statement, which a Board never shows.');
  });

  it('returns a body another process has rewritten, without waiting for an invalidation', async () => {
    const path = '.scratch/alpha/issues/01-T1-first.md';
    const root = await makeFixtureTree({
      '.scratch/alpha/spec.md': spec('Alpha'),
      [path]: ticket('T1', 'First', { body: 'The body this session started with.' }),
    });

    // The watcher is pushed out beyond the test so nothing invalidates behind
    // our backs: what get_tickets returns is what it read, not what a refresh
    // happened to hand it.
    const frontier = await connectFrontier({ cwd: root, env: {}, watcherDebounceMs: 60_000 });

    // Warm the index the way a session does — a Board first, bodies after.
    await frontier.call('get_board', { effort: 'alpha' });

    await writeFile(
      join(root, path),
      ticket('T1', 'First', { body: 'The body another process wrote.' }),
      'utf8',
    );

    const text = await frontier.call('get_tickets', { ids: ['T1'] });

    expect(text).toContain('The body another process wrote.');
    expect(text).not.toContain('The body this session started with.');
  });
});
