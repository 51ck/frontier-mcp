import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { WORKSPACE_ENV_VAR } from '../src/workspace.ts';
import { spec, ticket } from './support/fixtures.ts';
import {
  cleanupFixtures,
  connectFrontier,
  makeFixtureTree,
  type FixtureTree,
} from './support/harness.ts';

afterEach(cleanupFixtures);

/** Where this project puts its worktrees, and so where a nested repository really appears. */
const WORKTREE = '.claude/worktrees/feature';

/** A workspace whose single Effort is named after it, so a listing identifies its source. */
function workspaceNamed(name: string): FixtureTree {
  return {
    '.git/HEAD': 'ref: refs/heads/main\n',
    ...trackerNamed(name),
  };
}

/**
 * A git worktree, and equally a submodule: `.git` is a *file* pointing at the
 * real git directory, never a directory of its own.
 */
function worktreeNamed(name: string): FixtureTree {
  return {
    '.git': 'gitdir: /parent/.git/worktrees/feature\n',
    ...trackerNamed(name),
  };
}

function trackerNamed(name: string): FixtureTree {
  return {
    [`.scratch/${name}/spec.md`]: spec(name),
    [`.scratch/${name}/issues/01-T1-only.md`]: ticket('T1', 'Only'),
  };
}

/** The same tree, rooted at a subdirectory — a repository nested inside another. */
function nestedUnder(prefix: string, tree: FixtureTree): FixtureTree {
  return Object.fromEntries(
    Object.entries(tree).map(([path, contents]) => [join(prefix, path), contents]),
  );
}

