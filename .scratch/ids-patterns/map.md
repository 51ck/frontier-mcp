---
header: map
---

# Map

## Destination

A decision on whether the markdown driver's Ticket id format is **consumer-configurable**, and if so:
the token language and what makes a pattern legal, where the pattern lives, which minting strategy
each pattern implies and what becomes of ADR 0005's guards, and how a consumer is warned about a
pattern that collides.

The map ends at the decisions. The build is handed to `frontier-v1` as build Tickets.

## Notes

**Origin.** Raised while `frontier-ids` was still walking its map: recommend a default id format, but
let a consumer compose their own from tokens — `T<N>`, `T<b36{6}>`, `#<effort>-<N>`, `0x<b16{8}>`.

**Scope: local drivers, not third-party ones.** The line is who owns the storage. Where the consumer
owns it — the markdown driver today, a local database driver if one is ever built — the ids are a
local project convention and the consumer may name them. Where a third-party tracker owns it, that
tracker owns the ids and we relay them: T36 already gives every driver its own dialect, so a GitHub
driver has no say in issue numbers and nothing on this map reaches it.

Every decision here is nonetheless worked against the **markdown driver**, because it is the only
local driver that exists. What generalizes to a second one is the ownership principle, not this
pattern language — designing a token set for a driver nobody has written would be speculation
wearing the clothes of foresight.

**Standing preference — adults.** Warn, never prevent. A consumer may pick a collision-prone pattern;
the product recommends against it and says why, then does as it is told. It keeps no pattern history
and checks no compatibility. Changing a pattern mid-project is the consumer's responsibility, and the
recommendation is to pick one and keep it for the life of the project.

**The default does not change.** T35's `T<b36{6}>` stays what a new repo gets. This Effort decides
whether it can be overridden, not what it is.

**`frontier-ids` holds its ADR.** That Effort's T37 resolved that ADR 0005's guard machinery is
deleted outright. Ruling `<N>` in has falsified that — scan-derived minting needs coordination, so
the guards survive for those patterns while random ones need none. T37 is **not** reopened; a
resolved Ticket records the route actually walked, and it is superseded here the way ADR 0005 is
superseded rather than amended. But `frontier-ids` must not write its ADR until this map closes, or
that ADR will state something untrue. T39, T40, T49 and T50 all survive; T40's framing needs a
rewrite, since it opens on the premise that the guards are going.

**Skills.** `/grilling` and `/domain-modeling` every session.

**Decisions only.** Nothing in this Effort implements; the handoff is a build breakdown in
`frontier-v1`.

## Decisions so far

<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
- [T52 — The token language and what makes a pattern legal](issues/02-T52-the-token-language-and-what-makes-a-pattern-lega.md) — Four tokens — `<N>`, `<b36{n}>`, `<b16{n}>` and literals; `<effort>` is refused because identity may not derive from an unvalidated directory name that changes by plain `mv`, outside anything the product can observe, which dissolves the unknown-slug question; legality is split into parseability rules, filesystem rules that come from outside the repo, and no ambiguity rules at all — the plausible-key loss is recorded deliberately as a density problem, not a width one
- [T53 — What each pattern implies for minting, and what becomes of the guards](issues/03-T53-what-each-pattern-implies-for-minting-and-what-b.md) — Charting fused two independent questions: `<N>` decides whether minting needs coordination, and the presence of any random token decides whether identity survives a merge — so guards are kept for every pattern containing `<N>` (they were never actually deleted) while a mixed pattern like `T<N>-<b36{4}>` is cross-tree safe with only its counter racing, provided the guard keys on the `<N>` value rather than the rendered id; T38's write-refusal cannot substitute because the only path that is a pure function of the id is the guard itself, so "make the write atomic" reduces to reinventing it
- [T54 — Where the pattern lives](issues/04-T54-where-the-pattern-lives.md) — A YAML file at the root of the storage directory, `<storageDir>/frontier.yml`, holding one `id_pattern` key — the env var and the server argument fail on cardinality rather than lifetime, since `root` is a per-call argument and one process deliberately serves many workspaces; absent file or absent key means T35's default and is not an error, while an unparseable file or an illegal pattern warns on read and refuses on write, reusing T38's split exactly
- [T55 — Whether a temporary key needs a sigil once the id space is wide](issues/05-T55-whether-a-temporary-key-needs-a-sigil-once-the-i.md) — No sigil — T36's rejection stands, because its premise survived T52 largely intact: refusing `<effort>` and requiring every pattern to begin with a literal leaves every legal predicate anchored and narrow, so the price sigils were rejected for was never paid; and a sigil separates keys from ids while T52 established that the surviving undetectable case is id-to-id, which a sigil cannot touch. The rule does not vary by pattern, and the only migration is the `key` schema description, which hardcodes `T<n>` and is wrong either way
- [T56 — How a consumer is warned about a pattern that collides](issues/06-T56-how-a-consumer-is-warned-about-a-pattern-that-co.md) — The warning rides the `create_tickets` result, on every call, and never appears on a read — minting is where the consequence is realised and the tool is a batch tool, so per-call is already rare; suppression is refused because the driver is cached per workspace until process exit, so "once" would mean once per server process and an agent connecting later would never see it. Separate from T38's channel, one-way cross-referenced: T38 reports a duplicate that happened and is actionable, this reports a disposition that never is
<!-- /GENERATED -->

