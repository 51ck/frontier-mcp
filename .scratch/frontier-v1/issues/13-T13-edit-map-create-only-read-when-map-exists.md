---
id: T13
title: edit_map with create and no section fields does not force revision mismatch
kind: build
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: edit_map create with no sections reads an existing Map; create only writes when the Map is missing; mutations still require expected_revision
---

# T13 — edit_map with create and no section fields does not force revision mismatch

**What to build:** Calling `edit_map` with `create: true` and no Destination / Notes / fog /
rule-out fields no longer always takes the write path. If the Effort already has a Map, the call
returns that Map (same as a plain read) instead of requiring `expected_revision` and failing with
`RevisionMismatch`. `create` still starts an Effort and its Map when neither exists. Mutations on
an existing Map still require `expected_revision`.

Also clarify the `create` argument description so agents know it is only for starting an Effort
and Map that do not exist yet — not a flag to send on every call. Do not add a hard schema rule
that forbids `create` together with section edits; a one-shot create-and-set-Destination remains
valid.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `edit_map` with `create: true` and no section fields returns the existing Map when one is
      already present, without requiring `expected_revision`
- [ ] The same call still creates a missing Effort and Map when neither exists
- [ ] Section edits on an existing Map still require `expected_revision` and still reject a stale
      or absent revision
- [ ] The `create` argument description states it is for starting a missing Effort/Map only, and
      that it does not change the revision rules for mutations

## Answer

Handler tries readMap first when there are no section fields. create:true only takes the write path on NoSuchMap. create description clarified. Section edits still go through editMap with expected_revision.

## Comments

Verified by three harness tests under edit_map create with…. Tick blocked by T18 (wrapped criterion text).
