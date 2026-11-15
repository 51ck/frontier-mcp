# Search over Tickets

Date: **2026-11-13**. Ticket: **Tqlzf8v** (Which kinds of search over Tickets earn a place in the
tool surface, Effort `frontier-v1`,
[`68-Tqlzf8v-…`](../../.scratch/frontier-v1/issues/68-Tqlzf8v-which-kinds-of-search-over-tickets-earn-a-place.md)).
Related: `Tik4z0t` (Board filters and a cross-Effort read), `Tvndqat` (partial body reads).

Answers: which kinds of search an agent consuming FrontierMCP needs, what each should return, and
which are worth building under eight tools and a cached scan that holds no prose. This is evidence
and a recommendation for the decision. It does not make it.

> **Dated snapshot, not a contract.** Per the `docs/research/` rule in [AGENTS.md](../../AGENTS.md),
> this records what primary sources said and what ran on this machine on its date. Do not update it
> in place. The prior-art section expires first: three of the five products surveyed changed their
> search behaviour within the last year, and every upstream file was read at the tip of its default
> branch, not at a pinned commit.

Every claim below is marked one of three ways:

- **[sourced]** — a primary source said it; the URL follows. All URLs were fetched on 2026-11-13.
- **[measured]** — it ran here; the method is in [What was examined](#what-was-examined).
- **[inference]** — my reasoning from the other two. Nothing was run or read to confirm it.

## What was examined

- **FrontierMCP** at commit `0121fe61890135f50e4c8dfade9722289b14f77d` (`master`, v1.0.0), with the
  working tree's eight uncommitted Tickets included in the tracker data.
- **This repository's `.scratch/`**, copied to a temporary directory so nothing was served from the
  working tree: 116 Tickets in 8 Efforts, 510,786 bytes of Ticket files; 84 resolved, 30 open,
  2 dropped.
- **A throwaway script**, kept outside the repository and not committed. It did two things:
  - timed a body search: walk every `issues/` directory, read every Ticket file, lowercase it, test
    `includes(needle)`. 5 warm-up runs, then n=30. Run once normally and once under `taskpolicy -b`
    (background QoS, the efficiency cores), the same method the scan-cost paragraph in AGENTS.md
    Work Guidance uses;
  - sized results: called the real `list_efforts` and `get_board` through an in-process MCP client,
    as `test/support/harness.ts` does, and rendered a hypothetical search result for eleven
    queries. The hypothetical renderer split each file at its fence with a regular expression and
    read `title`, `answer_gist` and `dropped_reason` by line, which is cruder than the driver's
    parser; its hit counts are indicative, not exact.
- **Machine**: Node v24.15.0, darwin arm64, Apple M4 Pro, 12 cores, 24GB. **This is the fast end.**
  No run was OS-cold; the page cache was warm for every one.
- **Token counts** use the repository's own convention, bytes divided by four
  (`test/support/tokens.ts`).
- **Prior art** was read from upstream READMEs, source files, generated CLI references, a published
  GraphQL schema and vendor documentation pages. No blog post or summary was used.

## 1. The needs

Three different operations hide under the word "search". A **field filter** selects Tickets by a
value the cached scan already holds. A **graph query** follows Edges, forward or reverse, and also
needs only the cached scan. A **text search** matches a string against prose, and splits again by
whether that prose is a summary field the scan holds (`title`, `answer_gist`, `dropped_reason`) or a
body the scan deliberately does not hold. The split decides cost: the first three are free against
the cache, the last reads every Ticket file.

| # | Need | Agent task behind it | Kind | Needs bodies |
| --- | --- | --- | --- | --- |
| 1 | Is there already a Ticket for this? | Filing friction (`frontier-consumer.md` step 3), `/to-tickets`, `/triage` | Field filter first, then text | Sometimes |
| 2 | Was this already decided? | `/wayfinder` before raising a question; a builder checking a constraint | Text over gists, then over answers | Sometimes |
| 3 | Which Tickets mention this path, symbol, error string or PR? | Touching a file and wanting its history; reviewing a diff | Text, literal | Always |
| 4 | What does resolving this Ticket unblock? | Choosing among takeable Tickets; reporting after a resolve | Graph query, reverse Edge | No |
| 5 | What refers to this Ticket in prose? | Renumbering a duplicate id; dropping a Ticket others cite | Text, literal, query is an id | Always |
| 6 | Which Tickets have Status / kind / Triage role X? | Overnight shipping; a triage sweep | Field filter | No |
| 7 | Which claims are stale, or held by X? | Recovering after a crashed session | Field filter | No |
| 8 | What changed since X? | Resuming after time away | Neither; see below | No |

Notes on each, all **[inference]** unless marked.

**Need 1 is mostly not a text search.** The duplicate that matters is an *open* Ticket covering the
same friction, and there are 30 open Tickets in this repository **[measured]**. Their titles total
about 2.2KB **[measured]**. A cross-Effort read narrowed to open Tickets, which is what `Tik4z0t`
asks for, puts all thirty titles in front of the calling model for well under a thousand tokens, and
the model reading thirty titles is a better paraphrase matcher than any index this server could
build. Text search is the second step, for the case the Ticket names: a friction already filed and
since *resolved*, where the consumer should comment or reopen and the 84 resolved lines are too many
to read.

**Need 2 has its cheap half already indexed.** `answer_gist` is required on every resolved Ticket
and is in the cached scan. A text match over gists costs no I/O. The expensive half is a decision
whose gist does not use the searcher's word but whose `## Answer` does.

**Need 3 is body-only by nature.** Of eleven queries tried, the three reference-shaped ones
(`src/storage/markdown/watcher.ts`, `T99`, `sqlite`) had zero hits in summary fields and 4, 3 and 2
hits in bodies **[measured; the renderer did not match on a Ticket's own id, so `T99` counts
mentions only]**. Nobody writes a file path in a title.

**Need 4 has no route today.** Neither `get_tickets` nor `update_ticket` renders reverse Edges
**[measured: no occurrence of a dependents or unblocks rendering in either tool module]**. 49 of
116 Tickets have at least one dependent and the most any has is 4 **[measured]**, so the answer is
always short.

**Need 5 is need 3 with an id as the query**, and it is where prose and graph diverge: 326
Ticket-to-Ticket pairs here mention another Ticket's id in body prose **[measured, by word-boundary
regex over ids beginning `T`]**, far more than there are Edges. That is expected, since Edges mean
"must finish first" and prose means "see also". It is a reason to keep the two as separate
operations and not to promote prose mentions into the graph.

