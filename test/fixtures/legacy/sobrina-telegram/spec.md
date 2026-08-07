# Telegram

Phase 1 group adapter in `@sobri/telegram`. Spec: [telegram-ux.md](../../spec/telegram-ux.md), [daily-rhythm.md](../../spec/daily-rhythm.md), [checklist.md](../../spec/checklist.md). Arch: [architecture.md](../../tech/architecture.md) (adapter I/O only; channel tools call core verbs). Glossary: [`CONTEXT.md`](../../CONTEXT.md).

Legacy IDs **T30–T44**.

## Why

Core owns the ledger, Session hub, scheduler due-checks, and `askWithOptions` types. Phase 1 still needs a live **group** Grammy path: map Telegram ids → core, deliver Reminder / Day Summary, render buttons with caption limits, run `/settings` for group admins + env bot admins, and hand Check-in / Checklist intents to durable verbs. Free text always wins for Check-in intent. No DM-primary surface; no product rule invention in the adapter.

## Themes

1. Grammy group boot — token, long-polling (or webhook later), process entry (resolved)
2. Identity bridge — Telegram chat/user → core chat/member ids (resolved)
3. Inbound → Session — group messages/callbacks wake `getOrStart` (resolved)
4. Outbound send — readable Russian; chosen parse mode; safe send (resolved)
5. askWithOptions chrome — inline keyboard; enforce core caption max (resolved)
6. Reminder delivery — post Reminder + default Красавчик / Оступился (resolved)
7. Button Check-in — callback → join + record via core (resolved)
8. Free-text Check-in handoff — speech path to Session/core; wins over buttons (resolved)
9. `/settings` — Reminder, Deadline, TZ, N; admins only (resolved)
10. Character pick + admin title — force-choose face; `setChatAdministratorCustomTitle` best-effort (resolved)
11. Checklist commands — join/leave handoff to core (resolved)
12. Day Summary delivery — post after Deadline using core facts (+ agent prose when ready) (resolved)
13. Scheduler loop in process — call core tick → consume intents → Reminder / Summary I/O only (resolved)
14. Hygiene — edit-in-place Reminder chrome; no proactive user-message deletes (resolved)
15. Help + progress command handoff — locked `/help` text; `/progress` → core `fullStats` (resolved)

All 15 telegram themes (T30–T44) are resolved. Next work for the product is the agent board.

## Suggested build order

```text
core T11, T20, T21, T22, T14, T16, T17, T23 (as needed per theme — see ../core/spec.md)
  → T30 Grammy boot
  → T31 identity bridge
  → T33 outbound send          ∥ early after T30
  → T32 Session inbound
  → T34 askWithOptions chrome  (needs T22)
  → T38 /settings              (needs T11)
  → T44 Character + title      (needs core T25 + T38)
  → T39 join/leave
  → T35 Reminder delivery
  → T36 button Check-in
  → T37 free-text handoff
  → T40 Day Summary delivery
  → T41 scheduler loop         (handlers first; loop last)
  → T42 Reminder hygiene
  → T43 help/progress
```

## Non-goals

- DM as primary Phase 1 surface
- Web UI / Mini Apps
- Ledger fairness or Grace Token rules inside the adapter
- Profile / Diary implementation (Phase 2)
- Character prompt / Summary literary tone (agent board)
- Character SPEC lock / package rename (character board, resolved)
- sushkobot DB import
- Buttons-only Check-in
- Proactive deletion of user messages
- Per-person Reminder times

## Related

- Architecture: [architecture.md](../../tech/architecture.md)
- Core board: [core spec.md](../core/spec.md) (esp. T25 Character)
- Character: [character spec.md](../character/spec.md)
- Foundation: [foundation spec.md](../foundation/spec.md)
- Spec: [telegram-ux.md](../../spec/telegram-ux.md), [daily-rhythm.md](../../spec/daily-rhythm.md), [checklist.md](../../spec/checklist.md), [character.md](../../spec/character.md)
