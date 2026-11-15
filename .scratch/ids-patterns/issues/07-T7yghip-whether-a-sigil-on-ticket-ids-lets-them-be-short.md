---
id: T7yghip
title: Whether a sigil on Ticket ids lets them be short and readable
kind: decision
type: research
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: "No sigil, stored or written-only: the literal-first rule already is the marker, and a leading letter is the only one that survives YAML, filenames, git and shells. The complaint is about the random tail, and the outside-view study moved the question past it — to names that equal the path."
---

## Question

The default id `T<b36{6}>` produces ids like `Tik4z0t` and `T6xju35`. The owner's report after a
session of filing and triaging about twenty of them: they look like junk. They cannot be said
aloud, do not sort, carry no hint of order or Effort, and two of them are hard to tell apart at a
glance.

The random default exists for one reason: two trees minting without coordination must not collide
([[T35]], ADR 0006). Everything readable — a counter, an Effort slug — was traded away for that, and
[[T52]] then required every pattern to begin with a literal so that a typo'd temporary key never
looks like an id ([[T55]]).

The idea to research: **a sigil for Tickets** — a reserved marker that says *this string is a Ticket
id*, the way `#12`, `!34`, `T123` or `PROJ-12` do elsewhere. If the marker carries the job of
recognition, the rest of the id may be free to be short and readable, and `<effort>` (GitHub issue
#53) may stop costing the typo check.

This is not the question [[T36]] and [[T55]] closed. Those were about a sigil on *temporary keys*.
This one is about the id itself.

## What the research has to establish

- What other trackers and tools use as a Ticket marker, what the marker buys them, and where it
  bites (autolinking, quoting, shells).
- Which marker characters survive every place a FrontierMCP id is written: YAML frontmatter flow
  sequences, filenames on macOS, Linux and Windows, markdown prose, git commit subjects and bodies,
  GitHub and GitLab rendering, a shell argument, a JSON tool argument.
- Whether a sigil is part of the stored id or only of how an id is written in prose and rendered on
  a Board, and what each choice costs existing `T<n>` and `T<b36{6}>` ids.
- What actually makes an id readable while staying merge-safe: short random with collision-driven
  growth, counter plus short random suffix, per-Effort counter, word-based ids. A sigil alone does
  not shorten anything.
- What an id costs an agent in tokens under each shape, measured rather than guessed.
- Whether today's leading `T` already is the sigil, and the complaint is only about the random tail.

## Acceptance criteria

- [x] Prior art is cited from primary sources, with what each marker is and what it is for
- [ ] Every candidate marker is checked against each place an id is written, and each failure is shown
- [x] Stored-in-the-id versus written-only is compared, with the migration cost of each
- [x] At least three readable-and-merge-safe id shapes are compared, with collision arithmetic
- [x] Token cost per id shape is measured
- [x] A recommendation is given, and what it deliberately leaves out

## Source

Owner feedback, 2026-11-15, alongside GitHub issue #53. Findings go to `docs/research/` as a dated
snapshot.

## Answer

Findings: `docs/research/2026-11-15-ticket-id-sigil.md`.

- **No sigil mechanism.** Every legal id already starts with a literal letter or `_`. Of the candidates tested, `!12` and `&12` silently read as an empty string and null in YAML, and a `#12` at the start of a commit subject is deleted by the next `--amend`.
- **A sigil shortens nothing.** What makes an id readable is its tail. The research ranked `T<N>-<b36{3}>` (already legal) and a shorter random default `T<b36{4}>`.
- **Collision exposure follows unmerged mints, not workspace size.** It goes with the square of Tickets minted between merges.
- **It does not rescue `<effort>`.** For [[Tptzdka]] the `.n` tail can anchor the predicate instead.

The second criterion stays unticked: no Windows filename, Windows PowerShell or `cmd.exe` test ran, and the GitHub and GitLab autolink behaviour is from their docs, not from a rendered page.

After this research landed, five clean-room proposals independently rejected minted ids altogether in favour of `<effort>.<name>` with the name equal to the file path. That direction is carried by [[Tptzdka]], so neither id-shape recommendation above is being built.
