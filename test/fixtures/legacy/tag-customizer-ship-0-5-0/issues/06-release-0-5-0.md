# 06 — Release 0.5.0

Type: task
Status: resolved — **`0.5.0` published 2026-08-04**
Blocked by: 04, 05

## Shipped

`@gocream/tag-customizer@0.5.0` is on the registry and `dev` is pushed.

| | |
| --- | --- |
| Channel | stable, dist-tag `latest` — moved `0.4.6` → `0.5.0` |
| Tag | `v0.5.0` at `15333fe`, pushed |
| Tarball | 40 files, 135.4 kB packed / 587.6 kB unpacked, `dist/**` + `package.json` |
| Published peer | `three: ^0.147.0`, confirmed by reading it back off the registry |
| `beta` dist-tag | untouched at `0.5.0-beta.2` |
| `dev` | pushed, 0 ahead / 0 behind, clean |

Phase 1 was run outside this session, so its output was **verified rather than trusted**: packed
manifest re-read from the tarball for `catalog:` leaks (0), `development` conditions (0), and the peer
range; registry queried before publishing to confirm `0.5.0` was not already taken.

The `v0.5.0` tag sits one commit behind the pushed tip, because the regression lock (`b714c39`) landed
after the release commit. That commit is `.scratch/` tooling and `files` is `dist/**/*`, so the tag
points at exactly what was published.

Everything the ticket asked for above held: the changelog does not mention the park, the version
needed no explicit argument, and the tarball's `three` range is `^0.147.0`.

## Phase 1 findings — 2026-08-04

**The render is fine.** Checked with the tab in front, on the dev server at `:8081`. The scene
assembles: 19 nodes, 8 meshes, 27 172 triangles, renderer drawing across ~12 000 frames. Screenshot
shows the metal tag as brushed steel with a specular gradient, engraved relief legible, ribbon yellow
chroma intact. `window.__THREE__` is `"147"` — which doubles as proof the server is serving
post-rebuild code, since a stale server from before the park would still report `185`.

[04](04-park-the-branch-rebuild-dev.md)'s "framebuffer reads black" conclusion was a **bad probe, not
a real failure**: it read `scene.children === 2` as a stalled scene, but that is the two top-level
groups the app always builds. Corrected there.

**The version trap did not fire.** The dry run computes `0.5.0` unprompted —
`Let's release tag-customizer-demo (0.5.0-beta.2...0.5.0)`. The `preminor` worry recorded in
`.scratch/three-upgrade/spec.md:39` does not apply when the current version is *itself* a prerelease
of the target: `semver.inc('0.5.0-beta.2', 'minor')` is `0.5.0`, because the minor bump simply drops
the prerelease tag rather than opening a new line. `pnpm release 0.5.0 --ci` remains harmless as
belt-and-braces, but it is not required.

**Tarball verified** by `pnpm pack` (`publish --dry-run` refuses, since `0.5.0-beta.2` is already on
the registry and it sees nothing new to publish). Contents are `dist/**` — 39 files — plus
`package.json`, and nothing else. No `src/`, `static/`, or `.scratch/`. The packed manifest has **no
`development` export condition** and **no literal `catalog:`**; `three` reads `^0.147.0` in both
`peerDependencies` and `devDependencies`. That is the exact check this ticket was written to force.

**The changelog does not mention the park**, as required. It carries two breaking changes — the
`three` peer move and the `ControlsChangedPayload` optionality — one feature, and four fixes.

**Working tree had to be cleaned first.** A concurrent session left `.scratch/consume/` and
`.scratch/place-size-overlay-coords/` uncommitted, which release-it refuses to run against. Committed
as `9d58ebd`; tracker markdown only, no code.

### Decisions — Petr, 2026-08-04

1. **Straight to `0.5.0`.** No beta.3.
2. **T1.12 keeps its breaking marker.** `0.5.0` announces two breaking changes.
3. **Wait for the `place-size` fix.** It landed: `b3fb5b9`, merged fast-forward from the agent
   worktree. See below.

### The `place-size` fix, as landed

[`place-size-overlay-coords/01`](../../place-size-overlay-coords/issues/01-pick-place-size-space-restore-overlay-child-alignment.md)
resolved by emitting **both frames**: `canvasStartPoint` added alongside a numerically unchanged
`startPoint`, plus `space: 'wrapper'` naming the latter's frame. Verified additive rather than taken
on trust — the old code subtracted the offsets before `Math.min`, the new code subtracts after, and
subtracting a constant commutes with `min`, so every existing consumer's number is byte-identical.
The harness needed no edit.

