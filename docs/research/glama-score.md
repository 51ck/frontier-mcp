# Should we optimize the Glama quality score?

> **Dated snapshot — not a contract.** Researched **2026-08-20**, against a live third-party product
> with no changelog for its scoring surface. Unlike `docs/adr/` and `docs/agents/`, this document is
> not current by construction and is never updated in place. It records what was true on its date, as
> evidence for a decision. Do not cite it as authority against a live source: re-fetch and supersede
> it with a new dated document. The per-dimension numbers in §2 and the search-rank observation in
> §4 are the parts that expire first — both are readings of a page that Glama can re-score on any
> push.

No Ticket owns this question; it arrived as a direct ask. Placed in `docs/research/` rather than
`.scratch/` because `.scratch/<effort>/issues/NN-Tnn-*.md` is the frontier *Ticket* format — a unit
of work inside an Effort, with a Map and a Frontier — and this is not a unit of work. It is the same
artifact type as `browser-transport.md` (T21) and `sdk-v2-family.md` (T30): a dated external-fact
memo written as evidence for a decision. Those two are Ticket-linked and this one is not; that is the
only way it departs from the convention.

Researched **2026-08-20**. Every claim is from Glama's own pages and repositories, the MCP
specification and its schema, the GitHub and npm registry APIs, or this repository's source. Two
secondary sources are used and labelled inline. Facts read off a rendered page are marked
**observed**; facts Glama states in prose are marked **documented**.

**Cutoff caveat.** Training cutoff is May 2026; Glama's TDQS framework was published 2026-04-03 and
its methodology page is undated but references June 2026 figures. Everything here was fetched live.

---

**Headline finding, before the detail.** The premise is off by one metric. **67% is not the quality
score** — the page labels it "Profile completion", and the quality score is a *different* number on
the same page. Computed from Glama's own published formula, frontier-mcp's actual quality score is
**≈4.2/5, tier A**, against a registry mean of **3.56**. It is already above the 75th percentile.
There is nothing to optimize there.

The four unchecked boxes that drag "profile completion" to 67% are: a `glama.json` file, author
verification, "related servers", and *recent usage* — and Glama's own remedy for the last one is
"use the Try in Browser feature to seed initial usage", i.e. click your own server. None of the four
measures quality. None is visible in Glama's public API. None appears in any user-selectable sort.

