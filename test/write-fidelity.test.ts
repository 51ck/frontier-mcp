import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const FILE = '.scratch/alpha/issues/01-T1-work.md';

async function withFile(contents: string) {
  const root = await makeFixtureTree({
    '.scratch/alpha/map.md': map('Somewhere.'),
    [FILE]: contents,
  });
  return {
    root,
    frontier: await connectFrontier({ cwd: root, env: {} }),
    read: async () => readFile(join(root, FILE), 'utf8'),
  };
}

describe('a write does not reformat what it did not touch', () => {
  it('keeps field order, comments, quoting and unknown fields', async () => {
    // Deliberately not in the schema's order, and carrying things the schema
    // has never heard of. ADR 0003's whole claim is that all of this survives.
    const original = [
      '---',
      'title: Work',
      '# why this one is odd',
      'blocked_by: []',
      'id: T1',
      'status: open',
      'kind: build',
      'owner: "someone"',
      'tags: [a, b]',
      '---',
      '',
      'Body prose.',
      '',
    ].join('\n');
    const { frontier, read } = await withFile(original);

    await frontier.call('update_ticket', { id: 'T1', claim: { by: 'agent-7' } });

    const onDisk = await read();
    const fields = onDisk
      .split('---')[1]
      ?.split('\n')
      .map(line => line.split(':')[0]?.trim())
      .filter(name => name !== undefined && name !== '');

    // Untouched keys stay exactly where the author put them; the new ones are
    // appended rather than sorted into place.
    expect(fields?.slice(0, 7)).toEqual([
      'title',
      '# why this one is odd',
      'blocked_by',
      'id',
      'status',
      'kind',
      'owner',
    ]);
    expect(onDisk).toContain('# why this one is odd');
    expect(onDisk).toContain('owner: "someone"');
    expect(onDisk).toContain('tags: [a, b]');
    expect(onDisk).toContain('claimed_by: agent-7');
  });

  it('does not duplicate a fence whose YAML will not parse', async () => {
    const broken = ['---', 'id: T1', 'title: [unclosed', '---', '', 'Body prose.', ''].join('\n');
    const { frontier, read } = await withFile(broken);

    await frontier.call('update_ticket', { id: 'alpha#1', claim: { by: 'agent-7' } });

    const onDisk = await read();
    // A malformed fence is normalized, not shovelled into the body.
    expect(onDisk.match(/^---$/gm)).toHaveLength(2);
    expect(onDisk).toContain('Body prose.');
  });
});

describe('writing an answer', () => {
  it('leaves the sections after it alone', async () => {
    const original = [
      '---',
      'id: T1',
      'title: Work',
      'kind: build',
      'status: open',
      'blocked_by: []',
      '---',
      '',
      'Problem prose.',
      '',
      '## Answer',
      '',
      'An earlier answer.',
      '',
      '## Comments',
      '',
      'A human comment that must survive.',
      '',
    ].join('\n');
    const { frontier, read } = await withFile(original);

    await frontier.call('update_ticket', {
      id: 'T1',
      resolve: { answer_gist: 'Settled.', answer: 'The replacement answer.' },
    });

    const onDisk = await read();
    expect(onDisk).toContain('The replacement answer.');
    expect(onDisk).not.toContain('An earlier answer.');
    // The comment log is a separate mutation point and belongs to T4.
    expect(onDisk).toContain('## Comments');
    expect(onDisk).toContain('A human comment that must survive.');
    expect(onDisk).toContain('Problem prose.');
  });

  it('does not mistake a similarly named heading for the Answer', async () => {
    const original = [
      '---',
      'id: T1',
      'title: Work',
      'kind: build',
      'status: open',
      'blocked_by: []',
      '---',
      '',
      '## Answerable questions',
      '',
      'Not the answer section.',
      '',
    ].join('\n');
    const { frontier, read } = await withFile(original);

    await frontier.call('update_ticket', {
      id: 'T1',
      resolve: { answer_gist: 'Settled.', answer: 'The real answer.' },
    });

    const onDisk = await read();
    expect(onDisk).toContain('## Answerable questions');
    expect(onDisk).toContain('Not the answer section.');
    expect(onDisk).toContain('## Answer\n\nThe real answer.');
  });
});
