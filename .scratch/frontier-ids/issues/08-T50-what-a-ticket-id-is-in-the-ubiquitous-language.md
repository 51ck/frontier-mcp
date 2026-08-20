---
id: T50
title: What a Ticket id is in the ubiquitous language
kind: decision
type: grilling
status: resolved
triage: ready-for-agent
blocked_by: [T36, T39]
answer_gist: "One rule settles all four criteria — a document references the source of the id format and never restates the value — so `CONTEXT.md` names `id_pattern` and no shape, gains **Temporary key** and **Handle** as decided entries, and gains nothing about minting: the invariant \"the server mints every id it is present for\" is T39's and lives in the shipped tracker doc, because a glossary entry saying it would be contradicted by a passing test; `AGENTS.md` keeps both id bullets, the first stripped to what binds the code and the second made pattern-conditional per T53, with no pointer to the tracker doc because line 461 already is one; **Legacy Ticket** and **Edge** are both corrected, Edge because it claims a foreign Edge \"looks no different\" while the Board annotates it precisely so it does"
---

## Question

Two settled decisions have not reached the language. T35 makes an id opaque lowercase base36
(`Tk39fq`). T36 moves both shape and minting to the driver — the domain keeps only the contract, and
the tool layer asks the driver "is this one of your ids?" instead of testing a pattern.

`CONTEXT.md`'s **Ticket** entry still reads "Identified by a stable `id` of the form `T<n>`", which
after T36 is not the domain's business to state. `AGENTS.md:118` says it again — "`T<n>` from a
repo-global counter". The bullet after it, "The counter is derived, and allocated under a guard",
describes machinery T37 deleted; it dies with the code and needs no decision.

The generative half is harder. `CONTEXT.md` has **no term at all** for a draft's temporary key — the
thing `create_tickets` takes as `key`, which siblings name in `blocked_by` before any id exists. T36
made that distinction load-bearing: the entire reason the driver now answers "is this one of your
ids?" is to tell a key from an id. A concept the tool layer must discriminate on, and the ubiquitous
language cannot name, is a hole in the language rather than an omission from a file.

One invariant may also not survive. The tracker doc's case that only the server may allocate an id
rests on collision risk, which T35 removes. Whatever T39 decides about a hand-writing agent settles
whether "the server mints every id" is still true as language.

The mechanical edits themselves — `README.md`, the vendored `docs/agents/issue-tracker.md`, ADR
0005's supersession header — are build work handed to `frontier-v1`. This Ticket decides the words,
not the files.

## Acceptance criteria

- [x] The **Ticket** entry's id sentence is rewritten to the contract T36 left in the domain —
      opaque, repo-unique, never reused, never changed — with shape named as the driver's
- [x] `CONTEXT.md` has a decided entry, with its `_Avoid_` list, for a draft's temporary key
- [x] Whether "the server mints every id" survives as a language invariant is decided, consistent
      with T39
- [x] `AGENTS.md`'s two id bullets have agreed replacement wording, or an explicit ruling that one is
      deleted outright

## Answer

**One rule decides all four criteria: a document references the source of the id format and never restates the value.** `CONTEXT.md` names `id_pattern` and no shape. It gains **Temporary key** and **Handle**. It gains nothing about minting — that invariant is T39's and lives in the shipped tracker document. `AGENTS.md` keeps both id bullets, the first stripped to what binds the code and the second made conditional on the pattern. **Legacy Ticket** and **Edge** are corrected too.

## The rule, and why it is the whole answer

This Ticket exists because `T<n>` outlived two decisions that contradicted it. Worth asking why it survived: not because anyone defended it, but because it had been written down in more than one place and nobody owned all the copies. `CONTEXT.md:61` said it. `AGENTS.md:118` said it again. The `key` schema description said it to callers (`src/tools/create-tickets.ts:25`). And `src/domain.ts:38` says it a fourth time, in a doc comment on the `id` field — inside the domain, which is exactly the layer [[T36]] emptied of shape.

Four copies, one of them in the module whose job is to *not* know this. Each was true when written. None was wrong in a way that broke anything, which is why they all survived.

So the rule is not a style preference. **A value restated in prose has no owner and cannot be kept true.** A reference has one: `id_pattern` in `<storageDir>/frontier.yml`, where [[T54]] put it. Every document below points there and states no shape, and the default `T<b36{6}>` appears only where an agent acts on it — which after [[T39]] means the tracker document's minting procedure and nowhere else.

That rule is what makes the four criteria one decision rather than four.

*Correcting this Ticket's first acceptance criterion.* It asks for the shape "named as the driver's", and that is the wrong answer to its own question. [[T54]] resolved after this Ticket was written and made the shape the **repo's configuration**. The driver reads it and enforces it; it does not own it. A reader sent to the driver is sent to the wrong place.

## The **Ticket** entry

