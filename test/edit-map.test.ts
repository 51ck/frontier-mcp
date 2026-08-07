import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';
import { map, ticket } from './support/fixtures.ts';

afterEach(cleanupFixtures);

const GENERATED_OPEN =
  '<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->';

function fullMap(): string {
  return `---
header: map
---

# Map

## Destination

Ship the header docs.

## Notes

Consult ADR 0002. Keep sections typed.

## Decisions so far

<!-- hand-typed stale content the server must ignore -->
- [old](issues/old.md) — ignore me

## Not yet specified

- How Spec put preserves frontmatter style
- Whether fog graduates leave orphan bullets

## Out of scope

- Rewriting CONTEXT.md through this tool
`;
}

describe('edit_map', () => {
  it('reads Destination and Notes without returning the whole Map body', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': fullMap(),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('edit_map', { effort: 'alpha' });

    expect(text).toContain('destination: Ship the header docs.');
    expect(text).toContain('notes: Consult ADR 0002. Keep sections typed.');
    // Typed lists are fine; Decisions-so-far content from the file is not.
    expect(text).not.toContain('ignore me');
    expect(text).not.toContain('## Decisions');
    expect(text).toContain('How Spec put preserves frontmatter style');
    expect(text).toContain('Rewriting CONTEXT.md through this tool');
  });

  it('sets Destination without rewriting Notes', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': fullMap(),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('edit_map', {
      effort: 'alpha',
      destination: 'Reach a typed Map edit surface.',
    });

    const onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    expect(onDisk).toContain('## Destination\n\nReach a typed Map edit surface.\n');
    expect(onDisk).toContain('## Notes\n\nConsult ADR 0002. Keep sections typed.\n');
  });

  it('adds and graduates a fog patch, leaving it in only one place', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': fullMap(),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('edit_map', {
      effort: 'alpha',
      add_fog: 'Whether Markers wrap multi-line gists',
    });

    let onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    expect(onDisk).toContain('- Whether Markers wrap multi-line gists');

    const text = await frontier.call('edit_map', {
      effort: 'alpha',
      graduate_fog: 'Whether Markers wrap multi-line gists',
    });

    expect(text).not.toContain('Whether Markers wrap multi-line gists');
    onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    expect(onDisk).not.toContain('Whether Markers wrap multi-line gists');
    expect(onDisk).toContain('How Spec put preserves frontmatter style');
  });

  it('rules something out of scope without writing Decisions-so-far', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': fullMap(),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('edit_map', {
      effort: 'alpha',
      rule_out: 'A ninth tool',
    });

    const onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    expect(onDisk).toContain('- A ninth tool');
    expect(onDisk).toContain(GENERATED_OPEN);
    expect(onDisk).toContain('<!-- hand-typed stale content the server must ignore -->');
  });

  it('writes Decisions-so-far from resolved Tickets between overwrite markers', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': fullMap(),
      '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', {
        status: 'resolved',
        answer_gist: 'Landed the read path',
      }),
      '.scratch/alpha/issues/02-T2-second.md': ticket('T2', 'Second', { status: 'open' }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('edit_map', { effort: 'alpha', notes: 'Still consulting ADR 0002.' });

    const onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    expect(onDisk).toContain(GENERATED_OPEN);
    expect(onDisk).toContain('- [T1 — First](issues/01-T1-first.md) — Landed the read path');
    expect(onDisk).not.toContain('T2 — Second');
    expect(onDisk).toContain('<!-- hand-typed stale content the server must ignore -->');
    expect(onDisk).not.toMatch(/<!-- GENERATED[\s\S]*ignore me[\s\S]*<!-- \/GENERATED -->/);
  });

  it('renders dropped Tickets into Out of scope, never Decisions-so-far', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': fullMap(),
      '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', {
        status: 'dropped',
        dropped_reason: 'Beyond the destination',
      }),
      '.scratch/alpha/issues/02-T2-second.md': ticket('T2', 'Second', {
        status: 'resolved',
        answer_gist: 'Chose the seam',
      }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('edit_map', { effort: 'alpha', notes: 'Refresh derived blocks.' });

    const onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    const decisions = onDisk.slice(
      onDisk.indexOf('## Decisions so far'),
      onDisk.indexOf('## Not yet specified'),
    );
    const outOfScope = onDisk.slice(onDisk.indexOf('## Out of scope'));

    expect(decisions).toContain('- [T2 — Second](issues/02-T2-second.md) — Chose the seam');
    expect(decisions).not.toContain('T1 — First');
    expect(outOfScope).toContain('- [T1 — First](issues/01-T1-first.md) — Beyond the destination');
    expect(outOfScope).toContain('- Rewriting CONTEXT.md through this tool');
  });

  it('refreshes derived blocks when a Ticket is resolved or dropped', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': fullMap(),
      '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', {
        status: 'claimed',
        claimed_by: 'a',
        claimed_at: '2026-01-01T00:00:00.000Z',
      }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('update_ticket', {
      id: 'T1',
      resolve: { answer_gist: 'Resolved through update_ticket' },
    });

    const onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    expect(onDisk).toContain(
      '- [T1 — First](issues/01-T1-first.md) — Resolved through update_ticket',
    );
  });

  it('leaves content outside the GENERATED markers untouched', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': fullMap(),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('edit_map', { effort: 'alpha', notes: 'Touched.' });

    const onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    expect(onDisk).toContain('<!-- hand-typed stale content the server must ignore -->');
    expect(onDisk).toContain('- [old](issues/old.md) — ignore me');
  });
});

describe('spec', () => {
  it('gets and puts a Spec as a whole document with frontmatter', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/spec.md': `---
header: spec
---

# Alpha

Opening paragraph.
`,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const got = await frontier.call('spec', { effort: 'alpha' });
    expect(got).toContain('header: spec');
    expect(got).toContain('Opening paragraph.');

    const replacement = `---
header: spec
---

# Alpha

Rewritten Spec body.
`;
    await frontier.call('spec', { effort: 'alpha', content: replacement });

    const onDisk = await readFile(join(root, '.scratch/alpha/spec.md'), 'utf8');
    expect(onDisk).toBe(replacement);
  });

  it('allows an Effort to hold both a Map and a Spec', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/gamma/map.md': map('Chart gamma, then spec it.'),
      '.scratch/gamma/spec.md': `---
header: spec
---

# Gamma
`,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'gamma' });
    expect(board).toContain('destination: Chart gamma, then spec it.');

    const mapView = await frontier.call('edit_map', { effort: 'gamma' });
    expect(mapView).toContain('destination: Chart gamma, then spec it.');

    const specView = await frontier.call('spec', { effort: 'gamma' });
    expect(specView).toContain('# Gamma');

    const efforts = await frontier.call('list_efforts');
    expect(efforts).toMatch(/gamma\s+tickets=0\s+docs=map,spec/);
  });

  it('puts a Spec onto an existing Map Effort without create', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/beta/map.md': map('Ship beta.'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('spec', {
      effort: 'beta',
      content: `---
header: spec
---

# Beta Spec
`,
    });

    const efforts = await frontier.call('list_efforts');
    expect(efforts).toMatch(/beta\s+tickets=0\s+docs=map,spec/);
  });
});
