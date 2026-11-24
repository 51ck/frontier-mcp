import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const FILE = '.scratch/alpha/issues/01-T1-work.md';

const BODY = [
  '---',
  'frontier: ticket',
  'id: T1',
  'title: Work',
  'kind: build',
  'status: open',
  'blocked_by: []',
  '---',
  '',
  '# T1 — Work',
  '',
  '**Problem:** Something needs doing.',
  '',
  '- [ ] The first criterion',
  '- [ ] The second criterion',
  '  - [ ] A nested one, indented',
  '- [x] Already done',
  '',
  'Trailing prose that must not move.',
  '',
].join('\n');

async function withBody(contents = BODY) {
  const root = await makeFixtureTree({
    '.scratch/alpha/map.md': map('Somewhere.'),
    [FILE]: contents,
  });
  return {
    frontier: await connectFrontier({ cwd: root, env: {} }),
    read: async () => readFile(join(root, FILE), 'utf8'),
  };
}

describe('appending a comment', () => {
  it('creates the comments heading the first time', async () => {
    const { frontier, read } = await withBody();

    await frontier.call('update_ticket', { id: 'T1', comment: 'First note.' });

    const onDisk = await read();
    expect(onDisk).toContain('## Comments');
    expect(onDisk).toContain('First note.');
    expect(onDisk.indexOf('## Comments')).toBeLessThan(onDisk.indexOf('First note.'));
  });

  it('appends under the existing heading rather than making a second', async () => {
    const { frontier, read } = await withBody();

    await frontier.call('update_ticket', { id: 'T1', comment: 'First note.' });
    await frontier.call('update_ticket', { id: 'T1', comment: 'Second note.' });

    const onDisk = await read();
    expect(onDisk.match(/^## Comments$/gm)).toHaveLength(1);
    expect(onDisk.indexOf('First note.')).toBeLessThan(onDisk.indexOf('Second note.'));
  });

  it('stores the comment exactly as written', async () => {
    const { frontier, read } = await withBody();

    // What /triage writes, disclaimer and all. Nothing may be prepended,
    // appended, or reformatted around it — the disclaimer is the skill's own to
    // write and injecting one would be putting words in the agent's mouth.
    const verbatim = [
      '**Triaged by an agent.** This assessment is provisional.',
      '',
      '  indented line',
      '',
      '- a list item',
      '',
      'Trailing text with  double  spaces.',
    ].join('\n');

    await frontier.call('update_ticket', { id: 'T1', comment: verbatim });

    expect(await read()).toContain(verbatim);
  });
});

describe('ticking an acceptance criterion', () => {
  it('ticks the one named and leaves every other line byte-identical', async () => {
    const { frontier, read } = await withBody();

    const before = await read();
    await frontier.call('update_ticket', { id: 'T1', tick: ['The second criterion'] });
    const after = await read();

    const changed = after
      .split('\n')
      .map((line, index) => ({ line, was: before.split('\n')[index] }))
      .filter(entry => entry.line !== entry.was);

    expect(changed).toEqual([
      { line: '- [x] The second criterion', was: '- [ ] The second criterion' },
    ]);
  });

  it('keeps a nested criterion at its own indentation', async () => {
    const { frontier, read } = await withBody();

    await frontier.call('update_ticket', { id: 'T1', tick: ['A nested one, indented'] });

    expect(await read()).toContain('  - [x] A nested one, indented');
  });

  it('ticks several in one call', async () => {
    const { frontier, read } = await withBody();

    await frontier.call('update_ticket', {
      id: 'T1',
      tick: ['The first criterion', 'The second criterion'],
    });

    const onDisk = await read();
    expect(onDisk).toContain('- [x] The first criterion');
    expect(onDisk).toContain('- [x] The second criterion');
  });

  it('fails loudly when nothing matches, rather than silently doing nothing', async () => {
    const { frontier, read } = await withBody();

    const before = await read();
    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      tick: ['A criterion that does not exist'],
    });

    expect(error).toContain('A criterion that does not exist');
    expect(await read()).toBe(before);
  });

  it('ticks a criterion whose text wraps across lines', async () => {
    // House style: criterion prose continues on an indented line under the checkbox.
    const wrapped = [
      '---',
      'frontier: ticket',
      'id: T1',
      'title: Work',
      'kind: build',
      'status: open',
      'blocked_by: []',
      '---',
      '',
      '# T1 — Work',
      '',
      '- [ ] The workflow authenticates through one path; an absent `NPM_TOKEN` does not leave an empty',
      '      `_authToken` in `.npmrc`, and does not shadow OIDC',
      '- [ ] A single-line neighbour',
      '',
    ].join('\n');
    const { frontier, read } = await withBody(wrapped);
    const before = await read();

    // As get_tickets returns it — newline and continuation indent intact.
    const asReturned =
      'The workflow authenticates through one path; an absent `NPM_TOKEN` does not leave an empty\n' +
      '      `_authToken` in `.npmrc`, and does not shadow OIDC';
    await frontier.call('update_ticket', { id: 'T1', tick: [asReturned] });

    const after = await read();
    const changed = after
      .split('\n')
      .map((line, index) => ({ line, was: before.split('\n')[index] }))
      .filter(entry => entry.line !== entry.was);

    expect(changed).toEqual([
      {
        line: '- [x] The workflow authenticates through one path; an absent `NPM_TOKEN` does not leave an empty',
        was: '- [ ] The workflow authenticates through one path; an absent `NPM_TOKEN` does not leave an empty',
      },
    ]);
    expect(after).toContain('      `_authToken` in `.npmrc`, and does not shadow OIDC');
    expect(after).toContain('- [ ] A single-line neighbour');
  });

  it('also matches a wrapped criterion re-joined onto one line', async () => {
    const wrapped = [
      '---',
      'frontier: ticket',
      'id: T1',
      'title: Work',
      'kind: build',
      'status: open',
      'blocked_by: []',
      '---',
      '',
      '- [ ] The workflow authenticates through one path; an absent `NPM_TOKEN` does not leave an empty',
      '      `_authToken` in `.npmrc`, and does not shadow OIDC',
      '',
    ].join('\n');
    const { frontier, read } = await withBody(wrapped);

    await frontier.call('update_ticket', {
      id: 'T1',
      tick: [
        'The workflow authenticates through one path; an absent `NPM_TOKEN` does not leave an empty ' +
          '`_authToken` in `.npmrc`, and does not shadow OIDC',
      ],
    });

    expect(await read()).toContain(
      '- [x] The workflow authenticates through one path; an absent `NPM_TOKEN` does not leave an empty',
    );
  });
});

