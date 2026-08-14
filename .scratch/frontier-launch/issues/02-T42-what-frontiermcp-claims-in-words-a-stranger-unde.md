---
id: T42
title: What FrontierMCP claims, in words a stranger understands
kind: decision
type: prototype
status: open
triage: ready-for-human
blocked_by: []
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
