# T35 — Reminder delivery

Status: resolved

**Problem:** When core scheduler wakes Reminder, the group must see Reminder text + Check-in buttons.

**Done when:** On Reminder intent, adapter **posts the core Reminder Session turn result** (`runTurn` / `kind: reminder` from agent **T56**) — text + askWithOptions (defaults Красавчик / Оступился unless turn supplies special chrome); no ledger writes in the post itself. Until T56: **minimal stub** post only. Free text still accepted afterward (T37).

**Depends on:** T34 ([05-askwithoptions-inline-keyboard.md](05-askwithoptions-inline-keyboard.md)), core T21.4 ([../core/issues/12-scheduler-reminder-deadline-wakes.md](../../core/issues/12-scheduler-reminder-deadline-wakes.md)); agent **T56** for product Reminder copy (stub OK before T56) ([../agent/issues/07-reminder-voice-askwithoptions-defaults.md](../../agent/issues/07-reminder-voice-askwithoptions-defaults.md))

**Spec / arch links:** [spec/daily-rhythm.md](../../../spec/daily-rhythm.md) (Reminder), [spec/telegram-ux.md](../../../spec/telegram-ux.md), [agent spec.md](../../agent/spec.md) (T56)

**Out of scope:** Mid-evening nudge beat; **authoring product Reminder copy in the adapter after T56** (core turn owns it); Mastra/generate in telegram

**Tasks:**

- [x] **T35.1** Handler: Reminder wake → post core `runTurn` Reminder result (text + options); until T56 use minimal stub — **do not author product Reminder after T56**
- [x] **T35.2** Send Reminder message + keyboard to mapped Telegram chat (from turn/stub result)
- [x] **T35.3** Store message id for optional edit-in-place (T42)
- [x] **T35.4** Smoke: Reminder intent → posted message has two default buttons (from turn result or stub)

**Implementation note:** `packages/telegram/src/reminder.ts` (`postReminder`, `createReminderMessageRegistry`). `identity.ts` gained `fromChatId` (inverse of `toChatId`) since a scheduler `WakeIntent` only carries the core `chatId`, not the Telegram numeric id. Stub text only — `REMINDER_STUB_TEXT` is explicitly marked for replacement, never extended with product copy. `postReminder` has **no production caller yet**: the scheduler loop that would call `core tick` and hand it Reminder intents is T41, not built this batch (its own ticket hard-depends on T40, which landed alongside T35 in this same batch) — same "built, tested, ready, nothing to wire it to yet" situation T34's `toInlineKeyboard` was in last batch.

**Superseded by agent T56** ([../agent/issues/07-reminder-voice-askwithoptions-defaults.md](../../agent/issues/07-reminder-voice-askwithoptions-defaults.md)): the stub is gone. `postReminder` now takes the core turn result (`runTurn` with `kind: "reminder"`) and posts its text + options; when no agent turn runs (no `MODEL_ID`), it posts core's `reminderFallbackTurn()`. The adapter authors no Reminder copy and picks no labels. It has a production caller now too — T41's scheduler loop, via its optional `runReminderTurn` dep, wired in `main.ts`.