describe('sections a write does not own', () => {
  const WITH_SECTIONS = [
    '---',
    'frontier: ticket',
    'id: T1',
    'title: Work',
    'kind: build',
    'status: open',
    'blocked_by: []',
    '---',
    '',
    '- [ ] The first criterion',
    '',
    '## Comments',
    '',
    'An older note.',
    '',
    '## Notes',
    '',
    'Prose that is not the comment log.',
    '',
  ].join('\n');

  it('appends a comment under the comment log, not under whatever comes last', async () => {
    const { frontier, read } = await withBody(WITH_SECTIONS);

    await frontier.call('update_ticket', { id: 'T1', comment: 'A newer note.' });

    const onDisk = await read();
    const log = onDisk.indexOf('## Comments');
    const notes = onDisk.indexOf('## Notes');

    expect(onDisk.indexOf('A newer note.')).toBeGreaterThan(log);
    expect(onDisk.indexOf('A newer note.')).toBeLessThan(notes);
    expect(onDisk).toContain('Prose that is not the comment log.');
  });

  it('puts a new answer above the comment log, so the log stays at the bottom', async () => {
    const { frontier, read } = await withBody(WITH_SECTIONS);

    await frontier.call('update_ticket', {
      id: 'T1',
      resolve: { answer_gist: 'Settled.', answer: 'The answer.' },
    });

    const onDisk = await read();
    expect(onDisk.indexOf('## Answer')).toBeLessThan(onDisk.indexOf('## Comments'));
    expect(onDisk).toContain('An older note.');
  });

  it('keeps a comment out of the answer when both land in one call', async () => {
    const { frontier, read } = await withBody(WITH_SECTIONS);

    await frontier.call('update_ticket', {
      id: 'T1',
      resolve: { answer_gist: 'Settled.', answer: 'The answer.' },
      comment: 'A closing note.',
    });
    // A second answer replaces its own section and must not take the comment.
    await frontier.call('update_ticket', { id: 'T1', comment: 'Another note.' });

    const onDisk = await read();
    expect(onDisk).toContain('A closing note.');
    expect(onDisk).toContain('Another note.');
    expect(onDisk.indexOf('A closing note.')).toBeGreaterThan(onDisk.indexOf('## Comments'));
  });

  it('does not tick a checkbox inside a fenced code block', async () => {
    const fenced = [
      '---',
      'frontier: ticket',
      'id: T1',
      'title: Work',
      'kind: build',
      'status: open',
      'blocked_by: []',
      '---',
      '',
      '```markdown',
      '- [ ] an example, not a criterion',
      '```',
      '',
      '- [ ] a real criterion',
      '',
    ].join('\n');
    const { frontier, read } = await withBody(fenced);

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      tick: ['an example, not a criterion'],
    });

    expect(error).toContain('No acceptance criterion matches');
    expect(await read()).toContain('- [ ] an example, not a criterion');
  });
});

