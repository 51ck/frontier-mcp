#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createFrontierMCP } from './server.ts';

const frontier = createFrontierMCP();

// The index is built by a full scan before the transport connects, so the first
// call is served warm. A workspace that cannot be scanned yet is not fatal:
// every call resolves its own workspace regardless.
await frontier.warmUp().catch(() => {});

await frontier.server.connect(new StdioServerTransport());

// A stdio server has no independent lifecycle: it lives exactly as long as the
// client that spawned it. Without this, none of that is true. The v2
// `StdioServerTransport` attaches its `data` and `error` listeners on stdin —
// and a separate `error` listener on stdout — from `start()` (see
// `stdio.mjs`), and never listens for stdin `end` or `close`, so plain EOF
// never reaches the transport at all. And even if it did, the markdown
// driver's recursive `fs.watch` handles are live libuv handles that hold the
// event loop open on their own — a workspace that was ever scanned would keep
// the process alive regardless of what stdin does. So the binary has to
// notice disconnect itself, on every route a client can take away, and shut
// the driver down explicitly on the way out.
//
// "Client disconnected" arrives several ways, often more than one at once on
// an ordinary exit — the transport's own close callback, stdin reaching EOF,
// or a terminating signal — so shutdown is guarded to run exactly once no
// matter how many of them fire.
let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;

  // frontier.close() -> registry.closeAll() -> every driver's close(), which
  // for the markdown driver releases the timers and the storage/root watch
  // handles from watcher.ts. That is the whole point of running this at all:
  // an orphaned watcher is a live handle nothing else will ever clear.
  // Never let a rejection here (or anywhere close() reaches) block exit — a
  // client that is already gone cannot be reported an error, so shutdown must
  // be unconditional.
  frontier
    .close()
    .catch(() => {})
    .finally(() => {
      // Exit explicitly rather than trust the loop to drain on its own: that
      // is what bounds the window between "client gone" and "process gone"
      // to this call, instead of to whatever else happens to still be
      // scheduled. Always 0, deliberately, even on a signal — this is a
      // supervised server process reporting a clean shutdown it completed
      // itself, not a shell command whose caller inspects `128 + signal`.
      process.exit(0);
    });
}

// Protocol's own close hook, unaffected by `connect()` running above:
// `connect()` installs a wrapper on the *transport's* `onclose` that itself
// calls `_onclose()` — it never touches the `Server`'s own public `onclose`
// set here — so this assignment would be just as valid before `connect()`.
// oxlint's `unicorn/prefer-add-event-listener` flags this as a plain
// `on<event>` assignment, the pattern it exists to steer away from on a DOM
// `EventTarget`. It is a false positive here: `Server` (via `Protocol`) is
// not a DOM `EventTarget`, has no `addEventListener` to prefer, and this
// `onclose` field is the SDK's own, only, documented extension point for
// this hook.
// oxlint-disable-next-line unicorn/prefer-add-event-listener
frontier.server.server.onclose = shutdown;

// Belt over that hook: stdin EOF is the case the SDK transport does not
// observe (see the comment above), so the binary listens for it directly.
// `close` covers a stream destroyed instead of gracefully ended.
process.stdin.on('end', shutdown);
process.stdin.on('close', shutdown);

// A process manager or an interactive shell disconnecting a client sends a
// signal rather than closing stdin cleanly.
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
