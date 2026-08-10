/**
 * The one rendering of which repository a call served, so `list_efforts` and
 * every write say it the same way and in the same place.
 *
 * A read has never needed it for safety — wrong repository, visibly wrong
 * content. A write is the opposite: Ticket ids are not repo-unique, since every
 * Effort numbers from T1, so `T10 updated` is exactly as plausible against the
 * wrong repository as the right one. It is the one result a caller cannot check
 * from what it got back, which is how the T10 worktree escape stayed invisible.
 */
/**
 * Labelled `root:` after the argument that overrides it, so the line names the
 * knob a caller would reach for to change it.
 */
export function workspaceLine(workspace: string): string {
  return `root: ${workspace}`;
}

/** A result that names the workspace that produced it, above the result itself. */
export function withWorkspace(workspace: string, body: string): string {
  return `${workspaceLine(workspace)}\n${body}`;
}
