# Map — Ship 0.5.0 without three, park r185 for 0.6.0

Label: `wayfinder:map`

Status: **reached, 2026-08-04** — `@gocream/tag-customizer@0.5.0` is on the registry at
`three@^0.147.0` (dist-tag `latest`), and the r185 work is parked on `feat/three-r185`, also held by
tag `ship-0-5-0/pre-surgery` at `8313808`. All seven tickets resolved. `0.6.0` resumes the branch.

## Destination

`@gocream/tag-customizer` `0.5.0` is published to the registry with `three` back at `0.147`, and the
r185 work sits on a named branch that resumes cleanly under `0.6.0`. Reached when the version is on
the registry and `feat/three-r185` exists with every code change the upgrade made.

This map **carries execution**, overriding wayfinder's plan-don't-do default: the deliverable is a
published version, not a plan to publish one. Publishing and pushing still need Petr's explicit go at
the moment they happen — see the standing constraints.

## Notes

**Why this map exists.** The r147 → r185 upgrade landed the bump but left the render wrong, and fixing
it became [its own map](../metal-parity/map.md) rather than a step. Petr's call on 2026-08-04: defer
the upgrade to `0.6.0` and ship everything else as `0.5.0`, rather than hold a finished release hostage
to a render investigation. The work is parked, not discarded.

**Domain.** Release mechanics and git surgery, not rendering. The rendering findings are read-only
context here.

**Skills.** `/release-prep` for the release itself. `/grilling` on anything where the commit split is
a judgement call rather than a fact.

**Standing constraints for this effort.**

- pnpm only, never `npm` or `yarn`.
- Do not `git add -A` — stage explicit paths.
- Pushing and publishing need explicit human approval, every time. Approval of a version number is not
  approval to publish.
- Every meaningful change gets a DOX pass against the nearest owning `AGENTS.md`.

**Established before charting — do not re-derive.**

- **`origin/dev` is exactly `v0.5.0-beta.2` (`b6c034c`).** All 22 commits after it are local only,
  never pushed. Rewriting `dev`'s history is therefore safe — there is no published history to break.
- **Neither published beta contains the three bump.** `946bed3 feat(three-app)!` landed *after*
  `v0.5.0-beta.2`. `0.5.0`'s identity was always the workspace split, the per-package toolchain,
  `COATING_TYPES`, and the Runtime Assets contract — not the upgrade. Removing three restores what the
  two published betas already promised rather than gutting the release.
- **No published version has ever carried `three@0.185`.** The peer is `^0.185.0` only in the working
  tree. Reverting it to `^0.147.0` breaks no consumer.
- **The Runtime Assets contract (`f463ace`) shipped in beta.2 and does not need parking.** It resolves
  decoder binaries under a revision-scoped path, which works on `0.147` — being revision-scoped is the
  point. It is what makes a later three swap cheap.
- **Reverting would not un-type the breaking commit.** release-it computes the version from commit
  types; leaving `946bed3 feat(three-app)!` in `dev`'s history alongside a revert keeps the breaking
  marker visible to the version calculation. This is why the park rewrites history rather than
  reverting.

**Commit classification, measured** (`git log v0.5.0-beta.2..dev`, code = non-`.md`, non-`.scratch/`,
non-`docs/`):

| Class | Commits |
| --- | --- |
| Pure research/docs — **stays on `dev`** | `bcf77e5` `2baa088` `b8c47eb` `9629dc7` `0f3d3a4` `7ef5bd7` `7d99d58` `6a13333` `128b97f` `e25fe4b` `f59f155` `02f72b4` |
| Research + harness tooling — **stays on `dev`** | `8ca473b` `429af48` |
| Code, three-independent — **stays on `dev`** | `a448cfe` |
| Code, three-coupled — **rides the branch** | `7ed6f46` `cf283be` |
| Mixed, needs splitting | `946bed3` (7 code / 7 doc) `edeaa8e` (6 code / 7 doc) |
| Verdict needed | `a4788f7` (ticket 01) `ea41798` (ticket 02) `c73430a` (ticket 03) |