describe('an ambiguous criterion reference', () => {
  it('is refused rather than ticking everything it could mean', async () => {
    const { frontier, read } = await withBody();

    const before = await read();
    // "criterion" fits both "The first criterion" and "The second criterion".
    // Ticking both would be answering the caller's question for them.
    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      tick: ['criterion'],
    });

    expect(error).toContain('matches 2 criteria');
    expect(await read()).toBe(before);
  });

  it('still accepts an exact match that is a prefix of another', async () => {
    const overlapping = [
      '---',
      'frontier: ticket',
      'id: T1',
      'title: Work',
      'kind: build',
      'status: open',
      'blocked_by: []',
      '---',
      '',
      '- [ ] Add tests',
      '- [ ] Add tests for the parser',
      '',
    ].join('\n');
    const { frontier, read } = await withBody(overlapping);

    await frontier.call('update_ticket', { id: 'T1', tick: ['Add tests'] });

    const onDisk = await read();
    expect(onDisk).toContain('- [x] Add tests\n');
    expect(onDisk).toContain('- [ ] Add tests for the parser');
  });
});

describe('status', () => {
  it('is refused as a direct assignment, naming the transitions instead', async () => {
    const { frontier } = await withBody();

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      status: 'resolved',
    });

    expect(error).toContain('claim, resolve, drop, reopen, or release');
  });
});

/** The Ticket lines a Board marks as takeable. */
function takeable(board: string): string[] {
  return board.split('\n').filter(line => line.startsWith('> '));
}

describe('annotations and the graph', () => {
  it('leave the Frontier untouched', async () => {
    const { frontier } = await withBody();

    const before = await frontier.call('get_board', { effort: 'alpha' });
    await frontier.call('update_ticket', {
      id: 'T1',
      comment: 'A note.',
      tick: ['The first criterion'],
      triage: 'needs-info',
    });
    const after = await frontier.call('get_board', { effort: 'alpha' });

    expect(takeable(after).length).toBe(takeable(before).length);
    expect(after).toContain('> T1');
  });

  it('can ride along with a lifecycle change in one call', async () => {
    const { frontier, read } = await withBody();

    await frontier.call('update_ticket', {
      id: 'T1',
      resolve: { answer_gist: 'Landed.' },
      tick: ['The first criterion'],
      comment: 'Closing note.',
    });

    const onDisk = await read();
    expect(onDisk).toContain('status: resolved');
    expect(onDisk).toContain('- [x] The first criterion');
    expect(onDisk).toContain('Closing note.');
  });
});

