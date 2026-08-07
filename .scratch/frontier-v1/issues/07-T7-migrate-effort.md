---
id: T7
title: migrate_effort — normalize, mint ids, preview, opt-in rename
kind: build
status: open
triage: ready-for-agent
blocked_by: [T5]
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

- [ ] An Effort's Legacy Tickets are normalized to the schema in one call
- [ ] Existing ids are preserved verbatim, including `T31`-style ids found in titles
- [ ] Tickets with no id are minted one from the repo-global counter
- [ ] Prose Edges (`Depends on:`, `Blocked by:`) become `blocked_by` entries
- [ ] Preview mode reports every change it would make and writes nothing
- [ ] Filenames are unchanged by default, and every relative link still resolves after migration
- [ ] Renaming to `<NN>-T<n>-<slug>.md` is available behind an explicit flag
- [ ] Unrecognized files in the Effort directory are ignored, never rejected
- [ ] Migration is exercised against the sobrina and tag-customizer fixtures deliberately — this repo's
      own Tickets are schema-conformant from birth and give this path no accidental coverage
