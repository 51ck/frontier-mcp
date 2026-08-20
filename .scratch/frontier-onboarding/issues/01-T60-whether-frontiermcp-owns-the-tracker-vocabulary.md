---
id: T60
title: Whether FrontierMCP owns the tracker vocabulary or defers to the consumer's CONTEXT.md
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: []
---

## Question

The shipped tracker document opens by pointing at the consumer's own glossary (`docs/agents/issue-tracker.md:3-4`):

> Vocabulary is defined in the project's `CONTEXT.md` when present — Effort, Board, Header doc, Map, Spec, Ticket, Edge, Frontier.

So today the words are the consumer's to define, and the product names eight of them without saying what any means. That arrangement has a real virtue: nothing the product reworded can break someone else's repo.

It also has a cost that is easy to miss. A ubiquitous language nobody wrote down is not shared — it is eight headwords and an assumption. A consumer's agent meeting `Effort` for the first time has a term and no definition, and the file it is told to consult may not exist. `when present` is doing a great deal of work in that sentence.

The alternative is that the definitions ship with the package: the product serves them, a consumer persists them, and every rewording becomes a consumer-visible change versioned with the release. That inverts the current arrangement, and it should be chosen rather than drifted into — which is what would happen if an onboarding tool simply started handing out this repo's `CONTEXT.md`.

Two facts sharpen the question.

**This repo's `CONTEXT.md` is not shipped.** `package.json:13-16` publishes `dist` and `docs/agents/issue-tracker.md` and nothing else. Whatever is served has to be authored for consumers or deliberately promoted from an internal file that currently answers to nobody outside this repo — `AGENTS.md:15` makes it binding on this codebase's code and `:265` binds `src/domain.ts` naming to it, including its `_Avoid_` lines.

**The list is already out of date.** [[T50]] adds **Handle** and **Temporary key** to this repo's glossary, and both are consumer-facing: Handle is how a caller names an id-less Legacy Ticket in a tool call, and Temporary key is the name a caller gives a Ticket in a `create_tickets` batch. Neither appears in the eight. So the list grows whichever way this Ticket goes, and something has to own the growing.

## Acceptance criteria

- [ ] Whether the product ships definitions or only names terms is decided
- [ ] If it ships them, the relationship between the served vocabulary and this repo's `CONTEXT.md` is stated — same document, derived, or separately authored
- [ ] Whether a reworded definition is a breaking change under the pre-1.0 notice is answered
- [ ] The term list is settled, including **Handle** and **Temporary key**
