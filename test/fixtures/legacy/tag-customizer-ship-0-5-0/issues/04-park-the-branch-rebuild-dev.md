# 04 — Park the branch and rebuild `dev` from beta.2

Type: task
Status: resolved
Blocked by: 01, 02, 03

## Question

The surgery. Everything before this ticket decides what goes where; this one does it.

Shape, decided at charting:

1. **Preserve first.** Create `feat/three-r185` at the current `dev` tip before touching anything, and
   verify it exists. Nothing in this ticket is allowed to be the only copy of anything.
2. **Reset `dev` to `v0.5.0-beta.2` (`b6c034c`)** — safe, because `origin/dev` is exactly that commit
   and all 22 commits after it are local only.
3. **Cherry-pick the `dev` set back**, in original order: the pure research/docs commits, the harness
   tooling, `a448cfe`, and the split halves ticket 03 produced, plus whatever tickets 01 and 02
   resolved as shipping.
4. **Leave the branch as it is.** It already holds the full history. Do not rebase or clean it — its
   job is to be resumable, and rewriting it now discards the context that makes it resumable.

The classification table is in the [map](../map.md) under "Established before charting". Do not
re-derive it; do check it against the tickets' verdicts, which may have moved a commit.

Then confirm `dev` is genuinely three-free:

- `packages/tag-customizer/package.json` peer reads `^0.147.0`, devDep `@types/three` matches
- `pnpm-workspace.yaml` catalog reads `^0.147.0`
- `pnpm install` resolves and the lockfile updates
- `pnpm run check` green
- The harness boots, renders, and `window.__THREE__` reports `147`
- Generated decoder assets under the harness match the installed revision — the Runtime Assets
  contract is revision-scoped, so a stale folder is a real failure, not cosmetic
- `git log v0.5.0-beta.2..dev` contains no commit whose type marks a breaking change

One small honesty fix belongs here rather than in its own ticket: `.scratch/three-upgrade/spec.md` is
titled **"three upgrade (0.5.0)"** and its tickets 05 and 07 name `0.5.0-beta.3`. Those become false
the moment this lands. Correct the version references and add one line saying the effort is deferred
to `0.6.0` with the code on `feat/three-r185`. Do not rewrite the effort — just stop it lying.

## Acceptance criteria

- [x] `feat/three-r185` exists at the pre-surgery `dev` tip, verified before the reset
- [x] `dev` rebuilt, linear, with every commit from the `dev` set present and none from the branch set
- [x] All seven verification items above pass, each reported with its actual output — **six pass, one
      is partial**; see "What is not verified"
- [x] `.scratch/three-upgrade/spec.md` no longer claims `0.5.0`
- [x] `dev` is **not pushed** — pushing needs Petr's explicit go, and ticket 06 owns that moment
- [x] A short note in the map's Decisions-so-far recording the branch name and the tip SHA it holds

## Answer

**Done.** `dev` is `572dd32`, 22 commits on `v0.5.0-beta.2`, three-free at `0.147.0`, unpushed.

### Preservation

The pre-surgery tip `8313808` is held **twice** — by branch `feat/three-r185` and by tag
`ship-0-5-0/pre-surgery`. Both verified to resolve to that SHA before the reset ran.

### Method — built on a side branch, not in place

`dev` was never left half-rebuilt. The new history was assembled as `rebuild/dev-0-5-0` in the probe
worktree from ticket 02, verified green there, and only then was `dev` fast-forwarded onto it with
`git reset --hard`. A mistake mid-rebuild would have cost nothing.

Cherry-picks ran in original commit order, per ticket 03's constraint. All fifteen pure applications
were clean — no conflicts. The three non-mechanical pieces:

