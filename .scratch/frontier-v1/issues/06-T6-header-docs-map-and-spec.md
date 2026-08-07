---
id: T6
title: Header docs — edit_map sections, generated Decisions-so-far, spec get/put
kind: build
status: resolved
triage: ready-for-agent
blocked_by: [T3]
answer_gist: edit_map edits typed Map sections; Decisions-so-far and dropped Out-of-scope regenerate between GENERATED markers on mutation and on resolve/drop; spec gets/puts the whole document
---

# T6 — Header docs: `edit_map` sections, generated Decisions-so-far, `spec` get/put

**What to build:** Wayfinder's Map becomes editable a section at a time — set the Destination or Notes,
add a fog patch to Not yet specified, graduate one out of it, rule something out of scope — without
rewriting the file and without two concurrent sessions clobbering each other.

The Decisions-so-far section stops being something a session remembers to append to. Per ADR 0002 it is
generated from the resolved Tickets, written into `map.md` between markers that say their contents are
overwritten, and replaced wholesale on every mutation through the server. Specs are handled as whole
documents, because nothing ever edits one section of a Spec.

- [x] A Map's Destination and Notes can be read without returning the whole body
- [x] Each Map section can be set or amended without rewriting the others
- [x] A fog patch can be added to Not yet specified and graduated out of it, leaving it in one place
- [x] Ruling something out of scope writes to the Out-of-scope section, never to Decisions-so-far
- [x] Decisions-so-far is rendered from resolved Tickets — gist plus link, one line each — and never
      read from the file
- [x] The rendered block sits between markers stating that their contents are overwritten, and the
      whole block is replaced on every mutation
- [x] Content outside the markers is never touched
- [x] Dropped Tickets render into Out of scope, never into Decisions-so-far
- [x] A Spec is read and written as a whole document with frontmatter
- [x] An Effort holding both a Map and a Spec is handled as one Effort, not an error

## Answer

edit_map reads Destination/Notes and the fog/out-of-scope lists without the whole Map body, and mutates one typed section at a time. Decisions-so-far is never accepted as input — it is rendered from resolved Tickets between GENERATED markers, replaced on every Map mutation and whenever update_ticket resolves or drops. Dropped Tickets render into a GENERATED block under Out of scope; hand-ruled items stay outside the markers. spec gets and puts the whole document with frontmatter. An Effort may hold both a Map and a Spec; putting one onto an Effort that already has the other needs no create flag.
