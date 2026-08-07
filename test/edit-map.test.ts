import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';
import { map, ticket } from './support/fixtures.ts';

afterEach(cleanupFixtures);

/** Same marker the driver writes — duplicated here so tests never import storage. */
const GENERATED_OPEN =
  '<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->';

function revisionOf(text: string, kind: 'map' | 'spec'): string {
  const match = text.match(new RegExp(`${kind} revision: (.+)`));
  if (match?.[1] === undefined) throw new Error(`no ${kind} revision in:\n${text}`);
  return match[1]!.trim();
}

/** A Map with GENERATED fences already in place; hand-ruled Out of scope sits outside them. */
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

Hand note kept outside the cache.

${GENERATED_OPEN}
- [old](issues/old.md) — ignore me
<!-- /GENERATED -->

## Not yet specified

- How Spec put preserves frontmatter style
- Whether fog graduates leave orphan bullets

## Out of scope

- Rewriting CONTEXT.md through this tool

${GENERATED_OPEN}
<!-- /GENERATED -->
`;
}

/** Legacy shape: Decisions / Out of scope exist but have no GENERATED fences. */
function unfencedMap(): string {
  return `---
header: map
---

# Map

## Destination

Ship the header docs.

## Notes

Consult ADR 0002. Keep sections typed.

## Decisions so far

<!-- hand-typed stale content the server must clean up -->
- [old](issues/old.md) — ignore me

## Not yet specified

