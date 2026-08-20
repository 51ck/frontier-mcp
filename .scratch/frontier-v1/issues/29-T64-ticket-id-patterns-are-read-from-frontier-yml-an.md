---
id: T64
title: Ticket id patterns are read from frontier.yml and compiled
kind: build
status: open
triage: ready-for-agent
blocked_by: []
---

**What to build:** the consumer-configurable id format decided in [[T52]] and [[T54]].

A YAML file at the root of the storage directory, `<storageDir>/frontier.yml`, holding one
`id_pattern` key. The env var and the server argument both fail on cardinality rather than lifetime:
`root` is a per-call argument and one process deliberately serves many workspaces, so the pattern has
to live with the workspace. The driver already takes `storageDir` as a construction parameter
([[T28]]), which is the anchor.

**The token language is four forms** — `<N>`, `<b36{n}>`, `<b16{n}>` and literals. `<effort>` is
refused: identity may not derive from an unvalidated directory name that changes by plain `mv`,
outside anything the product can observe.

**Legality splits three ways**, and T52 keeps them apart deliberately: parseability rules, filesystem
rules that come from outside the repo, and no ambiguity rules at all. Every pattern must begin with a
literal — [[T55]] rests on that, since it is what keeps every legal predicate anchored and narrow and
is why no key sigil is needed.

**Absent file or absent key means the default and is not an error.** An unparseable file or an
illegal pattern warns on read and refuses on write, reusing [[T38]]'s split exactly.

The compiled pattern is what everything downstream asks. [[T53]] establishes that the two questions a
caller cares about — does minting need coordination, does identity survive a merge — are independent
properties of the token list, so both are answered statically at compile time and neither is a
runtime branch.

**Status:** ready-for-agent

- [ ] `<storageDir>/frontier.yml` is read at driver construction; `id_pattern` is its only
      recognized key
- [ ] `<N>`, `<b36{n}>`, `<b16{n}>` and literals parse; `<effort>` is refused with T52's reason
- [ ] A pattern not beginning with a literal is illegal, and the reason cites T55
- [ ] Absent file and absent key both yield the default with no warning
- [ ] An unparseable file or an illegal pattern warns on read and refuses on write
- [ ] The compiled pattern exposes both of T53's axes: needs-coordination, and survives-a-merge
