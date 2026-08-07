# T31 — Identity bridge

Status: resolved

**Problem:** Core verbs use opaque chat/member ids; Telegram supplies numeric chat/user ids.

**Done when:** Stable mapping Telegram group chat → core `chatId`, Telegram user → core `memberId`; `getOrCreateChat` on first sight; no cross-chat leakage; unit tests on mapping helpers.

**Depends on:** T30 ([01-grammy-group-boot.md](01-grammy-group-boot.md)), core T11.1 ([../core/issues/02-chat-settings-durable-verbs.md](../../core/issues/02-chat-settings-durable-verbs.md))

**Spec / arch links:** [architecture.md](../../../tech/architecture.md) (adapters map ids), [CONTEXT.md](../../../CONTEXT.md)

**Out of scope:** Multi-bot sharding; importing sushkobot ids

**Tasks:**

- [x] **T31.1** `toChatId(telegramChatId)` / `toMemberId(telegramUserId)` (document format; stable strings OK)
- [x] **T31.2** On inbound group event: ensure core chat exists via core T11
- [x] **T31.3** Tests: same Telegram ids → same core ids; different chats isolated

**Implementation note:** `packages/telegram/src/identity.ts`. Format locked as `tg:chat:<id>` / `tg:user:<id>` — separate namespaces so a chat id and a user id can never collide even though both are plain Telegram integers. `ensureChat` wraps core `getOrCreateChat`.
