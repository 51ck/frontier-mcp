---
id: T7
title: migrate_effort — normalize, mint ids, preview, opt-in rename
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T5]
answer_gist: "migrate_effort is the eighth tool: normalize Legacy Tickets, preserve ids, mint under create guards, remap bare sort-order Edges, preview with full change report, opt-in rename; covered by sobrina and tag-customizer fixtures"
---

# T7 — `migrate_effort`: normalize, mint ids, preview, opt-in rename

**What to build:** Pointing Frontier at a repo with 159 legacy Ticket files and converting an Effort
deliberately, rather than waiting for writes to normalize files one at a time. Ids a Ticket already
carries are preserved, so every `T31` reference in sobrina's prose and commit messages keeps resolving.
Tickets identified only by a filename number get a fresh id, because a per-Effort `01` is not unique
repo-wide.

Filenames are left alone by default — the existing files are linked by relative markdown links
throughout the Maps and Tickets, and the filename is cosmetic anyway. Tidiness is available for anyone
willing to accept the link churn.

- [x] An Effort's Legacy Tickets are normalized to the schema in one call
- [x] Existing ids are preserved verbatim, including `T31`-style ids found in titles
- [x] Tickets with no id are minted one from the repo-global counter
- [x] Prose Edges (`Depends on:`, `Blocked by:`) become `blocked_by` entries
- [x] Preview mode reports every change it would make and writes nothing
- [x] Filenames are unchanged by default, and every relative link still resolves after migration
- [x] Renaming to `<NN>-T<n>-<slug>.md` is available behind an explicit flag
- [x] Unrecognized files in the Effort directory are ignored, never rejected
- [x] Migration is exercised against the sobrina and tag-customizer fixtures deliberately — this repo's
      own Tickets are schema-conformant from birth and give this path no accidental coverage

## Answer

migrate_effort lands as the eighth tool on the StorageDriver seam.

- Legacy files get schema frontmatter; prose bodies stay verbatim.
- Existing ids are preserved; id-less Tickets mint via the same exclusive-create guards as create_tickets (preview peeks max+1 without guards).
- Bare sort-order Edges (`Blocked by: 01`) remap to the target Ticket's id after minting.
- Filenames stay put by default; `rename: true` rewrites to `<NN>-T<n>-<slug>.md`.
- Preview reports prior handles, planned renames, and remapped Edges, and writes nothing.
- Unrecognized Effort-dir files (e.g. research/) are ignored.
- Acceptance tests cover synthetic shapes plus the sobrina telegram and tag-customizer ship-0-5-0 fixtures.
