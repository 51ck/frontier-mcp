# T39 — Checklist join / leave commands

Status: resolved

**Problem:** Members need join/leave without requiring a Check-in; admin remove path optional via command or agent later.

**Done when:** Locked slash (or menu) commands call core `joinChecklist` / `leaveChecklist`; conversational join via Check-in remains T36/T37. Confirmations in Russian.

**Depends on:** T31 ([02-identity-bridge.md](02-identity-bridge.md)), T33 ([04-outbound-send-path.md](04-outbound-send-path.md)), core T12 ([../core/issues/03-checklist-membership-verbs.md](../../core/issues/03-checklist-membership-verbs.md)); T38.1 for command registration pattern ([09-settings-admins.md](09-settings-admins.md))

**Spec / arch links:** [spec/checklist.md](../../../spec/checklist.md), [spec/telegram-ux.md](../../../spec/telegram-ux.md) (Commands)

**Out of scope:** Admin remove UI polish (may be agent-mediated); Roster as a separate product term

**Tasks:**

- [x] **T39.1** Lock `/join` + `/leave` (or chosen names) in bot commands
- [x] **T39.2** Handlers → core join/leave with bridged ids; Russian ack
- [x] **T39.3** Optional `/remove` or admin-only remove → core `removeFromChecklist` — or document deferred to agent
- [x] **T39.4** Tests: join idempotent; leave when absent safe per core contract

**Implementation note:** `packages/telegram/src/checklist.ts` (`handleJoin`/`handleLeave`/`handleRemove`, `wireChecklistCommands`). `/join` and `/leave` are self-serve, no admin gate. Built `/remove` too (not deferred): admin-gated via the same `authz.ts` as T38, targets whoever the admin **replied to** (`ctx.message.reply_to_message.from.id`) — no username-resolution path for Phase 1, usage error if not used as a reply. `/join`/`/leave` registered via `setMyCommands`; `/remove` isn't (admin-only, still callable without menu listing).
