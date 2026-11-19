# 01 — sRGB-decoded data maps: r185-only, or latent on r147?

Resolves [issue 01](../issues/01-srgb-data-maps-verdict.md). Sources read: the two three trees in the
pnpm store, `node_modules/.pnpm/three@0.147.0/node_modules/three/` and
`node_modules/.pnpm/three@0.185.1/node_modules/three/`. Nothing here is taken from `.scratch/metal-parity/`
or `.scratch/three-upgrade/`.

## 1. Verdict

**Latent on r147 too.** `0.147` sRGB-decoded the packed `orm` texture by exactly the same mechanism and
by exactly the same amount as `0.185.1`. The bug is real, pre-existing, and independent of the bump.

The commit message's own explanation of *why* r147 hid it — "Texture encoding was honoured for a small set
of colour slots back then, so the same assignment on a bump map was simply ignored" — is **false** as a
statement about r147. It describes three ≤ r136, and it survives in r147 only as a stale code comment
(see §2.5). The observation that r185 looked worse is not disputed; the stated cause is wrong.

One caveat that does *not* change the verdict but bounds it: the tags whose textures are KTX2 carry
`isNotRGBEncoding: true` in the frozen config, so on both revisions those were already exempt. The
regression the fix targets is on the **JPEG** path. See §2.6 and §4.

## 2. Evidence

### 2.1 The code being fixed is API-renamed but semantically identical across the two revisions

`v0.5.0-beta.2` (`git show v0.5.0-beta.2:…/area/area.ts`), the r147-shaped file:

```
266:  if (!this._currentTextureSource.isNotRGBEncoding) this._material[threeJSMapName].encoding = THREE.sRGBEncoding;
282:  if (!this._currentTextureSource.isNotRGBEncoding) this._material[threeJSMapName].encoding = THREE.sRGBEncoding;
285:  this._material[threeJSMapName].encoding = THREE.LinearEncoding;          // normalMap only
293:  if (key === 'orm') {
294:    if (this._currentTextureSource.isNotRGBEncoding) this._material[threeJSMapName].encoding = THREE.LinearEncoding;
```

`946bed3`'s r185-shaped file (the parent of `a4788f7`, visible as the `-` side of `git show a4788f7`) is
line-for-line the same logic with `.encoding`→`.colorSpace`, `sRGBEncoding`→`SRGBColorSpace`,
`LinearEncoding`→`NoColorSpace`.

In both, the write at line 266/282 lands on **every** slot in `THREE_TEXTURE_NAMES`
(`packages/tag-customizer/src/three-app/world/objects/customizable-object/config.ts:16-23`), i.e. `map`,
`bumpMap`, `normalMap`, `roughnessMap`, `metalnessMap`, `aoMap`. Only `normalMap` is walked back. The
`orm` guard at 293-294 only fires when `isNotRGBEncoding` is truthy — in which case 266 never tagged it
sRGB in the first place, so it is a no-op in both revisions. **When `isNotRGBEncoding` is falsy, `orm`
lands in `aoMap`/`roughnessMap`/`metalnessMap` tagged sRGB on r147 and on r185 alike.**

### 2.2 Neither revision has any shader-side per-texture decode — the decode is GPU-side, from the texture's own tag

r147 has no `mapTexelToLinear` / `getTexelDecodingFunction` at all:

```
$ grep -rn "mapTexelToLinear\|TexelDecoding" three@0.147.0/node_modules/three/src
(no matches)
```

The only encoding function r147's program builder emits is the **output** one:

`three@0.147.0/…/src/renderers/webgl/WebGLProgram.js:67`
```js
function getTexelEncodingFunction( functionName, encoding ) {
	const components = getEncodingComponents( encoding );
	return 'vec4 ' + functionName + '( vec4 value ) { return LinearTo' + components[ 0 ] + components[ 1 ] + '; }';
}
```
`three@0.147.0/…/src/renderers/webgl/WebGLProgram.js:693`
```js
getTexelEncodingFunction( 'linearToOutputTexel', parameters.outputEncoding ),
```

