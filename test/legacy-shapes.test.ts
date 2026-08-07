import { afterEach, describe, expect, it } from 'vitest';

import { map } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

/**
 * Shapes the Legacy parser handles that the two copied Efforts do not happen to
 * contain. They were seen while surveying the wider repos, so they are covered
 * here with synthetic files rather than by editing fixtures that must stay
 * verbatim. Still the one seam: everything enters through the tool layer.
 */
async function boardFor(body: string): Promise<string> {
  const root = await makeFixtureTree({
    '.scratch/alpha/map.md': map('Somewhere.'),
    '.scratch/alpha/issues/01-legacy.md': body,
  });
  const frontier = await connectFrontier({ cwd: root, env: {} });
  return frontier.call('get_board', { effort: 'alpha' });
}

function line(board: string): string {
  return board.split('\n').find(entry => entry.includes('Subject')) ?? '';
}

describe('Legacy Status shapes', () => {
  it('reads done and fixed as resolved', async () => {
    expect(line(await boardFor('# T1 — Subject\nStatus: done\n'))).toContain('/resolved');
    expect(line(await boardFor('# T1 — Subject\nStatus: fixed — see elsewhere\n'))).toContain(
      '/resolved',
    );
  });

  it('reads superseded and deferred as closed, keeping them off the Frontier', async () => {
    const boards = await Promise.all(
      ['superseded', 'deferred to 0.6.0'].map(async status =>
        boardFor(`# T1 — Subject\nStatus: ${status}\n`),
      ),
    );

    for (const board of boards) {
      expect(line(board)).toContain('/dropped');
      expect(board.split('\n').filter(entry => entry.startsWith('> '))).toEqual([]);
    }
  });

  it('treats wontfix as a Triage role, not a Status', async () => {
    const board = await boardFor('# T1 — Subject\nStatus: wontfix\n');

    // Mapping it to dropped would make it contagious — every dependent would
    // become a broken Edge over a label that never described a lifecycle.
    expect(line(board)).toContain('/open');
    expect(line(board)).toContain('triage=wontfix');
    // Open, but declined: never offered as takeable.
    expect(board.split('\n').filter(entry => entry.startsWith('> '))).toEqual([]);
  });

  it('keeps a Triage role out of the Status field without losing it', async () => {
    const board = await boardFor('# T1 — Subject\nStatus: needs-triage\n');

    expect(line(board)).toContain('/open');
    expect(line(board)).toContain('triage=needs-triage');
  });

  it('accepts a bold field label', async () => {
    expect(line(await boardFor('# T1 — Subject\n**Status:** resolved\n'))).toContain('/resolved');
  });

  it('never lets a prototype key become a Status', async () => {
    // `STATUS_WORDS[first]` over an object literal would return a function here.
    const board = await boardFor('# T1 — Subject\nStatus: constructor\n');

    expect(line(board)).toContain('/open');
    expect(board).toContain('unrecognized status');
  });

  it('surfaces a status it cannot map rather than trusting it', async () => {
    const board = await boardFor('# T1 — Subject\nStatus: marinating\n');

    expect(line(board)).toContain('/open');
    expect(board).toContain('unrecognized status');
  });
});

describe('Legacy Edge shapes', () => {
  it('drops a withdrawn Edge that was struck through rather than deleted', async () => {
    const board = await boardFor('# T1 — Subject\n**Depends on:** ~~T61; later phase~~\n');

    expect(line(board)).not.toContain('blocked_by=');
  });

  it('reads none and an em-dash as no Edges', async () => {
    expect(line(await boardFor('# T1 — Subject\n**Depends on:** none\n'))).not.toContain(
      'blocked_by=',
    );
    expect(line(await boardFor('# T1 — Subject\nBlocked by: —\n'))).not.toContain('blocked_by=');
  });

  it('coarsens a sub-slice Edge to its parent and says so', async () => {
    const board = await boardFor('# T1 — Subject\n**Depends on:** T38.1 and T38.4\n');

    expect(line(board)).toContain('T38');
    expect(board).toContain('sub-slice Edges coarsened');
    expect(board).toContain('T38.1');
  });

  it('does not mistake a version number for an Edge', async () => {
    const board = await boardFor('# T1 — Subject\nBlocked by: release 0.5.0\n');

    // `0`, `5` and `0` are not Ticket references.
    expect(line(board)).not.toContain('blocked_by=');
  });

  it('does not take an id out of a relative link target', async () => {
    const board = await boardFor(
      '# T1 — Subject\n**Depends on:** none ([../T99/issues/01.md](../T99/issues/01.md))\n',
    );

    expect(line(board)).not.toContain('T99');
  });
});
