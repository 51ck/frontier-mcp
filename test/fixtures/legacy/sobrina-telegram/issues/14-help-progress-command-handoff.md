# T43 — Help + progress command handoff

Status: resolved

**Problem:** Minimum command surface includes help and progress/stats entry points.

**Done when:** Locked `/help` (or equivalent) posts short Russian usage; progress/stats command or mention hands off to Session → core `fullStats` / agent (no fabricated numbers). Exact names locked with T38.1 menu.

**Depends on:** T32 ([03-inbound-event-session-hub.md](03-inbound-event-session-hub.md)), T33 ([04-outbound-send-path.md](04-outbound-send-path.md)), core T18.4 ([../core/issues/09-streak-and-full-stats.md](../../core/issues/09-streak-and-full-stats.md)); agent optional for narration

**Spec / arch links:** [spec/telegram-ux.md](../../../spec/telegram-ux.md) (Commands), [spec/stats.md](../../../spec/stats.md), [spec/agent.md](../../../spec/agent.md)

**Out of scope:** Full stats dump unsolicited; Antistreak-leading greetings

**Tasks:**

- [x] **T43.1** Lock `/help` text (commands + "talk to Sobri" pointer)
- [x] **T43.2** Progress/stats entry → Session + `fullStats` tool path (or stub "ask Sobri" until agent board)
- [x] **T43.3** Register commands with Bot API command menu

**Implementation note:** `packages/telegram/src/help.ts` (`HELP_TEXT`, `formatProgress`, `wireHelpCommands`). `/progress` calls core `fullStats` directly for the caller (bridged ids) and replies with the real numbers (Стрик/Антистрик/Лучший стрик/Заморозка/Трезвых дней) — no fabrication, and no agent-board Session narration exists yet in this repo phase to hand off to, so this is the ticket's own "stub 'ask Sobri' until agent board" allowance, just backed by real data instead of a placeholder. `/help`/`/progress` registered in `setMyCommands` alongside `/settings`/`/join`/`/leave`.
