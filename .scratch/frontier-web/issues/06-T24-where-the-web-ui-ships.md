---
id: T24
title: Where the web UI ships
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: [T22]
---

## Question

Same npm package as `frontier-mcp`, or a separate one? How is it launched?

Touches the settled release path: publishing is CI-only through Trusted Publishing (T15, T16), the
install is a pinned user-scope `npx` registration (`README.md:13-14`), and pins are manual on
purpose. Browser assets imply a build step in a repo whose current build is plain TypeScript.

Also: what command does the user actually run to open the board, and does the server grow a mode
flag or a second binary alongside `src/bin.ts`?

Invoke `/grilling`. HITL.

## Acceptance criteria

- [ ] Package layout decided — one package or two — with the effect on the CI publish workflow stated
- [ ] The launch command a human types is written down
- [ ] Whether a browser-asset build step enters the pipeline, and what it does to `pnpm` scripts
- [ ] Confirmed the pinned user-scope install story still holds, or stated how it changes
