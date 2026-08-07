# T41 — Scheduler loop in telegram process

Status: resolved

**Problem:** Core due-checks need a process tick so the adapter can deliver Reminder / Day Summary I/O.

**Done when:** Bot process periodically calls **core tick** (core owns due-check + T16 + Session wake); telegram **only consumes returned intents** → T35 (Reminder) / T40 (Summary) I/O; **no second Deadline/Reminder rule engine** in the adapter; fake-clock or integration smoke documented. No Telegram I/O inside `@sobri/core`.

**Depends on:** T35 ([06-reminder-delivery.md](06-reminder-delivery.md)), T36 ([07-button-check-in-core-verbs.md](07-button-check-in-core-verbs.md)), T40 ([11-day-summary-delivery.md](11-day-summary-delivery.md)), core T21 ([../core/issues/12-scheduler-reminder-deadline-wakes.md](../../core/issues/12-scheduler-reminder-deadline-wakes.md))

**Spec / arch links:** [architecture.md](../../../tech/architecture.md) (Scheduler), [spec/daily-rhythm.md](../../../spec/daily-rhythm.md)

**Out of scope:** External cron service; multi-instance leader election; re-implementing due-check / T16 / Session wake in the adapter

**Tasks:**

- [x] **T41.1** Interval/timer in telegram (or shared runtime) calling core tick only
- [x] **T41.2** Consume returned Reminder intents → T35 I/O (no adapter due-check)
- [x] **T41.3** Consume returned Deadline intents → T40 Summary I/O (core T16 + Session wake already done inside core tick)
- [x] **T41.4** Dedup / "already fired" guard so a tick does not double-post (document strategy; prefer core-owned if possible)
- [x] **T41.5** Smoke with injected `now` or short test schedule

**Implementation note:** `packages/telegram/src/scheduler.ts` (`runSchedulerTick`, `startSchedulerLoop`, `DEFAULT_SCHEDULER_INTERVAL_MS` = 30s). `runSchedulerTick` calls core `tick` only, then branches each returned intent to `postReminder` (T35) or `postDaySummary` (T40) — no due-check logic of its own. **T41.4 dedup**: in-memory `Set<"${chatId}:${kind}:${dayKey}">` of already-posted intents, since core's due-check is an exact `HH:MM` match and polling twice inside the same minute would otherwise double-post; never cleared (acceptable for a Phase 1 process lifetime). `main.ts` now creates one `ReminderMessageRegistry` shared between the scheduler loop and the turn handler (T42 needs the same instance to find a Reminder's messageId later) and starts the loop alongside `bot.start()`.
