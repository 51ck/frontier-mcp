import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

/**
 * The URI is written out rather than imported from src: asserting the server
 * serves the same constant it exports proves nothing. This is the published
 * contract, so the test states it independently.
 */
const TRACKER_DOC_URI = 'frontier://tracker-doc';

/** The shipped document, read as a consumer would — not through src. */
function shippedTrackerDoc(): string {
  return readFileSync(
    join(import.meta.dirname, '..', 'docs', 'agents', 'issue-tracker.md'),
    'utf8',
  );
}

describe('the shipped surface', () => {
  it('exposes exactly eight tools and no ninth', async () => {
    const root = await makeFixtureTree({ '.git/HEAD': 'ref: refs/heads/main\n' });
    const { client } = await connectFrontier({ cwd: root, env: {} });

    const { tools } = await client.listTools();

    // The cap is a design constraint, not an outcome — every tool schema is
    // context in every session. See AGENTS.md, Local Contracts.
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

    expect(text).toBe(shippedTrackerDoc());
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
  /**
   * Transcribed by hand from the frontmatter template in the shipped document,
   * not built with the `ticket()` fixture helper. The helper is
   * schema-conformant by construction, so a Ticket built from it would prove
   * the fixtures work rather than that the document is followable — which is
   * the claim under test: an agent with no server loaded reads the document,
   * types this, and the server accepts it as a first-class Ticket.
   */
  const HAND_WRITTEN = `---
id: T1
title: Handwritten per tracker doc
kind: build
status: open
triage: ready-for-agent
blocked_by: []
---

# T1 — Handwritten per tracker doc

Written by following the tracker configuration document only.
`;

  it('describes file conventions that produce readable Tickets without the server', async () => {
    const doc = shippedTrackerDoc();

    // The doc names the fields a hand-written Ticket must carry.
    expect(doc).toContain('id: T');
    expect(doc).toContain('status: open');
    expect(doc).toContain('blocked_by');

    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/hand/issues/01-T1-handwritten.md': HAND_WRITTEN,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'hand' });
    expect(board).toContain('T1  Handwritten per tracker doc');
    // A Ticket the parser had to infer would be flagged Legacy — this one
    // carries real frontmatter, so it must not be.
    expect(board).not.toContain('legacy');
  });
});

describe('packaging', () => {
  it('publishes as frontier-mcp with a pinned-version entry point', async () => {
    const { default: packageJson } = await import('../package.json', { with: { type: 'json' } });

    expect(packageJson.name).toBe('frontier-mcp');
    expect(packageJson.bin).toEqual({ 'frontier-mcp': './dist/bin.js' });
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(packageJson.files).toEqual(
      expect.arrayContaining(['dist', 'docs/agents/issue-tracker.md']),
    );
  });

  it('documents user-scope install with a pinned npx invocation', () => {
    const readme = readFileSync(join(import.meta.dirname, '..', 'README.md'), 'utf8');

    expect(readme).toContain('user scope');
    expect(readme).toContain('frontier-mcp@');
    expect(readme).toContain('frontier://tracker-doc');
    expect(readme).toContain('The pin is the version you get');
  });
});
