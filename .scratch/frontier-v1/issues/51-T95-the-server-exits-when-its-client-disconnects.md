---
id: T95
title: The server exits when its client disconnects
kind: build
status: open
triage: ready-for-agent
blocked_by: []
---

## What to build

A frontier process spawned over stdio terminates when its client goes away, instead of living on as an orphan. Client disconnect means any of: the transport closing, stdin reaching EOF, SIGTERM, SIGINT. On the way out every driver releases the filesystem watchers it holds.

### The capture

Measured on the author's machine on 2026-09-11: 45 resident `frontier-mcp` processes, the oldest three at 12 days, others at 11, 10, 8 and 1 day. They span every spawn form in use — `npm exec`, `pnpm exec`, `pnpm dlx` — so this is not one client's bug. Each is an idle Node process, and each one that scanned a workspace still holds a recursive watch on that `.scratch` tree.

The accumulation is per session, not per day: every editor session that has ever opened a workspace with frontier configured leaves one behind, and nothing reaps them. A consumer who uses frontier daily across two or three clients collects them at that rate indefinitely.

### Why it happens

The binary connects the stdio transport and ends. Nothing observes the transport closing, and there is no signal handler. Stdin reaching EOF is therefore not enough on its own: the markdown driver's `fs.watch` handles are live libuv handles that hold the event loop open by themselves, so the process stays scheduled with nothing to serve. The two causes compound — a server with no watcher attached might still exit on its own, which is likely why this went unnoticed through the watcher work.

### Scope

The exit trigger is disconnect, decided in the ticket above. An idle timeout or a heartbeat for a client that holds stdin open while going silent is deliberately out of scope — no evidence in hand supports one, and it would need its own decision.

## Acceptance criteria

- [ ] A spawned server whose stdin reaches EOF exits within a bounded window
- [ ] A spawned server whose transport closes exits within the same window
- [ ] SIGTERM and SIGINT terminate the server
- [ ] Every driver watcher is released on shutdown, so no live handle can hold the event loop open
- [ ] A test spawns the real packaged binary as a child process, disconnects it, and asserts the pid is gone — not a unit test against a mocked transport

## Blocked by

- None (can start immediately)
