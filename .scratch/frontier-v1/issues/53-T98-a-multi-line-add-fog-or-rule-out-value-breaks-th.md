---
id: T98
title: A multi-line add_fog or rule_out value breaks the Map's bullet list
kind: build
status: open
triage: needs-triage
blocked_by: []
---

Found by the T96 review on 2026-11-12. Predates T96 and is outside its section-break scope.

## Repro

`edit_map` with `add_fog: "a\nb\n- c"` reads back as `["a", "c"]`. The line `b` drops out of the readback, `- c` becomes a fog patch of its own, and no `graduate_fog` value removes the original, because `removeBullet` in `src/storage/markdown/header-doc.ts` matches one line at a time. `rule_out` takes the same path.

## Expected

Either a newline in `add_fog` / `rule_out` is refused with a typed failure beside `SectionBreakInValue`, or a multi-line bullet round-trips and can be graduated. Refusal is the smaller change and matches T96.

Also from that review, minor: `SectionBreakInValue` names the section (`Not yet specified`) rather than the argument the caller passed (`add_fog`).

## Acceptance criteria

- [ ] A multi-line `add_fog` or `rule_out` value is refused, or round-trips and can be removed by `graduate_fog`
- [ ] Nothing is written when refused
- [ ] A regression test covers the repro above
