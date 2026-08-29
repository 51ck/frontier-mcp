---
id: T84
title: Values that were never statuses have nowhere to go in the schema
kind: decision
type: grilling
status: open
triage: needs-triage
blocked_by: []
---

Same migration, and the more interesting half of the previous Ticket.

Of the seventeen `Status:` values, several were never lifecycle values at all. They were priority and reachability markers riding in the only structured field the old format had:

- `checkout-path — escalated: reachable hang in addToCart(), highest priority in this backlog`
- `unreachable — the three configs authoring a singular camera: have no live importer. Normalise anyway`
- `latent — shipped configs hide directionals with visible, never addedToScene`
- `demoted — real but unread; the sole listener reads .hover`
- `live in shipped code and reachable on the production storefront via #debug`

The schema has `status` (closed set, four values) and `triage` (role vocabulary). Neither holds "this one is reachable in production and is the highest priority on the board". Mapped by keyword, all five became `status: open` and the sentence evaporated.

They were kept by hand as `**Triage note:**` lines in the body — a convention invented on the spot for that repo, which no tool knows about and nothing can query.

## The question

Is that a gap, or correct minimalism?

The argument for leaving it alone: prose is where prose belongs, and a tracker that grows a labels array grows a taxonomy problem.

The argument against: every one of those five sentences is a scheduling input. `checkout-path` was the board's own priority marker and the reason one Ticket outranked seventy-two others. After migration nothing distinguishes it from any other open Ticket, and the Board — the cheap orientation surface the whole design rests on — cannot show it.

If the answer is prose, the tracker doc should name a convention so every repo does not invent its own. If the answer is structure, the smallest version is probably a free `labels: []` the Board renders and nothing interprets.
