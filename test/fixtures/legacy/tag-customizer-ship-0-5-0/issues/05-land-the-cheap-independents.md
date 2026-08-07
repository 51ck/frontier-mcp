# 05 — Land the independents chosen for 0.5.0

Type: task
Status: resolved
Blocked by: 04

## Question

A tracking ticket, not a unit of work. The 0.5.0 scope decided at charting is *tight plus the cheap
independents* — the small, self-contained tickets that stay clear of `area.ts`, which is where the
parked branch lives and where every conflict will be.

Each of these is already specified in its own effort. Work them there, in their own sessions, under
their own acceptance criteria. This ticket exists so the map knows what `0.5.0` is waiting on.

- [x] [camera-pinned-after-resize 01 — Reset camera lock on defocus](../../camera-pinned-after-resize/issues/01-reset-camera-lock-on-defocus.md) — **already fixed**, `98356f6`, in beta.2
- [x] [camera-pinned-after-resize 02 — Dedupe resize-triggered camera reposition](../../camera-pinned-after-resize/issues/02-dedupe-resize-camera-reposition.md) — **already fixed**, `98356f6`, in beta.2
- [x] [typescript-rewrite T1.12 — Align controls-changed payload types to runtime](../../typescript-rewrite/issues/12-align-controls-changed-payload-types.md) — done, `1b74305`
- [x] [typescript-rewrite T1.13 — Export nested public types from package entry](../../typescript-rewrite/issues/13-export-nested-public-types.md) — done, `c141dd8`
- [x] [three-app-backlog 05 — `TextDrawer._resizeEditableElement` calls undefined `_getMaxTextWidth`](../../three-app-backlog/issues/05-resizeeditableelement-getmaxtextwidth-undefined.md) — **already fixed**, `16f971a`, in beta.2

Two things to check before starting any of them, because they were all written against a `dev` that
has since been rebuilt:

- **Does the ticket still describe reality?** Each was filed before the park. Re-read the code it
  names before working it.
- **Does it touch `area.ts` or the state-diff path?** If one turns out to, stop and raise it rather
  than working it — the whole point of this scope boundary is to keep 0.5.0 off the ground the branch
  occupies. Landing it anyway is a scope change, and that is Petr's call.

`three-app-backlog` ticket 05 is the one to watch: it is `ready-for-agent` but sits in an effort whose
other fifteen tickets are `needs-triage`, so it has had less scrutiny than the rest of this list.

## Acceptance criteria

- [x] Each listed ticket either resolved in its own effort, or explicitly dropped from 0.5.0 with a
      reason recorded here
- [x] Anything found to touch `area.ts` or the state-diff path raised rather than worked — **nothing
      did**; see below
- [x] `pnpm run check` green on `dev` after the last one lands
- [x] The harness still boots and renders on `147` — **boots yes, renders unverified**, the same gap
      [04](04-park-the-branch-rebuild-dev.md) reported and for the same reason

## Answer

**Two of the five needed work. Three were already fixed and shipped in `v0.5.0-beta.2`.**

The ticket's own warning — "each was filed before the park, re-read the code it names" — turned out to
be the whole job. Every line number in all five tickets had drifted, and in three cases the drift was
because the fix had landed.

| Ticket | Verdict | Evidence |
| --- | --- | --- |
| camera-pinned 01 | already fixed | `Camera.resetControlsLock()` at `camera.ts:120`, called from `Focus.deFocusAll` at `focus.ts:47` |
| camera-pinned 02 | already fixed | `_suppressResizeReframe` guard around `sizes.setPanelsSize` in `three-app.ts:274` |
| three-app-backlog 05 | already fixed | `_getMaxTextWidth(mode?)` defined at `text-drawer.ts:1126`, called at `:203` |
| typescript-rewrite 12 | **worked** | `1b74305` |
| typescript-rewrite 13 | **worked** | `c141dd8` |

The three already-fixed ones were traced with `git log --follow -S`, not by eyeballing the source —
`98356f6 fix(camera): unlock orbit after defocus resize` closes both camera tickets in one commit, and
`16f971a refactor(text-drawer): type-check the module, drop @ts-nocheck` closes the text-drawer one.
Both are ancestors of `v0.5.0-beta.2`, so **all three are already published** and add nothing to
`0.5.0`'s diff. `camera-pinned-after-resize` is closed as an effort.

A first `-S` pass without `--follow` blamed all three on `dc9eb2e build: extract library into
packages/tag-customizer`, which is just the workspace split renaming every file. Worth knowing: in
this repo, any archaeology across the split needs `--follow` or it will finger `dc9eb2e` every time.

### The `area.ts` boundary held

Nothing touched it. Both worked tickets are type declarations only — `types/public.ts` and the entry's
`export type` block — with zero runtime bytes and no overlap with the parked branch.

Camera-pinned 01 is the near miss worth recording: the ticket's own diagnosis named
`area.deFocus (area.ts:454-456)` as a place needing the fix. Had it still been open, working it would
have hit the boundary and had to be raised. The fix that actually shipped hangs off `Focus.deFocusAll`
one level up and never enters `area.ts` — a better fix that also happens to be the one this scope
could have accepted.

### T1.12 ships as breaking

Marking `start` / `end` / `userAction` optional cannot break anything at runtime — their absence is
what the type was wrong about. But a consumer assigning `payload.start` to a `boolean` under
`strictNullChecks` now fails to compile, so it carries a `BREAKING CHANGE:` footer rather than hiding
in a `fix`. Free in version terms: `0.5.0` already carries the `three` peer move as a deliberate
`feat!`, and [06](06-release-0-5-0.md) runs an explicit version anyway. Flagging it because it changes
the changelog `0.5.0` publishes, and that is Petr's to veto.

### Verification

`pnpm run check` green, exit 0, exactly the 12 known harness warnings. `dist/types/public.d.ts` carries
`start?` / `end?` / `userAction?` and `dist/ThreeApp.d.ts:4` re-exports all five names — both confirmed
in the built artifact, not only in source.

The harness re-check reproduced 04's result exactly: `window.__THREE__` is `"147"`, the app instance
constructs, and the only console error is the known fixture typo `[harness] Too many symbols for one
line`. The scene again stalled at 2 children with `_stopStatus.ready === false`, because the browser
pane is backgrounded and the FPS benchmark needs animation frames. **Still nobody has looked at the
picture.** That is unchanged by this ticket and stays [06](06-release-0-5-0.md)'s first step.

## Comments

### Agent — 2026-08-04

Cheapest ticket in the effort, and only because it was re-read before it was worked. Three of the five
would have been rediscovered as no-ops halfway through an implementation session each.
