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

  it('names an Effort that does not exist rather than returning an empty Board', async () => {
    const root = await makeFixtureTree({ '.scratch/alpha/map.md': map('Somewhere.') });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('get_board', { effort: 'nope' });

    expect(error).toContain('nope');
  });
});
