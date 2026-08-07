import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const BODY = 'Prose a Board must never carry, because prose is what makes an Effort expensive.';

describe('get_board', () => {
  it('opens with the Effort Destination, then one line per Ticket, and never a body', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Ship the read path.'),
      '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', { body: BODY }),
      '.scratch/alpha/issues/02-T2-second.md': ticket('T2', 'Second', {
        status: 'resolved',
        answer_gist: 'Landed behind the seam.',
        body: BODY,
      }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('get_board', { effort: 'alpha' });

    expect(text).toContain('Ship the read path.');
    expect(text).toContain('T1');
    expect(text).toContain('First');
    expect(text).toContain('T2');
    expect(text).toContain('Second');
    expect(text).not.toContain(BODY);
  });

  it('orders Tickets by their sort order, not by id', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T9-first.md': ticket('T9', 'First'),
      '.scratch/alpha/issues/02-T4-second.md': ticket('T4', 'Second'),
      '.scratch/alpha/issues/03-T7-third.md': ticket('T7', 'Third'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('get_board', { effort: 'alpha' });

    expect(text.indexOf('T9')).toBeLessThan(text.indexOf('T4'));
    expect(text.indexOf('T4')).toBeLessThan(text.indexOf('T7'));
  });

  it('carries the fields that make a Board of finished work readable', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-resolved.md': ticket('T1', 'Resolved', {
        status: 'resolved',
        answer_gist: 'Landed behind the seam.',
        body: BODY,
      }),
      '.scratch/alpha/issues/02-T2-dropped.md': ticket('T2', 'Dropped', {
        status: 'dropped',
        dropped_reason: 'Beyond the destination.',
        body: BODY,
      }),
      '.scratch/alpha/issues/03-T3-claimed.md': ticket('T3', 'Claimed', {
        status: 'claimed',
        claimed_by: 'agent-7',
        claimed_at: '2026-08-07T00:00:00Z',
        body: BODY,
      }),
      '.scratch/alpha/issues/04-T4-decision.md': ticket('T4', 'Question', {
        kind: 'decision',
        type: 'research',
        triage: 'ready-for-agent',
        body: BODY,
      }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    // A resolved Ticket's one line of what landed is the whole reason a Board
    // of finished work is worth reading at all.
    expect(board).toContain('gist=Landed behind the seam.');
    expect(board).toContain('dropped=Beyond the destination.');
    expect(board).toContain('claimed_by=agent-7');
    expect(board).toContain('triage=ready-for-agent');
    expect(board).toContain('decision/open');
    expect(board).not.toContain(BODY);

    // type and claimed_at are detail, so they ride on get_tickets instead.
    const detail = await frontier.call('get_tickets', { ids: ['T3', 'T4'] });
    expect(detail).toContain('claimed_at=2026-08-07T00:00:00Z');
    expect(detail).toContain('type=research');
  });

  it('does not let author prose forge a field boundary', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/alpha/issues/01-T1-spaced.md': ticket('T1', 'Title   with   wide   gaps'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const line =
      (await frontier.call('get_board', { effort: 'alpha' }))
        .split('\n')
        .find(entry => entry.includes('T1')) ?? '';

    // Fields join on two spaces, so a title carrying its own must not split.
    // The leading '> ' is the Frontier marker: this Ticket is takeable.
    expect(line.split('  ')).toEqual(['> T1', 'Title with wide gaps', 'build/open']);
  });

  it('names an Effort that does not exist rather than returning an empty Board', async () => {
    const root = await makeFixtureTree({ '.scratch/alpha/map.md': map('Somewhere.') });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('get_board', { effort: 'nope' });

    expect(error).toContain('nope');
  });
});
