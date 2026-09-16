---
id: T88
title: Verify and declare the compiled server runtime minimum separately from development
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: Packed runtime gates pass on Node 20.20.2, 22.17.1 and 24.15.0; engine range matches these LTS floors.
---

## What to build

A consumer can tell which installed Node versions run the released FrontierMCP package, independently of the Node version used to develop it. Establish Node 20+ compatibility through the actual distributable and MCP behavior before lowering the current Node 24 engine declaration. Keep Node 24 LTS as the recommendation for new installations; Node 20 is already EOL.

The 2026-09-04 runtime setup research measured successful local compiled-server smoke checks on Node 20.20.2, 22.17.1 and 24.15.0. Node 16.20.2 failed at creation on Array.toSorted. This is evidence to test, not a new support declaration.

## Acceptance criteria

- [x] A repeatable check runs the packaged JavaScript entry under each claimed Node major, covering MCP initialization, all eight tools being exposed, the shipped tracker resource, Ticket read/write lifecycle and external nested-file invalidation after watcher settling. Test the oldest minor that the engine range promises, or declare an honest minor floor.
- [x] Existing claim and id-allocation concurrency guarantees are checked under the newly claimed runtime range through the established MCP/process test boundaries.
- [x] The supported operating-system matrix is exercised or explicitly limited; macOS-only results are not presented as Windows/Linux verification.
- [x] If Node 20+ meets the gates, the package engine, consumer requirements and relevant DOX contract agree on that compiled-server minimum. If it fails, retain the supported floor and record the concrete blocker instead of claiming compatibility.
- [x] Development remains on Node 24; source TypeScript execution and development-tool requirements are distinguished from running the emitted package.
- [x] CI owns the compatibility check. Coordinate with the existing general CI Ticket T63 without making general CI work a prerequisite for this independently runnable check.

## Research

See [runtime setup research](../../../docs/research/2026-09-04-runtime-setup.md).

## Answer

Added a repeatable production tarball installation and real stdio MCP probe covering initialization, all eight tools, shipped resource, Ticket lifecycle, settled nested external edits, cross-process claims and concurrent id allocation. Actual production installation passed under Node 20.20.2, 22.17.1 and 24.15.0 on macOS arm64. Engine range is ^20.20.2 || ^22.17.1 || ^24.15.0; source development remains Node 24. CI builds once and tests the tarball on these versions across Linux, macOS and Windows; those other operating systems are configured, not locally measured. pnpm check, 248 tests, build and exact supplied-tarball CI invocation pass. Blind review PASS after narrowing the declared range.
