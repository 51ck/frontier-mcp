# Markdown is canonical, behind a storage driver seam

The tracker's data lives in markdown files under `.scratch/` that humans read on GitHub, edit by hand,
and diff in git — so files stay the source of truth and any index the server builds is derived,
in-memory, and rebuildable from a scan. That index sits *inside* the driver, together with the change
notification that drops it: the seam therefore covers the physical model, whatever cache it wants, and
what "something changed" means for it. A SQLite driver is wanted later, with conversion both ways
(`md → db`, `db → md`), so v1 puts every read and write behind a storage driver interface even though
only the markdown driver exists; the tool layer never touches the filesystem directly.

## Considered options

- **SQLite as the store, markdown as an export.** Faster queries and real transactions, but the files
  stop being the thing you can hand-edit and merge in git — which is the entire reason this tracker is
  markdown rather than a real tracker. Deferred to a driver, not adopted as the default.
- **No index at all, parse on every call.** Honest and simple, and at ~50 tickets per repo genuinely
  fast enough. Rejected only because the fs watcher was wanted anyway, which implies a live model.

## Consequences

The driver interface is load-bearing from the first commit and must not leak markdown concepts —
no file paths, no frontmatter, no section names — or the SQLite driver becomes impossible to write.

It is also the whole of the physical model, not a set of queries with the live parts bolted above it.
A driver is constructed already bound to its workspace and closed when the process is done with it, so
holding a scan, dropping it on a write, and watching for someone else's are its decisions to make and
its resources to release. Markdown answers all three by caching a full walk and running `fs.watch`,
because a walk is ~13ms at these volumes — measured since, in the scan-cost paragraph of
[AGENTS.md](../../AGENTS.md); SQLite would answer none of them that way. Callers see the difference
nowhere: every method answers as though it had just read.
