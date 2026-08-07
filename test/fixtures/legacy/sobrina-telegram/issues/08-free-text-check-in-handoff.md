# T37 — Free-text Check-in handoff

Status: resolved

**Problem:** Free text always wins for Check-in intent; speech must reach Session → core verbs (agent may classify intent later).

**Done when:** Group text is delivered to Session turn (+ core T24 tools when ready); **no adapter NLU/heuristic that invents statuses**; temporary path is **handoff only** (same as T37.3); button state must not block free-text Check-in. No buttons-only product.

**Depends on:** T32 ([03-inbound-event-session-hub.md](03-inbound-event-session-hub.md)), core T14/T17/T19 ([../core/issues/05-record-check-in-verb.md](../../core/issues/05-record-check-in-verb.md), [../core/issues/08-late-fix-until-next-reminder.md](../../core/issues/08-late-fix-until-next-reminder.md), [../core/issues/10-day-resolution-helper.md](../../core/issues/10-day-resolution-helper.md)); agent tools T24 optional for intent classification ([../core/issues/15-mastra-tool-bindings.md](../../core/issues/15-mastra-tool-bindings.md))

**Spec / arch links:** [CONTEXT.md](../../../CONTEXT.md) (askWithOptions — free text wins), [spec/telegram-ux.md](../../../spec/telegram-ux.md), [spec/daily-rhythm.md](../../../spec/daily-rhythm.md)

**Out of scope:** Adapter NLU/heuristics that invent Check-in statuses; inventing ledger without verbs

**Tasks:**

- [x] **T37.1** Group text → Session turn payload (raw text + member/chat ids)
- [x] **T37.2** Wire Session turn to Mastra/core tools when available (T24) for Check-in intent
- [x] **T37.3** Temporary until agent board: explicit Session handoff only — no adapter status invention
- [x] **T37.4** Verify free text works even while Reminder keyboard still visible (product: free text wins)

**Implementation note:** Mostly already true from T32 — group text has reached the Session turn since that theme landed. This ticket's actual delta is `turn.ts`'s `createTurnHandler`: free text (and any callback that isn't a mapped button option) falls through to the same log stub, on purpose — no heuristic classification added. **T37.2 is not wireable yet**: core T24 (Mastra tool bindings) exists but there's no agent-board Session turn loop to call it from in this repo phase; `turn.ts`'s doc comment names this explicitly as the handoff point for when that lands. **T37.4**: verified structurally, not by product test — Telegram button taps are `callback_query` updates, completely independent of `message` updates, so a visible Reminder keyboard can never block a text message from reaching the turn handler; added a regression test (`turn.test.ts`) asserting free text never calls a core Check-in verb, guarding against a future accidental heuristic regression.