r185 is structurally identical — `WebGLProgram.js:84` and `WebGLProgram.js:779`, keyed on
`parameters.outputColorSpace`. Both revisions therefore push per-texture transfer-function handling
entirely into the texture upload path.

### 2.3 Both revisions pick an sRGB GPU internal format from the texture's own tag, with no knowledge of the material slot

r147 — `src/renderers/webgl/WebGLTextures.js:172` (inside `getInternalFormat`, `glFormat === RGBA` branch):
```js
if ( glType === _gl.UNSIGNED_BYTE ) internalFormat = ( encoding === sRGBEncoding && forceLinearEncoding === false ) ? _gl.SRGB8_ALPHA8 : _gl.RGBA8;
```

r185 — `src/renderers/webgl/WebGLTextures.js:234`:
```js
if ( glType === _gl.UNSIGNED_BYTE ) internalFormat = ( transfer === SRGBTransfer ) ? _gl.SRGB8_ALPHA8 : _gl.RGBA8;
```

Both are reached unconditionally from the upload path — r147 `WebGLTextures.js:699-702`, r185
`WebGLTextures.js:937-940`:

```js
// r147:699
glFormat = utils.convert( texture.format, texture.encoding );
let glType = utils.convert( texture.type ),
	glInternalFormat = getInternalFormat( texture.internalFormat, glFormat, glType, texture.encoding, texture.isVideoTexture );
```

`forceLinearEncoding` in r147 is fed `texture.isVideoTexture` and nothing else, so it never applies here.
Neither `uploadTexture` nor `getInternalFormat` in either revision receives the material slot name; there
is no filter anywhere in the pipeline that could make `sRGBEncoding` "only supported on map, envMap and
emissiveMap". `SRGB8_ALPHA8` makes the *sampler hardware* apply the EOTF on every fetch, regardless of
which uniform the sampler is bound to.

The compressed path is the same story: r147 `WebGLUtils.js:86, 171-172, 194-207, 225` selects
`COMPRESSED_SRGB*` variants from `encoding === sRGBEncoding`; r185 `WebGLUtils.js:44, 111-112, 138-151, 169`
does it from `transfer === SRGBTransfer`. Same table, same trigger.

### 2.4 The shader chunks read raw texels and the same channels in both revisions

| chunk | r147 | r185 |
| --- | --- | --- |
| `roughnessmap_fragment.glsl.js:6-9` | `texture2D( roughnessMap, vUv )` → `.g` | `texture2D( roughnessMap, vRoughnessMapUv )` → `.g` |
| `metalnessmap_fragment.glsl.js:6-9` | `texture2D( metalnessMap, vUv )` → `.b` | `texture2D( metalnessMap, vMetalnessMapUv )` → `.b` |
| `aomap_fragment.glsl.js:5` | `texture2D( aoMap, vUv2 ).r` | `texture2D( aoMap, vAoMapUv ).r` |
| `bumpmap_pars_fragment.glsl.js:17` | `texture2D( bumpMap, vUv ).x` | `texture2D( bumpMap, vBumpMapUv ).x` |

The only difference is the varying's name (the r155 multi-UV refactor). No decode wrapper on either side.
So the value the shader sees *is* the hardware-decoded texel, identically on both.

**Decisive test, answered:** for the same file assigned to `roughnessMap`/`metalnessMap`/`aoMap` with the
same tag, r147 and r185 sample the same number. `SRGB8_ALPHA8` on r147 == `SRGB8_ALPHA8` on r185.
The arithmetic corroborates the recorded symptom: `srgbToLinear(0.41) = ((0.41+0.055)/1.055)^2.4 ≈ 0.140`,
which is the `0.15` metal-parity measured on r185 — and r147 computes the identical transform.

### 2.5 Where the "r147 ignored it" belief comes from

r147 still ships the pre-r137 comment, unchanged, four lines above the assignment:

`three@0.147.0/…/src/textures/Texture.js:64`
```js
// Values of encoding !== THREE.LinearEncoding only supported on map, envMap and emissiveMap.
```

