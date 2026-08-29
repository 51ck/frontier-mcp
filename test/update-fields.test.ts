import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const FILE = '.scratch/alpha/issues/01-T1-work.md';

async function withTicket(fields: Parameters<typeof ticket>[2] = {}) {
  const root = await makeFixtureTree({
    '.scratch/alpha/map.md': map('Somewhere.'),
    [FILE]: ticket('T1', 'Work', fields),
  });
  return {
    root,
    frontier: await connectFrontier({ cwd: root, env: {} }),
    read: async () => readFile(join(root, FILE), 'utf8'),
  };
}

describe('title, kind, and type through update_ticket', () => {
  it('sets each field alone', async () => {
    const { frontier, read } = await withTicket({ kind: 'build' });

    await frontier.call('update_ticket', { id: 'T1', title: 'Renamed work' });
    expect(await read()).toContain('title: Renamed work');

    await frontier.call('update_ticket', { id: 'T1', kind: 'decision' });
    expect(await read()).toContain('kind: decision');

    await frontier.call('update_ticket', { id: 'T1', type: 'grilling' });
    expect(await read()).toContain('type: grilling');
  });

  it('rides along with a lifecycle change', async () => {
    const { frontier, read } = await withTicket({ kind: 'build' });

    await frontier.call('update_ticket', {
      id: 'T1',
      claim: { by: 'agent-7' },
      title: 'Held work',
      kind: 'decision',
      type: 'task',
    });

    const onDisk = await read();
    expect(onDisk).toContain('title: Held work');
    expect(onDisk).toContain('kind: decision');
    expect(onDisk).toContain('type: task');
    expect(onDisk).toContain('status: claimed');
    expect(onDisk).toContain('claimed_by: agent-7');
  });

  it('refuses type on a build Ticket', async () => {
    const { frontier } = await withTicket({ kind: 'build' });

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      type: 'grilling',
    });

    expect(error).toContain('build Ticket');
    expect(error).toContain('has no type');
  });

  it('accepts kind decision and type in one call', async () => {
    const { frontier, read } = await withTicket({ kind: 'build' });

    await frontier.call('update_ticket', {
      id: 'T1',
      kind: 'decision',
      type: 'grilling',
    });

    const onDisk = await read();
    expect(onDisk).toContain('kind: decision');
    expect(onDisk).toContain('type: grilling');
  });

  it('clears type when kind becomes build', async () => {
    const { frontier, read } = await withTicket({ kind: 'decision', type: 'research' });

    await frontier.call('update_ticket', { id: 'T1', kind: 'build' });

    const onDisk = await read();
    expect(onDisk).toContain('kind: build');
    expect(onDisk).not.toMatch(/^type:/m);
  });
});

describe('title-only writes', () => {
  it('change title on disk and leave other frontmatter alone', async () => {
    const { frontier, read } = await withTicket({
      kind: 'build',
      triage: 'needs-info',
      blocked_by: ['T2'],
    });

    await frontier.call('update_ticket', { id: 'T1', title: 'First rename' });
    let onDisk = await read();
    expect(onDisk).toContain('title: First rename');
    expect(onDisk).toContain('triage: needs-info');
    expect(onDisk).toContain('blocked_by: [T2]');

    await frontier.call('update_ticket', { id: 'T1', title: 'Second rename' });
    onDisk = await read();
    expect(onDisk).toContain('title: Second rename');
    expect(onDisk).toContain('triage: needs-info');
  });
});
