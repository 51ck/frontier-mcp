---
id: T42
title: What FrontierMCP claims, in words a stranger understands
kind: decision
type: prototype
status: resolved
triage: ready-for-human
blocked_by: []
answer_gist: Hero leads with where it lives ("An issue tracker that lives in your repo"); what the agent gets is the first supporting claim; the trade-off is a Trade-offs section directly under the hero; "frontier" stays out of the hero.
---

## Question

What is the one-sentence claim, and what are the two or three supporting claims underneath it?

The current README opens with "An MCP server that serves the markdown issue tracker under `.scratch/`",
which is unreadable to anyone who has never seen a `.scratch/` — it names the mechanism before the
reason. The Notes fix the *lead*: the tracker lives in the repo, branch-local, offline, no GitHub and
no git required. This ticket turns that into actual words, and settles what sits beneath it.

Raise fidelity by drafting rather than discussing: produce three short hero variants — a one-liner plus
two or three sentences each — that take genuinely different angles, and react to them. Also produce
drafts of the two short forms that get read far more often than the README: the GitHub repository
description (currently empty) and the npm package blurb.

Settle in passing:

- Which supporting claims ship, and in what order. Token cost is supporting, not leading, and only once
  measured — do not draft copy that asserts an unmeasured number.
- How the trade-off is stated. Repository bloat and branch/worktree sync are published beside the claims,
  not buried; decide whether that is a README section, a line in the hero, or a linked document.
- Whether "FrontierMCP" and the mental model of a *frontier* survive contact with a stranger, or whether
  the vocabulary needs an explanatory beat before it can be used.

Output is decided copy, linked as an asset. It is not applied to the repository here.

## Answer

Decided by the user in grilling, 2026-11-12, from three drafted angles. This is decided copy; it is not applied to the repository here. No number appears anywhere in it: the token-cost claim waits on [[T45]].

## Hero

> **An issue tracker that lives in your repo.** Tickets are markdown files on your branch. They work offline, need no account, and merge like code. FrontierMCP serves them to your coding agent as a graph, so it asks "what can I work on?" and gets an answer instead of reading every file.

## Supporting claims, in order

1. What the agent gets: one call returns what is open, what is blocked and by what, and what is takeable right now.
2. Plain markdown: readable on GitHub and editable by hand.
3. Token cost, only once T45 has a measurement a skeptic accepts.

## How the trade-off is stated

A "Trade-offs" section directly under the hero, not a line inside it and not a linked document. Its core sentence: the tracker has no server because the tracker is your repo, and the price is that Tickets branch and merge like everything else. Repository bloat and branch/worktree sync are named there.

## Vocabulary

"FrontierMCP" stays. The word "frontier" stays out of the hero and gets one explanatory sentence where it first appears; the hero says "what can I work on?" instead.

## Short forms

- **GitHub repository description:** "MCP server for a markdown issue tracker that lives in your repo. Tells agents what is open, blocked, and takeable."
- **npm blurb:** "An in-repo markdown issue tracker, served to coding agents over MCP as a queryable graph."

## The angles not chosen as the lead

- B, "Your agent should not have to read forty files to find its next task." The stronger pitch, but it only lands once the reader knows there is a tracker. Its second sentence became supporting claim 1.
- C, "A tracker with no server, because the tracker is your repo." Its honesty became the Trade-offs section.
