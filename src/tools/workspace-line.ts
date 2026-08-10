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
export function workspaceLine(root: string): string {
  return `root: ${root}`;
}

/** A result that names the workspace that produced it, above the result itself. */
export function withWorkspace(root: string, body: string): string {
  return `${workspaceLine(root)}\n${body}`;
}