**Needs 6 and 7 are `Tik4z0t`'s**, not this Ticket's. They are listed so the taxonomy is whole and
because text search has to compose with them: "resolved Tickets mentioning the watcher" is a filter
and a match in one call.

**Need 8 should be left unserved.** The schema holds no creation or update time; `claimed_at` is the
only timestamp, and `TicketSummary.revision` is opaque above the seam by contract. `git log --
.scratch/` already answers it exactly, with authorship. Serving it here means either a new
frontmatter field every write must maintain, or parsing a token the seam says may not be parsed.
No capture shows an agent wanting it.

Needs considered and not listed: searching Specs and Maps (low volume, read whole, and
Decisions-so-far is the gists again); finding Tickets with unticked criteria (a structural body
query with no capture behind it); and batch near-duplicate detection across all pairs, which Beads
ships as `bd find-duplicates` and which is a maintenance sweep, not something an agent mid-task
asks.

## 2. Prior art

### GitHub MCP server and GitHub issue search

- The server exposes two issue-reading tools that take a query. `list_issues` filters one repository
  by `state`, `labels`, `since`, `field_filters`, with `orderBy`, `direction`, cursor pagination
  (`after`) and `perPage` (min 1, max 100). `search_issues` takes `query`, optional `owner` and
  `repo`, `sort`, `order`, `page`, `perPage` (max 100). **[sourced:
  https://github.com/github/github-mcp-server/blob/main/README.md]**
- **Results are full records unless the caller trims them.** Both tools take `fields`, "Subset of
  fields to return for each issue. If omitted, all fields are returned", and the description says
  omitting `body`, `reactions` and `labels` "drops the largest per-result data". The default is the
  expensive shape; economy is opt-in. **[sourced: same README]**
- **`search_issues` is semantic by default on github.com.** The source registers the tool in
  semantic mode and falls back to lexical only for GitHub Enterprise Server, and swaps the tool and
  argument descriptions to match, with the comment that "semantic rewards paraphrased natural
  language and degrades on boolean operators, while lexical needs the caller's literal keywords".
  The semantic `query` description tells the caller to "include [alternative wordings] as plain
  words rather than joining them with OR". **[sourced:
  https://github.com/github/github-mcp-server/blob/main/pkg/github/issues.go and
  `pkg/github/search_utils.go` in the same repository]**
