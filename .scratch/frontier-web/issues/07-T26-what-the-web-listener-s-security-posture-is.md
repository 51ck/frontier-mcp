---
id: T26
title: What the web listener's security posture is
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: [T22]
---

## Question

Surfaced by T21. Whatever T22 chooses, the process ends up listening on a socket while holding read
access to the user's repository. That is a security surface this repo has never had — a stdio server
reachable only by its parent process has no attack surface at all.

T21 established the posture to copy: the official MCP Inspector binds loopback-only, mints a session
token at start-up and injects it into the page, keeps an `Origin` allow-list against DNS rebinding,
and refuses to bind `0.0.0.0` outside containers. What is left to decide is the detail.

- How the token is minted, delivered to the browser, and rotated — launch URL, or something better.
- Port selection: fixed, ephemeral, or configurable. Fixed ports are guessable by a malicious page;
  ephemeral ports complicate the launch command decided in T24.
- The `Origin` allow-list contents, and the behaviour when a request carries no `Origin` at all.
- What happens when two workspaces are open at once — two listeners, or one serving both, which
  collides with the single-workspace scoping in the Destination.

One finding from T21 that must not be lost: the official SDK's own browser-client CORS example ships
`origin: '*'`, which contradicts the specification's MUST on `Origin` validation. Harmless in an
example, a genuine vulnerability on a loopback server reading somebody's repository. Do not copy it,
and do not let a later reader copy it either.

Invoke `/grilling`. HITL.

## Acceptance criteria

- [ ] Token minting, delivery and lifetime decided and written down
- [ ] Port selection decided, consistent with the launch command from T24
- [ ] `Origin` validation specified, including the missing-`Origin` case, and the bind address fixed
      to loopback with the exception behaviour stated
- [ ] The two-workspace case has an answer
- [ ] The `origin: '*'` trap is recorded where an implementer will meet it, not only here
