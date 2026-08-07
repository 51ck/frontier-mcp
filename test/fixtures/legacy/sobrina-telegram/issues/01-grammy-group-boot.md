# T30 — Grammy group boot

Status: resolved

**Problem:** Without a running group bot entry, no Telegram MVP path is real.

**Done when:** `@sobri/telegram` starts with `TELEGRAM_BOT_TOKEN`, connects via Grammy, and can receive an update from a group (log or echo stub). Privacy Mode off called out in install notes (README or package note). No ledger writes yet.

**Depends on:** foundation T4 (env), T6 (boot patterns) ([../foundation/issues/04-env-naming-and-config-load.md](../../foundation/issues/04-env-naming-and-config-load.md), [../foundation/issues/06-runnable-process-boot.md](../../foundation/issues/06-runnable-process-boot.md)); package `@sobri/telegram` from foundation T1

**Spec / arch links:** [spec/telegram-ux.md](../../../spec/telegram-ux.md) (Install), [architecture.md](../../../tech/architecture.md) (`@sobri/telegram`)

**Out of scope:** DM-primary UX; webhook vs polling final ops choice beyond a working local default; character prompt

**Tasks:**

- [x] **T30.1** Grammy bot factory reading `TELEGRAM_BOT_TOKEN`; fail fast if missing
- [x] **T30.2** Process entry / root script (e.g. `bun run bot`) starts the bot
- [x] **T30.3** Receive group message update → structured log (chat id, user id, text) — no core yet
- [x] **T30.4** Install note: Privacy Mode off; bot needs post/edit in group ([spec/telegram-ux.md](../../../spec/telegram-ux.md))

**Implementation note:** `packages/telegram/src/config.ts` (`loadTelegramConfig`), `bot.ts` (`createBot`), `main.ts` (`bun run bot` entry), `inbound.ts` (group-message log stub, superseded by T32's Session wiring). README documents the Privacy Mode off / post+edit permission requirement.
