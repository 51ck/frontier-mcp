---
id: T96
title: edit_map notes containing `##` headings become orphan sections and pile up
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: edit_map refuses a `##` line or a GENERATED marker in destination, notes, add_fog or rule_out with `SectionBreakInValue`, using the reader's own section-break regex, and writes nothing; `###` round-trips with one copy
---

Observed 2026-11-11 in staya-dog-meta (Effort `front-about-page`). Reproduced on 2026-11-12 in a throwaway workspace with `edit_map`.

## Repro

1. `edit_map` with `create: true` on a new Effort (Destination only).
2. `edit_map` with `notes: "## Sub A\n\n- one\n\n## Sub B\n\n- two"`. The result prints `notes: (none)`.
3. `edit_map` with `notes: "## Sub A\n\n- one (second write)"`. The result prints `notes: (none)` again.

map.md after step 3:

```
## Notes

## Sub A

- one (second write)

## Sub A

- one

## Sub B

- two

## Decisions so far
```

## What goes wrong

- The writer puts the value verbatim under `## Notes`. The reader then treats every `##` inside it as a new top-level section, so Notes reads back as empty.
- A `notes` replace only swaps the (empty) Notes body. The earlier `## Sub` blocks stay as orphan sections, so every write adds another copy.
- The caller gets no warning. `notes: (none)` in the result looks like success.

## Expected

One of:

- Notes content round-trips, with nested headings demoted on write (`##` → `###`).
- Or the call is refused, with a message that Notes cannot contain level-2 headings.

Either way, a replace must leave exactly one copy of the notes.

## Acceptance criteria

- [x] Writing notes with `##` headings either round-trips (read returns them) or is refused with a clear message
- [x] Repeated `notes` writes never duplicate or orphan content in map.md
- [x] A regression test covers the repro above

## Answer

Refused rather than demoted, because the server never rewrites content an agent wrote. The check runs the reader's own `NEXT_HEADING` regex on each value as it would be stored, so the two cannot drift; fenced code is refused too because the reader splits there. It runs before `mkdir`, so a refused create leaves no Effort. Review added the GENERATED-marker refusal: the same truncation through a second regex. Maps already damaged on disk are not repaired. Left for a follow-up: a multi-line `add_fog`/`rule_out` value breaks the bullet list, which predates this.
