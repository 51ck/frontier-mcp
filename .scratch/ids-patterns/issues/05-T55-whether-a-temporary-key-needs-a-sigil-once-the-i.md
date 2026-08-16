---
id: T55
title: Whether a temporary key needs a sigil once the id space is wide
kind: decision
type: grilling
status: open
triage: ready-for-agent
blocked_by: [T52]
---

## Question

T36 considered requiring every temporary key to start with `@` — `@auth` — so that keys are
syntactically disjoint from any driver's ids by construction. It rejected the idea, and the recorded
reason is exact:

> It was rejected because it loses one case: an Edge reading `blah` carries no sigil, so the tool
> layer would have to accept it as an id that does not exist yet. Today `blah` is refused.

That argument holds while the id pattern is narrow. A wide configurable pattern loses **the same
check by the same mechanism** — under `<effort>-<N>` the typo `auth-1` is a well-formed id and is
accepted as dangling. So if a wide pattern ships, the price sigils were rejected for has already been
paid, and sigils would at least buy back disjointness: keys carry `@`, ids never do, and the pattern
can then be as wide as the consumer likes without eating key space.

T36 is not wrong. Its premise is what this Effort changes. The question is whether the trade it made
survives the change, and if sigils come back, whether they are mandatory, optional, or required only
for patterns above some ambiguity threshold — the third being the most tempting and the most likely
to produce a rule nobody can hold in their head.

A sigil is also a change to the **tool surface** rather than the driver: `create_tickets` takes
`key`, and its description tells the caller what a key may look like. Eight tools stay eight, but the
contract on one of them moves.

## Acceptance criteria

- [ ] Whether temporary keys gain a required sigil is decided
- [ ] If they do, the migration for callers is stated — the schema description, and whether an
      unsigiled key is refused or accepted with a warning
- [ ] If they do not, what protects the typo case under a wide pattern is stated
- [ ] Whether the answer varies by pattern is decided, and if it does, the rule is written in one
      sentence a caller can hold
