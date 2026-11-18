# Name fidelity under three Ticket naming schemes

Date: 2026-11-15. Answers part of Ticket `Tptzdka`: before replacing minted ids with names an agent
chooses, find out whether a model reproduces a meaningful name less faithfully than an opaque one.

This is a dated snapshot. Re-run before citing it against a newer model.

## Question

Five clean-room design proposals all named a unit of work `<effort>.<name>` with the name equal to
the file path. Four wanted a meaningful slug chosen by the creator (`token-cache`); one wanted a
random word drawn by the tool (`walnut`), arguing that a model re-derives a meaningful name from its
meaning (`cache-tokens`) where it would copy an arbitrary one. Nobody had measured it.

## Method

One prompt per run, no tools, no project context (`claude -p` from an empty directory with an
explicit system prompt, no settings and no MCP servers).

- A Board of 14 Tickets on one subject, deliberately crowded: four `token-*` names, two `session-*`,
  two `mfa-*`. Order shuffled per run.
- Working notes that refer to the Tickets only by description, never by name. Three paragraphs
  (`near`, about 2,300 input tokens in all) or 220 paragraphs (`far`, about 25,000).
- A task: file ten new Tickets and give each one's `blocked_by`. Dependencies are described in
  paraphrase that shares no wording with the names. 22 references per run.
- Three more dependencies per run describe work that has no Ticket.

Schemes: `b36` (`T` plus six random base-36 characters, redrawn per run), `slug` (one to three
meaningful words), `word` (one random word from a list of 32, redrawn per run).

Scoring per reference: correct; invalid (matches no Ticket, so a write would refuse it); valid but
wrong (names another Ticket, so it would be stored silently); missing.

Models: `haiku` and `sonnet` as the CLI resolved them on the day, five runs per cell.

## Results

With an instruction to write `MISSING` where no Ticket exists — 60 runs, 1,320 references:

| | correct | invalid | valid but wrong | missing | absent flagged |
| --- | --- | --- | --- | --- | --- |
| every scheme, both models, near and far | 110/110 per cell | 0 | 0 | 0 | 15/15 per cell |

Without that instruction, `near` only — 30 runs, 660 references:

| model | scheme | correct | invalid | valid but wrong | invented names |
| --- | --- | --- | --- | --- | --- |
| haiku | b36 | 88/110 | 22 | 0 | 0 |
| haiku | slug | 110/110 | 0 | 0 | 0 |
| haiku | word | 110/110 | 0 | 0 | 0 |
| sonnet | all three | 110/110 each | 0 | 0 | 0 |

The 22 invalid references are one whole run: given opaque ids, `haiku` answered with the Tickets'
titles instead of their names. It happened once in five runs and in no other cell.

## What this supports

- With the Board in context, no scheme produced a single wrong or re-derived name. The feared
  failure of meaningful slugs did not appear, on the smaller model or 25,000 tokens away from the
  Board.
- No model invented a plausible name for work that had no Ticket, with or without a stated way to
  say so. Without one, both models left the dependency out.
- Name fidelity therefore does not separate the schemes. The choice between a meaningful slug and a
  random word has to be made on other grounds.

## What it does not show

- Every run had the Board in the same context as the task. A session that has lost the Board to
  compaction was not simulated; there the only correct move under any scheme is to read it again.
- One subject, one author's fixture, two models from one vendor, one turn. It is not a sample of
  real sessions.
- The single `haiku` run that used titles is an anecdote, not a rate.
- Nothing here measures humans, who are the other reader of a name.

The harness was a throwaway script and is not kept in the repository.
