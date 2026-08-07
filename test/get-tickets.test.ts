import { afterEach, describe, expect, it } from 'vitest';

import { spec, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

describe('get_tickets', () => {
  it('returns the full body of a Ticket by id', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/spec.md': spec('Alpha'),
      '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', {
        body: 'The whole problem statement, which a Board never shows.',
      }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('get_tickets', { ids: ['T1'] });

    expect(text).toContain('T1');
    expect(text).toContain('First');
    expect(text).toContain('The whole problem statement, which a Board never shows.');
  });
});