describe('workspace resolution', () => {
  it('walks up from the working directory to the nearest .scratch/', async () => {
    const root = await makeFixtureTree({
      ...workspaceNamed('from-scratch-marker'),
      'src/deep/nested/.keep': '',
    });
    const frontier = await connectFrontier({ cwd: join(root, 'src/deep/nested'), env: {} });

    const text = await frontier.call('list_efforts');

    expect(text).toContain(`root: ${root}`);
    expect(text).toContain('from-scratch-marker');
  });

  it('walks up to a .git/ marker in a repo that has no .scratch/ yet', async () => {
    const root = await makeFixtureTree({
      '.git/HEAD': 'ref: refs/heads/main\n',
      'src/deep/.keep': '',
    });
    const frontier = await connectFrontier({ cwd: join(root, 'src/deep'), env: {} });

    expect(await frontier.call('list_efforts')).toBe(`root: ${root}\n(no efforts)`);
  });

  // A nested repository is only distinguishable from its parent while it carries
  // no `.scratch/` of its own — with one, the tracker marker matches first and
  // resolution never reaches the `.git` question. So the discriminating fixtures
  // below omit it deliberately.

  it('treats a directory holding a .git file as its own workspace', async () => {
    const outer = await makeFixtureTree({
      ...workspaceNamed('outer-repo'),
      'vendor/lib/.git': 'gitdir: ../../.git/modules/lib\n',
    });
    const submodule = join(outer, 'vendor/lib');
    const frontier = await connectFrontier({ cwd: submodule, env: {} });

    expect(await frontier.call('list_efforts')).toBe(`root: ${submodule}\n(no efforts)`);
  });

  it('serves no Efforts when a worktree branch carries no .scratch/ of its own', async () => {
    const parent = await makeFixtureTree({
      ...workspaceNamed('parent-repo'),
      [`${WORKTREE}/.git`]: 'gitdir: /parent/.git/worktrees/feature\n',
      [`${WORKTREE}/src/deep/.keep`]: '',
    });
    const worktree = join(parent, WORKTREE);
    const frontier = await connectFrontier({ cwd: join(worktree, 'src/deep'), env: {} });

    expect(await frontier.call('list_efforts')).toBe(`root: ${worktree}\n(no efforts)`);
  });

  it('serves a worktree its own .scratch/, not the repository it was made from', async () => {
    const parent = await makeFixtureTree({
      ...workspaceNamed('parent-repo'),
      ...nestedUnder(WORKTREE, worktreeNamed('worktree-repo')),
    });
    const worktree = join(parent, WORKTREE);
    const frontier = await connectFrontier({ cwd: worktree, env: {} });

    const text = await frontier.call('list_efforts');

    expect(text).toContain(`root: ${worktree}`);
    expect(text).toContain('worktree-repo');
    expect(text).not.toContain('parent-repo');
  });

  it('ignores a .scratch file, since only a tracker directory is a marker', async () => {
    const root = await makeFixtureTree({
      ...workspaceNamed('outer-repo'),
      'tool/.scratch': 'scratch notes, not a tracker\n',
    });
    const frontier = await connectFrontier({ cwd: join(root, 'tool'), env: {} });

    const text = await frontier.call('list_efforts');

    expect(text).toContain(`root: ${root}`);
    expect(text).toContain('outer-repo');
  });

  it('falls back to the working directory when nothing above it is a repository', async () => {
    const root = await makeFixtureTree({ 'notes/.keep': '' });
    const cwd = join(root, 'notes');
    const frontier = await connectFrontier({ cwd, env: {} });

    expect(await frontier.call('list_efforts')).toBe(`root: ${cwd}\n(no efforts)`);
  });

  it('prefers FRONTIER_ROOT over the working directory', async () => {
    const session = await makeFixtureTree(workspaceNamed('session-repo'));
    const other = await makeFixtureTree(workspaceNamed('env-repo'));
    const frontier = await connectFrontier({
      cwd: session,
      env: { [WORKSPACE_ENV_VAR]: other },
    });

    const text = await frontier.call('list_efforts');

    expect(text).toContain(`root: ${other}`);
    expect(text).toContain('env-repo');
    expect(text).not.toContain('session-repo');
  });

  it('prefers an explicit root argument over FRONTIER_ROOT', async () => {
    const session = await makeFixtureTree(workspaceNamed('session-repo'));
    const fromEnv = await makeFixtureTree(workspaceNamed('env-repo'));
    const explicit = await makeFixtureTree(workspaceNamed('explicit-repo'));
    const frontier = await connectFrontier({
      cwd: session,
      env: { [WORKSPACE_ENV_VAR]: fromEnv },
    });

    const text = await frontier.call('list_efforts', { root: explicit });

    expect(text).toContain(`root: ${explicit}`);
    expect(text).toContain('explicit-repo');
    expect(text).not.toContain('env-repo');
  });

  it('falls through to FRONTIER_ROOT when root is supplied empty', async () => {
    const session = await makeFixtureTree(workspaceNamed('session-repo'));
    const fromEnv = await makeFixtureTree(workspaceNamed('env-repo'));
    const frontier = await connectFrontier({
      cwd: session,
      env: { [WORKSPACE_ENV_VAR]: fromEnv },
    });

    const text = await frontier.call('list_efforts', { root: '' });

    expect(text).toContain('env-repo');
    expect(text).not.toContain('session-repo');
  });

  it('reads a second repo without disturbing the session default', async () => {
    const session = await makeFixtureTree(workspaceNamed('session-repo'));
    const other = await makeFixtureTree(workspaceNamed('other-repo'));
    const frontier = await connectFrontier({ cwd: session, env: {} });

    expect(await frontier.call('list_efforts', { root: other })).toContain('other-repo');
    expect(await frontier.call('list_efforts')).toContain('session-repo');
  });

  it('resolves a relative root against the working directory', async () => {
    const root = await makeFixtureTree({
      ...workspaceNamed('nested-repo'),
      'sibling/.keep': '',
    });
    const frontier = await connectFrontier({ cwd: join(root, 'sibling'), env: {} });

    expect(await frontier.call('list_efforts', { root: '..' })).toContain('nested-repo');
  });

  it('fails loudly when an explicit root names nothing', async () => {
    const root = await makeFixtureTree(workspaceNamed('session-repo'));
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const error = await frontier.callExpectingError('list_efforts', {
      root: join(root, 'typo-repo'),
    });

    expect(error).toContain('not a directory');
  });

  it('fails loudly when FRONTIER_ROOT names a file', async () => {
    const root = await makeFixtureTree(workspaceNamed('session-repo'));
    const frontier = await connectFrontier({
      cwd: root,
      env: { [WORKSPACE_ENV_VAR]: join(root, '.scratch/session-repo/spec.md') },
    });

    const error = await frontier.callExpectingError('list_efforts');

    expect(error).toContain(WORKSPACE_ENV_VAR);
    expect(error).toContain('not a directory');
  });
});
