import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';
import { map, ticket } from './support/fixtures.ts';

afterEach(cleanupFixtures);

const WORKSPACE = {
  '.git/HEAD': 'ref: refs/heads/main\n',
  '.scratch/alpha/map.md': map('Ship alpha.'),
  '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First'),
  '.scratch/alpha/issues/02-T2-second.md': ticket('T2', 'Second', { blocked_by: ['T1'] }),
  '.scratch/beta/map.md': map('Ship beta.'),
  '.scratch/beta/issues/01-T3-third.md': ticket('T3', 'Third'),
};

describe('cycle rejection on creation', () => {
  it('refuses a loop closed between two drafts, and creates neither', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [
        { name: 'chicken', title: 'Chicken', blocked_by: ['egg'] },
        { name: 'egg', title: 'Egg', blocked_by: ['chicken'] },
      ],
    });

    expect(error).toContain('cycle');
    expect(error).toContain('alpha.chicken -> alpha.egg -> alpha.chicken');
    expect(await frontier.call('get_board', { effort: 'alpha' })).not.toContain('Chicken');
  });

  it('refuses a loop closed between two drafts when one is named in full', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [
        { name: 'chicken', title: 'Chicken', blocked_by: ['alpha.egg'] },
        { name: 'egg', title: 'Egg', blocked_by: ['chicken'] },
      ],
    });

    expect(error).toContain('cycle');
  });

  it('refuses a draft that blocks itself', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'ouroboros', title: 'Ouroboros', blocked_by: ['ouroboros'] }],
    });

    expect(error).toContain('cycle');
  });

  it('refuses a loop closed through Tickets already on disk', async () => {
    const root = await makeFixtureTree({
      ...WORKSPACE,
      // T1 already waits on a name nobody has written yet — a dangling Edge,
      // and a Board warning rather than a refusal.
      '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', { blocked_by: ['keystone'] }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    // Creating keystone as something blocked by T2, which waits on T1, which
    // waits on keystone, is the moment that dangling Edge becomes a loop.
    const error = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'keystone', title: 'Closes the loop', blocked_by: ['T2'] }],
    });

    expect(error).toContain('cycle');
    expect(error).toContain('alpha.keystone -> T2 -> T1 -> alpha.keystone');
    expect(await frontier.call('get_board', { effort: 'alpha' })).not.toContain('Closes the loop');
  });

  it("does not close a loop through another Effort's dangling Edge on the same bare name", async () => {
    const root = await makeFixtureTree({
      ...WORKSPACE,
      // A bare name means a Ticket of its own Effort, so beta's dangling
      // keystone is not the one alpha is about to create.
      '.scratch/beta/issues/01-T3-third.md': ticket('T3', 'Third', { blocked_by: ['keystone'] }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'keystone', title: 'Keystone', blocked_by: ['T3'] }],
    });
  });

  it('allows a diamond, which is not a cycle', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [
        { name: 'left', title: 'Left', blocked_by: ['T1'] },
        { name: 'right', title: 'Right', blocked_by: ['T1'] },
        { name: 'join', title: 'Join', blocked_by: ['left', 'right'] },
      ],
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('join  Join  build/open  blocked_by=left,right');
  });
});

describe('Edge mutation through update_ticket', () => {
  it('replaces the Edge list, and the Board follows', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('update_ticket', { id: 'T2', blocked_by: ['T3'] });

    const onDisk = await readFile(join(root, '.scratch/alpha/issues/02-T2-second.md'), 'utf8');
    expect(onDisk).toContain('blocked_by: [T3]');
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('blocked_by=T3@beta');
  });

  it('clears the Edge list when given an empty one, freeing the Ticket', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('update_ticket', { id: 'T2', blocked_by: [] });

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('> T2  Second  build/open');
    expect(board).not.toContain('blocked_by');
  });

  it('is validated by the same cycle check, and writes nothing when it fails', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    // T2 already waits on T1, so pointing T1 at T2 closes the loop.
    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      blocked_by: ['T2'],
    });

    expect(error).toContain('cycle');
    const onDisk = await readFile(join(root, '.scratch/alpha/issues/01-T1-first.md'), 'utf8');
    expect(onDisk).toContain('blocked_by: []');
  });

  it('refuses a Ticket blocking itself', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(
      await frontier.callExpectingError('update_ticket', { id: 'T1', blocked_by: ['T1'] }),
    ).toContain('cycle');
  });

  it('accepts an Edge on a Ticket that does not exist, as a Board warning', async () => {
    const root = await makeFixtureTree(WORKSPACE);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('update_ticket', { id: 'T1', blocked_by: ['T404'] });

    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain('dangling Edges (1)');
  });
});
