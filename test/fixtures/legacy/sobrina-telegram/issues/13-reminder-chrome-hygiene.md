# T42 — Reminder chrome hygiene

Status: resolved

**Problem:** Prefer edit-in-place for Reminder updates; never proactively delete user messages.

**Done when:** After button Check-in (and similar), adapter can edit Reminder message chrome instead of spamming new keyboards when message id known; no code path deletes arbitrary user messages.

**Depends on:** T33.4 ([04-outbound-send-path.md](04-outbound-send-path.md)), T35.3 ([06-reminder-delivery.md](06-reminder-delivery.md)), T36 ([07-button-check-in-core-verbs.md](07-button-check-in-core-verbs.md))

**Spec / arch links:** [spec/telegram-ux.md](../../../spec/telegram-ux.md) (Hygiene)

**Out of scope:** Moderating / deleting member content; aggressive keyboard wipe of unrelated messages

**Tasks:**

- [x] **T42.1** On successful button Check-in: edit Reminder reply markup or caption chrome when message id stored
- [x] **T42.2** Audit: no `deleteMessage` on user messages in adapter paths
- [x] **T42.3** Fallback if edit fails: send short ack instead of deleting anything

**Implementation note:** `packages/telegram/src/reminderchrome.ts` (`tidyReminderChrome`), wired into `turn.ts`'s button Check-in branch — runs whenever `handleButtonCheckIn` reports `ok: true` (open-Day or late-fixed, not a rejection), looking up the chat's stored Reminder messageId in the shared registry and calling T34.4's `clearInlineKeyboard`. No messageId on record → no-op (nothing to tidy). Edit failure → one short "Отмечено." ack, never a delete or retry. **T42.2 audit**: `grep -rn "deleteMessage" packages/telegram/src/*.ts` (excluding tests) returns zero matches — confirmed clean.
