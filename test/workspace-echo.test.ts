import { afterEach, describe, expect, it } from 'vitest';

import { map, spec, ticket } from './support/fixtures.ts';
import {
  cleanupFixtures,
  connectFrontier,
  makeFixtureTree,
  makeLegacyWorkspace,
} from './support/harness.ts';
import { tokens } from './support/tokens.ts';

afterEach(cleanupFixtures);

const WORKSPACE = {
  '.git/HEAD': 'ref: refs/heads/main\n',
  '.scratch/demo/spec.md': spec('Demo'),
  '.scratch/demo/issues/01-T1-first.md': ticket('T1', 'First'),
  '.scratch/demo/issues/02-T2-second.md': ticket('T2', 'Second'),
  '.scratch/charted/map.md': map('Ship the charted thing.'),
};

/** The workspace line is the first line, in the form `list_efforts` established. */
function namesWorkspace(text: string, root: string): boolean {
  return text.startsWith(`root: ${root}\n`);
}

describe('a write names the workspace it resolved', () => {
  it('on update_ticket', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('update_ticket', { id: 'T1', claim: { by: 'agent-1' } });

    expect(namesWorkspace(text, root)).toBe(true);
    expect(text).toContain('T1 updated');
  });

  it('on create_tickets', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('create_tickets', {
      effort: 'demo',
      tickets: [{ key: 'a', title: 'A new Ticket', kind: 'build', body: 'Body.' }],
    });

    expect(namesWorkspace(text, root)).toBe(true);
    expect(text).toContain('demo: 1 created');
  });

  it('on edit_map when a section is actually edited', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const before = await frontier.call('edit_map', { effort: 'charted' });
    const revision = /map revision: (\S+)/.exec(before)?.[1];

    const text = await frontier.call('edit_map', {
      effort: 'charted',
      notes: 'Notes that replace what was there.',
      expected_revision: revision,
    });

    expect(namesWorkspace(text, root)).toBe(true);
  });

  it('on edit_map when it creates the Effort', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('edit_map', { effort: 'brand-new', create: true });

    expect(namesWorkspace(text, root)).toBe(true);
  });

  it('on a spec put', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const before = await frontier.call('spec', { effort: 'demo' });
    const revision = /spec revision: (\S+)/.exec(before)?.[1];

    const text = await frontier.call('spec', {
      effort: 'demo',
      content: '---\nheader: spec\n---\n\n# Demo, rewritten\n',
      expected_revision: revision,
    });

    expect(namesWorkspace(text, root)).toBe(true);
  });

  it('on migrate_effort when it is not a preview', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('migrate_effort', { effort: 'demo' });

    expect(namesWorkspace(text, root)).toBe(true);
  });

  it('naming the workspace the call resolved, not the session default', async () => {
    const session = await makeFixtureTree(WORKSPACE);
    const other = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: session, env: {} });

    const text = await frontier.call('update_ticket', {
      id: 'T1',
      claim: { by: 'agent-1' },
      root: other,
    });

    expect(namesWorkspace(text, other)).toBe(true);
    expect(text).not.toContain(session);
  });
});

// A tool annotated as mutating is not the same thing as a call that mutated.
// Three of them have a pure read path, and a read has never needed the line —
// its content already shows which repository answered.
describe('a read does not, even through a tool that can write', () => {
  it('edit_map with no section fields', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('edit_map', { effort: 'charted' });

    expect(text.startsWith('effort: charted')).toBe(true);
    expect(text).not.toContain('root: ');
  });

  it('spec with no content', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('spec', { effort: 'demo' });

    expect(text.startsWith('effort: demo')).toBe(true);
    expect(text).not.toContain('root: ');
  });

  it('migrate_effort in preview', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('migrate_effort', { effort: 'demo', preview: true });

    expect(text).not.toContain('root: ');
  });

  it('get_board and get_tickets', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('get_board', { effort: 'demo' })).not.toContain('root: ');
    expect(await frontier.call('get_tickets', { ids: ['T1'] })).not.toContain('root: ');
  });

  it('list_efforts still names it exactly once', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('list_efforts');

    expect(namesWorkspace(text, root)).toBe(true);
    expect(text.split('root: ').length - 1).toBe(1);
  });
});

/**
 * The cost of the line is the whole case against it, so T11 required it
 * measured rather than assumed, and it is pinned here rather than left in
 * prose. The path is a representative checkout rather than the test's own
 * temporary directory, whose length says nothing about anybody's repository.
 */
const REPRESENTATIVE_ROOT = '/Users/epee/Projects/frontier-mcp';

describe('what naming the workspace costs', () => {
  it('is about ten tokens on a typical checkout', () => {
    expect(tokens(`root: ${REPRESENTATIVE_ROOT}\n`)).toBe(10);
  });

  it('buys the whole write path for less than one Board', async () => {
    const root = await makeLegacyWorkspace({ telegram: 'sobrina-telegram' });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = tokens(await frontier.call('get_board', { effort: 'telegram' }));

    // Forty writes is a heavy session. The comparison is the one that matters:
    // the whole session's worth of workspace lines costs less than a single
    // extra Board read, which is the unit this server's frugality is measured
    // in. A write response is small, so the line is a large fraction of one —
    // it is the absolute number that decides, not the percentage.
    expect(tokens(`root: ${REPRESENTATIVE_ROOT}\n`) * 40).toBeLessThan(board);
  });
});