## Not yet specified

- **What the vendored tracker doc says once ids are a local convention.** `docs/agents/issue-tracker.md` hardcodes `T<n>` in its examples, its frontmatter template, and its Hand-publish instruction to scan for the highest `T`. It is served as `frontier://tracker-doc` and vendored into other repos, so under a configurable pattern it is wrong for the repo reading it unless it is generated per-repo. Overlaps `frontier-ids` T39 and T50 hard, and may resolve there rather than here.
- **What `migrate_effort` mints under each strategy.** Migration allocates ids for Legacy Tickets through `withIdReservations` (`src/storage/markdown/create.ts:102`), which exists only to hold guards. Guards now survive for derived patterns and not for random ones, so migration inherits both strategies and the batch case may differ from the single case. `frontier-ids` T40 asks a version of this, but on the premise that the guards are going — that premise is dead and the Ticket needs rewriting whichever Effort answers it.

## Out of scope

- **Tokens derived from git state.** `<commit>` and anything like it — a 7-character hash of HEAD at mint time. Dropped during charting. Rebase, amend or squash and the id points at an object that no longer exists: still unique, but misleading rather than merely opaque, which is worse. It is also unavailable in a `.scratch/`-only workspace, which the workspace resolver supports, and it would make minting reach outside `.scratch/` for the first time. The provenance it reaches for belongs in a field, where it can be wrong without corrupting identity.
- **Compatibility checking and migration between patterns.** A consumer who changes a pattern mid-project owns the consequences. The product keeps no pattern history, verifies no compatibility, and repairs nothing — the predicate answers from the current pattern plus the ids already on disk, and an Edge naming an old-pattern id whose Ticket is not in this tree is refused rather than warned. The recommendation is to choose a pattern once and keep it for the life of the project.
- **A configurable id format for a third-party tracker's driver.** The boundary is ownership of the storage, not which driver happens to exist. A GitHub or Jira driver relays ids that the remote tracker minted and named, so there is no format to offer the consumer; T36 already gives each driver its own dialect. Configurability belongs to drivers whose storage lives in the consumer's own repo — the markdown driver today, a local database driver if one is ever built.


<!-- GENERATED: overwritten on every mutation through the server. Do not hand-edit. -->
- [T51 — How other trackers constrain a configurable key format](issues/01-T51-how-other-trackers-constrain-a-configurable-key.md) — Prior art from hosted trackers answers a different question. Jira, Linear, YouTrack and Redmine all have a central server, so `max + 1` is trivially coordinated for them — the constraint this Effort exists to work around is one they do not have. Their key rules follow from database referential integrity and a rename operation; ours follow from branch divergence and a filesystem. T36 already relays third-party ids to the driver that owns them, so nothing here has to interoperate with a key format we did not choose.
<!-- /GENERATED -->
