# 03 — Split the two commits that carry both research and code

Type: task
Status: resolved
Blocked by: —

## Question

The park keeps the research on `dev` and sends the code to `feat/three-r185`. Two commits refuse that
split because they contain both:

- **`946bed3 feat(three-app)!: bump three to 0.185.1 and declare it a peer dependency`** — 7 code
  files, 7 doc files. The code half is the bump itself: `package.json`'s peer and devDeps,
  `pnpm-workspace.yaml`'s catalog, `renderer.ts`'s API migration, `environment.ts`, `area.ts`,
  and a harness `texture-generator` touch. The doc half is `README.md`'s consumer install
  instructions, three `AGENTS.md` files, `docs/runtime-assets.md`, the three-upgrade ticket 04 body,
  and a backlog finding.
- **`edeaa8e fix(metal-parity): eye-tune metal strength for r185`** — 6 code files, 7 doc files. Code
  is the harness `config.json`/`config.js` strength blocks and the migration script's default factor;
  docs are the metal-parity ticket bodies and the migration note.

Split each into a `dev` half and a branch half. The doc halves are not simply "all the `.md` files" —
some of that prose is *about* r185 and would be a lie sitting on a `0.147` `dev`:

- `README.md`'s install instructions tell consumers to install `three@^0.185`. That is the branch's.
- `docs/runtime-assets.md` and the `AGENTS.md` edits need reading individually. Some describe the
  revision-scoped contract, which shipped in beta.2 and is true on `0.147`. Some describe the bump.
- The three-upgrade and metal-parity ticket bodies are research and stay, whole.

`c73430a chore(scripts): add the r158 bumpScale config migration` needs a call in the same pass. Its
one code file is [`scripts/migrate-bump-scale.mjs`](../../../scripts/migrate-bump-scale.mjs), a tool
that only means anything once three is on r158+. It is also a recorded finding — the derivation that
produced it is the substance of metal-parity ticket 02. Decide whether it sits on `dev` as a dormant
script beside its note in [`docs/migrations/r158-bump-scale.md`](../../../docs/migrations/r158-bump-scale.md),
or rides the branch with the config it migrates. State the reasoning; either is defensible and the map
should not have to guess later.

Output is the split patches ready for ticket 04 to apply, not a rebuilt `dev`.

## Acceptance criteria

- [x] Each of `946bed3` and `edeaa8e` split into a `dev` patch and a branch patch, with every file
      assigned deliberately
- [x] Every doc file that describes r185 identified and sent to the branch — no prose left on `dev`
      that a `0.147` tree contradicts
- [x] A verdict on `c73430a`, with reasoning
- [x] The `dev` halves apply to `v0.5.0-beta.2` — verified, not assumed
- [x] `AGENTS.md` files checked individually rather than in bulk; they are the repo's instructions and
      a wrong one misleads every future session

## Answer

### `946bed3` — splits, and [07](07-peer-dependency-question.md) moved the line

Because the peer move ships in 0.5.0, the manifest hunks split along *move* versus *range* rather
than going wholesale to the branch.

| File | Goes to | Note |
| --- | --- | --- |
| `packages/tag-customizer/package.json` | **split** | Peer move to `dev` at `^0.147.0`; `^0.185.0` and the `@types/three` bump to the branch |
| `README.md` | **`dev`** | The install section exists *because* of the peer move. Rewritten: `^0.185.0`→`^0.147.0`, `0.186`→`0.148` |
| `packages/tag-customizer/AGENTS.md` | **`dev`** | Same, rewritten. The `@types/three` bullet's claim holds — `0.147.0` ships no `.d.ts` either |
| `.agents/skills/release-prep/SKILL.md` | **`dev`** | The `catalog:`-in-`peerDependencies` checks only matter once a peer block exists, which is now |
| `docs/runtime-assets.md` | **split** | Hunk 1 (bump catalog *and* peer together) to `dev`; the r156 table row and the r185 console examples to the branch |
| `.scratch/three-upgrade/issues/04-…` | **`dev`** | Research, whole |
| `.scratch/three-app-backlog/issues/06-…` | **`dev`** | Research, whole |
| `packages/tag-customizer/src/three-app/AGENTS.md` | branch | Entirely the colour-space / `outputColorSpace` / `physicallyCorrectLights` block |
| `renderer.ts`, `environment.ts`, `area.ts` | branch | The API migration |
| `apps/dev/src/texture-generator/texture-generator.js` | branch | The one colour-space line |
| `pnpm-workspace.yaml`, `pnpm-lock.yaml` | branch | Catalog stays `^0.147.0`; the lockfile regenerates |

