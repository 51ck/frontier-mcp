import { link, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

const named = (title: string): string =>
  `---\nfrontier: ticket\ntitle: ${title}\nstatus: open\n---\n`;

describe('create_tickets against an Effort spelled in another case', () => {
  it('is refused, naming the spelling on disk, and creates nothing', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/auth/issues/05-cache.md': named('Cache'),
      '.scratch/auth/issues/login.md': named('Login'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('create_tickets', {
      effort: 'AUTH',
      create: true,
      tickets: [{ name: 'session', title: 'Session', blocked_by: ['logn'] }],
    });

    expect(error).toContain("there is 'auth'");
    expect(await readdir(join(root, '.scratch'))).toEqual(['auth']);
    expect((await readdir(join(root, '.scratch', 'auth', 'issues'))).toSorted()).toEqual([
      '05-cache.md',
      'login.md',
    ]);
  });
});

describe('create_tickets with a name another Effort already answers to in full', () => {
  it('is refused when a dotted stem elsewhere has the same full name', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/a/issues/b.foo.md': named('Dotted'),
      '.scratch/a.b/issues/other.md': named('Other'),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('create_tickets', {
      effort: 'a.b',
      tickets: [{ name: 'foo', title: 'Foo' }],
    });

    expect(error).toContain('would share the full name a.b.foo with a Ticket of a');
    expect(await readdir(join(root, '.scratch', 'a.b', 'issues'))).toEqual(['other.md']);
  });
});

describe('a staged file left behind by an interrupted create', () => {
  it('is never written through into the Ticket it is still linked to', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.scratch/auth/issues/victim.md': named('Victim'),
    });
    const issues = join(root, '.scratch', 'auth', 'issues');
    // The staged name is built from the pid and a per-process counter, so every
    // name the next few stagings could take is planted as a link to the victim.
    await Promise.all(
      Array.from({ length: 200 }, (_, index) =>
        link(
          join(issues, 'victim.md'),
          join(issues, `.frontier-${String(process.pid)}-${String(index + 1)}.tmp`),
        ),
      ),
    );
    const frontier = await connectFrontier({ cwd: root, env: {} });

    await frontier.call('create_tickets', {
      effort: 'auth',
      tickets: [{ name: 'fresh', title: 'Fresh' }],
    });

    expect(await readFile(join(issues, 'victim.md'), 'utf8')).toBe(named('Victim'));
    expect(await readFile(join(issues, 'fresh.md'), 'utf8')).toContain('title: Fresh');
  });
});
