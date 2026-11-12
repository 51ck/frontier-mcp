import { lstatSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** The environment variable that overrides the workspace for a whole session. */
export const WORKSPACE_ENV_VAR = 'FRONTIER_ROOT';

/**
 * A directory carrying one of these is the repository root we serve.
 *
 * `.scratch` counts only as a directory — it is the tracker itself. `.git`
 * counts either way: a git worktree and a submodule both carry it as a *file*
 * naming the real git directory. Since a worktree sits nested inside the
 * repository it was made from, a directory-only marker walks straight past it
 * and serves the parent — writing into the working copy the worktree exists to
 * isolate.
 *
 * These stay constants while the markdown driver takes its storage directory as
 * a construction parameter. The upward walk asks "is this a repository this tool
 * serves", which is a different question from "what does a driver call its
 * storage" — and it is asked before any driver exists to be asked, so it cannot
 * come from one.
 */
const ROOT_MARKERS = [
  { name: '.scratch', matches: isDirectory },
  { name: '.git', matches: exists },
];

export interface WorkspaceContext {
  /** The server process's working directory. */
  readonly cwd: string;
  readonly env: Readonly<Partial<Record<string, string>>>;
}

/**
 * Resolve which workspace a call serves. First match wins:
 *
 *   1. an explicit `root` argument on the call,
 *   2. the `FRONTIER_ROOT` environment variable,
 *   3. the working directory, walked upward to the nearest root marker.
 *
 * The working directory is the one the client launched this process in, and it
 * is fixed for the session. A client that moves to another worktree mid-session
 * retargets a call with `root`, or restarts the server; nothing here follows it.
 *
 * MCP Roots is deliberately not used: it is deprecated as of protocol revision
 * `2026-07-28` (SEP-2577), which directs implementations to pass directories
 * through tool parameters or server configuration instead.
 *
 * An override that names nothing, or names a file, is a typo worth failing on.
 * A workspace with no `.scratch/` is not — that is a fresh project.
 */
export function resolveWorkspace(root: string | undefined, context: WorkspaceContext): string {
  return locateWorkspace(root, context).root;
}

export interface LocatedWorkspace {
  readonly root: string;
  /**
   * What located `root`, for a reader to check it against: the override that
   * named it, the marker the upward walk stopped at, or the working directory
   * when the walk found none.
   */
  readonly resolvedBy: string;
}

/** {@link resolveWorkspace}, saying which source won. */
export function locateWorkspace(
  root: string | undefined,
  context: WorkspaceContext,
): LocatedWorkspace {
  const argument = given(root);
  if (argument !== undefined) {
    return {
      root: requireDirectory(resolve(context.cwd, argument), 'root argument'),
      resolvedBy: 'root argument',
    };
  }

  const fromEnv = given(context.env[WORKSPACE_ENV_VAR]);
  if (fromEnv !== undefined) {
    return {
      root: requireDirectory(resolve(context.cwd, fromEnv), WORKSPACE_ENV_VAR),
      resolvedBy: `$${WORKSPACE_ENV_VAR}`,
    };
  }

  const cwd = resolve(context.cwd);
  return (
    findRootMarker(cwd) ?? { root: cwd, resolvedBy: 'working directory, no root marker found' }
  );
}

/**
 * An empty override was not supplied. Falling through to the next source is the
 * only reading that keeps the precedence intact — treating `''` as an answer
 * would let `{ root: '' }` skip `FRONTIER_ROOT` and silently read another repo.
 */
function given(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

/**
 * Walk upward for the nearest directory carrying a marker. Falls back to the
 * working directory itself, so a session started outside any repository still
 * resolves rather than failing.
 */
function findRootMarker(from: string): LocatedWorkspace | undefined {
  let dir = from;

  for (;;) {
    const marker = ROOT_MARKERS.find(candidate => candidate.matches(join(dir, candidate.name)));
    if (marker !== undefined) return { root: dir, resolvedBy: marker.name };

    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function requireDirectory(path: string, source: string): string {
  if (!isDirectory(path)) {
    throw new Error(`Workspace from ${source} is not a directory: ${path}`);
  }
  return path;
}

/** Follows symlinks: a `.scratch` pointed at shared storage is still the tracker. */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Deliberately does not follow symlinks — the question is whether an entry is
 * there at all, not what it leads to. A dangling `.git` symlink still marks a
 * repository root, and reading it as absent would walk on into the parent.
 */
function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}