`.claude/skills/release-prep` is a **symlink** to `.agents/skills/release-prep` — one file, not two.

**Ordering constraint found here, and ticket 04 must honour it.** The `SKILL.md` hunk does not apply
to beta.2: it was written against the file as rewritten by `bcf77e5` and `2baa088`, which are earlier
in history and both in the `dev` set. Cherry-picks must go in original commit order.

### `edeaa8e` — almost entirely branch

`dev` half is the five `.scratch/metal-parity/**` files only: the map, tickets 04 and 05, and the
harness tooling (`tools/README.md`, `tools/capture.js`). Research, per the charting decision.

Everything else rides the branch — `apps/dev/src/config.js` and `config.json` (the tuned strength
blocks), `docs/migrations/r158-bump-scale.md`, `scripts/migrate-bump-scale.mjs`,
`three-app/AGENTS.md`.

**Including the debug tooling, which is a deliberate call rather than an oversight.** The commit also
adds `#debug`-gated live material faders — 56 lines to `utils/debug.ts`, 43 to `area/debug.ts`, a
`refreshMaterialTuners()` call in `three-app.ts`. Every property it binds (`roughness`, `metalness`,
`bumpScale`, `envMapIntensity`, `aoMapIntensity`, `color`) exists on `MeshStandardMaterial` at
`0.147`, so it would *run*. It still rides the branch:

- Its fader ranges are r185-calibrated and unusable at `0.147`. `bumpScale` is bound as
  `(material, 'bumpScale', 0, 120, 0.01)` — a 0.01 step cannot express `0.001`, the shipped r147
  value. The instrument would be present and useless.
- It is new library code, and 0.5.0 is deliberately boring.
- Its `three-app/AGENTS.md` documentation would need rewriting alongside the ranges.

Worth porting later on its own merits; not worth porting as a side effect of this split.

### `c73430a` — rides the branch, whole

The ticket left this open as defensible either way. It is not, once the consumer is considered.

`docs/migrations/r158-bump-scale.md` is an **instruction**, not a finding: it tells a reader to rescale
every `bumpScale` in their config by a factor. That instruction is correct on r158+ and actively
destructive on `0.147`, where the r147 pixel-footprint cancellation still applies — a 0.5.0 consumer
following it would multiply their working values by 2000 and get garbage. Shipping a migration note
for a migration that has not happened is worse than not shipping it.

`scripts/migrate-bump-scale.mjs` follows the note; alone on `dev` it is a loaded gun with no label.
The `AGENTS.md` hunk indexing `docs/migrations/` goes with them.

This does not lose the research. The *derivation* — why r158 changed `bumpScale`'s meaning, and the
×21 000 arithmetic — lives in [metal-parity ticket 02](../../metal-parity/issues/02-bumpscale-semantics.md),
which stays on `dev`. What leaves is the instruction, which is the part that would be wrong.

### Artifacts

- `scratchpad/03-946bed3-dev-half.patch` — README, `AGENTS.md`, `docs/runtime-assets.md` hunk 1, and
  the `package.json` peer move, all r147-shaped. Verified to apply to `v0.5.0-beta.2`.
- The `SKILL.md` hunk is **not** in that patch, by the ordering constraint above. Ticket 04 applies it
  after `bcf77e5` / `2baa088`.

### Found while splitting, not fixed here

`docs/runtime-assets.md` is already internally inconsistent at beta.2: lines 21 and 24 give `185dev`
and `r185/draco/` as examples while lines 85, 93 and 96 name the `0.147` pin. Pre-existing, unrelated
to this split, and misleading to a 0.5.0 reader. Flagged for ticket 04's "stop the tracker lying" pass.

## Comments

### Agent — 2026-08-04

Split decided against the probe worktree at `v0.5.0-beta.2`. `946bed3`'s `dev` half was drafted and
verified to apply; the rest is a classification, applied by [04](04-park-the-branch-rebuild-dev.md).
