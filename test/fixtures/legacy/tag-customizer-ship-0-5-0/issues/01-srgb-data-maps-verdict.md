# 01 — Is the data-map colour-space fix an r185 fix or a latent bug?

Type: research
Status: resolved
Blocked by: —

## Question

`a4788f7 fix(three-app): stop sRGB-decoding data maps` changes 37 lines of
[`area.ts`](../../../packages/tag-customizer/src/three-app/world/objects/customizable-object/area/area.ts).
It was written during the r185 investigation, and [metal-parity](../../metal-parity/map.md) records
that before it, r185 read the tag's effective roughness as `0.15` instead of `0.41` — the packed `orm`
texture was being sRGB-decoded when it carries data, not colour.

The question this ticket answers: **was `0.147` doing the same wrong thing, quietly?**

That determines where the commit goes. If data maps were mis-decoded on r147 too and the r185 change
merely made it visible, this is a genuine bug fix that belongs in `0.5.0` on its own merits. If r147's
`outputEncoding`-era pipeline handled these textures correctly and only the r152 `colorSpace` migration
introduced the mistake, the commit is meaningless without the bump and rides the branch.

Do not settle this from the commit message or from the metal-parity notes — both were written from
inside the r185 frame and neither asked this question. **Both revisions' sources are on disk**:

```bash
ls -d node_modules/.pnpm/three@*/node_modules/three/src
```

Read what `0.147` does with texture encoding on a `KTX2`/data texture assigned to `roughnessMap` /
`metalnessMap` / `aoMap`, and compare with `0.185.1`. The material's shader reads specific channels;
what matters is whether the sampled value differs between the revisions for the same file.

Second half of the question, and do not skip it: **if the answer is "latent bug", does the fix apply
cleanly to a `0.147` tree?** The commit was authored on top of `946bed3`'s `area.ts`. A verdict of
"ships in 0.5.0" is worthless if the patch does not apply — say so, and say what the r147-shaped
version of it looks like.

## Acceptance criteria

- [x] A verdict, stated plainly: r185-only, or latent on r147 too
- [x] The evidence is a read of both revisions' sources, quoted with file and line — not an inference
      from the metal-parity notes
- [x] If latent: whether the patch applies to a `0.147` tree, and if not, what the equivalent is
- [x] If r185-only: named as such so ticket 04 parks it without re-litigating

## Answer

**Latent on r147 too — the bug predates the bump. But `a4788f7` still parks**, because the fix is a
rewrite rather than a port and it changes the render. Petr's call, 2026-08-04.

Full findings: [`research/01-srgb-data-maps.md`](../research/01-srgb-data-maps.md).

### The verdict

`0.147` sRGB-decoded the packed `orm` texture by the identical mechanism and the identical amount as
`0.185.1`. Three reads establish it, none of them inferred from the metal-parity notes:

- **Neither revision decodes per-texture in the shader.** `grep -rn "mapTexelToLinear\|TexelDecoding"`
  over `three@0.147.0/src` returns nothing. The only encoding function r147's program builder emits is
  the *output* one (`WebGLProgram.js:67`, `:693`, keyed on `parameters.outputEncoding`); r185 is
  structurally identical at `:84` / `:779`. Both push transfer-function handling entirely into upload.
- **Both pick the sRGB internal format from the texture's own tag, slot-agnostically.** r147
  `WebGLTextures.js:172` — `internalFormat = ( encoding === sRGBEncoding && forceLinearEncoding === false ) ? _gl.SRGB8_ALPHA8 : _gl.RGBA8` — against r185 `WebGLTextures.js:234`'s
  `( transfer === SRGBTransfer ) ? _gl.SRGB8_ALPHA8 : _gl.RGBA8`. Both reached unconditionally from
  `uploadTexture`. Nothing in either pipeline knows which material slot the sampler is bound to.
- **The material shader chunks are byte-identical** modulo the r155 varying rename — raw `texture2D`,
  `.g` / `.b` / `.r` / `.x`, no decode wrapper.

### `a4788f7`'s commit message states the wrong cause

It claims r147 "honoured encoding for a small set of colour slots, so the same assignment on a bump
map was simply ignored." That describes three ≤ r136, not r147. The likely source of the belief is
r147's own stale comment at `textures/Texture.js:64` — *"Values of encoding !== THREE.LinearEncoding
only supported on map, envMap and emissiveMap"* — four lines above the assignment and contradicted by
its own `WebGLTextures.js`. r185 replaced it with an accurate one at `Texture.js:293-299`.
`ColorManagement.legacyMode` was ruled out as an alternative explanation: it gates CPU-side
`Color.convert` only and appears nowhere in r147's `renderers/`.

### Scope is narrower than the commit implies

Every KTX2 source in the harness configs already carries `isNotRGBEncoding: true`, so those were never
mis-tagged on either revision. The only affected path is JPEG — the `blk` metal tag at
`apps/dev/src/config.js:542-570`, with `orm.jpg` and `height.jpg`, no `isKTX`, no `isNotRGBEncoding`.
Broken identically on both revisions.

### Portability — it is a rewrite, and the naive resolution is dangerous

`git cherry-pick -n a4788f7` onto `v0.5.0-beta.2` produces three conflict hunks in `area.ts`, all in
the colour-space region. The trap:

- The **additive** half merges clean — 49 insertions: `COLOUR_MAP_NAMES`, `_colorSpaceForMap`, the
  call site. So "take theirs" compiles.
- And does nothing. `Texture.colorSpace` does not exist on r147 — the property is `encoding`, a
  number — while the constants `SRGBColorSpace` / `NoColorSpace` *are* exported from r147's
  `constants.js:146-148` for the then-new `Color` API. No throw, no warning.
- Meanwhile the conflicting hunks are exactly the deletions of `.encoding = sRGBEncoding`, so
  resolving them "theirs" strips the only working tag and washes out the base colour.

The r147-shaped equivalent is roughly 30 lines in one file with no new imports — same
`COLOUR_MAP_NAMES` set, helper returning `THREE.sRGBEncoding` / `THREE.LinearEncoding`. A rewrite in
the same spirit, needing its own review.

### Why it parks anyway

0.5.0 exists to stop being held up by render questions. Landing a 30-line rewrite that visibly changes
the `blk` tag is exactly that, reintroduced. In 0.6.0 the render is being re-judged regardless, so the
visual change costs nothing there. The bug has been shipping since before `0.5.0-beta.1`, so one more
release is not new exposure.

`a4788f7` therefore rides `feat/three-r185` whole. Ticket 04 parks it without re-litigating. The r147
finding is filed separately so it is not lost with the branch — see
[three-app-backlog 17](../../three-app-backlog/issues/17-orm-jpeg-srgb-decoded-on-r147.md).

### Stated limits of the evidence

The agent read sources; it did not run an r147 renderer. The `0.15` effective roughness was measured
on r185 and *derived* for r147. The code path is unambiguous, but the number is not an observation.

## Comments

### Agent — 2026-08-04

Resolved by a background research subagent against both on-disk three trees. Its worktree probe was
removed; `dev` was untouched by it.

Process note: the research file was swept into commit `35c9282` by a `git add` of the effort directory
while the agent was still writing it. The repo rule is to stage explicit paths, and this is the
failure it exists to prevent. No content was lost; the commit message simply does not mention the
file.
