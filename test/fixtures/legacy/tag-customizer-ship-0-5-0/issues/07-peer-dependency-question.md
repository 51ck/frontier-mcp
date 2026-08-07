# 07 — Should 0.5.0 ship `three` as a peer at `^0.147.0`?

Type: grilling
Status: resolved
Blocked by: —

## Question

Surfaced while resolving [02](02-texture-leak-fix-portability.md), and not anticipated at charting.

At `v0.5.0-beta.2`, `three` is a **`dependency`** — `"three": "catalog:"` resolving to `^0.147.0`. The
move to `peerDependencies` was part of `946bed3`, the bump commit. So parking the bump reverts the
peer move along with it, by default and without anyone deciding to.

That default may be wrong. `946bed3`'s own message argues the peer move is a fix for a problem that
exists *today*, on `0.147`:

> `three` moves from `dependencies` to `peerDependencies` at `^0.185.0`. It was already external in
> the library build, so it behaved as a peer while declaring as a dependency — and that mismatch is
> what forced the consumer to carry an `overrides.three` hack.

Read that carefully: the mismatch is between the **build** treating `three` as external and the
**manifest** declaring it a dependency. Neither half of that is version-specific. If it is true at
`0.185`, it is true at `0.147`, and `staya-front` is carrying `overrides.three` right now because of
it.

So the question: **does 0.5.0 ship `three` as `peerDependencies: {"three": "^0.147.0"}`, decoupling
the peer move from the version bump?**

Establish the facts before putting it to Petr — several are checkable and none should be argued from
the commit message alone:

- Confirm `three` is genuinely `external` in `packages/tag-customizer/vite.lib.config.js` at beta.2,
  not only after the bump. If it is not, the argument collapses and this ticket closes.
- Confirm the packed tarball's dependency block at beta.2 — the repo uses `catalog:`, and
  `/release-prep` notes pnpm resolves it at pack time. What does a consumer installing
  `0.5.0-beta.2` actually get today?
- Find out whether `staya-front`'s `overrides.three` is reachable from here, or whether this has to be
  asked rather than read.

Then the decision, which is Petr's:

- **Ship the peer move in 0.5.0.** Fixes the consumer's hack a release earlier. But it is a breaking
  install change — a consumer who installs only this package gets something that cannot run — landing
  in a version whose two published betas did not break. Pre-1.0 a minor may break, and 0.5.0 is
  already a minor, so semver permits it; the question is whether it is kind.
- **Leave it, ship the peer move with the bump in 0.6.0.** One breaking change, one release, one thing
  for consumers to read. 0.5.0 stays the quiet release it has been.

Note the interaction with ticket 03: if the peer move ships, `946bed3`'s `package.json` and
`pnpm-workspace.yaml` hunks split *again* — the peer *move* to `dev`, the `^0.185.0` *range* to the
branch. Say so in the answer, because 03 has to act on it.

## Acceptance criteria

- [x] The three factual questions above answered from the repo, not from `946bed3`'s message
- [x] Both options put to Petr with the consequence for consumers stated plainly
- [x] A decision recorded, and ticket 03 told what it means for splitting `946bed3`
- [x] If the answer is "ship it", the changelog consequence noted — an install break needs saying out
      loud, and `/release-prep`'s version check in [06](06-release-0-5-0.md) has to expect it

## Answer

**Yes. 0.5.0 ships `three` as `peerDependencies: {"three": "^0.147.0"}`.** Petr's call, 2026-08-04.

### The facts, checked rather than argued

`946bed3`'s premise holds at `0.147`, and is not version-specific:

- **`three` is already `external` at beta.2.** `packages/tag-customizer/vite.lib.config.js:5-11`
  lists `'three'` and `/^three\//` in `external`, fed to `rollupOptions.external`. This predates the
  bump.
- **And it is declared a `dependency`.** `packages/tag-customizer/package.json` at beta.2:
  `"dependencies": {"dat.gui": "^0.7.9", "gsap": "^3.11.4", "three": "catalog:"}`, with the catalog
  pinning `^0.147.0`.

So the build-versus-manifest mismatch that forced `staya-front`'s `overrides.three` exists today, on
the published beta. Nothing about it waits for r185.

`gsap` and `dat.gui` sit in the same mismatch and were deliberately left alone. A duplicate `gsap` or
`dat.gui` is wasteful, not broken; a duplicate `three` breaks `instanceof` across the library
boundary, which takes out raycasting and picking with no build error. Only `three` earns the churn.

### Reasoning for shipping it now

Separating the install-shape change from the renderer change is worth a release. When 0.6.0 lands
r185, the install shape will already be settled, so anything that breaks then is unambiguously the
renderer rather than a second copy of `three` getting loaded. Debugging those two at once, in one
release, is the expensive version of this.

The cost is real and was accepted: 0.5.0 becomes a breaking install where its two published betas did
not break. Pre-1.0, a minor may break, and 0.5.0 is already a minor.

### What this means for ticket 03

`946bed3`'s manifest hunks split along *move* versus *range* rather than going wholesale to the
branch:

| Change | Goes to |
| --- | --- |
| `three` moved `dependencies` → `peerDependencies` | **`dev`** |
| The range in that peer block — `^0.185.0` | branch. `dev` gets `^0.147.0` |
| `@types/three` devDep `^0.147.1` → `^0.185.0` | branch. `dev` keeps `^0.147.1` |
| `pnpm-workspace.yaml` catalog `^0.147.0` → `^0.185.0` | branch. `dev` keeps `^0.147.0` |
| `README.md` consumer install instructions | **`dev`**, rewritten for `^0.147.0` |

The README instructions are the subtle one. `946bed3` added 24 lines telling consumers to install
`three` themselves, and they exist *because* of the peer move — so they belong on `dev` now, but they
name `^0.185`. They must be rewritten to `^0.147.0` rather than cherry-picked or dropped.

### What this means for ticket 06

The commit carrying the peer move on `dev` must declare the break — `feat!` or a `BREAKING CHANGE:`
footer — or consumers get an install break with nothing in the changelog saying so. That footer feeds
release-it's version calculation, so [06](06-release-0-5-0.md)'s "read the dry-run deliberately" step
must expect a break-driven bump and confirm it lands on `0.5.0` rather than somewhere else.