`CONTEXT.md:59-62` becomes:

> **Ticket**:
> One markdown file under an Effort's `issues/`, one unit of work or one question. Identified by a
> stable `id` — opaque, unique across the whole repo, never reused and never changed. The id's shape
> is the repo's, set as `id_pattern` in `<storageDir>/frontier.yml` and enforced by the storage
> driver. Never identified by its filename.
> _Avoid_: issue, task, card, story

"Opaque" is [[T35]]'s word and carries the operative instruction: nothing is derivable from an id, so no code parses one. It collides mildly with the **Spec** entry's "opaque document bytes across the storage seam" (`:56`), a different sense. The collision was weighed and accepted — both usages mean "do not look inside", which is close enough that a reader is not misled.

The default is deliberately absent. A default printed in a glossary is read as the format; that is precisely how `T<n>` got in and stayed through two contradicting decisions. The cost is real and was argued: a reader meeting `Tk39fq` in a repo with no `frontier.yml` has no example here to recognize it by. Accepted, because the alternative is a value with no owner, and this entry is the first place it would rot.

## **Temporary key**, the term that was missing

`CONTEXT.md` had no name for the thing `create_tickets` takes as `key`, which is the concept [[T36]] made load-bearing — the driver answers "is this one of your ids?" precisely to tell a key from an id. [[T55]] closed by handing the debt here, noting its own rule was "unwritable in the domain language as it stands".

