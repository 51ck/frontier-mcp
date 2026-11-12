import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import {
  cleanupFixtures,
  connectFrontier,
  makeFixtureTree,
  makeForeignWorkspace,
} from './support/harness.ts';

afterEach(cleanupFixtures);

describe('Edges on a Board', () => {
  it('annotates a blocker owned by another Effort with that Effort slug', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-local.md': ticket('T1', 'Local'),
      '.scratch/alpha/issues/02-T2-crosses.md': ticket('T2', 'Crosses', {
        blocked_by: ['T1', 'T9'],
      }),
      '.scratch/beta/map.md': map('Elsewhere.'),
      '.scratch/beta/issues/01-T9-foreign.md': ticket('T9', 'Foreign'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('get_board', { effort: 'alpha' });

    // A local blocker needs no annotation; a foreign one is followable only if
    // the Board says which Effort owns it.
    expect(text).toContain('blocked_by=T1,T9@beta');
  });
});

describe('the warnings block', () => {
  it('reports an Edge pointing at a Ticket that does not exist', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-dangling.md': ticket('T1', 'Dangling', {
        blocked_by: ['T404'],
      }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('get_board', { effort: 'alpha' });

    expect(text).toContain('warnings:');
    expect(text).toContain('T404');
    // A dangling Edge must not quietly make a Ticket look takeable.
    expect(text.split('\n').filter(line => line.startsWith('> '))).toEqual([]);
  });

  it('reports a Ticket left blocked by a dropped Ticket', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-dropped.md': ticket('T1', 'Dropped', {
        status: 'dropped',
        dropped_reason: 'Ruled out.',
      }),
      '.scratch/alpha/issues/02-T2-orphaned.md': ticket('T2', 'Orphaned', { blocked_by: ['T1'] }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('get_board', { effort: 'alpha' });

    expect(text).toContain('warnings:');
    expect(text).toContain('T2');
    expect(text).toContain('dropped');
  });

  it('is absent entirely when nothing is wrong', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-fine.md': ticket('T1', 'Fine'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('get_board', { effort: 'alpha' })).not.toContain('warnings:');
  });
});

describe('lifecycle Tickets missing their field (T85)', () => {
  const now = new Date().toISOString();

  it('counts each missing field against its Status, grouped, never itemized', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-a.md': ticket('T1', 'A', { status: 'resolved' }),
      '.scratch/alpha/issues/02-T2-b.md': ticket('T2', 'B', { status: 'resolved' }),
      '.scratch/alpha/issues/03-T3-c.md': ticket('T3', 'C', {
        status: 'resolved',
        answer_gist: 'Done.',
      }),
      '.scratch/alpha/issues/04-T4-d.md': ticket('T4', 'D', { status: 'dropped' }),
      '.scratch/alpha/issues/05-T5-e.md': ticket('T5', 'E', { status: 'claimed', claimed_at: now }),
      '.scratch/alpha/issues/07-T7-g.md': ticket('T7', 'G', {
        status: 'claimed',
        claimed_by: 'someone',
      }),
      '.scratch/alpha/issues/06-T6-f.md': ticket('T6', 'F', {
        status: 'claimed',
        claimed_by: 'someone',
        claimed_at: now,
      }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });
    const warnings = board.slice(board.indexOf('warnings:')).split('\n');

    expect(warnings).toContain('  2/3 resolved Tickets carry no answer_gist');
    expect(warnings).toContain('  1/1 dropped Tickets carry no dropped_reason');
    expect(warnings).toContain('  1/3 claimed Tickets carry no claimed_by');
    expect(warnings).toContain('  1/3 claimed Tickets carry no claimed_at');
    expect(warnings.some(line => /carry no .*\bT[1-7]\b/.test(line))).toBe(false);
  });

  it('adds nothing when every lifecycle Ticket carries its field', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-a.md': ticket('T1', 'A', {
        status: 'resolved',
        answer_gist: 'Done.',
      }),
      '.scratch/alpha/issues/02-T2-b.md': ticket('T2', 'B', {
        status: 'dropped',
        dropped_reason: 'Out.',
      }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('get_board', { effort: 'alpha' })).not.toContain('warnings:');
  });

  it('counts a foreign-fenced Ticket, whose Status was read from its fence', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-a.md':
        '---\ntitle: A\nlabels: bug\nstatus: resolved\n---\n\nBody.\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain(
      '1/1 resolved Tickets carry no answer_gist',
    );
  });

  it('counts the resolved Tickets a migration leaves without a gist', async () => {
    const root = await makeForeignWorkspace({ telegram: 'sobrina-telegram' });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    expect(await frontier.call('get_board', { effort: 'telegram' })).not.toContain('carry no');

    await frontier.call('migrate_effort', { effort: 'telegram' });

    expect(await frontier.call('get_board', { effort: 'telegram' })).toContain(
      '15/15 resolved Tickets carry no answer_gist',
    );
  });

  it('does not count a fenceless Foreign Ticket, whose answer is prose', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-a.md': '# T1 — Prose\n\nStatus: done\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('get_board', { effort: 'alpha' })).not.toContain('carry no');
  });
});
