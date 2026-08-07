import { afterEach, describe, expect, it } from 'vitest';

import { readTrackerDoc, TRACKER_DOC_URI } from '../src/tracker-doc.ts';
import { ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

describe('the shipped surface', () => {
  it('exposes exactly eight tools and no ninth', async () => {
    const root = await makeFixtureTree({ '.git/HEAD': 'ref: refs/heads/main\n' });
    const { client } = await connectFrontier({ cwd: root, env: {} });

    const { tools } = await client.listTools();

    expect(tools.map(tool => tool.name).toSorted()).toEqual([
      'create_tickets',
      'edit_map',
      'get_board',
      'get_tickets',
      'list_efforts',
      'migrate_effort',
      'spec',
      'update_ticket',
    ]);
  });

  it('lists the tracker configuration document as an MCP resource, not a tool', async () => {
    const root = await makeFixtureTree({ '.git/HEAD': 'ref: refs/heads/main\n' });
    const { client, call } = await connectFrontier({ cwd: root, env: {} });

    const { resources } = await client.listResources();
    expect(resources).toEqual([
      expect.objectContaining({
        uri: TRACKER_DOC_URI,
        name: 'tracker-doc',
        mimeType: 'text/markdown',
      }),
    ]);

    const { tools } = await client.listTools();
    expect(tools.map(tool => tool.name)).not.toContain('tracker-doc');
    expect(tools.map(tool => tool.name)).not.toContain('tracker_doc');

    // Warm path still works — the resource is orthogonal to tools.
    expect(await call('list_efforts')).toContain('root:');
  });

  it('serves the tracker configuration document at a stable URI', async () => {
    const root = await makeFixtureTree({ '.git/HEAD': 'ref: refs/heads/main\n' });
    const { client } = await connectFrontier({ cwd: root, env: {} });

    const { contents } = await client.readResource({ uri: TRACKER_DOC_URI });
    const text = contents.map(part => ('text' in part ? part.text : '')).join('\n');

    expect(text).toBe(readTrackerDoc());
    expect(text).toContain('list_efforts');
    expect(text).toContain('get_board');
    expect(text).toContain('update_ticket');
    expect(text).toContain('create_tickets');
    expect(text).toContain('edit_map');
    expect(text).toContain('spec');
    expect(text).toContain('migrate_effort');
    expect(text).toContain('get_tickets');
    expect(text).toContain('.scratch/');
    expect(text).toContain('blocked_by');
    expect(text).toMatch(/fallback|without Frontier/i);
  });
});

describe('the tracker configuration document', () => {
  it('describes file conventions that produce readable Tickets without the server', async () => {
    const doc = readTrackerDoc();

    // The doc names the fields a hand-written Ticket must carry.
    expect(doc).toContain('id: T');
    expect(doc).toContain('status: open');
    expect(doc).toContain('blocked_by');

    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/hand/issues/01-T1-handwritten.md': ticket('T1', 'Handwritten per tracker doc', {
        body: 'Written by following the tracker configuration document only.',
      }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'hand' });
    expect(board).toContain('T1  Handwritten per tracker doc');
    expect(board).not.toContain('legacy');
  });
});