It is stale. It documented the era when `WebGLProgram` injected `mapTexelToLinear` / `envMapTexelToLinear`
/ `emissiveMapTexelToLinear` and only those three chunks called a decode. Those functions do not exist in
r147 (§2.2). r185 replaced the comment with the accurate one at `Texture.js:293-299`
("Textures containing color data should be annotated with `SRGBColorSpace` or `LinearSRGBColorSpace`").
Anyone reading r147's `Texture.js` and not its `WebGLTextures.js` would conclude what the commit message
concluded.

`ColorManagement.legacyMode: true` (r147 `src/math/ColorManagement.js:24`) is the other candidate
explanation and it also does not hold: `legacyMode` is read at `ColorManagement.js:40` inside `convert()`
only, and `grep -rn ColorManagement three@0.147.0/…/src/renderers/` returns **nothing**. It gates CPU-side
`Color` conversion, never texture upload.

Output stage is not a compensating difference either: `v0.5.0-beta.2:…/renderer.ts:57` sets
`this.instance.outputEncoding = THREE.sRGBEncoding` explicitly, and r185's `outputColorSpace` defaults to
`SRGBColorSpace` (deliberately not restated — `packages/tag-customizer/src/three-app/renderer.ts:52-57`).
Both revisions therefore render through the same output transform.

### 2.6 Which real assets were actually affected — narrower than the commit message implies

`apps/dev/src/config.js:542-570` — the `blk` "Matte black" variant, the tag metal-parity tuned
(`strength: {bumpScale: 2, roughness: 0.27, metalness: 0.97}`):

```js
mesh: {
	base:   './textures/staya-tag/base-bl.jpg?cash=08-06-2022',
	height: './textures/staya-tag/height.jpg',
	orm:    './textures/staya-tag/orm.jpg',
},
```

No `isKTX`, no `isNotRGBEncoding`. It goes through `Loaders.loadImage` →
`new THREE.Texture(HTMLImageElement)` (`area/area.ts:213-217`, `276`), which is `RGBAFormat` /
`UnsignedByteType` — precisely the case `WebGLTextures.js:172` / `:234` upgrades to `SRGB8_ALPHA8`.
So `orm.jpg` and `height.jpg` were sRGB-decoded on r147, and `bumpMap` too.

Conversely, **every** KTX2 source in the harness configs carries `isNotRGBEncoding: true` —
`apps/dev/src/config.js:1653-1659`, `config-af1.js:305-310, 326-331, 347-352, 392-393`,
`config-polaroid.js:397-401, 418-422, 439-443`. For those, line 266/282 never fired on either revision,
so they were never mis-tagged. `KTX2Loader` sets the tag from the file's DFD in both revisions anyway
(r147 `examples/jsm/loaders/KTX2Loader.js:256, 782`; r185 `KTX2Loader.js:458, 1242, 1251-1265`), and
`area.ts` overwrites it — but with the same value the loader chose, so no change.

Net: the fix's real target on the current asset set is the **non-KTX (JPEG) `orm` + `height`** path, which
is the metal tag. That path is broken identically on r147 and r185.

## 3. Patch portability

**`a4788f7` does not cherry-pick onto a 0.147-shaped tree, and its clean part is inert there.**

```
$ git worktree add …/r147-probe v0.5.0-beta.2
HEAD is now at b6c034c chore(release): v0.5.0-beta.2

$ git cherry-pick -n a4788f7
Auto-merging   packages/tag-customizer/src/three-app/world/objects/customizable-object/area/area.ts
CONFLICT (content): Merge conflict in packages/…/area/area.ts
error: could not apply a4788f7… fix(three-app): stop sRGB-decoding data maps
exit 1
```

Three conflict hunks, all in the colour-space region (probe file lines 276, 295, 306). The additive part
merged clean — `COLOUR_MAP_NAMES` (line 18), the `_colorSpaceForMap` helper (line 363), and the call site
(line 303) all landed, 49 insertions. **That is the trap**: taking "theirs" on all three hunks yields a
file that type-checks and does nothing useful, because

- `Texture.colorSpace` **does not exist in r147** — `grep -n colorSpace three@0.147.0/…/src/textures/Texture.js`
  returns nothing; r147's property is `encoding`, a number (`Texture.js:22, 68`). Assigning `.colorSpace`
  writes a dead expando the renderer never reads.
