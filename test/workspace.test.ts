import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { WORKSPACE_ENV_VAR } from '../src/workspace.ts';
import { spec, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

/** A workspace whose single Effort is named after it, so a listing identifies its source. */
function workspaceNamed(name: string) {
  return {
    '.git/HEAD': 'ref: refs/heads/main\n',
    [`.scratch/${name}/spec.md`]: spec(name),
    [`.scratch/${name}/issues/01-T1-only.md`]: ticket('T1', 'Only'),
  };
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
