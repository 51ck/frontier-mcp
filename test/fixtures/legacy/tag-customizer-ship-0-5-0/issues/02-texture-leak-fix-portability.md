# 02 — Does the texture-lifetime fix survive without the bump?

Type: task
Status: resolved
Blocked by: —

## Question

`ea41798 fix(three-app): free bumpMap and stale map slots` is a real texture leak fix — `_setMaterial`
left `bumpMap` and stale map slots holding GPU memory across design changes. It touches `area.ts`,
`config.ts` and `customizable-object.ts`, and its intent has nothing to do with three's revision. It
should ship in `0.5.0`.

The problem is where it was written: on top of `946bed3`, after the bump had already rewritten
`area.ts`'s material handling, and after `a4788f7` had rewritten the colour-space branch in the same
function. Cherry-picked onto `v0.5.0-beta.2` it will probably conflict, and the conflict will be in
exactly the code that decides which textures get disposed — the place where a bad merge produces a
leak or a double-dispose rather than a compile error.

Establish, concretely:

- Whether `git cherry-pick ea41798` onto a branch at `v0.5.0-beta.2` applies, conflicts, or applies
  and is wrong.
- If it conflicts, what the `0.147`-shaped fix is. Resolve it by reading what the leak actually is,
  not by taking whichever side of the conflict compiles.
- Whether it depends on ticket 01's commit landing first. If `a4788f7` parks and this one ships, this
  ticket owns the seam between them.

Note that `128b97f docs(three-app-backlog): file two texture-lifetime findings` records two *further*
problems in the same area (`15-setmaterial-disposes-loader-cached-textures`,
`16-setdesign-assigns-before-validating`) that were found while doing this and deliberately not fixed.
Those stay filed and unworked — this ticket is about porting the fix that exists, not extending it.

## Acceptance criteria

- [x] A cherry-pick onto a scratch branch at `v0.5.0-beta.2` attempted and its outcome recorded
- [x] If conflicted: a resolved patch, with the reasoning for each hunk stated
- [x] The dependency on ticket 01 stated either way — depends on it, or does not
- [x] `pnpm run check` green on the scratch branch with the patch applied
- [x] The scratch branch is a probe, not the park. Ticket 04 does the real rebuild.

## Answer

**`ea41798` ports cleanly. It ships in 0.5.0, and it does not depend on ticket 01.**

The feared conflict did not happen. Cherry-picked onto `v0.5.0-beta.2`, all three code files
auto-merged — `area.ts`, `config.ts`, `customizable-object.ts` — and only
`packages/tag-customizer/src/three-app/AGENTS.md` conflicted. The dangerous case the ticket was
written to catch, an apply that succeeds and is silently wrong, did not occur either; the merge was
inspected rather than trusted.

### Why `area.ts` auto-merged despite three commits touching it

`946bed3` (the bump) and `a4788f7` (colour space) both rewrote the *encoding assignment* lines inside
`_setMaterial`. `ea41798` touches the *texture construction* lines in the same block — the branches
that assign `this._material[threeJSMapName]` — plus new methods far below. Same region, disjoint
lines, so git's three-way merge had no overlap to resolve. The result keeps beta.2's r147 API intact:
all five `encoding` / `sRGBEncoding` / `LinearEncoding` assignments survive verbatim, and
`grep -rn "colorSpace\|ColorSpace" packages/tag-customizer/src/` returns nothing on the probe tree.

Every part of the fix is present and wired: `MATERIAL_MAP_SLOTS` derived in `config.ts`,
`_appliedMapSlots` initialised and written at all four assignment sites, `_currentMapSlots()` and
`_releaseUnusedMapSlots()` defined, the release called before the texture loop, and both teardown
paths (`Area.destroy`, `CustomizableObject.destroy`) iterating the derived list.

### The `AGENTS.md` conflict and how it was resolved

`ea41798` added its three bullets directly beneath the block `946bed3` had added, so the whole region
came through as one hunk. Resolution — keep beta.2's line, take only what belongs to this fix:

| Line | Kept? | Why |
| --- | --- | --- |
| Runtime assets revision-scoped, `147dev` | **kept** (beta.2's side) | The `185dev` variant is the bump's and would be false on a `0.147` tree |
| Colour space, not encoding (+ 3 sub-bullets) | dropped | Describes r152+ API this tree does not use. Rides the branch |
| `WebGLRenderer.outputColorSpace` defaults | dropped | Same |
| `physicallyCorrectLights` removed in r165 | dropped | Same — and it is still live API at `0.147` |
| Material map slots are derived | **kept** | This fix |
| A material outlives its texture source | **kept** | This fix |
| Only textures this graph constructed may be disposed | **kept** | This fix |

### Verification

`pnpm run check` **green** on the probe with `three@0.147.0` resolved — library `tsc --noEmit`, lint,
`lib:build` (37 modules, `dist/ThreeApp.js` 178.35 kB), harness lint. Exactly the 12 pre-existing
`no-unused-vars` warnings in `apps/dev/src/script.js` and `old-init.js`, no new ones.

### Dependency on ticket 01 — none, with one caveat for ticket 04

`ea41798` applies to beta.2 **without** `a4788f7` present. There is no ordering requirement in the
"01 parks" case.

If 01 comes back "latent bug, ships", the order is not free: `a4788f7` is earlier in history and
touches the same `_setMaterial` block, so it lands first and **this probe must be re-run on top of
it**. Confirmed while testing the seam: `git cherry-pick a4788f7` onto beta.2 conflicts in `area.ts`
on its own, because it was authored against the bump's `colorSpace` lines, which beta.2 does not have.
Resolving that conflict is ticket 01's second deliverable, not this one's.

### Artifacts

- Resolved patch: `scratchpad/02-ea41798-on-beta2.patch` — applies to `v0.5.0-beta.2` with `git am`
- Probe worktree left in place at `scratchpad/leak-probe`, installed and at the verified state, for
  tickets 03 and 04 to reuse

### Surfaced, not in scope here

At `v0.5.0-beta.2`, `three` is a **`dependency`** at `catalog:` → `^0.147.0`. The move to
`peerDependencies` was part of `946bed3`, so parking the bump also reverts the peer move — and with it
the fix for the consumer's `overrides.three` hack, which `946bed3`'s message calls out as the reason
for the move. Whether 0.5.0 should ship `three` as a peer at `^0.147.0` is a real question this map
did not anticipate. Raised on the map rather than decided here.

## Comments

### Agent — 2026-08-04

Probed in a detached worktree at `v0.5.0-beta.2`; nothing on `dev` touched. Merge result inspected
line by line rather than trusted, per the ticket's warning about a clean apply that is wrong.
