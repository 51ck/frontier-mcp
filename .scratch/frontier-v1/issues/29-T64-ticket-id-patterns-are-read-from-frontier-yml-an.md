---
id: T64
title: Ticket id patterns are read from frontier.yml and compiled
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: frontier.yml id_pattern is read once at driver construction and compiled below the seam with T53's two axes; absent means T<b36{6}> silently, broken warns on one Board line and refuses every write (reads and previews still work) until a server restart; minting unchanged
---

**What to build:** the consumer-configurable id format decided in [[T52]] and [[T54]].

A YAML file at the root of the storage directory, `<storageDir>/frontier.yml`, holding one
`id_pattern` key. The env var and the server argument both fail on cardinality rather than lifetime:
`root` is a per-call argument and one process deliberately serves many workspaces, so the pattern has
to live with the workspace. The driver already takes `storageDir` as a construction parameter
([[T28]]), which is the anchor.

**The token language is four forms** — `<N>`, `<b36{n}>`, `<b16{n}>` and literals. `<effort>` is
refused: identity may not derive from an unvalidated directory name that changes by plain `mv`,
outside anything the product can observe.

**Legality splits three ways**, and T52 keeps them apart deliberately: parseability rules, filesystem
rules that come from outside the repo, and no ambiguity rules at all. Every pattern must begin with a
literal — [[T55]] rests on that, since it is what keeps every legal predicate anchored and narrow and
is why no key sigil is needed.

**Absent file or absent key means the default and is not an error.** An unparseable file or an
illegal pattern warns on read and refuses on write, reusing [[T38]]'s split exactly.

The compiled pattern is what everything downstream asks. [[T53]] establishes that the two questions a
caller cares about — does minting need coordination, does identity survive a merge — are independent
properties of the token list, so both are answered statically at compile time and neither is a
runtime branch.


- [x] `<storageDir>/frontier.yml` is read at driver construction; `id_pattern` is its only
      recognized key
- [x] `<N>`, `<b36{n}>`, `<b16{n}>` and literals parse; `<effort>` is refused with T52's reason
- [x] A pattern not beginning with a literal is illegal, and the reason cites T55
- [x] Absent file and absent key both yield the default with no warning
- [x] An unparseable file or an illegal pattern warns on read and refuses on write
- [x] The compiled pattern exposes both of T53's axes: needs-coordination, and survives-a-merge

## Answer

Built in `src/storage/markdown/id-pattern.ts`, held by the markdown driver; surfaced above the seam only through `StorageDriver.workspaceWarnings()` (Board) and the `InvalidWorkspaceConfig` write refusal.

- Read once at construction, not watched (T54). The refusal and warning both say a fix takes effect after a FrontierMCP server restart.
- Every write refuses under a broken config, per T54's table; read paths of write-capable tools (migrate preview, edit_map with no sections, spec with no content) still work.
- Builder choices beyond the decision text: literals limited to `[A-Za-z0-9._-]`, random token length 1–64, minted id at most 64 chars, null/non-string `id_pattern` illegal, empty or comment-only file treated as absent, non-mapping top level treated as broken.
- Accepted edge: a non-preview migrate that would change nothing is still refused under a broken config; nothing is written either way.
- Criterion 6 (needs-coordination / survives-a-merge) is implemented but not observable through any tool yet, so it has no test; T65 proves it through minting. No test seam added.
- T52's `0x<b16{8}>` example violates its own rule 3 and is refused; comment left on T52.