**0.5.0 scope, decided at charting.** The release is *tight plus the cheap independents*: what beta.2
published, the non-three fixes already on `dev`, and the small self-contained tickets that stay clear
of `area.ts`. Everything ready-but-unbuilt that touches `area.ts` slides to `0.6.0` alongside three,
because `area.ts` is where the r185 work lives and every week the park stays open is a week it rots.

## Decisions so far

<!-- one line per resolved ticket: gist, then the link for the detail -->

- [01 — Is the data-map colour-space fix an r185 fix or a latent bug?](issues/01-srgb-data-maps-verdict.md)
  — **latent on r147 too**; the bug predates the bump, and `a4788f7`'s commit message states the wrong
  cause (it describes three ≤ r136). Neither revision decodes per-texture in the shader; both pick the
  sRGB internal format from the texture's own tag, slot-agnostically. Scope is one design, not all —
  every KTX2 source already carries `isNotRGBEncoding: true`, so only the JPEG `blk` tag is affected.
  **It parks anyway**: the r147 fix is a ~30-line rewrite, not a port, and it changes the render,
  which is the thing 0.5.0 exists to stop waiting on. Filed as
  [three-app-backlog 17](../three-app-backlog/issues/17-orm-jpeg-srgb-decoded-on-r147.md) so it does
  not leave with the branch.
- [02 — Does the texture-lifetime fix survive without the bump?](issues/02-texture-leak-fix-portability.md)
  — it does, and it ships in 0.5.0. All three code files auto-merge onto `v0.5.0-beta.2`; only
  `three-app/AGENTS.md` conflicts, and only over the bump's own doc block. The merge was inspected,
  not trusted: no r185 API survives in `src/`, beta.2's five r147 `encoding` assignments are intact,
  and `pnpm run check` is green on `three@0.147.0` with exactly the 12 known harness warnings. No
  dependency on ticket 01 — but if 01 ships, `a4788f7` lands first and the probe re-runs, because
  `a4788f7` alone conflicts on beta.2. Resolved patch and an installed probe worktree left for
  tickets 03 and 04.
