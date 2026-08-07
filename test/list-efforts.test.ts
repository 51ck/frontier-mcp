import { afterEach, describe, expect, it } from 'vitest';

import { SERVER_NAME } from '../src/server.ts';
import { MIXED_WORKSPACE, map, spec, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

describe('the server', () => {
  it('advertises the frontier server name', async () => {
    const root = await makeFixtureTree(MIXED_WORKSPACE);
    const { client } = await connectFrontier({ cwd: root, env: {} });

    expect(client.getServerVersion()?.name).toBe(SERVER_NAME);
    expect(SERVER_NAME).toBe('frontier');
  });
});

describe('list_efforts', () => {
  it('reports each Effort with its Ticket count and header docs', async () => {
    const root = await makeFixtureTree(MIXED_WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('list_efforts');

    expect(text).toBe(
      [
        `root: ${root}`,
        'alpha  tickets=2  docs=spec  frontier=2',
        'beta  tickets=1  docs=map  frontier=1',
        'gamma  tickets=0  docs=map,spec  frontier=0',
      ].join('\n'),
    );
  });

  it('lists an Effort that holds Tickets but no header doc', async () => {
    const root = await makeFixtureTree({
      '.scratch/orphaned/issues/01-T1-alone.md': ticket('T1', 'Alone'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('list_efforts')).toContain(
      'orphaned  tickets=1  docs=none  frontier=1',
    );
  });

  it('returns an empty list, not an error, for a repo with no .scratch/', async () => {
    const root = await makeFixtureTree({ '.git/HEAD': 'ref: refs/heads/main\n' });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('list_efforts')).toBe(`root: ${root}\n(no efforts)`);
  });

  it('returns an empty list for a .scratch/ holding nothing the schema recognizes', async () => {
    const root = await makeFixtureTree({
      '.scratch/notes/thinking.md': '# Not an Effort\n',
      '.scratch/loose-note.md': '# Also not an Effort\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('list_efforts')).toBe(`root: ${root}\n(no efforts)`);
  });

  it('does not mistake a file named issues for an Effort', async () => {
    const root = await makeFixtureTree({ '.scratch/impostor/issues': 'not a directory\n' });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('list_efforts')).toBe(`root: ${root}\n(no efforts)`);
  });

  it('does not mistake a directory named spec.md for a header doc', async () => {
    const root = await makeFixtureTree({ '.scratch/impostor/spec.md/inside.txt': 'not a Spec\n' });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('list_efforts')).toBe(`root: ${root}\n(no efforts)`);
  });

  it('counts only the markdown files directly under issues/', async () => {
    const root = await makeFixtureTree({
      '.scratch/effort/map.md': map('Somewhere.'),
      '.scratch/effort/issues/01-T1-counted.md': ticket('T1', 'Counted'),
      '.scratch/effort/issues/notes.txt': 'not a Ticket',
      '.scratch/effort/issues/archive/02-T2-nested.md': ticket('T2', 'Nested'),
      '.scratch/effort/research.md': '# Not a Ticket either',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('list_efforts')).toContain(
      'effort  tickets=1  docs=map  frontier=1',
    );
  });

  it('orders Efforts by slug', async () => {
    const root = await makeFixtureTree({
      '.scratch/zulu/spec.md': spec('Zulu'),
      '.scratch/alpha/spec.md': spec('Alpha'),
      '.scratch/mike/spec.md': spec('Mike'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const slugs = (await frontier.call('list_efforts'))
      .split('\n')
      .slice(1)
      .map(line => line.split('  ')[0]);

    expect(slugs).toEqual(['alpha', 'mike', 'zulu']);
  });
});
