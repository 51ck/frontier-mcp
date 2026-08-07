import type { Effort } from '../domain.ts';

/**
 * The seam from ADR 0001. Every read and write reaches storage through this
 * interface, and the tool layer never touches a filesystem.
 *
 * Nothing markdown-shaped may cross it — no file paths, no frontmatter, no
 * section names. A driver is constructed already bound to its workspace (the
 * markdown driver takes a directory, a SQLite driver would take a connection),
 * so no method ever takes or returns a location. The planned SQLite driver, and
 * the `md <-> db` conversion either side of it, are only writable if this holds.
 */
export interface StorageDriver {
  /**
   * Every Effort in the workspace, ordered by slug. A workspace holding no
   * Efforts yields an empty list; that is not an error.
   */
  listEfforts(): Promise<readonly Effort[]>;
}
