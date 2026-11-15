---
id: Ti75suj
title: What makes a fence Foreign once no new Ticket carries an id
kind: decision
type: grilling
status: resolved
triage: ready-for-human
blocked_by: []
answer_gist: "The predicate keeps its wording: a parsed fence is Foreign when it carries no `id` and a key outside the schema. A schema fence with no `id` is now simply a named Ticket, so the `no id (N)` warning is removed. Dropping its Unimported keys is the only way a foreign-fenced Ticket leaves the set."
---

## Question

ADR 0007 defines a foreign-fenced Ticket as a fence that parses, carries no `id`, and has at least
one key outside the schema. A fence with an `id` is never Foreign. A fence of schema keys and no `id`
is conforming and shows on the Board as `no id (N)`.

Under ADR 0008 no new Ticket carries an `id`. So:

- `no id (N)` would count every Ticket the server creates. The warning has to go or change meaning.
- A new Ticket that a person adds one stray key to by hand becomes Foreign, where the same edit to
  an existing Ticket with an `id` does not. Is that difference acceptable, and what does the reader
  see for that Ticket's own fields?
- `migrate_effort` took a foreign-fenced Ticket out of the Foreign set by minting its id. Nothing is
  minted now. Does dropping its Unimported keys become the only route out, or does migration get
  another way to mark a file as accepted?

## Position going in

Keep the predicate's shape and move its anchor off `id`: a fence is Foreign when it has a key outside
the schema and is not marked accepted, and the question is what the mark is. Candidates are the
presence of `id` (existing Tickets, unchanged) or of `status` written by the server.

## Acceptance criteria

- [x] The Foreign predicate is restated without relying on a minted id
- [x] What happens to the `no id (N)` Board warning is decided
- [x] How a foreign-fenced Ticket leaves the Foreign set under 2.0 is stated
- [x] Whether a stray key on a new Ticket makes it Foreign is decided
- [ ] ADR 0007 is amended or superseded accordingly

## Source

ADR 0008, Consequences.

## Answer

Settled by the agent on 2026-11-15 after the owner said to start 2.0, on the grounds that it is small and reversible. Reopen it if any line is wrong.

What made it small: a foreign-fenced Ticket's fields are already read from its fence, not inferred. Being Foreign-by-fence changes two things only — the Board counts it apart, and `get_tickets` shows its fence whole instead of entry by entry.

- **Predicate:** unchanged. No parseable fence, or a parsed fence with no `id` and at least one key outside the schema. A fence with an `id` is never Foreign, as today, so no existing Board changes.
- **`no id (N)`:** removed. A fence of schema keys and no `id` is the normal shape of a Ticket under ADR 0008 and is addressed by its name.
- **A stray key on a new Ticket** does make it Foreign-by-fence, where the same key on an id-carrying Ticket does not. Accepted: in both cases the key is shown as Unimported and `drop_keys` removes it, and the Board's count is true — that fence holds something the server did not import.
- **Leaving the set:** only by dropping every Unimported key. `migrate_effort` no longer has a way to accept a foreign fence wholesale. An Effort imported from another tracker therefore keeps its Board warning until its keys are dropped; whether that deserves a bulk path is [[T86]]'s question, not this one's.
- **ADR 0007:** its two-routes paragraph and the `no id (N)` sentence are amended when the read path is built.

## Comments

**2026-11-15 — the owner chose otherwise.** Asked which ways there were, the owner took the second: drop "Foreign by fence" altogether, so that Foreign means only "no parseable fence" and a key outside the schema is an Unimported key on any Ticket. The Answer above was the agent's provisional pick and is replaced by that. The build is [[To7zwid]]. The removal of `no id (N)` stands either way.
