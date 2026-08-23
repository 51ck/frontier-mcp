---
id: T79
title: Foreign above the Ticket — an Effort, and a whole tracker
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: [T57]
---

## Question

[[T57]] settled **Foreign** as a conformance predicate rather than a provenance one: a Ticket file is Foreign when it does not conform to the schema — no fence, a broken fence, or a fence that is not ours — and provenance is unknowable, so we do not care whether a file came from a hand, another tracker, or an older version of this server.

That decision named a scaling the build deliberately did not reach. Foreign is an adjective that applies at three levels, and only the first exists in code.

A **Foreign Effort**: a directory under `.scratch/` with no header doc, or with a layout that is not `issues/` holding one file per Ticket. `list_efforts` reports `headerDocs` and would report an empty list; nothing else notices, and `ticketCount` silently counts whatever the scan happened to find.

A **Foreign tracker**: a repo whose issues do not live under `.scratch/` at all — `docs/issues/`, `.github/`, a `TODO.md`, an exported Jira dump. Workspace resolution recognizes a root by its markers ([[T10]]), and `.scratch` is one of them, so such a repo resolves to a workspace with no Efforts in it and the server has nothing to say.

The adoption question this Effort exists for runs straight through it: a consumer arriving with an existing tracker meets the product at exactly this boundary. [[T57]] identified two consumer paths — recreate the tree through the tools, or read what is there as Foreign — and gave no test for choosing between them. `legacy.ts`'s parser cannot supply one: it defaults rather than guesses (no `Status:` line gives `open`, no `Type:` line gives `build`), so it always succeeds and never reports insufficient similarity.

What does the server do when the shape above the Ticket does not conform — detect and report, refuse, or offer to convert? What is the test that tells a consumer which of the two adoption paths they are on? And does any of this write, given [[T57]] settled that Ticket-level Foreign detection writes nothing?

Related: [[T60]] decides who owns the tracker vocabulary, which bears on what a Foreign Effort is even measured against.

## Acceptance criteria

- [ ] Whether a Foreign Effort is detected, and what the server does about it, is decided
- [ ] Whether a Foreign tracker — a repo whose issues are not under `.scratch/` — is in scope for the product at all is decided
- [ ] The test that tells a consumer which adoption path they are on is stated, or its absence is accepted with a reason
- [ ] Whether detection at these levels writes anything is stated, consistent with [[T57]]'s Ticket-level rule
- [ ] The vocabulary is recorded so [[T78]]'s glossary entry for **Foreign** covers all three levels or explicitly scopes itself to one