- **`946bed3`'s `dev` half** landed as a new commit, `feat(three-app)!: declare three a peer
  dependency`. The `release-prep/SKILL.md` hunk applied only after `bcf77e5` and `2baa088`, exactly as
  ticket 03 predicted.
- **`ea41798`** applied from ticket 02's resolved patch.
- **`edeaa8e`'s `dev` half** landed as `docs(metal-parity): record the strength tuning and the capture
  fix`, carrying its five `.scratch/metal-parity/**` files only.

### Verification

| Check | Result |
| --- | --- |
| `package.json` peer | `"three": "^0.147.0"`, `@types/three` `^0.147.1`, `three: catalog:` devDep |
| `pnpm-workspace.yaml` catalog | `three: ^0.147.0` |
| `pnpm install --frozen-lockfile` | resolves; lockfile diff is the peer move only |
| `pnpm run check` | **green**, exit 0, exactly the 12 known harness warnings |
| Linked `three` | `0.147.0` in both `packages/tag-customizer` and `apps/dev` |
| `window.__THREE__` | `"147"` |
| Decoder path | **4 requests under `/wasm/r147/`** — `draco_wasm_wrapper.js`, `draco_decoder.wasm`, basis. Plus 4 GLBs from the CDN and 3 KTX2 textures, no failures |
| Breaking-type commits | one, `feat(three-app)!`, deliberate per [07](07-peer-dependency-question.md) |
| Console | only the known fixture typo, `[harness] Too many symbols for one line`. No `[THREE_APP]` errors |

The decoder result is worth calling out: it exercises the revision-scoped Runtime Assets contract,
Draco decode and KTX2 decode against `0.147` and they all resolve. That is most of what
[three-upgrade ticket 05](../../three-upgrade/issues/05-harness-draco-ktx2-smoke.md) was going to
test, obtained for free.

### What is **not** verified — the render

> **Superseded 2026-08-04 by [06](06-release-0-5-0.md): the render is fine, and this section's
> diagnosis was wrong.** The scene was assembled the whole time. `scene.children === 2` is not a stalled
> scene — it is the two top-level groups the app always builds, and the world group beneath them held
> its five children as normal. The right probe is `scene.traverse`: 19 nodes, 8 meshes, 27 172
> triangles, with the renderer reporting active draw calls across ~12 000 frames. A screenshot shows
> the metal tag reading as brushed steel with a specular gradient, legible engraved relief, and the
> ribbon's yellow chroma intact. Left below as written, because the wrong probe is the lesson.

The harness was driven from a backgrounded browser pane, which is the trap
[metal-parity ticket 04](../../metal-parity/issues/04-restore-engraving-relief.md) documented: the FPS
benchmark never completes without animation frames, so scene assembly stalls. Stepping
`ThreeApp.update()` with `_stopStatus.pageVisibility` cleared got the loader to `loader--hide` and got
every asset fetched, but the scene still reported 2 children and the framebuffer read uniformly black.

So: **the library loads, resolves and decodes correctly at `0.147`, and nothing errors — but nobody
has looked at the picture.** A visual check with the tab in front is a thirty-second job for a human
and impossible from here. It belongs to [06](06-release-0-5-0.md) before Phase 1.

There is no specific reason to expect a regression — the render code on `dev` is byte-identical to
`v0.5.0-beta.2` apart from `ea41798`, whose effect is a teardown path — but "no reason to expect" is
not a check.

### Also done — the tracker stopped lying

- `.scratch/three-upgrade/spec.md` retitled `(0.6.0)`, status `deferred`, with a note naming the
  branch. Tickets 04, 05 and 07 marked deferred; 07's title no longer says `0.5.0-beta.3`.
- `.scratch/metal-parity/map.md` gets the same note, including that its tickets 04 and 05 read
  `claimed` from a session that ended rather than from live work. *(Slightly beyond the charting
  decision, which declined a metal-parity rewrite. This is four lines of status, not a rewrite —
  flagged rather than assumed.)*
- `docs/runtime-assets.md` corrected: it already contradicted itself at beta.2, giving `185dev` and
  `r185/draco/` as examples while the pin and the console-message section said `0.147`.

### Found for ticket 06 — a version trap

`.scratch/three-upgrade/spec.md:25` records that `preMajor: true` landed with `0.5.0-beta.2`, so the
`feat!` peer move demotes to **minor** rather than computing `1.0.0`. But the same note records that a
minor recommendation against an existing prerelease resolves as `preminor` → **`0.6.0-beta.0`**,
overshooting the line. Reaching `0.5.0` needs the explicit form, `pnpm release 0.5.0 --ci`. Recorded
in [06](06-release-0-5-0.md).

### Leftovers

`apps/dev/static/wasm/r185/` is still on disk beside `r147/`. Gitignored and regenerated by `predev`,
so it affects nothing committed — noted so it is not mistaken for a live path later.

## Comments

### Agent — 2026-08-04

Rebuilt on a side branch and verified before `dev` moved. The one gap is the visual check, which the
backgrounded pane cannot provide; stated rather than papered over.
