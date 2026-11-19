# marked fixtures

Generated from `../legacy/`; never edited by hand. Regenerate whenever `legacy/` is refreshed.

1. Copy `legacy/sobrina-telegram` and `legacy/tag-customizer-ship-0-5-0` into a scratch
   workspace (a directory holding `.git/`) as `.scratch/telegram` and `.scratch/ship`.
2. From a checkout of tag `v2.0.0`, connect to `createFrontierMCP({ cwd: <workspace> })` over
   an in-memory transport and call `migrate_effort` with `{ effort: 'telegram' }`, then
   `{ effort: 'ship' }` (no `preview`). It reports 15 and 7 migrated.
3. In every `.scratch/*/issues/*.md` without one, insert `frontier: ticket` as the first line
   after the opening `---`, e.g.
   `perl -0pi -e 's/\A---\n/---\nfrontier: ticket\n/' .scratch/*/issues/*.md`.
4. Copy `.scratch/telegram` back as `sobrina-telegram` and `.scratch/ship` as
   `tag-customizer-ship-0-5-0`, replacing the directories here. Everything else, `map.md`,
   `spec.md` and `research/` included, comes through as 2.0.0 left it.

Last regenerated this way on 2026-11-19 and diffed byte-identical against the committed files.
