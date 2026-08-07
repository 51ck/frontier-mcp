# T34 — askWithOptions → inline keyboard

Status: resolved

**Problem:** Core `askWithOptions` must render as Telegram buttons; adapter enforces caption max from core.

**Done when:** Options become inline keyboard; over-long labels are **rejected/blocked** per core max (T22.1) — **do not silently truncate** product labels; optional skip/reject mapped if present; callback payload round-trips to Session without inventing ledger outcomes. Reminder defaults available from core constants.

**Depends on:** T32 ([03-inbound-event-session-hub.md](03-inbound-event-session-hub.md)), T33 ([04-outbound-send-path.md](04-outbound-send-path.md)), core T22 ([../core/issues/13-askwithoptions-core.md](../../core/issues/13-askwithoptions-core.md))

**Spec / arch links:** [CONTEXT.md](../../../CONTEXT.md) (askWithOptions), [spec/telegram-ux.md](../../../spec/telegram-ux.md), [architecture.md](../../../tech/architecture.md) (tool rule)

**Out of scope:** Core validation rewrite; essays on buttons; forcing buttons-only Check-in; silent truncation of labels

**Tasks:**

- [x] **T34.1** Map `askWithOptions` → Grammy inline keyboard builder
- [x] **T34.2** Before send: **reject/block** any label over core caption max (defense in depth; no silent truncate)
- [x] **T34.3** Callback data encoding/decoding → option id / reject / skip → Session event
- [x] **T34.4** Expire/replace keyboard after answer when practical (edit or disable); document behavior
- [x] **T34.5** Tests: over-long label blocked; default labels Красавчик / Оступился render

**Implementation note:** `packages/telegram/src/askwithoptions.ts` (`toInlineKeyboard`, `decodeAskWithOptionsCallback`, `clearInlineKeyboard`). Callback data namespaced `askopt:<id>` / `askopt:__skip__` / `askopt:__reject__`, with its own 64-**byte** defense check distinct from the 64-**char** label check. `inbound.ts`'s `callback_query` handler now acks the tap (`answerCallbackQuery`, best-effort) and decodes the payload onto `NormalizedInboundEvent.askWithOptions` — still just logged by the turn stub, no ledger call (that's T36).

**Known gap, called out explicitly:** `toInlineKeyboard`/`clearInlineKeyboard` have no production caller yet — nothing in this repo phase actually *asks* an `askWithOptions` question (Reminder delivery T35 and button Check-in T36 aren't built), so there's no send-path call site to wire them into today. The inbound half (decode) is live; the outbound half (render) is built, unit-tested, and ready for T35 to call. Not an oversight — there's genuinely nothing to wire it to yet.