- The constants *are* exported in r147 (`constants.js:146-148`: `NoColorSpace = ''`, `SRGBColorSpace = 'srgb'`)
  — added for the then-new `Color`/working-colour-space API — so nothing throws and nothing warns. It fails
  silently.
- The conflicting hunks are the deletions of `.encoding = THREE.sRGBEncoding`. Resolving them "theirs"
  removes the only working colour tag, so `map` (the base colour) drops to `LinearEncoding` and the whole
  tag renders washed out. The fix would trade a wrong roughness for a wrong albedo.

Worktree removed (`git worktree remove --force`, then `git worktree prune`); `dev` untouched.

### The r147-shaped equivalent

Same shape, `encoding` vocabulary, `LinearEncoding` as the "do not transform" marker (r147 has no
`NoColorSpace` for textures):

```js
const COLOUR_MAP_NAMES = new Set(['map', 'emissiveMap']);

// …in _setMaterial, replacing beta.2 lines 266, 282, 284-295, keeping only:
this._material[threeJSMapName].encoding = this._encodingForMap(threeJSMapName);

if (threeJSMapName === 'normalMap') {
	this._material.normalScale = new THREE.Vector2(1, -1);
}

// …and the helper:
_encodingForMap(threeJSMapName) {
	const isColour = COLOUR_MAP_NAMES.has(threeJSMapName) && !this._currentTextureSource.isNotRGBEncoding;

	return isColour ? THREE.sRGBEncoding : THREE.LinearEncoding;
}
```

`LinearEncoding` is the correct r147 counterpart of `NoColorSpace` here: it is r147's default
(`Texture.js:22`) and the value that leaves `getInternalFormat` at `RGBA8`. The r185 commit's own comment
about preferring `NoColorSpace` over `LinearSRGBColorSpace` is an r185-only distinction — r147 has one
"linear" and it is the right one.

This is a **rewrite in the same spirit, not a port**. It is small (≈30 lines, one file, no new imports)
and self-contained, but it is new code that must be re-reviewed and re-verified on r147, and it does not
carry `a4788f7`'s authorship cleanly. Landing it in 0.5.0 means writing a fresh commit, not cherry-picking
one.

## 4. What I could not determine

- **I did not run either renderer.** Every claim above is a source read plus the arithmetic in §2.4. I did
  not put a r147 build in a browser and read back a sampled roughness value, so I have not *empirically*
  confirmed the `0.15` on r147 the way metal-parity confirmed it on r185. The source path is unambiguous
  and slot-agnostic in both revisions, which is why I state the verdict plainly — but "measured on r185,
  derived on r147" is the honest description of the evidence.
- **Whether the r147 render was ever visibly wrong to a human.** The bug is identical, but the surrounding
  material values (`roughness 0.27`, `metalness 0.97`) were tuned *against* the broken r147 render. It is
  entirely possible that the strengths in `config.js` are compensating for this decode, and that fixing it
  on r147 makes the tag look wrong until those numbers are re-tuned. The map itself flags those values as
  unverified ("Not yet specified" → whether metal-parity's working values survive re-measurement). **I
  would not ship the r147-shaped fix without a visual check and probable re-tune.** This is the single
  biggest risk in calling it "ships in 0.5.0", and it is a rendering question, not a source-reading one.
- **The GPU transcode target for KTX2.** I confirmed the sRGB compressed-format tables exist and are
  keyed the same way in both `WebGLUtils.js`, but I did not determine which format `KTX2Loader.detectSupport`
  actually picks on the target hardware. It does not affect the verdict, because every KTX2 source in the
  repo's configs is already `isNotRGBEncoding: true` and so was never mis-tagged on either revision.
- **Non-harness consumer configs.** I read `apps/dev/src/config*.js`. If a real consumer ships a JPEG `orm`
  or `height` without `isNotRGBEncoding`, they have the same latent bug and the fix changes their render.
  That is a compat question for the changelog, and I have not surveyed consumer configs.