- How Spec put preserves frontmatter style

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
    const rev = revisionOf(await frontier.call('edit_map', { effort: 'alpha' }), 'map');

    await frontier.call('edit_map', {
      effort: 'alpha',
      destination: 'Reach a typed Map edit surface.',
      expected_revision: rev,
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
    let rev = revisionOf(await frontier.call('edit_map', { effort: 'alpha' }), 'map');

    await frontier.call('edit_map', {
      effort: 'alpha',
      add_fog: 'Whether Markers wrap multi-line gists',
      expected_revision: rev,
    });

    let onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    expect(onDisk).toContain('- Whether Markers wrap multi-line gists');

    rev = revisionOf(await frontier.call('edit_map', { effort: 'alpha' }), 'map');
    const text = await frontier.call('edit_map', {
      effort: 'alpha',
      graduate_fog: 'Whether Markers wrap multi-line gists',
      expected_revision: rev,
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
    const rev = revisionOf(await frontier.call('edit_map', { effort: 'alpha' }), 'map');

    await frontier.call('edit_map', {
      effort: 'alpha',
      rule_out: 'A ninth tool',
      expected_revision: rev,
    });

    const onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    expect(onDisk).toContain('- A ninth tool');
    expect(onDisk).toContain(GENERATED_OPEN);
    // Decisions stays derived — the rule_out never lands there.
    const decisions = onDisk.slice(
      onDisk.indexOf('## Decisions so far'),
      onDisk.indexOf('## Not yet specified'),
    );
    expect(decisions).not.toContain('A ninth tool');
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
    const rev = revisionOf(await frontier.call('edit_map', { effort: 'alpha' }), 'map');

    await frontier.call('edit_map', {
      effort: 'alpha',
      notes: 'Still consulting ADR 0002.',
      expected_revision: rev,
    });

    const onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    expect(onDisk).toContain(GENERATED_OPEN);
    expect(onDisk).toContain('- [T1 — First](issues/01-T1-first.md) — Landed the read path');
    expect(onDisk).not.toContain('T2 — Second');
    // Stale pointer inside the prior GENERATED block is gone; hand note outside stays.
    expect(onDisk).toContain('Hand note kept outside the cache.');
    expect(onDisk).not.toContain('ignore me');
  });

  it('normalizes unfenced Decisions into a GENERATED block on write', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': unfencedMap(),
      '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', {
        status: 'resolved',
        answer_gist: 'Landed the read path',
      }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const rev = revisionOf(await frontier.call('edit_map', { effort: 'alpha' }), 'map');

    await frontier.call('edit_map', {
      effort: 'alpha',
      notes: 'Normalize unfenced Decisions.',
      expected_revision: rev,
    });

    const onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    const decisions = onDisk.slice(
      onDisk.indexOf('## Decisions so far'),
      onDisk.indexOf('## Not yet specified'),
    );
    const outOfScope = onDisk.slice(onDisk.indexOf('## Out of scope'));

    // Unfenced stale Decisions must not remain on disk lying to humans.
    expect(decisions).toContain(GENERATED_OPEN);
    expect(decisions).toContain('- [T1 — First](issues/01-T1-first.md) — Landed the read path');
    expect(decisions).not.toContain('ignore me');
    expect(decisions).not.toContain('hand-typed stale content');

    // Out of scope without fences keeps hand-ruled bullets outside a new GENERATED block.
    expect(outOfScope).toContain('- Rewriting CONTEXT.md through this tool');
    expect(outOfScope).toContain(GENERATED_OPEN);
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
    const rev = revisionOf(await frontier.call('edit_map', { effort: 'alpha' }), 'map');

    await frontier.call('edit_map', {
      effort: 'alpha',
      notes: 'Refresh derived blocks.',
      expected_revision: rev,
    });

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

  it('omits the gist em dash when a resolved Ticket has no answer_gist', async () => {
    // T6: "gist plus link". Empty gist → link-only line, no trailing " —", no invented prose.
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': fullMap(),
      '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', { status: 'resolved' }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const rev = revisionOf(await frontier.call('edit_map', { effort: 'alpha' }), 'map');

    await frontier.call('edit_map', {
      effort: 'alpha',
      notes: 'Refresh.',
      expected_revision: rev,
    });

    const onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    expect(onDisk).toContain('- [T1 — First](issues/01-T1-first.md)');
    expect(onDisk).not.toMatch(/\[T1 — First\]\([^)]+\) —\s*$/m);
  });

  it('does not invent Decisions or Out-of-scope headings on an unrelated edit', async () => {
    const slim = `---
header: map
---

# Map

## Destination

Ship slim.

## Notes

Keep slim.
`;
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': slim,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const rev = revisionOf(await frontier.call('edit_map', { effort: 'alpha' }), 'map');

    await frontier.call('edit_map', {
      effort: 'alpha',
      notes: 'Still slim.',
      expected_revision: rev,
    });

    const onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    expect(onDisk).not.toContain('## Decisions so far');
    expect(onDisk).not.toContain('## Out of scope');
    expect(onDisk).toContain('## Notes\n\nStill slim.\n');
  });

  it('refuses a Map edit when expected_revision is stale', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': fullMap(),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const rev = revisionOf(await frontier.call('edit_map', { effort: 'alpha' }), 'map');

    await frontier.call('edit_map', {
      effort: 'alpha',
      notes: 'First writer wins.',
      expected_revision: rev,
    });

    const error = await frontier.callExpectingError('edit_map', {
      effort: 'alpha',
      notes: 'Stale writer loses.',
      expected_revision: rev,
    });
    expect(error).toMatch(/changed on disk|Nothing was written/i);
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

  it('retries Map derived refresh when a concurrent edit_map holds the Map', async () => {
    // Two Frontier instances → two write queues → real filesystem guard races,
    // still entered only through the MCP harness (no guard-path or storage imports).
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': fullMap(),
      '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', {
        status: 'claimed',
        claimed_by: 'a',
        claimed_at: '2026-01-01T00:00:00.000Z',
      }),
    });
    const editor = await connectFrontier({ cwd: root, env: {} });
    const resolver = await connectFrontier({ cwd: root, env: {} });
    const rev = revisionOf(await editor.call('edit_map', { effort: 'alpha' }), 'map');

    const results = await Promise.allSettled([
      editor.call('edit_map', {
        effort: 'alpha',
        notes: 'Concurrent Map edit.',
        expected_revision: rev,
      }),
      resolver.call('update_ticket', {
        id: 'T1',
        resolve: { answer_gist: 'Won the refresh race' },
      }),
    ]);

    const resolveOutcome = results[1];
    expect(resolveOutcome.status).toBe('fulfilled');

    const onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    expect(onDisk).toContain('- [T1 — First](issues/01-T1-first.md) — Won the refresh race');
  });

  it('invents Decisions / Out-of-scope GENERATED headings on resolve when absent', async () => {
    const slim = `---
header: map
---

# Map

## Destination

Ship slim.

## Notes

Keep slim.
`;
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': slim,
      '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', {
        status: 'claimed',
        claimed_by: 'a',
        claimed_at: '2026-01-01T00:00:00.000Z',
      }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('update_ticket', {
      id: 'T1',
      resolve: { answer_gist: 'Invented the Decisions block' },
    });

    const onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    expect(onDisk).toContain('## Decisions so far');
    expect(onDisk).toContain(GENERATED_OPEN);
    expect(onDisk).toContain(
      '- [T1 — First](issues/01-T1-first.md) — Invented the Decisions block',
    );
    expect(onDisk).toContain('## Destination\n\nShip slim.\n');
    expect(onDisk).toContain('## Notes\n\nKeep slim.\n');
  });

  it('resolve succeeds with a warning when Map derived refresh fails', async () => {
    // A directory at map.md lets the Ticket write land, then makes the Map
    // refresh fail on read — chmod on the file cannot, because rename over a
    // read-only target still succeeds when the directory is writable.
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': fullMap(),
      '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', {
        status: 'claimed',
        claimed_by: 'a',
        claimed_at: '2026-01-01T00:00:00.000Z',
      }),
      '.scratch/alpha/issues/02-T2-second.md': ticket('T2', 'Second', {
        status: 'claimed',
        claimed_by: 'a',
        claimed_at: '2026-01-01T00:00:00.000Z',
      }),
    });
    const mapPath = join(root, '.scratch/alpha/map.md');
    await rm(mapPath);
    await mkdir(mapPath);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const result = await frontier.call('update_ticket', {
      id: 'T1',
      resolve: { answer_gist: 'Ticket landed; Map refresh could not' },
    });

    expect(result).toMatch(/status=resolved/);
    expect(result).toMatch(/warnings:/i);
    expect(result).toMatch(/Decisions-so-far|Out-of-scope|stale/i);

    const ticketOnDisk = await readFile(join(root, '.scratch/alpha/issues/01-T1-first.md'), 'utf8');
    expect(ticketOnDisk).toMatch(/status: resolved/);
    expect(ticketOnDisk).toContain('Ticket landed; Map refresh could not');

    await rm(mapPath, { recursive: true });
    await writeFile(mapPath, fullMap(), 'utf8');
    await frontier.call('update_ticket', {
      id: 'T2',
      resolve: { answer_gist: 'Second resolve refreshes the Map' },
    });

    const mapOnDisk = await readFile(mapPath, 'utf8');
    expect(mapOnDisk).toContain(
      '- [T1 — First](issues/01-T1-first.md) — Ticket landed; Map refresh could not',
    );
    expect(mapOnDisk).toContain(
      '- [T2 — Second](issues/02-T2-second.md) — Second resolve refreshes the Map',
    );
  });

  it('leaves content outside the GENERATED markers untouched', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/map.md': fullMap(),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const rev = revisionOf(await frontier.call('edit_map', { effort: 'alpha' }), 'map');

    await frontier.call('edit_map', {
      effort: 'alpha',
      notes: 'Touched.',
      expected_revision: rev,
    });

    const onDisk = await readFile(join(root, '.scratch/alpha/map.md'), 'utf8');
    expect(onDisk).toContain('Hand note kept outside the cache.');
    expect(onDisk).toContain('- Rewriting CONTEXT.md through this tool');
    // Inside the fence is overwritten.
    expect(onDisk).not.toContain('ignore me');
  });
});

