---
id: T53
title: What each pattern implies for minting, and what becomes of the guards
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: []
---

## Question

`<N>` is ruled in, so scan-derived minting survives, and with it the coordination problem T37
believed it had deleted. The markdown driver now needs **two** minting strategies:

- **derived** — the pattern contains `<N>`. Scan the pattern's own namespace, take the max, add one.
  Needs coordination, exactly as ADR 0005 describes.
- **random** — the pattern contains only random tokens. Generate; no scan is needed to *produce* a
  candidate, only to verify it.

The two collision problems are not the same and must not be answered together. **Cross-tree** — two
branches, two worktrees — is unsolvable locally under `<N>` and is accepted knowingly, with a
recommendation against it. **Same-tree** — two agent sessions in one checkout — is solved today by
ADR 0005's guards, which measured four processes creating three Tickets each producing thirteen files
carrying four distinct ids, silently. If `<N>` ships without that protection, a consumer choosing
`T<N>` gets worse behaviour than they have today, in the setup this product exists for.

There may be a cheaper answer than restoring the guards. **T38 already resolved that a write refuses
on a duplicate id.** If that refusal is atomic, a same-tree race ends in a clean refusal and a retry
rather than a silent duplicate, and no guard is needed. Whether it *can* be atomic is genuinely open:
detecting the duplicate needs a scan, and the race is between the scan and the write — which is the
reasoning that produced the guard in the first place.

## Acceptance criteria

- [ ] Which minting strategy a pattern implies, and how the driver decides, is stated
- [ ] Whether ADR 0005's guard machinery returns for derived patterns is decided
- [ ] Whether T38's write-refusal can serve instead of a guard is answered, with the scan/write race
      addressed rather than assumed away
- [ ] The cross-tree exposure of a derived pattern is stated in the terms a consumer is warned in
- [ ] What this leaves of T37 is written down, since T37 stays resolved and is superseded rather than
      reopened