- [03 — Split the two commits that carry both research and code](issues/03-split-the-mixed-commits.md)
  — split decided and `946bed3`'s `dev` half drafted and verified against beta.2. `edeaa8e` is almost
  entirely branch: only its five `.scratch/metal-parity/**` files stay, and the `#debug` material
  faders ride the branch too because their ranges are r185-calibrated (`bumpScale` bound `0..120` at
  step `0.01` cannot express r147's `0.001`). `c73430a` rides the branch whole — its migration note is
  an *instruction* that is destructive on `0.147`, while the derivation behind it stays on `dev` in
  metal-parity ticket 02. **Ordering constraint for 04:** cherry-picks must go in original commit
  order, because `946bed3`'s `release-prep/SKILL.md` hunk needs `bcf77e5` and `2baa088` first.
- [07 — Should 0.5.0 ship `three` as a peer at `^0.147.0`?](issues/07-peer-dependency-question.md)
  — yes. `three` was already `external` in the library build at beta.2 while declared a `dependency`,
  so the mismatch that forced `staya-front`'s `overrides.three` is not version-specific and does not
  need to wait for r185. Shipping it now settles the install shape before 0.6.0 changes the renderer,
  so any breakage then is unambiguously the renderer. `946bed3`'s manifest hunks therefore split along
  *move* versus *range*: the peer move to `dev` at `^0.147.0`, the `^0.185.0` range to the branch.
  0.5.0 becomes a breaking install and the commit must say so.

- [04 — Park the branch and rebuild `dev` from beta.2](issues/04-park-the-branch-rebuild-dev.md)
  — done. `dev` is `572dd32`, 22 commits on `v0.5.0-beta.2`, three-free at `0.147.0`, **unpushed**.
  The pre-surgery tip `8313808` is held twice, by branch **`feat/three-r185`** and tag
  `ship-0-5-0/pre-surgery`. Built on a side branch and verified before `dev` moved, so `dev` was never
  half-rebuilt. `check` green, `window.__THREE__` is `147`, and the harness fetched 4 decoder files
  under `/wasm/r147/` plus 4 GLBs and 3 KTX2 textures — which incidentally covers most of
  three-upgrade ticket 05's smoke test. **The render itself is unverified**: a backgrounded pane
  stalls the harness benchmark, so nobody has looked at the picture. That check moves to 06.

- [05 — Land the independents chosen for 0.5.0](issues/05-land-the-cheap-independents.md)
  — done, and cheaper than charted: **three of the five were already fixed and published in beta.2**.
  `98356f6` closed both camera-pinned tickets in one commit and `16f971a` closed the text-drawer one;
  all three predate `v0.5.0-beta.2`, so they add nothing to `0.5.0`'s diff and
  `camera-pinned-after-resize` closes as an effort. Only the two typescript-rewrite tickets needed
  work, both type declarations with zero runtime bytes: `1b74305` marks `ControlsChangedPayload`'s
  `start`/`end`/`userAction` optional (as **breaking** — it can fail a `strictNullChecks` consumer's
  build), and `c141dd8` re-exports five nested public types from the package entry. **The `area.ts`
  boundary was never approached.** `check` green; the harness boots at `147` with only the known
  fixture-typo error, and the render is still unlooked-at for the same backgrounded-pane reason as 04.

- **Scope addition, Petr 2026-08-04:** the `place-size` overlay coordinate defect
  ([`consume/02`](../consume/issues/02-place-size-wrapper-coords-double-shift-overlay.md)) joins
  `0.5.0`. It was already in `v0.5.0-beta.2`, so shipping without it would have published a known
  consumer defect. Fixed additively in `b3fb5b9` — `canvasStartPoint` alongside an unchanged
  `startPoint` — so no existing consumer's numbers move. Note this touches `place.ts` under `area/`,
  not `area.ts` itself.

- [06 — Release 0.5.0](issues/06-release-0-5-0.md) — **published.** Stable channel, dist-tag `latest`
  moved `0.4.6` → `0.5.0`; `beta` left at `0.5.0-beta.2`. Published peer read back off the registry as
  `three: ^0.147.0`. The version needed no explicit argument after all — the `preminor` trap this map
  carried does not apply when the current version is itself a prerelease of the target, so
  `semver.inc('0.5.0-beta.2', 'minor')` is just `0.5.0`.

## Not yet specified

- How `0.6.0` resumes the branch — merge, or rebase onto whatever `dev` has become — and how much
  drift is tolerable before the answer changes. Cannot be judged until 0.5.0's content is known.
- Whether metal-parity's working values (`roughness 0.27`, `metalness 0.97`, `bumpScale` factor
  `2000`) survive re-measurement after 0.5.0's changes land. They were tuned against a tree that will
  have moved.
- Whether `structural-compare-and-clone` lands before or after three in `0.6.0`. It shares `area.ts`
  and the state-diff path, so the order is a real choice rather than a preference.
- Whether the r158 `bumpScale` migration needs a consumer-facing note when it eventually ships. It
  landed as `chore`, so it will not reach the changelog on its own, and consumers must act on it.
- Whether anything in the parked branch is worth landing in 0.5.0 on its own merits, beyond the
  commits already classified. Only visible once the split is actually performed.

## Out of scope

- **Resolving [metal-parity](../metal-parity/map.md)'s open tickets** — 04 (relief), 05 (gloss),
  06 (where compensation lives), 07 (verify six conditions). They are the `0.6.0` effort. This map
  parks them intact; it does not advance them.
- **`structural-compare-and-clone` in 0.5.0.** Seven ready tickets, ruled out at charting: it touches
  `area.ts` and the state-diff path, the same ground the parked branch sits on, and landing it now
  buys a bigger merge fight later. Returns in `0.6.0`.
- **Re-opening the render investigation.** If 0.5.0's changes make the r185 render worse or better,
  that is `0.6.0`'s problem. Note it and move on.