**This does not fix `staya-front` on its own.** The overlay child is still positioned from
`startPoint`, which is still wrapper coords; the consumer has to switch that read to
`canvasStartPoint`. That was the deliberate trade for not breaking the document-space path in a
release being cut the same day. The consumer ticket needs to say so.

`area.ts` was not touched. It does carry 76 lines of change since beta.2, but all of it is `80cb9fa`,
the texture-lifetime fix [02](02-texture-leak-fix-portability.md) decided to ship — not a boundary
violation, and known.

### Phase 1 green light

- Version: **`0.5.0`**, tag `v0.5.0`, computed by release-it without an explicit argument.
- Changelog: 2 breaking (peer move, `ControlsChangedPayload`), 1 feature, 5 fixes. No mention of the
  park, as required.
- `pnpm run check` green on the merged tree, exactly the 12 known harness warnings.
- Tarball: `dist/**` (39 files) + `package.json`. No `development` condition, no `catalog:`,
  `three` at `^0.147.0`.
- Render confirmed by eye after the merge.
- 30 commits unpushed; `origin/dev` still at `b6c034c`.

Phase 2 (`pnpm --filter @gocream/tag-customizer publish --no-git-checks` then
`git push --follow-tags`) **awaits explicit approval.**

## Question

The destination. Run [`/release-prep`](../../../.claude/skills/release-prep/SKILL.md) and publish —
Phase 1 local and reversible, Phase 2 only after Petr says go, in the conversation, at that moment.

One decision this ticket owns before Phase 1 starts: **`0.5.0-beta.3` first, or straight to `0.5.0`?**

The argument for going straight: the release's content is two betas old and already published. Nothing
is being added by the park — the park only *removes* work that was never published. A beta.3 that
mainly reverses unpublished commits tests nothing that beta.2 did not already test.

The argument for a beta.3: ticket 05 lands five tickets of genuinely new code, and `dev` has been
rebuilt from scratch. That is not the same tree beta.2 shipped, however similar the diff looks. If
there is a consumer who can smoke it, beta.3 costs a day and buys the evidence.

Put it to Petr rather than deciding it here.

Three things specific to this release that `/release-prep`'s normal flow will not catch:

- **Look at the render before anything else.** [04](04-park-the-branch-rebuild-dev.md) verified that
  the library loads, resolves `/wasm/r147/` decoders, and decodes Draco and KTX2 without error — but
  it could not see the picture, because a backgrounded browser pane stalls the harness's FPS benchmark
  and the scene never assembles. Run `pnpm dev` with the tab in front and look. The render code is
  byte-identical to `v0.5.0-beta.2` apart from a teardown path, so there is no reason to expect a
  regression; that is not the same as having checked.
- **The computed version has a known trap, and it is not the one this ticket was written for.** The
  worry was a stray `feat!`. There is one, deliberately — the peer move from
  [07](07-peer-dependency-question.md). `preMajor: true` landed with `0.5.0-beta.2`, so it demotes to
  **minor** rather than computing `1.0.0`. But a minor recommendation against an existing prerelease
  resolves as `preminor` → **`0.6.0-beta.0`**, which overshoots the line entirely. Reaching `0.5.0`
  needs the explicit form:

  ```bash
  pnpm release 0.5.0 --ci
  ```

  Recorded at `.scratch/three-upgrade/spec.md:25`. Read the `--dry-run` output rather than skimming
  it; a wrong version here is not fixable after publish.
- **Verify the tarball's `three` range reads `^0.147.0`**, not `catalog:` and not `^0.185.0`. The
  skill already checks for a literal `catalog:` leaking; this release adds the second question of
  whether the resolved range is the *right* one. A published `0.5.0` demanding `three@^0.185` would be
  the exact failure this whole map exists to prevent.
- **The changelog will not mention the park, and should not.** Nothing being removed was ever
  published, so there is nothing to tell consumers about. If the generated changelog does mention it,
  something survived the split that should not have.

## Acceptance criteria

- [ ] The beta.3-vs-final question put to Petr and answered before Phase 1
- [ ] `/release-prep` Phase 1 run in full, including the tarball dry run
- [ ] Computed version read and confirmed to match intent, with the reasoning stated
- [ ] Tarball's `three` range confirmed as `^0.147.0`
- [ ] Phase 2 run **only** after explicit approval; publish before push, per the skill
- [ ] Map's Decisions-so-far updated with the released version, and the map closed
