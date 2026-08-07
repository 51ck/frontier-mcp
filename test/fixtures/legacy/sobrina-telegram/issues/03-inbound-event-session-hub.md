# T32 — Inbound event → Session hub

Status: resolved

**Problem:** Group messages and callbacks must wake the one Session per chat and serialize turns.

**Depends on:** T31 ([02-identity-bridge.md](02-identity-bridge.md)), core T20 ([../core/issues/11-session-hub.md](../../core/issues/11-session-hub.md))

**Done when:** Inbound group text/callback enters `getOrStart(chatId)` under per-chat mutex; activity resets idle; adapter does not bypass Session for agent turns. Stub handler may no-op reply until later themes.

**Spec / arch links:** [spec/session.md](../../../spec/session.md), [ADR 0004](../../../docs/adr/0004-agentic-session-vs-day.md), [architecture.md](../../../tech/architecture.md) (Session hub)

**Out of scope:** Full Mastra dialogue; Profile/Diary; coalesce tuning beyond calling core hook if exposed

**Tasks:**

- [x] **T32.1** Wire group `message` → Session `getOrStart` + turn queue
- [x] **T32.2** Wire `callback_query` → same Session path (distinct event kind)
- [x] **T32.3** Drop/ignore non-group chats for Phase 1 (or reply once "group only") — document choice
- [x] **T32.4** Tests or smoke: two rapid messages same chat serialize; two chats independent

**Implementation note:** `packages/telegram/src/inbound.ts`. Both event kinds normalize to one `NormalizedInboundEvent` shape and go through `handleInboundEvent` → `ensureChat` → `sessionHub.getOrStart` + `runTurn`; turn body is an injectable stub (`onTurn`, defaults to a structured log) that later themes (button Check-in T36, free-text handoff T37) will replace. Chose **drop silently** for non-group chats — no reply-once bookkeeping for no Phase 1 benefit. `main.ts` now opens the shared core store on boot since the identity bridge needs it.
