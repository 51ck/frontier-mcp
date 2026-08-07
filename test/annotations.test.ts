import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const FILE = '.scratch/alpha/issues/01-T1-work.md';

const BODY = [
  '---',
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
