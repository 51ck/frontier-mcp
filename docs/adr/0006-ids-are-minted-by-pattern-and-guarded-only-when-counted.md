# Ids are minted by the pattern, and guarded only when the pattern counts

Supersedes [ADR 0005](./0005-ids-are-allocated-under-a-guard-and-a-rescan.md). Its arguments stand —
why the exclusive create cannot sit on the Ticket file, and why no scheme for reclaiming a guard can
be made safe — but it argues them for every id, and since ids became configurable that is no longer
the case.

A repo's Ticket id pattern is `id_pattern` in `<storageDir>/frontier.yml`; absent, it is
`T<b36{6}>`. Existing `T<n>` ids stay valid under every pattern. The pattern compiles once, when the
driver is built, into one of two minting plans, and the choice is static — two properties of its
token list decide everything:

- **Coordination is needed exactly when the pattern contains `<N>`**, because a counter is the only
  token derived from what is already on disk.
- **Identity survives a merge exactly when the pattern contains a random token**, because randomness
  is the only thing that lets two trees disagree without talking.

| Pattern | Plan | Cross-tree identity |
| --- | --- | --- |
| `T<b36{6}>` — random only, the default | Draw, no guard | Safe |
| `T<N>` — counted only | Count under guards | Collides |
| `T<N>-<b36{4}>` — mixed | Count under guards | Safe |

**A random pattern draws.** The batch takes one workspace scan, draws each id, and redraws one that
the scan or the batch already holds, up to 1000 redraws per id before refusing with a message to
lengthen the random token. No guard is taken and no file is left behind. Two processes can draw the
same id at once; nothing coordinates that by design, and surfacing a duplicate is T67's.

**A pattern containing `<N>` counts, and its guard's condition is the counter.** It takes `max + 1`
over the counter values of the ids its pattern matches, with ADR 0005's machinery unchanged: an
exclusive create per candidate, a re-scan while holding every guard, a restart if a candidate turned
up, the guards held across the write and never reclaimed, only bumped past. The one change is the
guard's subject. It is `.frontier-id-N-<n>.guard`, keyed on the `<N>` value and not on the rendered
id: under `T<N>-<b36{4}>` two sessions reaching `35` render `T35-ab12` and `T35-cd34`, and a guard
named for the id would give them two paths and serialize nothing. A mixed pattern keeps the guard
even though its random part already carries uniqueness, because a pattern that asks for a counter is
promised that no number is handed out twice.

A guard prevents a same-tree duplicate. Nothing local prevents a cross-tree one under a counted-only
pattern: two branches count the same tree to the same number, and git merges both files cleanly
because their slugs differ. That is accepted knowingly; it is why the default is random.

## Consequences

The default takes one workspace scan per batch where ADR 0005 took two, and leaves no guard files for
a crashed session to strand. Measured on this repo's benchmark ([2026-09-13 create-path
findings](../research/2026-09-13-create-path-cost.md), the guarded path before random minting
shipped, one-Ticket batch at 1,000 Tickets, Apple M4 Pro, default QoS): the guarded `createTickets`
call is 212.66ms median / 226.64ms p95, and an independent single scan is 80.33ms / 93.56ms. At
background QoS (core index 25.13ms) they are 525.47ms / 774.03ms and 217.87ms / 317.56ms. Those are
the only measured figures. Subtracting one median from the other — 132.33ms and 307.60ms — is
**arithmetic**: it is neither the cost of the random path, which was not measured, nor the guards'
isolated overhead. Scan cost itself is the scan-cost paragraph of [AGENTS.md](../../AGENTS.md).

A counted pattern pays what ADR 0005 priced, and inherits its lock-file deviation and its skipped-id
cost on a crash. Ids are promised never to be reused or changed, not to run without gaps.

What ADR 0005 recorded that was never about counters holds for both plans: the two-phase all-or-none
write, the Effort directory created only after validation, and the `validate` hook that refuses a
cycle a freshly minted id would close.

`create_tickets` refuses a temporary key the pattern would accept as an id, or that names an existing
Ticket, so a key can never be mistaken for the id it stands in for.