describe('adding acceptance criteria', () => {
  const FENCE = [
    '---',
    'frontier: ticket',
    'id: T1',
    'title: Work',
    'kind: build',
    'status: open',
    'blocked_by: []',
    '---',
    '',
  ];
  const ticketWith = (...body: string[]) => [...FENCE, ...body, ''].join('\n');

  it('appends after the last criterion and changes no other line', async () => {
    const { frontier, read } = await withBody();
    const before = await read();

    await frontier.call('update_ticket', { id: 'T1', add_criteria: ['A third', 'A fourth'] });

    const lines = before.split('\n');
    const at = lines.indexOf('- [x] Already done') + 1;
    expect(await read()).toBe(
      [...lines.slice(0, at), '- [ ] A third', '- [ ] A fourth', ...lines.slice(at)].join('\n'),
    );
  });

  it('follows a wrapped last criterion, at the list’s own indentation and bullet', async () => {
    const { frontier, read } = await withBody(
      ticketWith('Intro.', '', '  * [ ] Wrapped across', '    two lines', '', 'Prose.'),
    );

    await frontier.call('update_ticket', { id: 'T1', add_criteria: ['Next'] });

    expect(await read()).toBe(
      ticketWith(
        'Intro.',
        '',
        '  * [ ] Wrapped across',
        '    two lines',
        '  * [ ] Next',
        '',
        'Prose.',
      ),
    );
  });

  it('prefers the Acceptance criteria section to an earlier checkbox list', async () => {
    const { frontier, read } = await withBody(
      ticketWith(
        '## What to build',
        '',
        '- [ ] A step',
        '',
        '## Acceptance criteria',
        '',
        '- [ ] One',
        '',
        '## Notes',
        '',
        '- [ ] A later list',
      ),
    );

    await frontier.call('update_ticket', { id: 'T1', add_criteria: ['Two'] });

    expect(await read()).toContain('- [ ] One\n- [ ] Two\n\n## Notes');
  });

  it('does not take a `##` line inside a code fence for a section break', async () => {
    const { frontier, read } = await withBody(
      ticketWith(
        '## Acceptance criteria',
        '',
        '- [ ] One',
        '```md',
        '## Answer',
        '```',
        '- [ ] Two',
        '',
        '## Notes',
      ),
    );

    await frontier.call('update_ticket', { id: 'T1', add_criteria: ['Three'] });

    expect(await read()).toContain('```\n- [ ] Two\n- [ ] Three\n\n## Notes');
  });

  it('prefers an empty Acceptance criteria section to checkboxes elsewhere', async () => {
    const { frontier, read } = await withBody(
      ticketWith('Intro', '', '- [ ] top one', '', '## Acceptance criteria', '', '## Notes'),
    );

    await frontier.call('update_ticket', { id: 'T1', add_criteria: ['New'] });

    expect(await read()).toBe(
      ticketWith(
        'Intro',
        '',
        '- [ ] top one',
        '',
        '## Acceptance criteria',
        '',
        '- [ ] New',
        '',
        '## Notes',
      ),
    );
  });

  it('otherwise uses the first section holding a checkbox, outside the comment log', async () => {
    const { frontier, read } = await withBody(
      ticketWith(
        '## Done when',
        '',
        '- [ ] One',
        '',
        '## Comments',
        '',
        '- [ ] quoted in a comment',
        '',
        '## Agent Brief',
        '',
        '- [ ] restated',
      ),
    );

    await frontier.call('update_ticket', { id: 'T1', add_criteria: ['Two'] });

    expect(await read()).toContain('- [ ] One\n- [ ] Two\n\n## Comments');
  });

  it('creates the section above the answer and the comment log when there is no list', async () => {
    const { frontier, read } = await withBody(
      ticketWith(
        'Problem prose.',
        '',
        '## Answer',
        '',
        'What landed.',
        '',
        '## Comments',
        '',
        '- [ ] a checkbox in the log is no criteria list',
      ),
    );

    await frontier.call('update_ticket', { id: 'T1', add_criteria: ['One', 'Two'] });

    expect(await read()).toBe(
      ticketWith(
        'Problem prose.',
        '',
        '## Acceptance criteria',
        '',
        '- [ ] One',
        '- [ ] Two',
        '',
        '## Answer',
        '',
        'What landed.',
        '',
        '## Comments',
        '',
        '- [ ] a checkbox in the log is no criteria list',
      ),
    );
  });

  it('creates the section at the end of a body with neither, or as the whole of an empty one', async () => {
    const prose = await withBody(ticketWith('Problem prose.'));
    await prose.frontier.call('update_ticket', { id: 'T1', add_criteria: ['One'] });
    expect(await prose.read()).toBe(
      ticketWith('Problem prose.', '', '## Acceptance criteria', '', '- [ ] One'),
    );

    const bare = await withBody([...FENCE.slice(0, -1), ''].join('\n'));
    await bare.frontier.call('update_ticket', { id: 'T1', add_criteria: ['One'] });
    expect(await bare.read()).toBe(ticketWith('## Acceptance criteria', '', '- [ ] One'));
  });

  it('fills an Acceptance criteria section that holds no checkbox yet', async () => {
    const { frontier, read } = await withBody(
      ticketWith('## Acceptance criteria', '## Notes', '', 'Prose.'),
    );

    await frontier.call('update_ticket', { id: 'T1', add_criteria: ['One'] });

    expect(await read()).toBe(
      ticketWith('## Acceptance criteria', '', '- [ ] One', '', '## Notes', '', 'Prose.'),
    );
  });

  it('can tick a criterion it adds in the same call', async () => {
    const { frontier, read } = await withBody();

    await frontier.call('update_ticket', {
      id: 'T1',
      add_criteria: ['Found mid-work'],
      tick: ['Found mid-work'],
    });

    expect(await read()).toContain('- [x] Already done\n- [x] Found mid-work\n');
  });

  it('is allowed on a resolved Ticket', async () => {
    const { frontier, read } = await withBody();
    await frontier.call('update_ticket', { id: 'T1', resolve: { answer_gist: 'Done.' } });

    await frontier.call('update_ticket', { id: 'T1', add_criteria: ['A late finding'] });

    expect(await read()).toContain('- [ ] A late finding');
  });

  it.each([
    ['a newline', 'One\nTwo'],
    ['a carriage return', 'One\rTwo'],
    ['a line separator', 'One Two'],
    ['a paragraph separator', 'One Two'],
  ])('refuses a value holding %s and writes nothing', async (_, value) => {
    const { frontier, read } = await withBody();
    const before = await read();

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      add_criteria: ['Fine', value],
      tick: ['The first criterion'],
    });

    expect(error).toContain('must be a single line');
    expect(await read()).toBe(before);
  });

  it('refuses a duplicate of a criterion, compared as tick compares, and writes nothing', async () => {
    const { frontier, read } = await withBody();
    const before = await read();

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      add_criteria: ['  the   FIRST criterion '],
    });

    expect(error).toContain('already matches a checkbox of this Ticket that tick would match');
    expect(await read()).toBe(before);
  });

  it('refuses a value repeated in the call and writes nothing', async () => {
    const { frontier, read } = await withBody();
    const before = await read();

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      add_criteria: ['New one', 'new  one'],
    });

    expect(error).toContain('is passed twice in this call');
    expect(await read()).toBe(before);
  });

  it('refuses a blank value', async () => {
    const { frontier, read } = await withBody();
    const before = await read();

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'T1',
      add_criteria: ['   '],
    });

    expect(error).toContain('a criterion must not be blank');
    expect(await read()).toBe(before);
  });
});