Meanwhile the genuinely useful finding is one Glama does **not** check: this repo has **no LICENSE
file** (GitHub's API reports `license: null`), and its five mutating tools leave `destructiveHint`
and `openWorldHint` undeclared, which under the MCP spec defaults them to `true` — telling every
client that a purely-local `.scratch/` editor is destructive and open-world. That is a real defect,
it is invisible to Glama, and it is worth fixing on its own merits.

**Recommendation: ignore the score; fix two things the score never looked at.** See §7.

---

## 1. What the score actually measures

Glama publishes the full framework. It is not a black box, and it is genuinely better documented than
most directory scores.

Primary sources:

- [glama.ai/mcp/methodology](https://glama.ai/mcp/methodology) — "How Glama indexes the MCP ecosystem"
- [github.com/glama-ai/tool-definition-quality-score](https://github.com/glama-ai/tool-definition-quality-score) — the complete TDQS specification, including the exact prompts and aggregation formulas
- The explainer text rendered inline on every `/score` page

### 1.1 The two numbers on the page are unrelated

This is the crux, and the page's layout invites the confusion:

| Number | Label on the page | What it is |
| --- | --- | --- |
| **67%** | "Profile completion" | A checklist of directory-hygiene items. Sub-caption: *"A complete profile improves this server's visibility in search results."* |
| **≈4.2 / tier A** | "Tool Definition Quality" + "Server Coherence" | The actual quality score, per the published formula |

Glama never publishes the profile-completion formula. **Inferred, not documented:** 67% is suspiciously
exactly 2/3, so the denominator is likely 9 or 12 items, but the visible checklist has 10 rows, which
does not divide to 67%. Some items are evidently weighted or hidden. Do not reverse-engineer this.

### 1.2 The quality score, as documented

> "The overall quality score combines two components: **Tool Definition Quality (70%)** and **Server
> Coherence (30%)**."
> — rendered on `/score`, and restated in the TDQS README

**Tool Definition Quality (70%).** Every tool scored 1–5 on six dimensions
([TDQS README, "Computing the score"](https://github.com/glama-ai/tool-definition-quality-score)):

| Dimension | Weight | Registry mean | Registry smell rate (<3) |
| --- | --- | --- | --- |
| Purpose Clarity | 25% | 4.47 | 4.0% |
| Usage Guidelines | 20% | 3.03 | 44.5% |
| Behavioral Transparency | 20% | 2.90 | 46.1% |
| Parameter Semantics | 15% | 3.19 | 14.0% |
| Conciseness & Structure | 10% | 4.47 | 3.8% |
| Contextual Completeness | 10% | 3.23 | 32.8% |

Rolled to the server as **60% mean TDQS + 40% minimum TDQS** — "so a single poorly described tool
pulls the score down."

**Server Coherence (30%).** Four dimensions, weighted **equally**: Disambiguation, Naming Consistency,
Tool Count Appropriateness, Completeness.

**Tiers** (same mapping at every level): A ≥3.5, B ≥3.0, C ≥2.0, D ≥1.0, F <1.0. B is passing.

### 1.3 What evidence it uses

Documented in [methodology §1.2–1.6](https://glama.ai/mcp/methodology). It is a **runtime probe**, not
a repo scan or a manifest read:

1. **Source ingestion** — Glama clones and continuously syncs full Git history from GitHub.
2. **Sandboxed build** — built from a Dockerfile "either authored by the maintainer … or **inferred by
   Glama's AI-assisted build system**", run inside a Firecracker microVM.
3. **Protocol introspection** — Glama runs `tools/list`, `resources/list`, `prompts/list` against the
   live server and captures the complete JSON Schema plus annotation hints.
4. **Behavioural analysis** — syscall- and network-layer observation for credential-path access,
   unexpected egress, exfiltration signatures, process forks, out-of-tree writes. Findings graded
   *Malicious* (de-listing review) or *Risky* (surfaced publicly).
5. **Scoring** — stages 1, 2 and 4 are deterministic code; **only stage 3 is an LLM call**.

The scored inputs are "exactly what an MCP client sees from `tools/list`": `name`, `title`,
`description`, `inputSchema`, `outputSchema`, `annotations`, and `siblingToolNames`. **No human
review is involved in scoring.** The one human touchpoint is the *Malicious* escalation path.

Two deterministic hard gates bypass the LLM: a missing description forces every dimension to 1; a
description that merely restates the tool name caps Purpose Clarity at 2.

---

## 2. The current reading for 51ck/frontier-mcp

Read from <https://glama.ai/mcp/servers/51ck/frontier-mcp/score> on **2026-08-20**.

### 2.1 Headline

```
Server Quality Checklist
67%  Profile completion
     A complete profile improves this server's visibility in search results.
```

### 2.2 Everything that passes

**Server Coherence — A**

| Dimension | Score | Glama's verbatim justification (abridged where noted) |
| --- | --- | --- |
| Disambiguation | 5/5 | "Each tool targets a distinct resource and action… There is no overlap or ambiguity between them." |
| Naming Consistency | 4/5 | "The exception is 'spec', which is a short noun rather than a verb_noun, and there is some singular/plural inconsistency (update_ticket vs create_tickets)." |
| Tool Count | 5/5 | "With 8 tools, the set is well-scoped… within the ideal 3-15 range." |
| Completeness | 4/5 | "Minor gaps include lack of an explicit create_effort tool and no delete operations for tickets or efforts, but these are workable or perhaps intentionally omitted." |

**Tool Definition Quality — A**, average 4.3/5 across 8 of 8 tools:

| Tool | TDQS | | Tool | TDQS |
| --- | --- | --- | --- | --- |
| `update_ticket` | 4.7 | | `get_tickets` | 4.4 |
| `edit_map` | 4.6 | | `create_tickets` | 4.1 |
| `migrate_effort` | 4.6 | | `get_board` | 3.9 |
| `spec` | 4.5 | | `list_efforts` | 3.8 |

**Maintenance — A**: no community issues in 6 months; 141 commits in 12 weeks; last stable release
2026-08-13; no critical/high vulnerability alerts; no code scanning findings; **"CI status not
available"**; permissive licence (MIT); has README.

### 2.3 The actual quality score, computed

Glama displays the components but not the composite. Applying its own published formula:

```
mean TDQS = (3.8+3.9+4.1+4.4+4.5+4.6+4.6+4.7)/8 = 4.325   (page rounds to 4.3 ✓)
min  TDQS = 3.8
description quality = 0.6(4.325) + 0.4(3.8)              = 4.115
coherence           = (5+4+5+4)/4                        = 4.500
OVERALL             = 0.7(4.115) + 0.3(4.500)            = 4.23  → tier A
```

Against Glama's own registry-wide figures (TDQS README, "TDQS across the registry", June 2026, n =
15,036 servers / 228,369 tools):

| | frontier-mcp | Registry mean |
| --- | --- | --- |
| Overall server score | **4.23** | 3.56 |
| Description quality | **4.12** | 3.29 |
| Coherence | **4.50** | 4.18 |
| Per-tool mean | **4.33** | 3.57 (p75 = 4.2) |

The per-tool mean sits **above the registry's 75th percentile**. There is no quality gap.

### 2.4 The four failing checklist items, verbatim

> ⚠ **No recent usage** — "No tool usage detected in the last 30 days. Usage tracking helps
> demonstrate server value. *Tip: use the "Try in Browser" feature on the server page to seed initial
> usage.*"

> ⚠ **No glama.json** — "Add a `glama.json` file to provide metadata about your server."

> ⚠ **Author not verified** — "If you are the author, simply *authenticate using GitHub*. If the
> server belongs to an organization, first add `glama.json` to the root of your repository … Then
> *authenticate using GitHub*."

> ⚠ **No related servers** — "Add related servers to improve discoverability."

None of these four is an input to the quality score. All four are profile-completion items.

### 2.5 Two internal inconsistencies (observed)

- The page's "Has a Glama release" row reads **"Latest release: v0.2.1"**, while the Maintenance
  block reads "Last stable release on **August 13, 2026**" — which is `v0.3.0`'s date
  ([GitHub releases API](https://api.github.com/repos/51ck/frontier-mcp/releases); npm `latest` is
  `0.3.0`). One of the two is stale. **Inferred:** "Glama release" likely means a release Glama
  itself built successfully, which would mean the `v0.3.0` build has not been ingested — but Glama
  does not define the term, so this is a guess.
- The checklist says "No related servers", yet the server's Overview page already renders
  *"Related MCP server: brainforge-mcp"* and a "Related MCP Connectors" block. Glama auto-suggests
  them; the checkbox apparently wants a maintainer-curated list.

---

## 3. How the score refreshes

Glama gives **two different answers**, and they do not agree.

**On the `/score` page** (documented):
> "Servers are automatically synced **at least once per day**, but you can also sync manually at any
> time to instantly update the server profile. To manually sync the server, click the **"Sync Server"**
> button in the MCP server admin interface."

**On the methodology page, §1.8** (documented):
> "**Every new commit and every rebuild** triggers a full re-run of sections 1.2 through 1.6."

And §1.2: "The registry reflects the current state of the repository **within minutes of a push**."

Scoring itself is incremental and content-addressed: an `inputHash` over each tool's own definition
fields decides whether it is re-scored, so a commit that does not touch a tool definition costs no
LLM call and cannot move the score.

**There is a documented manual re-evaluation path** — the "Sync Server" button — but it lives in the
*MCP server admin interface*, which requires being the verified author. Author verification is itself
one of the failing checks, so the manual path is currently closed for this server. The daily sync is
not.

---

## 4. What the score is used for — and whether it moves discovery

This is where Glama's marketing claim and Glama's observable behaviour part company.

### 4.1 What Glama claims

Documented, TDQS README, "How Glama uses the scores":
> - "Every server's public listing includes a score page…"
> - "**Tool search ranks tools by TDQS among otherwise comparable matches**: well-described tools
>   surface first."
> - "The scores are available via the public API…"

And on the `/score` page: *"A complete profile improves this server's visibility in search results."*

### 4.2 What is actually observable

**The public API exposes no score at all.** `GET https://glama.ai/api/mcp/v1/servers/51ck/frontier-mcp`
returns exactly:

```json
{ "attributes": ["hosting:local-only"], "description": "…", "environmentVariablesJsonSchema": {…},
  "id": "mp5aptzvbk", "name": "frontier-mcp", "namespace": "51ck",
  "repository": {…}, "slug": "frontier-mcp", "spdxLicense": {…}, "tools": [], "url": "…" }
```

No score, no tier, no profile completion, no ranking. (`tools: []` is normal — an A-graded comparison
server, `docmancer/docmancer`, returns an empty `tools` array too. It is not evidence of a failed
build.) So the README's third bullet is, as of this date, **not true of the documented v1 API**.

**No sort order uses the score.** The listing's sort control offers exactly seven options (observed,
enumerated from the live DOM at <https://glama.ai/mcp/servers>):

> Search Relevance ↓ · Recent Usage ↓ · Date Added ↓ · Date Updated ↓ · Weekly Downloads ↓ ·
> GitHub Stars ↓ · Recent GitHub Stars ↓

Quality is **not** among them. There is no quality filter facet either. What *is* there is
**Recent Usage** — the one failing checklist item that maps to a real, user-selectable ordering, and
the one Glama tells you to seed yourself.

**The relevance ranker demonstrably ignores the grades.** Searching Glama for this server's *exact
name*:

<https://glama.ai/mcp/servers?query=frontier-mcp> — `51ck/frontier-mcp` ranks **7th of 20**.

The six results above it merely contain the word "frontier" somewhere in their description. Among
them: `Jackson-DM/msp-tools-mcp` (**F** licence, B maintenance), `stephenpeters/conclave-mcp`
(**D** maintenance), `lesonky/gcp-diagrams-mcp-server` (**D** maintenance, last updated a year ago),
and `rasvan-ghiliciu/test_mcp` (**F** licence, C maintenance). frontier-mcp carries straight
**A / A / A** (licence / quality / maintenance) and still loses to all of them on its own name.

**Inference, clearly labelled:** an exact-name match placing seventh behind F-licence and D-maintenance
servers is strong evidence that neither the quality score nor profile completion is a meaningful term
in the relevance ranker. It does not prove the weight is exactly zero. But it does mean the claim
"a complete profile improves this server's visibility in search results" is unfalsifiable marketing
copy that the observable ranking actively contradicts.

### 4.3 What the score *is* genuinely used for

- **A visible grade triple on every listing card** — `A license / A quality / B maintenance` is
  rendered on each result. This is real: it is the one place the score reaches a human eye.
- **Badges** — `/badges/score.svg` and `/badges/card.svg` are offered for the README. The score badge
  renders three green marks plus a right-hand panel; it carries **no `<text>`, `<title>` or
  `aria-label`** element (observed by inspecting the SVG), so it is inaccessible to screen readers.
- **Tool-level search** at `/mcp/tools`, per the README claim. Not independently verified here.

### 4.4 The real discovery gate is not the score

Documented, methodology §1.3 — and far more consequential than anything on the score page:

> "If the AI-inferred Dockerfile fails to produce a working build, the server's profile page is
> preserved but **distribution is withheld: the server does not appear in search results, category
> listings, or recommendations**. Listings only become discoverable once a reproducible build succeeds."

This repo ships **no Dockerfile** (`git ls-files` finds none). Glama therefore inferred one. It
evidently worked — Glama introspected and scored all 8 tools, which requires a running server, and
the server does appear in search results. So the gate is currently passed. But it is passed on a
Dockerfile *Glama guessed*, which is a silent dependency: a change to the build (a Node version bump,
a pnpm pin) could break the inferred build and drop the server out of search entirely, with the score
page still sitting there looking healthy. **That is a bigger discovery risk than any checkbox on the
page** — and checking the four boxes does nothing about it.

---

## 5. Gameability

Glama publishes a straightforwardly good improvement guide (TDQS README, "Improving your score"):
state purpose in one specific sentence; say when *not* to use the tool and name the alternative;
declare MCP annotations; describe parameters in the schema; provide an output schema; cut anything
that restates the schema. Every one of those is real advice that helps real agents. The quality half
of this system is **not** a vanity metric — it measures something that matters, using inputs an agent
actually sees, with a published rubric and a deterministic aggregation.

The profile-completion half is a different animal:

| Item | Gameable? | Reflects quality? |
| --- | --- | --- |
| Recent usage | **Entirely.** Glama's own tip is to self-click "Try in Browser" | No — measures traffic *on Glama*, and Glama tells you to fake it |
| glama.json | Trivially — it is a 4-line file whose only required key is `maintainers` | No — pure directory plumbing |
| Author verified | It is an OAuth click | Weakly. Verifying provenance is legitimate; it says nothing about the code |
| Related servers | Entirely — you pick them | No |
| TDQS / Coherence | Hard to game without actually writing better descriptions | **Yes** |

The `glama.json` schema is the whole story on how much it carries
(<https://glama.ai/mcp/schemas/server.json>):

```json
{"properties":{"maintainers":{"items":{"type":"string"},"type":"array"}},
 "required":["maintainers"],"type":"object"}
```

One key. It is a claim-of-ownership token, not metadata.

One structural note in Glama's favour: TDQS is **derived from the live `tools/list` output**, not from
a self-declared manifest. You cannot inflate it by writing a nicer README. To move it you must edit
the descriptions the agent actually receives — which means the only way to game TDQS is to do the
thing you wanted done anyway.

---

## 6. Traffic and adoption — the honest answer

**There is no primary evidence that Glama sends this server any traffic, and Glama publishes no
visitor numbers at all.**

What Glama does publish is scale of *its own crawling*, not of its audience:

- "over one million such scans" in the preceding twelve months (methodology, opening + §1.8)
- **75,396** servers in the registry (page title, <https://glama.ai/mcp/servers>, observed
  2026-08-20; a search-engine cache of the same page from days earlier read 74,529 — roughly +870 in
  the gap, so the registry is growing ~100–150 servers/day)
- 15,036 servers / 228,369 tools scored as of June 2026 (TDQS README)

None of that is audience. A registry of 75k servers with ~150 added daily is a corpus, and being one
undifferentiated row in it is the realistic prior.

Glama's own signal for this server says the same thing: **"No tool usage detected in the last 30
days."** That is Glama telling us, in its own instrumentation, that its platform has sent this server
zero sessions.

**npm is the only adoption instrument that exists here**, and it reads as essentially zero external
uptake (<https://api.npmjs.org/downloads/range/last-month/frontier-mcp>, fetched 2026-08-20 — 586
downloads in 30 days):

```
2026-07-21 … 2026-08-07   0/day        (pre-first-publish)
2026-08-08   116          ← v0.1.0 published
2026-08-09     7
2026-08-11   276          ← v0.2.0 + v0.2.1
2026-08-13   143          ← v0.3.0
2026-08-14 … 08-19   0–8/day
```

Every meaningful number is a publish-day spike — CI, registry replication, and mirror bots. The
inter-release baseline is 5–8/day, consistent with the author's own `npx` invocations plus mirrors.
GitHub corroborates: **0 stars, 0 forks, 0 watchers, 0 open issues**, no description, no topics
(<https://api.github.com/repos/51ck/frontier-mcp>).

**Inference, labelled:** with no external adoption on the instrument that *would* show it (npm), a
directory profile is not the binding constraint. Nothing on the Glama page is what is standing
between this server and users.

*Secondary source, flagged:* the "260% more often" tool-selection claim that motivates TDQS comes from
two arXiv preprints Glama cites — ["MCP Tool Descriptions Are Smelly!"](https://arxiv.org/abs/2602.14878)
(856 tools / 103 servers) and ["From Docs to Descriptions"](https://arxiv.org/abs/2602.18914) (10,831
servers). These are third-party preprints, not Glama primary material, and were not independently
read for this memo. They are cited only because Glama's rubric weights derive from them.

---

## 7. Cross-check: each gap against the actual repo

Blunt verdicts, in the three buckets asked for.

### 7.1 Directory busywork — no value outside Glama

**`glama.json`.** A four-line file listing `51ck` as maintainer. Its only function is to let Glama
tie the repo to a GitHub identity. Adds a config file to the repo root for a third party's benefit.
**Zero value outside Glama.** ~2 minutes if you want it.

**Related servers.** Curating a list of other people's MCP servers to display on someone else's
directory page. **Zero value outside Glama.**

**"No recent usage".** The remedy Glama offers is to click your own server in their browser sandbox.
Doing that manufactures a number that then feeds the "Recent Usage" sort — the one sort that might
actually matter. **This is the only item where gaming has any mechanical payoff, and it is exactly
the item that would be dishonest to game.** Do not. The honest read is the correct one: nobody uses
this yet.

**Author verification.** A GitHub OAuth click. Mildly defensible — it proves provenance, unlocks the
"Sync Server" button, and appears to be a precondition for the `author:official` attribute that every
server on Glama's front page carries. But it buys nothing outside Glama, and given §4.2 there is no
evidence the attribute moves ranking either. **Near-zero value; near-zero effort.** Only worth doing
if the account is being claimed for some other reason.

### 7.2 Already true, just not detected — or detected wrong

**"Naming Consistency 4/5 — `spec` is a noun, not verb_noun."** Correct observation, wrong
conclusion. `spec` is a get-or-put on one document; naming it `get_spec` would be a lie (it writes)
and `get_or_put_spec` is worse. `update_ticket` vs `create_tickets` is singular/plural *because* one
edits exactly one Ticket and the other publishes a batch — the number is load-bearing, and
`src/tools/update-ticket.ts` enforces it. **Not a defect. Ignore.**

**"Completeness 4/5 — no `create_effort`, no delete operations."** The absence is deliberate:
`create_tickets`, `edit_map` and `spec` all take `create: true`, so Effort creation is a flag on the
first write rather than a ninth tool — README:"A repository with no `.scratch/` directory is not an
error." Deletion is deliberately absent from a tracker whose Tickets are the audit trail. Glama's own
justification even hedges: *"or perhaps intentionally omitted."* **Not a defect. Ignore.**

**"CI status not available."** `.github/workflows/release.yml` exists but is a `workflow_dispatch`
release job, not a push-triggered CI check, so there is no commit status for Glama to read. Whether
that is worth changing is a CI question with nothing to do with Glama — noted, not recommended here.

**"Has a permissive license (MIT) — A".** This one Glama got **wrong in our favour**, and it hides a
real gap. See below.

### 7.3 Real gaps worth fixing on their own merits

**(a) There is no LICENSE file.** `git ls-files` matches nothing licence-shaped, and
`GET https://api.github.com/repos/51ck/frontier-mcp` returns **`"license": null`**. Glama's A-grade
came from `package.json:6` (`"license": "MIT"`) or the README's `## License / MIT` line — not from
GitHub's licence detection, which sees nothing.

Consequences that have nothing to do with Glama: GitHub shows no licence in the sidebar or API, so
automated licence scanners at any prospective adopter's company read this as unlicensed; the npm
tarball ships no licence text (`package.json:11-14` includes only `dist` and one doc file); and an
SPDX string in a manifest is a declaration, not a grant. **This is the single most valuable item in
this document, it is invisible to Glama, and it costs one file.** Effort: 2 minutes.

**(b) Five mutating tools misdeclare their behaviour under the MCP spec.** `src/server.ts` declares
`readOnlyHint: true` on the three readers and `{readOnlyHint: false, idempotentHint: false}` on
`create_tickets`, `update_ticket`, `edit_map`, `spec`, `migrate_effort` (lines 160, 179, 203, 219,
247, 300, 350, 378). `destructiveHint` and `openWorldHint` are never set anywhere in `src/`.

Per the MCP schema
([schema/2026-07-28/schema.ts, `ToolAnnotations`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts)):

> `destructiveHint` — "If true, the tool may perform destructive updates… If false, the tool performs
> only additive updates. **Default: true**"
>
> `openWorldHint` — "If true, this tool may interact with an 'open world' of external entities…
> **Default: true**"

So every client is currently told that `create_tickets` — which is purely additive — is
**destructive**, and that a server which touches only local files under `.scratch/` interacts with an
**open world**. Both are false. Clients that gate confirmation prompts on `destructiveHint` will
over-prompt on the additive path, which is precisely the friction this server exists to remove.
Fixing it is four object literals. It also happens to lift Behavioral Transparency — the
lowest-scoring dimension registry-wide (mean 2.90) and worth 20% — but that is a side effect, not the
reason. Effort: ~15 minutes including tests.

**(c) No tool declares an `outputSchema`.** `grep` finds zero occurrences in `src/`. This is the
single most-repeated remark across all eight tool score breakdowns — "since there is no output
schema", "the absence of an output schema is mitigated by…", "no output schema means…" — and it is
the reason `list_efforts` and `get_board` sit at 3.8/3.9 while everything else clears 4.1.

Unlike the checkbox items, this is a genuine spec feature with genuine value
([spec, Tools §Output Schema](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)):

> "If an output schema is provided: Servers **MUST** provide structured results that conform to this
> schema. Clients **SHOULD** validate structured results against this schema."

The spec lists the payoff as strict validation, type information, and better parsing by clients and
LLMs. For this server the honest case is narrower: the returns are Markdown-shaped board and ticket
renderings meant to be *read* by an agent, and `get_board`'s output is deliberately a compact prose
line per Ticket. Forcing that into `structuredContent` may be genuine work for modest gain, and the
board format is still settling (README: "Pre-1.0… the on-disk conventions are still being settled").
**Real, but not urgent — and a design question in its own right, not a score fix.** Effort: hours,
per tool. Worth its own Ticket if it happens; worth deferring past 1.0 otherwise.

---

## 8. Recommendation

**Ignore the Glama score. Do (a) and (b) below because they are correct, not because Glama counts
them — it does not count either one.**

Ranked by (value outside Glama) ÷ (effort):

| # | Item | Value outside Glama | Effort | Moves Glama score? | Do it? |
| --- | --- | --- | --- | --- | --- |
| 1 | **Add a `LICENSE` file (MIT)** | **High** — GitHub/npm/scanners currently see no licence grant | 2 min | **No** (already scored A) | **Yes** |
| 2 | **Declare `destructiveHint` / `openWorldHint`** on the 5 writers | **High** — clients are being told two false things about this server | ~15 min | Yes, incidentally | **Yes** |
| 3 | Add `outputSchema` + `structuredContent` | Medium — real spec feature, but the returns are prose-shaped by design | Hours | Yes (the biggest lever) | **Defer** — own Ticket, post-1.0 |
| 4 | Push-triggered CI status | Low-medium — a CI question, unrelated to this memo | — | Cosmetic | Out of scope |
| 5 | GitHub author verification | Near-zero | 1 min | Yes | Optional, only if claiming the listing anyway |
| 6 | `glama.json` | Zero | 2 min | Yes | No |
| 7 | Related servers | Zero | 10 min | Yes | No |
| 8 | Seed usage via "Try in Browser" | **Negative** — manufactures a false adoption signal | 1 min | Yes | **No** |

**Why not optimize.** The quality score is already **A / ≈4.2**, above the registry's 75th percentile,
and the four unchecked boxes measure directory hygiene rather than quality. The score does not appear
in Glama's public API, does not drive any user-selectable sort, and an exact-name search puts this
server *seventh, behind F-licence and D-maintenance servers*. The remaining checkbox that plausibly
touches discovery — recent usage — can only be moved honestly by having users, and npm says there are
none. Directory placement is not the binding constraint on adoption; there is nothing to unblock.

**One thing genuinely worth watching**, and it is not on the score page: discoverability depends on
Glama's *AI-inferred Dockerfile* continuing to build (methodology §1.3 — a failed build silently
withholds the server from search, category listings and recommendations). If Glama listing ever does
matter, committing a real Dockerfile removes that silent dependency. That is a far better use of
Glama-directed effort than any checkbox here — and it is still not worth doing today.

---

## Appendix: sources

**Glama (primary).**
[Score page](https://glama.ai/mcp/servers/51ck/frontier-mcp/score) ·
[Server overview](https://glama.ai/mcp/servers/51ck/frontier-mcp) ·
[Methodology](https://glama.ai/mcp/methodology) ·
[TDQS specification](https://github.com/glama-ai/tool-definition-quality-score) ·
[TDQS rationale post](https://glama.ai/blog/2026-04-03-tool-definition-quality-score-tdqs) (linked, not read) ·
[glama.json schema](https://glama.ai/mcp/schemas/server.json) ·
[Registry API](https://glama.ai/api/mcp/v1/servers/51ck/frontier-mcp) ·
[Attributes API](https://glama.ai/api/mcp/v1/attributes) ·
[Server listing + sort control](https://glama.ai/mcp/servers) ·
[Name search](https://glama.ai/mcp/servers?query=frontier-mcp) ·
[Release notes](https://glama.ai/release-notes)

**MCP (primary).**
[Tools specification, rev 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) ·
[`ToolAnnotations` in schema.ts](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts)

**This repository (primary).**
`package.json:6` (licence string) · `package.json:11-14` (published files) ·
`src/server.ts:160,179,203,219,247,300,350,378` (tool annotations) · `src/tools/*.ts` ·
`README.md` · `.github/workflows/release.yml` · absence of `LICENSE`, `Dockerfile`, `outputSchema`

**Registries (primary).**
[GitHub repo API](https://api.github.com/repos/51ck/frontier-mcp) ·
[GitHub releases API](https://api.github.com/repos/51ck/frontier-mcp/releases) ·
[npm registry](https://registry.npmjs.org/frontier-mcp) ·
[npm downloads](https://api.npmjs.org/downloads/range/last-month/frontier-mcp)

**Secondary, flagged in §6.** Two arXiv preprints cited by Glama as the empirical basis for the TDQS
weights ([2602.14878](https://arxiv.org/abs/2602.14878), [2602.18914](https://arxiv.org/abs/2602.18914)).
Not independently read. No primary source exists for Glama's audience size — Glama publishes scan
counts and registry size, never visitors.
