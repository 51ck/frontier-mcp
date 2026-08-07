# T40 — Day Summary delivery

Status: resolved

**Problem:** After Deadline, Summary is a normal group post — not an Antistreak scoreboard.

**Done when:** On Deadline Session wake (after core T16), adapter obtains core T23 fact bundle (+ agent prose when agent board lands); posts Summary to group; soft line when quiet flag / Checklist exists per facts; does not lead with Antistreak. Reply threading optional — lock choice here.

**Depends on:** T33 ([04-outbound-send-path.md](04-outbound-send-path.md)), core T16, T21.5, T23 ([../core/issues/07-deadline-close-day-auto-slip.md](../../core/issues/07-deadline-close-day-auto-slip.md), [../core/issues/12-scheduler-reminder-deadline-wakes.md](../../core/issues/12-scheduler-reminder-deadline-wakes.md), [../core/issues/14-day-summary-fact-bundle.md](../../core/issues/14-day-summary-fact-bundle.md)); agent narration optional stub

**Spec / arch links:** [spec/daily-rhythm.md](../../../spec/daily-rhythm.md) (Day Summary), [spec/stats.md](../../../spec/stats.md) (voice), [spec/telegram-ux.md](../../../spec/telegram-ux.md) (Hygiene)

**Out of scope:** Inventing quiet thresholds; Antistreak leaderboard posts

**Tasks:**

- [x] **T40.1** Deadline wake → load `daySummaryFacts` for `dayKey`
- [x] **T40.2** Build outbound text: use agent Summary tool/prose when available; else minimal factual Russian stub from bundle (heroes/support/soft-line) — no Antistreak list
- [x] **T40.3** Lock threading: normal post vs reply-to Reminder (document)
- [x] **T40.4** Smoke: closed Day with fixtures → one Summary message; empty Checklist → no shame parade (per core empty flag)

**Implementation note:** `packages/telegram/src/daysummary.ts` (`formatDaySummary`, `postDaySummary`). **T40.3 locked: plain post, not a reply** — spec/telegram-ux.md calls Summary "a normal post after Deadline", and there's no single reliable Reminder message to thread under (a chat can have many Check-ins/edits between Reminder and Deadline). Stub text is counts-only (`Трезвые: N` / `Оступились: M`), no member names (no Telegram profile lookup built), no Antistreak. Same documented gap as T35: `postDaySummary` has no production caller yet — that's T41 (scheduler loop), not in this batch.

**Superseded by agent T57** ([../agent/issues/08-day-summary-narration.md](../agent/issues/08-day-summary-narration.md)): `formatDaySummary` moved into core as `formatDaySummaryFallback`. `postDaySummary` now posts the Summary Session turn it is handed (`runTurn` with `kind: "deadline"`), falling back to core's factual text only when that turn failed; this module authors no Summary copy.
