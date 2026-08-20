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

  it('negotiates protocol version 2025-11-25', async () => {
    // The fact that made the SDK v1 -> v2 scoped-family migration revertable:
    // the wire did not move. See AGENTS.md, Work Guidance, on the SDK split.
    const root = await makeFixtureTree({ '.git/HEAD': 'ref: refs/heads/main\n' });
    const { client } = await connectFrontier({ cwd: root, env: {} });

    expect(client.getNegotiatedProtocolVersion()).toBe('2025-11-25');
  });

  it('advertises listChanged false on both declared capabilities', async () => {
    // v2 defaults a declared `tools: {}` / `resources: {}` to `listChanged:
    // true` at construction. src/server.ts states `false` on both because this
    // server sends neither notification — a dropped `false` must go red here.
    const root = await makeFixtureTree({ '.git/HEAD': 'ref: refs/heads/main\n' });
    const { client } = await connectFrontier({ cwd: root, env: {} });

    expect(client.getServerCapabilities()).toMatchObject({
      tools: { listChanged: false },
      resources: { listChanged: false },
    });
  });

  it('emits tool input schemas in the 2020-12 JSON Schema dialect', async () => {
    // v2 moved the emitted `$schema` from draft-07. Pin the dialect so a
    // future SDK move is a deliberate decision rather than a silent surprise.
    const root = await makeFixtureTree({ '.git/HEAD': 'ref: refs/heads/main\n' });
    const { client } = await connectFrontier({ cwd: root, env: {} });

    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
      });
    }
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

  it('serves a document that forbids working out the next id by hand', async () => {
    const root = await makeFixtureTree({ '.git/HEAD': 'ref: refs/heads/main\n' });
    const { client } = await connectFrontier({ cwd: root, env: {} });

    const { contents } = await client.readResource({ uri: TRACKER_DOC_URI });
    const text = contents.map(part => ('text' in part ? part.text : '')).join('\n');

    // Read over the wire because that is the copy an agent acts on, and matched
    // on substance rather than on the sentences as written — this file re-wraps
    // whenever a line grows, and a rewording that still states the rule must not
    // turn this red. Observed in the field: an agent with the server loaded
    // scanned for the highest T<n> itself, the naive `max + 1` ADR 0005 measured.
    expect(text).toMatch(/ids\s+come\s+from\s+`create_tickets`/i);
    expect(text).toMatch(/never[\s\S]{0,40}\bscan/i);
    expect(text).toMatch(/ADR 0005/);
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

  it('states the no-server precondition inside the hand-publish body, not only in its heading', () => {
    const doc = shippedTrackerDoc();

    const start = doc.indexOf('### Hand publish');
    expect(start).toBeGreaterThan(-1);
    // Sliced to the section, then past its heading line: an agent that arrived
    // straight at this procedure never read the heading, so the precondition
    // has to sit in the text it does read. A whole-document match would pass on
    // the fence up in the File conventions preamble and prove nothing here.
    const section = doc.slice(start);
    const end = section.indexOf('\n## ');
    const body = (end === -1 ? section : section.slice(0, end)).replace(/^.*\n/, '');

    expect(body).toMatch(/absent|not loaded/i);
    expect(body).toMatch(/create_tickets/);
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

  it('reports the version it was published as, in the handshake', async () => {
    const { default: packageJson } = await import('../package.json', { with: { type: 'json' } });
    const root = await makeFixtureTree({ '.git/HEAD': 'ref: refs/heads/main\n' });
    const { client } = await connectFrontier({ cwd: root, env: {} });

    // Read back over the wire rather than from src: the claim is what a client
    // is told it is talking to. A hardcoded constant satisfies itself, and a
    // release bumps package.json without touching src, so the two drift
    // silently and every published build misreports itself.
    expect(client.getServerVersion()).toMatchObject({
      name: 'frontier',
      version: packageJson.version,
    });
  });

  it('documents user-scope install with a pinned npx invocation', () => {
    const readme = readFileSync(join(import.meta.dirname, '..', 'README.md'), 'utf8');

    expect(readme).toContain('user scope');
    expect(readme).toContain('frontier-mcp@');
    expect(readme).toContain('frontier://tracker-doc');
    expect(readme).toContain('The pin is the version you get');
  });

  it('ships a LICENSE file, not just an SPDX string in the manifest', async () => {
    // package.json's `"license": "MIT"` and the README's one-word License
    // section are declarations; neither is the grant. Without this file
    // GitHub's API reports `license: null`, so licence scanners at any
    // adopter read the repo as unlicensed. npm always includes a LICENSE in
    // the tarball regardless of `files`, so its presence here is the fix.
    const { default: packageJson } = await import('../package.json', { with: { type: 'json' } });
    const license = readFileSync(join(import.meta.dirname, '..', 'LICENSE'), 'utf8');

    expect(packageJson.license).toBe('MIT');
    expect(license).toContain('MIT License');
    expect(license).toContain('Permission is hereby granted, free of charge');
    expect(license).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
  });
});

/** Every tool's annotations, read off the wire as a client sees them. */
async function annotationsByTool(): Promise<Record<string, Record<string, unknown>>> {
  const root = await makeFixtureTree({ '.git/HEAD': 'ref: refs/heads/main\n' });
  const { client } = await connectFrontier({ cwd: root, env: {} });
  const { tools } = await client.listTools();

  return Object.fromEntries(
    tools.map(tool => [tool.name, (tool.annotations ?? {}) as Record<string, unknown>]),
  );
}

describe('tool annotations', () => {
  it('declares every tool closed-world, because scope stops at .scratch/', async () => {
    // openWorldHint defaults to *true* when omitted, so silence here is not
    // neutral — it tells every client that a server which touches only local
    // files under .scratch/ reaches out to external entities. It does not.
    const annotations = await annotationsByTool();

    for (const [name, annotation] of Object.entries(annotations)) {
      expect(annotation, name).toMatchObject({ openWorldHint: false });
    }
  });

  it('declares create_tickets additive, because it only ever adds', async () => {
    // create_tickets writes new Ticket files and nothing else, so a client
    // gating a confirmation prompt on the omitted-means-true default was
    // prompting on the additive path — the friction this server exists to
    // remove.
    const annotations = await annotationsByTool();

    expect(annotations['create_tickets']).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
  });

  it('declares the overwriting writers destructive, and says so out loud', async () => {
    // These four replace or remove what was there: update_ticket rewrites
    // fields and sections, edit_map replaces Destination/Notes and graduates
    // fog away, spec puts a whole new body, migrate_effort rewrites and
    // renames files. True is also the default, and stated anyway — see
    // AGENTS.md, Local Contracts.
    const annotations = await annotationsByTool();

    for (const name of ['update_ticket', 'edit_map', 'spec', 'migrate_effort']) {
      expect(annotations[name], name).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
      });
    }
  });

  it('keeps the three readers read-only', async () => {
    const annotations = await annotationsByTool();

    for (const name of ['list_efforts', 'get_board', 'get_tickets']) {
      expect(annotations[name], name).toMatchObject({ readOnlyHint: true });
    }
  });
});
