# T36 — Button Check-in → core verbs

Status: resolved

**Problem:** Button tap must join Checklist if needed and record Check-in via durable verbs — adapter does not invent status.

**Done when:** Callback for Красавчик / Оступился (or mapped option) calls core join+record / recordCheckIn with correct Day (via Day resolution or open Day from Reminder context); answers callback; updates chrome if needed. Tests with temp DB / mocked core.

**Depends on:** T34 ([05-askwithoptions-inline-keyboard.md](05-askwithoptions-inline-keyboard.md)), T35 ([06-reminder-delivery.md](06-reminder-delivery.md)), core T14, T12, T19 as needed ([../core/issues/05-record-check-in-verb.md](../../core/issues/05-record-check-in-verb.md), [../core/issues/03-checklist-membership-verbs.md](../../core/issues/03-checklist-membership-verbs.md), [../core/issues/10-day-resolution-helper.md](../../core/issues/10-day-resolution-helper.md))

**Spec / arch links:** [spec/checklist.md](../../../spec/checklist.md) (button = join + record), [spec/daily-rhythm.md](../../../spec/daily-rhythm.md), [spec/stats.md](../../../spec/stats.md)

**Out of scope:** Bypass Grace Token; writing closed Days via core T14 (use T17 path when late)

**Tasks:**

- [x] **T36.1** Map default buttons → sober / slip intent
- [x] **T36.2** Call core join+record (or composition) with bridged ids + Day key from Reminder/Session context
- [x] **T36.3** Closed Day / late-fix period (until next Reminder): call core T17 **`correctCheckIn` only** — never T14 write on a closed Day
- [x] **T36.4** Ack callback; optional confirm edit on Reminder message
- [x] **T36.5** Tests: new member joins+records; existing member records; core rejection surfaced without crash

**Implementation note:** `packages/telegram/src/buttoncheckin.ts` (`optionIdToCheckInIntent`, `handleButtonCheckIn`) + `turn.ts` (`createTurnHandler`) wires it into the `onTurn` hook T32 built for exactly this. Day key = `computeDayKey` at tap-time (not full `resolveDay` — a button tap is always "now", no conversational ambiguity to resolve). `joinAndRecordCheckIn` (T14/T12) attempted first; on `DayClosedError` the **only** fallback is `correctCheckIn` (T17) — never a second `recordCheckIn` attempt, satisfying T36.3 exactly. Callback ack landed already in T34's `inbound.ts` wiring; confirm-edit-on-Reminder-message is left for T42 hygiene (optional per this ticket).