- The REST endpoint behind it documents `search_type` as `semantic` ("a pure semantic (vector)
  search") or `hybrid`, defaulting to lexical, authenticated only, and "rate limited to 10 requests
  per minute". It returns "up to 1,000 results for each search", refuses queries "longer than 256
  characters (not including operators or qualifiers)", and offers a `text-match` media type that
  returns matched fragments with offsets. **[sourced:
  https://docs.github.com/en/rest/search/search]**
- Whether the MCP server requests `text-match` fragments was **not established**. No reference to it
  appears in `search_utils.go` or `search_tool_types.go`; the rest of the package was not searched.
- Lexical qualifiers relevant here: `in:title`, `in:body`, `in:comments` to scope the text match;
  `state:`, `reason:completed` and `reason:"not planned"`; `linked:pr`; `updated:` with date ranges.
  **[sourced:
  https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests]**

### Linear

- The API has two distinct mechanisms. **Filtering** is structured: per-field comparators including
  `contains`, `containsIgnoreCase` and their negations on strings, date and numeric comparators, a
  null test, and filters across relations (`labels: { every: … }`, `comments: { body: { contains:
  … } }`). **[sourced: https://linear.app/developers/filtering]**
- **Search** is separate: `searchIssues(term, filter, includeComments, first, after, orderBy,
  teamId, …)`. `term` is 1 to 1024 characters and "search combines text matching with relevance by
  meaning". `includeComments` defaults to false. `first` is "between 1 and 250" and "defaults to
  50". `totalCount` is documented as "not an exact count of all matching issues" because "search
  caps candidates". **[sourced:
  https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql]**
- **Linear's MCP server: tool names and arguments not verified.** The documentation page says the
  hosted server "has tools available for finding, creating, and updating objects in Linear like
  issues, projects, and comments" and lists no schemas. **[sourced: https://linear.app/docs/mcp]**
  The schemas are served only to an authenticated client, and none was connected for this work.

### Jira through Atlassian's MCP server

- The server groups tools by intent. `search_jira` holds `searchJiraIssuesUsingJql`, "Search Jira
  work items using JQL". `search_atlassian` holds `search`, marked Beta and Enriched: "Semantic
  search across Jira, Confluence, and connected apps using natural language, through Rovo", with a
  note that enriched calls cost Rovo credits. **[sourced:
  https://support.atlassian.com/atlassian-rovo-mcp-server/docs/supported-tools/]**
- Atlassian's own advice to agents is to cap results: "**MUST** use `maxResults: 10` or `limit: 10`
  for ALL Jira JQL and Confluence CQL search operations". **[sourced:
  https://github.com/atlassian/atlassian-mcp-server/blob/main/README.md]**
- JQL text search is the `~` (CONTAINS) operator on text fields, with `text ~ "some words"` as the
  all-text-fields form. It is tokenized, not substring: `summary ~ win` matches "simple derivatives
  of that word, such as 'wins'", and a trailing `*` is a wildcard. **[sourced:
  https://support.atlassian.com/jira-software-cloud/docs/jql-operators/]**
- **Not verified**: the argument schema and default result fields of `searchJiraIssuesUsingJql`
  (the supported-tools page describes tools, not their inputs), and JQL's link-traversal functions,
  which were looked for in the functions page extract and not found by the search used.

### Beads

The closest design to this one: a dependency graph with a computed ready set, built for agents.
`steveyegge/beads` now resolves to `gastownhall/beads` **[sourced:
https://api.github.com/repos/steveyegge/beads returns `full_name: "gastownhall/beads"`]**. All
paths below are in that repository at `main`.

- **CLI text search is narrow and substring.** `bd search` searches "across title and ID (all
  statuses, including closed)"; description and notes are separate opt-in flags,
  `--desc-contains` and `--notes-contains`, each "substring (case-insensitive)". Default limit 50.
  **[sourced: `docs/cli-reference/search.md`]**
- **It states the failure this Ticket is about.** "Closed issues are included by default so 'was
  this already filed/fixed?' cannot silently answer no. Matches beyond `--limit` are dropped
  status-blind". **[sourced: same file]**
- **Structured filtering is a separate command with its own small language.** `bd query` takes
  `field=value` comparisons with `AND` / `OR` / `NOT` over status, priority, type, assignee, label,
  dates, parent, and `title` / `description` / `notes` as "contains". **[sourced:
  `docs/cli-reference/query.md`]**
- **Reverse edges are first-class.** `bd dep list <id> --direction=up` shows "what depends on this
  issue"; `bd dep tree` takes `down`, `up` or `both`, with a depth limit defaulting to 50.
  **[sourced: `docs/cli-reference/dep.md`]**
- **Duplicate detection is a batch command, mechanical by default.** `bd find-duplicates`
  "tokenizes titles and descriptions, then computes Jaccard similarity between all issue pairs";
  `--method ai` "requires ANTHROPIC_API_KEY, MINIMAX_API_KEY, or ai.api_key" and pre-filters
  mechanically first. The doc concedes the mechanical method "may miss semantically similar issues
  with very different wording". **[sourced: `docs/cli-reference/find-duplicates.md`]**
- **Staleness** is `bd stale`, "issues not updated in this many days (default 30)", limit 50.
  **[sourced: `docs/cli-reference/stale.md`]**
- **The MCP server exposes none of the search commands as tools.** Its tools are `discover_tools`,
  `get_tool_info`, `context`, `ready`, `list`, `show`, `create`, `claim`, `update`, `close`,
  `reopen`, `dep`, `comment`, `comments`, `note`, `stats`, `blocked`, `admin`. Text search reaches
  an agent as one argument on `list`: `query`, "Search in title (case-insensitive substring)".
  **[sourced: `integrations/beads-mcp/src/beads_mcp/server.py`]**
- **Its result economy is the most developed of the five.** `list` defaults to 20 results and
  `ready` to 10 (both 1 to 100). Results are a "minimal issue format"; above a compaction
  threshold of 20 the server returns a `CompactedResult` with `total_count`, a 5-item preview and a
  hint to narrow. Callers can ask for `brief` (id, title, status), a `fields` projection, or
  `max_description_length`. `show` returns one issue with both `dependencies` and `dependents`.
  **[sourced: same file]**

### Backlog.md

A markdown-file tracker with its own MCP server. Paths are in `MrLesk/Backlog.md` at `main`.

- Two tools carry text search. `task_search` takes `query` (max 200 characters), `status`, `type`,
  `priority`, `modifiedFiles` ("case-insensitive substring match against modified file paths") and
  `limit` (1 to 100). `task_list` takes the structured filters plus `search`, `ready` ("all
  dependencies satisfied/completed") and `limit` (1 to 1000). **[sourced:
  `src/mcp/utils/schema-generators.ts`, `src/mcp/tools/tasks/index.ts`]**
- **Matching is fuzzy, through Fuse.js**, threshold 0.35, `ignoreLocation: true`, weighted keys:
  title 0.35, body text 0.3, id 0.2, modified files 0.15, id variants 0.1, dependency ids 0.05.
  **[sourced: `src/utils/task-search.ts`]**
- **The index is built per call.** The handler loads every task and calls
  `createTaskSearchIndex(tasks)` inside `searchTasks`; nothing is kept between calls. **[sourced:
  `src/mcp/tools/tasks/handlers.ts`]**
- **Results are summary lines, never bodies and never excerpts**: `Tasks:` then one line per task
  with priority, type, id, title, status and an acceptance-criteria summary. A limit silently
  slices; no count of what was cut is rendered. **[sourced: same file]**
- A file path gets its own structured argument (`modifiedFiles`) because tasks record the files
  they changed in a field. That is need 3 answered by schema instead of by text search.

### Not surveyed

No further markdown-file tracker with an MCP server was examined. The brief asked for "any other …
you find"; none was looked for beyond Backlog.md, so the absence of others here is not a finding.

### What the prior art agrees on

All **[inference]** from the above.

1. **Text search is an argument on the list operation as often as it is a tool.** Beads' MCP server
   and Backlog.md's `task_list` both do it. That is the only shape open under eight tools, and it
   is not an exotic one.
2. **Filter and search are kept apart** in every product (GitHub `list_issues` / `search_issues`,
   Linear filtering / `searchIssues`, JQL fields / `~`, Beads `query` / `search`), and then made
   composable.
3. **The local, file-backed tools use substring or fuzzy matching and no index.** The hosted ones
   have moved to semantic search. The dividing line is infrastructure and corpus size, not the
   needs of the caller.
4. **Nobody local returns excerpts.** Beads and Backlog.md both return summary lines and send the
   agent to a `show` call. GitHub's API offers match fragments; whether its MCP server passes them
   on is unverified.
5. **The agent-specific tools cap hard and say so.** Beads previews 5 of N with an exact total;
   Atlassian tells agents to ask for 10. The general-purpose defaults (GitHub 100 maximum, Linear
   50 default) are an order of magnitude looser and return bodies.
6. **Searching closed work by default is a stated design choice**, in the one tool that explains
   itself.

## 3. Matching technique

Costs are against this codebase. The runtime closure is three packages and AGENTS.md states that as
a value; the cache holds no prose by design; the server is commonly launched by `pnpm dlx`, so
install size is start-up time.

| Technique | Dependencies | Index and staleness | Serves which need better than substring |
| --- | --- | --- | --- |
| Case-insensitive substring | None | None. Bodies read fresh per query, as `readTickets` already does | Baseline |
| Regular expression | None | None | Need 3, marginally: symbol variants in one call |
| Tokenized with ranking (BM25) | One package, or hand-written | Needs every body in memory, or a rebuild per query | Needs 1 and 2, only when hits exceed the cap |
| Fuzzy (edit distance) | One package | Same as tokenized | None, for this caller |
| Embeddings | A model or an API key | A vector per Ticket, rebuilt on every body change | Need 1, paraphrase only |

**Substring.** 2.71ms median, 3.08ms p95 for a full walk, read and match of all 116 Tickets on
performance cores; 15.64ms median, 21.44ms p95 on efficiency cores **[measured, n=30 each]**. The
match itself is 0.43ms of the fast figure; the rest is opening files **[measured]**. It needs no
index, so there is nothing to go stale and nothing for the watcher to invalidate.

**Regular expression.** No faster and no slower in any way that matters here: 0.11ms against
0.43ms for the match step **[measured]**, both noise beside the file reads. What it buys is
alternation and anchoring in one call. What it costs is that a pattern is caller-supplied code
running on the server's only thread; a pathological one stalls every tool until it returns.
**[inference]** An array of literal alternatives buys the alternation without the risk.

**Tokenized with ranking.** `minisearch` 7.2.0 has no dependencies and unpacks to 827KB; `fuse.js`
7.5.0 has none and unpacks to 417KB **[sourced: https://registry.npmjs.org/minisearch/latest,
https://registry.npmjs.org/fuse.js/latest]**. Either would be a fourth package in a closure of
three. A persistent index means holding every body's tokens in memory, which is the thing the
`TicketSummary` / `Ticket` split exists to avoid; building it per query, as Backlog.md does, means
it only ever ranks. Ranking matters when there are more hits than the caller will read. At this
size, eight of eleven test queries returned 13 or fewer hits **[measured]**, and the caller can
narrow by Status or Effort. Tokenizing actively hurts need 3: `src/storage/markdown/watcher.ts`,
`T99`, `#52` and `ENOTDIR` are strings a tokenizer splits or stems, and they are the queries where
the caller wants exactly what it typed. **[inference]** Index memory and build time were not
measured.

**Fuzzy.** Edit-distance tolerance exists for humans who mistype. The caller here copies strings
out of its own context. What fuzzy matching adds for this caller is false positives, each one a
line of tokens, and it removes the property need 1 depends on: that "no match" means no match.
**[inference]**

**Embeddings.** Said plainly: **the calling agent does not need the server to do semantic search,
and this server should not offer it.** **[inference]**, on these grounds:

- The caller is a language model. Generating four phrasings of a query is the thing it is best at,
  and a second substring call costs about 3ms and a round trip. GitHub's own server concedes the
  mechanism when it tells callers to include alternative wordings as plain words **[sourced
  above]**; the semantic engine there is doing what the caller could have done.
- The hosted products that went semantic have corpora of thousands to millions of issues written by
  many people in many vocabularies. This corpus is about a hundred Tickets, written largely by
  agents, under a glossary (`CONTEXT.md`) that binds the words used.
- The paraphrase case that substring really does miss is need 1, and need 1 has a better answer
  than search: show the caller the thirty open titles and let it judge.
- The cost is disqualifying on its own. A local model is a download measured in tens of megabytes
  on a `pnpm dlx` cold start; a remote one is an API key in a server whose tools all declare
  `openWorldHint: false`, and Ticket bodies leaving the machine. Beads, which does offer an AI
  mode, makes it opt-in behind a key and still defaults to token overlap **[sourced above]**.

## 4. Cost against this codebase

**Time.** A body search has to read every Ticket file, because the cached scan keeps frontmatter
and no prose. For comparison, AGENTS.md Work Guidance (the paragraph beginning "A full workspace
scan costs 9–13ms") gives the driver's own scan and re-scan costs and the efficiency-core factor of
about six; those figures are that paragraph's and are not restated here. Against them:

| | Performance cores | Efficiency cores (`taskpolicy -b`) |
| --- | --- | --- |
| Walk, read, lowercase, substring match, 116 Tickets / 511KB | 2.71ms median, 3.08ms p95 | 15.64ms median, 21.44ms p95 |
| Match step alone, bodies already in memory | 0.43ms median | 2.37ms median |

**[measured]** Same machine and warm-cache caveat as everything else here. The slow-core factor is
about 5.8, in line with the one AGENTS.md reports for the scan. A body search is cheaper than a
scan because it parses nothing; it is the YAML parse, not the reads, that a scan spends its time on,
which is what AGENTS.md's `UV_THREADPOOL_SIZE=1` result says too.

Extrapolating linearly in bytes to 1000 Tickets gives roughly 23ms on performance cores and 135ms
on efficiency ones **[inference; not run]**. A summary-field search has no cost of its own: it is a
filter over the cached scan, which AGENTS.md prices at 0.01ms for a warm read.

**Tokens.** What the consumer does today against what a search would return:

| Read | Bytes | Tokens (bytes / 4) |
| --- | --- | --- |
| `get_board` on `frontier-v1` alone | 20,828 | ~5,200 |
| `get_board` on all 8 Efforts | 39,993 | ~10,000 |
| Every Ticket body, the `grep` fallback's reading matter | 510,786 | ~127,700 |
| Search result, summary fields only, per query | 13 – 1,045 | 3 – 260 |
| Search result, bodies included, capped at 20 hits with one excerpt line each | 13 – 4,084 | 3 – 1,020 |

**[measured]**, the last two rows from the hypothetical renderer described above, across the eleven
queries. The Ticket's own capture, three Boards at about 25,000 characters, sits between the first
two rows. Three points come out of the per-query numbers:

- **A specific query costs almost nothing.** `ENOTDIR` returned one Ticket in 107 bytes.
- **A summary-only search silently misses most hits.** `search` matched 1 Ticket by title or gist
  and 17 more by body only; `watcher` 4 and 13; `duplicate` 3 and 10; `token cost` 0 and 5
  **[measured]**. A title-only "no existing match" is the failure the Ticket describes, and a
  summary-only search tool would reproduce it faster.
- **A broad query hits the cap.** `claim` matched 49 Tickets. The cap is what bounds the cost, so
  the cap and its exact remainder count are part of the design, not a refinement.

**The excerpt is what makes a body hit usable.** Without it, the caller must fetch each hit's body
to learn whether the hit is relevant. Tickets here average about 4.4KB (510,786 / 116), so the 13
body-only hits for `watcher` are roughly 57KB of `get_tickets` output to triage, against 3.4KB for
the same hits rendered with one excerpt line each **[inference from measured sizes; the fetch was
not run]**.

## 5. Result shape

A proposal, checked against the rendering rules in AGENTS.md. All **[inference]**. The block below
is an illustration of the layout: the ids are real but the grouping, counts and excerpt text are
invented, not output of anything that ran.

```
3 match "watcher" in title, gist, dropped reason; 13 more in bodies
frontier-v1
  T99   On Linux a recent Node 24 watcher throw kills the server  build/resolved  gist=…
  T8    …
  T95   …
    body, ## Answer: …releases every driver's watcher before the process exits, so…
frontier-hive
  T29   …
    body, ## Question: …whether one watcher per process is the cost that…
(9 more in bodies, not shown; narrow with status, kind or effort)
```

- **A hit is the Board line, unchanged.** Same fields, same order, same `flat()` treatment as
  `renderLine`. The caller already knows how to read it, and the id on it is the argument to the
  next call.
- **Hits are grouped under their Effort**, one heading line each, because a cross-Effort result
  must say where each Ticket lives (`Tik4z0t`'s first criterion) and a heading is cheaper than a
  suffix on every line. The `T9@beta` form stays what it is today: the rendering of a foreign
  *blocker*, never of a hit, and never input.
- **A summary-field hit carries no extra line.** The matched text is already on the Board line; the
  title and the gist are both rendered there.
- **A body-only hit carries exactly one more line**: the section heading the match fell under, and
  one flattened excerpt of fixed width around the first match. The heading names the argument for a
  `Tvndqat` section read, so the next call can fetch the Answer alone.
- **The first line states what was searched and how many matched**, exactly, including the count in
  the place that was *not* searched when bodies were off. This is the line that keeps "no match"
  honest; it is Beads' "cannot silently answer no" made into output.
- **A cap of 20 hits, then one line with the exact remainder** and the arguments that narrow.
  Twenty is Beads' compaction threshold and close to where the measured results cross 1,000 tokens.
- **Ordering is deterministic, not ranked**: summary-field hits before body-only hits, and Board
  order (Effort, then sort order) within each. Two identical calls over unchanged files return
  identical text, the property the `migrate_effort` preview rule already insists on. Ranking by
  score would need a scorer, and a caller cannot reason about why line 3 beat line 4.
- **Resolved and dropped Tickets are searched by default.** Needs 1 and 2 are both about closed
  work. This is the opposite default from `Tik4z0t`'s Frontier narrowing, and the two compose: a
  Status filter narrows a search like any other Board.
- **Warnings stay grouped, and only those that bear on a listed Ticket are kept**, which is the
  rule `Tik4z0t` proposes for any narrowed Board. A hit whose id is duplicated still triggers the
  duplicate warning; an Effort-wide Foreign count for Tickets not in the result does not appear.

**One rule this bends, stated so it is decided and not slid past.** "A Board never carries a body"
is written as absolute, and an excerpt line is body prose on a Board-shaped result. The rule's
stated reason is cost and the way the read path is built: `listTickets` yields summaries, the cache
holds what a Board is built from, `readTickets` is the only route to a body. A bounded excerpt
respects all of that if it is built the same way: the search reads files fresh through its own seam
method, returns excerpts and never bodies, and caches nothing. But the sentence in AGENTS.md would
need amending to say so, and that is the maintainer's call. If the rule is held as written, the
fallback is the section heading with no excerpt, at the fetch-to-triage cost estimated in section 4.

## 6. Recommendation

Three things, in this order. All **[inference]**; the evidence each rests on is cited.

**1. Reverse Edges, with no new argument.** The `get_tickets` header gains a `blocks=` field
listing the Tickets that name this one in `blocked_by`, and an `update_ticket` `resolve` result
says which Tickets that resolve made takeable. Both come from the cached scan. This is need 4, it
is a graph query and not a search, it has no route today, and the answer is at most four ids long
here. It is first because it is the smallest change and does not depend on `Tik4z0t`. Beads' `show`
returning `dependents` is the precedent.

**2. `match` on `get_board`, over summary fields, built with `Tik4z0t` and not after it.**
`match` is a string or an array of strings; a Ticket hits when any of them occurs, case-insensitive
and literal, in its id, title, `answer_gist` or `dropped_reason`. It composes with the filters
`Tik4z0t` adds and requires its cross-Effort read (an omitted `effort`), plus one filter that
Ticket does not list: Status, so that "resolved only" is expressible. No I/O beyond the cached
scan. The array is the substitute for semantic search: the caller supplies its own synonyms in one
call. This serves the cheap halves of needs 1 and 2, and the first line of every result says that
bodies were not searched.

Before building it, settle need 1's real answer inside `Tik4z0t`: the consumer doc's "scan before
filing" step should become one cross-Effort read of open Tickets, with `match` as the follow-up
for closed ones. That change to `docs/agents/frontier-consumer.md` is worth more than the matcher.

**3. `bodies: true` on the same call.** With it, every Ticket file is read and matched, body-only
hits are added beneath the summary hits with their one excerpt line, and the first line reports
both counts. It should cross the seam as its own driver method that takes the terms and returns
handles with section and excerpt, not as `readTickets` over every handle: ADR 0001 says what a
driver holds and how it answers is one physical model's business, and a SQLite driver should be
free to answer from its own store. The contract above the seam has to pin the semantics to literal
case-insensitive substring, so that two drivers cannot disagree about what matches. This serves
needs 3 and 5 and the expensive halves of 1 and 2. It is last because it is the only one that
touches a rendering rule, adds a seam method and costs I/O, and because the measured miss rate of
summary-only search (section 4) is what justifies it; without it, item 2 alone would hand the
consumer a faster way to get the wrong answer.

**Leave out, and why.**

- **A ninth tool.** Settled by AGENTS.md, and the prior art shows search-as-an-argument is normal.
- **Embeddings and any semantic mode.** Section 3. The caller reformulates; the corpus is small and
  vocabulary-bound; the cost breaks the dependency closure, the cold start or the closed-world
  declaration.
- **Fuzzy matching.** It makes "no match" untrustworthy for a caller that does not mistype.
- **A tokenized index and relevance ranking.** A fourth dependency or a hand-written scorer, an
  in-memory copy of every body or a per-query rebuild, to solve an ordering problem the cap and the
  filters already bound at this size. Revisit at the volume AGENTS.md names as where scan cost
  starts to matter.
- **Regular expressions.** The array of literals covers the use; a caller-supplied pattern can
  stall a single-threaded server.
- **A query language.** `bd query`, JQL and GitHub qualifiers all exist because their callers are
  humans typing into one box. Here every filter is already a named, typed argument.
- **Recency ("what changed since").** No timestamp in the schema, an opaque revision, and `git log`
  answers it exactly.
- **Prose mentions as Edges, or a dedicated backlinks argument.** Need 5 is `match` with an id and
  `bodies: true`. Promoting 326 prose mentions into the graph would change what the Frontier means.
- **Batch near-duplicate detection.** A maintenance sweep with no capture behind it.
- **Search over Specs and Maps.** Low volume, read whole; Decisions-so-far is the gists again.
- **A `fields` projection or result paging.** The Board line is already the minimal shape, and a
  capped result with an exact remainder asks the caller to narrow, which is cheaper than a second
  page.

## What could not be verified

- **Linear's MCP tool names, arguments and result shape.** The public page lists none; schemas need
  an authenticated client.
- **The input schema and default fields of Atlassian's `searchJiraIssuesUsingJql`**, and JQL's
  link-traversal functions.
- **Whether GitHub's MCP server returns `text-match` fragments.** Not found in the two files read;
  the package was not searched in full.
- **Upstream commits.** Every GitHub-hosted file was read at the tip of its default branch on the
  date above. No commit hash was recorded, so a line cited here may have moved.
- **Other markdown trackers with MCP servers.** Not looked for beyond Backlog.md.
- **Index memory and build time** for a tokenized or fuzzy search, and **cold-start cost** of an
  added dependency under `pnpm dlx`. Reasoned about, not measured.
- **Search cost at 1000 Tickets**, which is a linear extrapolation, and anything OS-cold.
- **The hypothetical renderer's hit counts**, which come from a line-based read of frontmatter and
  would shift slightly under the driver's real parser, notably for multi-line gists.
