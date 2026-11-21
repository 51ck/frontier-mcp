import { afterEach, describe, expect, it } from 'vitest';

import { spec, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const BODY = [
  'goals: token-effective',
  '',
  '## Problem',
  '',
  'The problem statement.',
  '',
  '```md',
  '## Answer',
  'An illustration inside a code fence, not a heading.',
  '```',
  '',
  '## Acceptance criteria  ',
  '',
  '- [x] First',
  '- [ ] Second',
  '',
  '### A subsection, which belongs to its section',
  '',
  'Detail.',
  '',
  '## Answer',
  '',
  'The answer.',
  '',
  '## Comments',
  '',
  'First comment.',
  '',
  '## comments',
  '',
  'A second log, under the same heading in another case.',
].join('\n');

async function workspace() {
  const root = await makeFixtureTree({
    '.scratch/alpha/spec.md': spec('Alpha'),
    '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', {
      status: 'resolved',
      answer_gist: 'Done.',
      body: BODY,
    }),
    '.scratch/alpha/issues/02-T2-second.md': ticket('T2', 'Second', {
      blocked_by: ['T1'],
      body: '## Problem\n\nNo criteria here.',
    }),
    '.scratch/alpha/issues/03-stray.md':
      '---\nfrontier: ticket\ntitle: Stray\nstatus: open\nowner: someone\n---\n\n## Problem\n\nP.\n',
  });
  return connectFrontier({ cwd: root, env: {} });
}

describe('get_tickets sections', () => {
  it('returns only the named sections under the header line', async () => {
    const frontier = await workspace();

    const text = await frontier.call('get_tickets', {
      ids: ['T1'],
      sections: [' acceptance CRITERIA ', 'Answer'],
    });

    expect(text).toBe(
      [
        '# T1 — First',
        'effort=alpha  kind=build  status=resolved  blocks=T2  answer_gist=Done.',
        '',
        '## Acceptance criteria  ',
        '',
        '- [x] First',
        '- [ ] Second',
        '',
        '### A subsection, which belongs to its section',
        '',
        'Detail.',
        '',
        '## Answer',
        '',
        'The answer.',
      ].join('\n'),
    );
  });

  it('says in its own block which sections a Ticket lacks, without failing the call', async () => {
    const frontier = await workspace();

    const text = await frontier.call('get_tickets', {
      ids: ['T1', 'T2', 'T9'],
      sections: ['Acceptance criteria'],
    });

    expect(text).toBe(
      [
        '# T1 — First',
        'effort=alpha  kind=build  status=resolved  blocks=T2  answer_gist=Done.',
        '',
        '## Acceptance criteria  ',
        '',
        '- [x] First',
        '- [ ] Second',
        '',
        '### A subsection, which belongs to its section',
        '',
        'Detail.',
        '',
        '---',
        '',
        '# T2 — Second',
        'effort=alpha  kind=build  status=open  blocked_by=T1',
        '',
        'no section: ## Acceptance criteria',
        '',
        '---',
        '',
        'not found: T9',
      ].join('\n'),
    );
  });

  it('returns every section a repeated heading opens, in file order', async () => {
    const frontier = await workspace();

    const text = await frontier.call('get_tickets', {
      ids: ['T1'],
      sections: ['Comments', 'comments', 'Answer'],
    });

    expect(text.split('\n\n').slice(1)).toEqual([
      '## Answer',
      'The answer.',
      '## Comments',
      'First comment.',
      '## comments',
      'A second log, under the same heading in another case.',
    ]);
  });

  it('leaves out the text above the first heading and the Unimported appendix unless named', async () => {
    const frontier = await workspace();

    const problem = await frontier.call('get_tickets', { ids: ['T1'], sections: ['Problem'] });
    expect(problem).not.toContain('goals:');
    // A `##` line inside a code fence starts no section.
    expect(problem).toContain('An illustration inside a code fence, not a heading.');
    expect(problem).not.toContain('## Acceptance criteria');

    const stray = await frontier.call('get_tickets', {
      ids: ['alpha.stray'],
      sections: ['Problem'],
    });
    expect(stray).not.toContain('Unimported');

    const appendix = await frontier.call('get_tickets', {
      ids: ['alpha.stray', 'T2'],
      sections: ['Unimported frontmatter'],
    });
    expect(appendix).toContain('## Unimported frontmatter\n\n```yaml\nowner: someone\n```');
    expect(appendix).not.toContain('## Problem');
    expect(appendix).toContain('no section: ## Unimported frontmatter');
  });

  it('leaves an unfiltered read as it was', async () => {
    const frontier = await workspace();

    const text = await frontier.call('get_tickets', { ids: ['T1', 'alpha.stray'] });

    expect(text).toBe(
      [
        '# T1 — First',
        'effort=alpha  kind=build  status=resolved  blocks=T2  answer_gist=Done.',
        '',
        `# T1 — First\n\n${BODY}`,
        '',
        '---',
        '',
        '# alpha.stray — Stray',
        'effort=alpha  kind=build  status=open',
        '',
        '## Problem',
        '',
        'P.',
        '',
        '## Unimported frontmatter',
        '',
        '```yaml',
        'owner: someone',
        '```',
      ].join('\n'),
    );
  });

  it('closes a fence only on its own character, at least as long', async () => {
    const body = [
      '## Problem',
      '',
      '~~~',
      '```',
      '## Fake in tildes',
      '```',
      '~~~',
      '',
      '````md',
      '```',
      '## Fake in four backticks',
      '```',
      '````',
      '',
      'A prose line quoting ```inline``` code opens no fence.',
      '',
      '## Notes ##',
      '',
      'Closed by a hash run.',
      '',
      '## C#',
      '',
      'Keeps its hash.',
    ].join('\n');
    const root = await makeFixtureTree({
      '.scratch/alpha/spec.md': spec('Alpha'),
      '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First', { body }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const problem = await frontier.call('get_tickets', { ids: ['T1'], sections: ['Problem'] });
    expect(problem).toContain('## Fake in tildes');
    expect(problem).toContain('## Fake in four backticks');
    expect(problem).toContain('opens no fence.');
    expect(problem).not.toContain('## Notes');

    const notes = await frontier.call('get_tickets', {
      ids: ['T1'],
      sections: ['notes', 'C#', 'Fake in tildes'],
    });
    expect(notes.split('\n\n').slice(1)).toEqual([
      '## Notes ##',
      'Closed by a hash run.',
      '## C#',
      'Keeps its hash.',
      'no section: ## Fake in tildes',
    ]);
  });

  it('refuses an empty list and a blank heading', async () => {
    const frontier = await workspace();

    expect(await frontier.callExpectingError('get_tickets', { ids: ['T1'], sections: [] })).toMatch(
      /sections/,
    );
    expect(
      await frontier.callExpectingError('get_tickets', { ids: ['T1'], sections: ['Answer', ' '] }),
    ).toMatch(/a section heading must not be blank/);
  });
});