describe('spec', () => {
  it('gets and puts a Spec as a whole opaque document', async () => {
    const original = `---
header: spec
---

# Alpha

Opening paragraph.
`;
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/spec.md': original,
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
    const rev = revisionOf(got, 'spec');
    await frontier.call('spec', {
      effort: 'alpha',
      content: replacement,
      expected_revision: rev,
    });

    const onDisk = await readFile(join(root, '.scratch/alpha/spec.md'), 'utf8');
    expect(onDisk).toBe(replacement);
  });

  it('stores Spec put bytes untouched — no BOM strip or trailing newline inject', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/spec.md': `---
header: spec
---

# Alpha
`,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const rev = revisionOf(await frontier.call('spec', { effort: 'alpha' }), 'spec');

    // Opaque: caller bytes land as-is, including a leading BOM and no final \n.
    const opaque = '\uFEFF---\nheader: spec\n---\n\n# No trailing newline';
    await frontier.call('spec', {
      effort: 'alpha',
      content: opaque,
      expected_revision: rev,
    });

    const onDisk = await readFile(join(root, '.scratch/alpha/spec.md'), 'utf8');
    expect(onDisk).toBe(opaque);
  });

  it('preserves a Spec body that mentions header: spec without rewriting frontmatter', async () => {
    const document = `---
header: spec
title: keep me
---

# Alpha

Notes about header: spec in the body stay prose.
`;
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/spec.md': document,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const rev = revisionOf(await frontier.call('spec', { effort: 'alpha' }), 'spec');

    await frontier.call('spec', {
      effort: 'alpha',
      content: document,
      expected_revision: rev,
    });

    const onDisk = await readFile(join(root, '.scratch/alpha/spec.md'), 'utf8');
    expect(onDisk).toBe(document);
  });

  it('refuses a Spec put when expected_revision is stale', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/alpha/spec.md': `---
header: spec
---

# Alpha
`,
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const rev = revisionOf(await frontier.call('spec', { effort: 'alpha' }), 'spec');

    await frontier.call('spec', {
      effort: 'alpha',
      content: `---
header: spec
---

# First
`,
      expected_revision: rev,
    });

    const error = await frontier.callExpectingError('spec', {
      effort: 'alpha',
      content: `---
header: spec
---

# Stale
`,
      expected_revision: rev,
    });
    expect(error).toMatch(/changed on disk|Nothing was written/i);
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