> **Temporary key**:
> A caller's own name for a Ticket in a `create_tickets` call, so its siblings can declare Edges on
> it before any id exists. Never stored, never leaves the call — a key written into a file resolves
> against nothing. Any name that is not one of this repo's Ticket ids; if it matches `id_pattern` the
> call is refused and the key is named back to you.
> _Avoid_: temp id, provisional id, alias, handle (that is a Legacy Ticket's), and Key for a YAML or
> map key in tracker prose

**The headword carries "temporary" because the failure mode is specific.** A bare **Key** was considered and rejected. An agent reading a neutral headword may take it for a persistent name and write one into a `blocked_by` in a hand-authored file; `checkEdges` only knows keys declared inside the same call (`src/tools/create-tickets.ts:162`), so such a key resolves against nothing and surfaces later as a dangling-Edge warning on the Board. The concept exists to prevent exactly that.

The obvious counter is **Frontier**, also never stored, whose headword does not say so either. It does not transfer: nobody is tempted to persist a computed set into a field. Key is tempting, so the asymmetry is real.

**This costs no consistency and no code.** The noun stays one word; the modifier marks a property, which is what **Triage role** does over a field named `triage` and **Legacy Ticket** over a derived `legacy`. And the implementation already writes it this way — both error strings say "Temporary key" (`create-tickets.ts:135`, `:141`), so nothing needs renaming.

**"Placeholder" is deliberately not on the `_Avoid_` list.** `placeholderFor` (`:210-214`) names a different thing: the `#0`, `#1` stand-in the server invents for a draft the caller gave no key, which reaches the caller in cycle and Edge errors. Avoid-listing the word would make an existing function name a glossary violation under `AGENTS.md:265` and force a rename that buys nothing.

**Draft stays undefined.** `DraftRequest`, `TicketDraft`, `toDraft` and `drafts` (`create-tickets.ts:89-91`) are code vocabulary with no glossary entry. The entry above was written not to depend on the word, so the debt is real but isolated. It belongs to a Ticket that names it, not to this one.

## **Handle**, the third concept in the id-adjacent space

Three concepts live here — id, temporary key, handle — and the glossary named one. Handle is not a convenience field: `get_tickets` indexes by it (`src/tools/get-tickets.ts:30`), renders it as each Ticket's heading (`:66`) and tells callers an id-less Legacy Ticket is fetched by it (`:11`); the write path resolves a target by id **or** handle (`src/storage/markdown/driver.ts:577-578`); and [[T40]] made `migrate_effort --preview` name every unminted Ticket by it.

> **Handle**:
> How you name a Ticket in a call — the id when it has one, otherwise `<effort>#<order>`, which is
> all an id-less Legacy Ticket has until migration mints it one. `<order>` is the `NN` filename
> prefix, or the Ticket's position in the Effort when it has none, counting from 1; a later Ticket
> colliding on one gets a `.2`, `.3` suffix so every Ticket stays addressable. An addressing form,
> never an identity: nothing is stored under a handle, and a Ticket's handle changes the moment it
> gets an id.
> _Avoid_: id (a handle is usually one, but they are not the same thing), name, reference

**"An addressing form, never an identity" is the clause that earns the entry.** Without it this entry damages the **Ticket** entry above. `handleFor` returns the id whenever there is one (`src/storage/markdown/ticket.ts:106-108`), so a handle *is* an id in almost every case, and a reader meeting both entries could reasonably conclude "handle" is a friendlier word for "id" and start writing it where identity is meant. The `_Avoid_` line does unusual work here: it warns against the term the entry mostly denotes.

**The `.2` suffix is in the entry because uniqueness does not come from the filename.** Two files can share an `NN-` prefix, which would give two id-less Tickets one handle and make one unfetchable; `withUniqueHandles` (`driver.ts:700-717`) suffixes the later ones at scan time. An entry omitting that would misdescribe the only property that makes a handle usable.

**Order counts from 1 already**, so nothing changes: `nextOrder` returns `1` for an empty Effort and `max + 1` otherwise (`src/storage/markdown/create.ts:375-376`), and a file with no `NN-` prefix takes its 1-based position in the sorted listing (`driver.ts:687`). `readOrder` (`ticket.ts:111-114`) is the definition.

**The separator is ratified, not argued.** `<effort>#<order>` predates this Effort and `@` has a real case — `renderEdge` already spells cross-Effort as `T3@other-effort` (`src/tools/get-board.ts:138`), so two forms meaning "this thing, in that Effort" use two characters. The counter-case is that the parts play opposite roles: in an Edge annotation `@other-effort` decorates something already unique and can be dropped, while in a handle the Effort is required and no form omits it. That is an argument, not a ruling, and it is [[T58]]'s.

## The minting invariant lives in the shipped document, not here

[[T39]] settled the content: **the server mints every id it is present for** — precedence, not capability. This Ticket places it, and the placement is *neither* `CONTEXT.md` nor `AGENTS.md`.

**Not `CONTEXT.md`, because a passing test would contradict it.** The obvious objection is that the glossary already carries an ownership claim — **Status**, "Owned by the server" (`:70`). That one is definitional: strip it and **Status** blurs into **Triage role**, which the next entry's `_Avoid_` line names as the confusion to prevent. Minting is not definitional for **Ticket**. A Ticket whose id a human typed is still a Ticket — `test/ship.test.ts:151-183` writes a hand-transcribed `id: T1` into a fixture and asserts the Board renders it first-class, explicitly not Legacy. A glossary sentence a green test refutes is worse than no sentence.

**Not `AGENTS.md`, because of audience.** The agent facing the choice "mint through the tool or derive one by hand" is in a consumer's repo, and `AGENTS.md` does not ship — `package.json:13-16` publishes `dist` and `docs/agents/issue-tracker.md` and nothing else. The document that reaches that agent is `frontier://tracker-doc`, whose preamble [[T39]] already rewrote to argue precedence. There is nothing left for this Ticket to place.

The repo agrees with that division independently: `AGENTS.md:461` already routes tracker usage to the shipped document, and `:142` calls it "the extension point every skill already treats as such". `AGENTS.md` has never been the authority on how the tracker works. The id bullet restating the format was the anomaly in that pattern — and it is the restatement that went stale.

## `AGENTS.md`'s two id bullets

Both survive, rewritten. `AGENTS.md:118-125` becomes:

> - **Stable `id`, cosmetic filename.** A Ticket id is opaque, unique across every Effort, never reused
>   and never changed. Its shape is the repo's, set as `id_pattern` and enforced by the driver.
>   `<NN>-<id>-<slug>.md` carries sort order in `NN` only. Frontmatter is the authority — on
>   disagreement the file is renamed, never the field. Edges are plain ids resolved repo-wide; there is
>   no compound cross-Effort reference form.
> - **The counter is derived, and allocated under a guard — for patterns that have one.** A pattern
>   containing `<N>` mints under a guard; a pattern without one has no counter to serialize and takes
>   none. The guard keys on the `<N>` value rather than the rendered id, because two sessions reaching
>   the same number under a mixed pattern render different ids, derive different guard paths, and
>   contend over nothing.

*Correcting the Question above.* It predicts the second bullet "dies with the code and needs no decision". That prediction is wrong twice. [[T53]] kept guards for **every pattern containing `<N>`**, so the machinery is conditional rather than dead; and [[T37]]'s deletion was never carried out — `guardFor`, `hold`, `claim`, `release` and `reserve` are all still in `src/storage/markdown/create.ts`. The bullet describes live code and a live rule.

**No pointer to the tracker document in either bullet.** `AGENTS.md:459-461` is the section built for that pointer. A second copy inside a Local Contract gives one fact two homes in one file, which is the mechanism that put `T<n>` in two places and left both wrong. Naming `id_pattern` stays — that is the location of a value, not a prose copy of it.

**No ADR link on the second bullet.** It cites ADR 0005 (`docs/adr/0005-ids-are-allocated-under-a-guard-and-a-rescan.md`) today, which [[T53]] ruled superseded by an ADR stating the guard's condition. That ADR does not exist. Linking a record already agreed wrong is worse than linking nothing; the build adds the citation when it writes the replacement.

**"Though they may be skipped" is cut.** Skipping means something only when ids come from a sequence. Under a random pattern there is no sequence and nothing is skipped — one more clause surviving from the counter, inside the bullet being rewritten because it was wrong.

What the bullets keep is what binds this codebase: frontmatter is the authority, the file is renamed and never the field, Edges are plain ids resolved repo-wide. Those constrain `src/domain.ts` and the driver. `T<n>` and the counter did not.

## **Legacy Ticket** and **Edge**, both corrected

The Question scoped this Ticket to the **Ticket** entry. Two more entries are wrong for reasons this Effort created, and leaving them would mean shipping a glossary the same Effort had just falsified.

**Legacy Ticket** (`:94-97`) — two clauses fail. "With no frontmatter" is false: `splitFrontmatter` treats any opening fence whose YAML parses as a mapping as a schema Ticket (`src/storage/markdown/frontmatter.ts:26-37`), so a file exported from another tracker reads as `legacy: false` and the Legacy parser never runs. [[T40]] decided such a fence is quarantined into the body rather than imported. "Normalized on first write through the server" understates what T40 settled: migration is its own operation, it writes `awaits_migration` for prose an agent still has to read, and `legacy` is derived rather than stored (`ticket.ts:52`, `:93`) so migration destroys the flag the sentence leans on.

> **Legacy Ticket**:
> A Ticket file predating the schema, carrying no frontmatter of ours. Parsed best-effort on read.
> Migration mints it an id and writes our fields; a foreign frontmatter fence is moved into the body
> rather than imported, and prose a parser cannot read is flagged for an agent to finish.
> _Avoid_: unmigrated, old-format

The headword is capitalized. It read "Legacy ticket" while every other entry and all of T40's prose write **Ticket**; a glossary that miscapitalizes its own term teaches the wrong form.

**Edge** (`:78-81`) — the entry ends "an Edge across Efforts looks no different from a local one". That is true of the stored form and false of the rendered one, and it does not say which it means. `renderEdge` emits `T3@other-effort` for a foreign blocker precisely so it *does* look different, and its comment says that without the annotation "a foreign blocker is a dead end" (`get-board.ts:132-138`).

> **Edge**:
> A `blocked_by` entry: one Ticket declaring another must finish first. Always stored as a plain Ticket
> id, resolved repo-wide. A Board annotates a blocker living in another Effort so it stays followable;
> that annotation is rendering, never a stored reference form.
> _Avoid_: dependency, link, relation

The correction is narrow on purpose. It names the annotation without naming its character, so [[T58]] can settle `#` against `@` without this entry needing a rewrite.

## What the build inherits

This Ticket decides words. Every edit below is `frontier-v1`'s, and no Ticket holds them yet.

- `CONTEXT.md` — **Ticket** rewritten (`:59-62`), **Edge** rewritten (`:78-81`), **Legacy ticket** rewritten and recapitalized (`:94-97`), and two new entries, **Temporary key** and **Handle**. Placement follows the file's existing grouping; the two new entries belong beside **Ticket**.
- `AGENTS.md:118-125` — both bullets replaced with the wording quoted above.
- `src/domain.ts:38` — the `id` field's doc comment still reads "`T<n>`, unique repo-wide". It is the fourth restatement and the one in the layer [[T36]] emptied. It becomes the contract, naming no shape.
- `src/tools/create-tickets.ts:25` — the `key` description ends "May not look like T<n>." [[T55]] already ruled this must become pattern-neutral and called it the whole of its own migration. The **Temporary key** entry above is wording it can be derived from.
- `docs/agents/issue-tracker.md:3-4` names eight terms a consumer's `CONTEXT.md` is expected to define. **Handle** and **Temporary key** are both consumer-facing and both absent. Whether the product ships definitions or only names terms is [[T60]]'s question; the list grows either way.
- `README.md` and ADR 0005's supersession header remain as this Ticket's Question left them — build work, unchanged by anything decided here.

## What this Ticket opened

Four Tickets came out of the grilling, three of them outside this Effort.

- [[T58]] — whether a handle separates with `#` or `@`, blocked on this Ticket.
- [[T59]] in `frontier-hive` — what per-call `root` commits us to. [[T54]] leaned on that property to kill environment variables and server arguments as config homes; the property itself had never been argued.
- [[T60]] and [[T61]] in the new `frontier-onboarding` Effort — who owns the tracker vocabulary, and what a setup flow serves and writes. [[T39]] found there is no vendoring mechanism at all, so a consumer's persisted copy of the tracker document has no update path; onboarding is where that gets fixed or accepted.

One constraint found late and recorded on [[T61]]: `AGENTS.md:137-139` fixes the tool count at eight, permanently, and prescribes an optional argument on an existing tool over a ninth. An onboarding *tool* is not available without overturning that, which reshapes T61 before it is answered.
