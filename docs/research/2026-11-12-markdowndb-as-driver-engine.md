# MarkdownDB as the markdown driver's engine

Date: **2026-11-12**. Ticket: **T29** (Is the scan cost worth sharing one driver across processes,
Effort `frontier-hive`,
[`01-T29-…`](../../.scratch/frontier-hive/issues/01-T29-is-the-scan-cost-worth-sharing-one-driver-across.md)).

Answers: could MarkdownDB be the engine inside the markdown storage driver, so that the driver holds
an indexed model of the `.scratch/` tree in place of its hand-written scan and cache, and what would
that change about the three costs T29 prices? This is evidence for the decision. It does not make it.

> **Dated snapshot, not a contract.** Per the `docs/research/` rule in [AGENTS.md](../../AGENTS.md),
> this records what primary sources said and what ran on this machine on its date. Do not update it
> in place. The maintenance findings in §1 expire first: they rest partly on the *absence* of a
> release, and an absence is only ever true as of a date.

## What was examined

- **FrontierMCP** at commit `c97c5d8268346e078d5222c8d8be9e8175280375` (branch `ids-round-2`), with
  `frontier-mcp@0.5.0` as published on npm for the install comparison.
- **MarkdownDB.** npm package **`mddb`**. `datopian/markdowndb` now redirects to
  **`flowershow/markdowndb`**: `gh api repos/datopian/markdowndb` returns `full_name:
  "flowershow/markdowndb"`. Two trees were read:
  - the published **`mddb@0.9.5`**, tag `v0.9.5` = commit `58e863c64f60d930015e3d4e854f2107376ffebf`
    (2024-03-07), which matches the registry's `gitHead`. This is what an install gets and what was
    benchmarked;
  - `main` at **`f53cfef49ffcd267fc200d2dc451ed6f37b4523a`** (2026-05-21), which is 35 commits ahead
    of the tag and unpublished. Source line references below are to `main` unless marked `v0.9.5`.
- Registry metadata from `https://registry.npmjs.org/mddb`. Repository, issues, PRs and releases via
  `gh`. Native-binding facts from `TryGhost/node-sqlite3` and `https://registry.npmjs.org/sqlite3`.
  `node:sqlite` status from `https://nodejs.org/docs/latest-v22.x/api/sqlite.json` and
  `…/latest-v24.x/api/sqlite.json`.
- **Machine:** Apple M4 Pro, 12 cores, 24 GB, macOS 27.2 (Darwin 27.2.0), darwin arm64, Node
  v24.15.0, npm 12.0.2, pnpm 12.15.0. Same-day `pnpm run bench:scan` core index **6.87ms**.
  [AGENTS.md](../../AGENTS.md) records 11ms on this machine's performance cores at the time of T19,
  so today's numbers are not directly comparable with the ones written there. Per the repo's own
  rule, this is the fast end of the hardware FrontierMCP runs on. §6 includes a slow-core run.

All harnesses were throwaway scripts in the session scratchpad, importing `mddb` by absolute path
from a separate install directory. None is committed. The scripts are described in §6 with enough
detail to rebuild them.

## Headline

MarkdownDB is a **read-only indexer for publishing sites**. It parses each file into a full remark
AST, extracts frontmatter, tags, links and tasks, and **drops and recreates every table** in a Knex
database (SQLite through the native `sqlite3` binding by default) whenever anything changes. It
writes no markdown, and it has no frontmatter-only mode and no incremental database update.
Measured on this repo's `.scratch/`, a MarkdownDB index takes **~221ms**. FrontierMCP's whole scan
takes **~11ms cold and ~16ms re-scan**. At 1000 Tickets the figures are **~842ms** against
~52/64ms. Its runtime closure is **483 packages / 51 MB**, against FrontierMCP's **5 packages /
18 MB**. Under the npm 12 defaults on this machine, `npx -y mddb@0.9.5` installs without the native
SQLite binary and **crashes at the first query**.

The more important result: MarkdownDB changes **none of the three costs T29 names**. Each process
would still hold its own index, re-index on every write and run its own watcher. The new problems it
brings are an index on disk that drifts from the files, a cwd-relative `.markdowndb/files.json`
written on every rebuild, and stdout logging. Several processes sharing one database file failed a
quarter of their indexes in a four-process test. "A virtual model of the md tree" is a fair
description of what FrontierMCP's driver already does, more cheaply.

---

## 1. What it is and its state

**Verified.**

- **Identity.** npm `mddb`, licence MIT (`package.json`, registry `license`). Description: "Parse
  markdown files and store them in an SQL database." The repository's `site/about.md` says "MarkdownDB
  is built and maintained by Flowershow". The parser depends on `@portaljs/remark-wiki-link`
  (`package.json`), which is the PortalJS link to the same group of projects. The published
  `package.json` still points `repository` and `bugs` at `datopian/markdowndb`.
- **Releases.** 15 versions on npm, from `0.1.9` (2023-06-12) to **`0.9.5` (2024-03-07)**. No
  release in the 20 months since. `dist-tags.latest` is `0.9.5`. GitHub releases end at `v0.9.5`.
  The only npm maintainer is `olayway`.
- **Commit activity.** `git log --format=%ci | cut -c1-4 | uniq -c` gives 90 commits in 2023, 26 in
  2024, 15 in 2025 and 19 in 2026. The last commit is `f53cfef` on 2026-05-21, a docs change. The 35
  commits on `main` since `v0.9.5` add MySQL/PostgreSQL support (`3a3cebe`), multi-folder indexing
  (`04af494`), a `processMarkdown` single-file API (`e4236c8`), a CLI `--exec` (`bd4861f`) and a
  Node 20 floor (`dcd2feb`, `engines: ">=20.0.0"`). `package.json` on `main` still says `0.9.5`, so
  none of it is installable from npm. Several of those commits are authored by `Copilot`.
- **Issues.** 9 open issues and 1 open PR (#159, 2026-11-08). The contributors API lists olayway
  (49), mohamedsalem401 (42), rufuspollock (29), Copilot (10), knu (5). Issue **#113, "SQLITE_ERROR:
  table `tags` already exists"**, opened 2024-02-26, is still open. Its last comment is from
  rufuspollock on 2025-12-24: "we didn't have this issue. we're looking at this to see if we can
  repro". §4 reproduces it.
- **Repository.** Not archived. 548 stars, 27 forks.

**Maintained?** The repository receives commits. The package does not receive releases. For an
adopter, the only installable artifact is a two-year-old 0.9.x. **Could not determine:** whether a
release is planned, or whether there is a successor. Nothing in the repository, its `site/` or its
`docs/plans/` names one.

## 2. Architecture

**Verified by reading source** (`main` unless marked).

- **Store.** Knex over a configurable client (`src/lib/markdowndb.ts:69-80`, `knex({ ...config,
  useNullAsDefault: true })`). The default and documented client is **`sqlite3`**, the native
  `node-sqlite3` binding (`README.md:143-152`). It is not `better-sqlite3`. `mysql2` and `pg` are
  optional peers on `main` only. A database can be `:memory:` or a file. The CLI writes `markdown.db`
  into the current directory (`README.md:69`).
- **Second store, always written.** `saveDataToDisk` calls `writeJsonToFile(".markdowndb/files.json",
  fileObjects)` on every rebuild (`markdowndb.ts:322`). The path is **relative to `process.cwd()`**
  (`:498-510`), whatever folder is being indexed. Every run in §6 produced that file in the process's
  working directory.
- **Tables** (`src/lib/schema.ts`): `files` (`_id`, `file_path` unique, `extension`, `url_path`,
  `filetype`, `metadata` as a JSON string, plus one string column per extra top-level key on the file
  object, `:72-93`), `tags`, `file_tags`, `links` and `tasks`. **No body column.** The file object
  that goes to both stores has no body field (`src/lib/process.ts:149-159`). Columns observed after
  indexing this repo: `_id, file_path, extension, url_path, filetype, metadata, tasks`.
- **`_id`** is the SHA-1 of the path relative to the indexed root (`process.ts:145-147`). It is
  keyed on the file path. FrontierMCP's Ticket id is a frontmatter value.
- **Per-file parse** (`src/lib/parseFile.ts:17-46`): `gray-matter` for frontmatter (`:22`), then a
  **full `unified` + `remark-parse` + `remark-gfm` + `@portaljs/remark-wiki-link` AST** (`:49-65`),
  then a walk over every AST node for `#tags` (`:74-88`), link extraction, and task extraction. Both
  versions do this for every `.md`/`.mdx` file. Non-markdown files get a row with empty metadata
  (`process.ts:161-164`).
- **YAML engine.** gray-matter 4.0.3 uses js-yaml 3.15.2. Run here, `matter('---\nclaimed_at:
  2026-11-12T10:00:00Z\n---')` returns `claimed_at` as a **`Date`**. `yaml.parse` from FrontierMCP's
  dependency returns the **string** `'2026-11-12T10:00:00Z'`.
- **gray-matter caches every input string it has parsed** when called without options
  (`gray-matter/index.js:35-47`, `matter.cache[file.content] = file`), and MarkdownDB calls it
  without options. In a long-lived process that cache only grows. §6 measures it.
- **Walk.** `recursiveWalkDir` is synchronous `readdirSync` recursion (`src/lib/recursiveWalkDir.ts`).
  Files are processed **one at a time** in a `for … await` loop (`src/lib/indexFolder.ts:26-34`). In
  `v0.9.5`, `processFile` reads each file synchronously.
- **Extension points.** `computedFields`: functions `(fileInfo, ast) => …` that mutate the file
  object (`process.ts:178-181`). `schemas`: zod validation per top-level folder, which **throws and
  aborts the whole index** on failure (`indexFolder.ts:45-65`). `include`/`exclude` globs.
  `processMarkdown` accepts `remarkPlugins` and `extractors` (`process.ts:134-135`), but
  `indexFolder` never passes them (`indexFolder.ts:28-34`). The `matter()` and remark parse cannot be
  replaced or skipped.
- **Query API** (`markdowndb.ts:335-488`): `getFileById`, `getFileByUrl`, `getFiles({ folder,
  filetypes, tags, extensions, frontmatter })` (equality or LIKE on JSON fields), `getTags`,
  `getLinks({ fileId, linkType, direction })`, and the raw Knex handle `db.db` for anything else.
  Nothing writes markdown. The only writes in `src/lib` are `files.json` (`markdowndb.ts:506`) and a
  temporary script for `--exec` (`runExecScript.ts:43`).

## 3. Dependencies and install cost

**Verified by real installs on this machine.**

| | packages | `du -sk node_modules` |
| --- | --- | --- |
| `npm install frontier-mcp@0.5.0` | **5** (`@modelcontextprotocol/server`, `/core`, `yaml`, `zod`, itself) | 18,848 KB |
| `npm install mddb@0.9.5` | **483** (`npm ls --all --parseable`, 273 top-level dirs) | 52,472 KB |

Commands: `npm install --no-audit --no-fund <pkg>` in an empty directory, then `npm ls --all
--omit=dev --parseable | tail -n +2 | wc -l` and `du -sk node_modules`. The mddb closure includes
`knex@2.5.1`, `chokidar@3.6.0`, `gray-matter@4.0.3`, `react-markdown@9.1.0` with `react@19.3.1`
installed as its peer, the micromark/mdast family, `lodash`, **`zod@3`** (FrontierMCP is on zod 4, so
both majors would ship), and `sqlite3@5.1.7` with optional peer `node-gyp@8` and its tree. npm
printed deprecation warnings during the install for `inflight`, `rimraf@3`, `glob@7`, `npmlog`,
`gauge`, `are-we-there-yet`, `tar@6` and `prebuild-install@7.1.3`. FrontierMCP's tsc-only build with
no bundler ([AGENTS.md](../../AGENTS.md), Stack) depends on a closure this size. Adopting `mddb`
would add roughly a hundred times as many packages.

**The native module.** `sqlite3@5.1.7` installs with `prebuild-install -r napi || node-gyp rebuild`
and declares `binary.napi_versions: [3, 6]` (its `package.json`).

- **Prebuild coverage.** Verified from the v5.1.7 GitHub release asset list (2024-01-05): N-API v3
  and v6 tarballs for darwin-arm64, darwin-x64, linux-x64, linux-arm64, linuxmusl-x64,
  linuxmusl-arm64, win32-x64 and win32-ia32. N-API binaries do not depend on the Node major. Loading
  was **verified only on darwin arm64**: the approved install opened a database and returned SQLite
  `3.44.2` under Node 20.20.2, 22.17.1 and 24.15.0 (`fnm exec --using=<v> node probe.mjs`). The
  other platforms were not run.
- **No prebuild** means `node-gyp rebuild`, which needs Python and a C/C++ toolchain (Visual Studio
  Build Tools on Windows). That follows from the install script above. It was not exercised here.
- **npm 12 does not run the install script by default.** `npm config ls -l` shows `allow-scripts =
  [""]`, and nothing in `~/.npmrc` sets it. `npm install mddb@0.9.5` reported `install-scripts
  blocked … sqlite3@5.1.7`. No binary was fetched. Importing the package succeeds, but the first
  query fails with Knex's `Could not locate the bindings file`. **`npx -y mddb@0.9.5 ./content` with a
  fresh `npm_config_cache` reproduces it exactly.** That is the launch form FrontierMCP documents
  (`docs/installation.md:12-20`, `"args": ["-y", "frontier-mcp@0.5.0"]`), so a FrontierMCP that
  depended on `mddb` would ship broken to every npm 12 user unless the user ran `npm install-scripts
  approve sqlite3` first. `pnpm add mddb@0.9.5` on pnpm 12.15.0 refuses outright with
  `ERR_PNPM_IGNORED_BUILDS`. Older npm releases ran install scripts by default. That was not
  re-verified here.
- **The binding is deprecated upstream.** `TryGhost/node-sqlite3` is archived, and its README opens
  with "[DEPRECATED] node-sqlite3 … This repository is currently unmaintained." npm's latest is
  `6.0.1` (2026-03-12). `mddb` pins `^5.1.6`, so it stays on 5.1.7 with its bundled SQLite 3.44.2.
- `fsevents@2.3.3` also had its install script blocked. It ships a prebuilt `fsevents.node`, and
  chokidar still used it (`useFsEvents: true` in the unapproved `npx` cache), so that block is
  harmless.

## 4. Liveness

**Verified by reading source and running it.**

- **Watcher:** `chokidar.watch(folderPath, { ignoreInitial: true })` (`markdowndb.ts:115-118`), with
  no debounce. chokidar 3.6.0 uses FSEvents on macOS. Elsewhere it uses its `NodeFsHandler`, which
  calls `fs.watch(path, …)` per path with no `recursive` option (`chokidar/lib/nodefs-handler.js:119`).
- **Granularity.** On an event, the changed file alone is re-parsed (`markdowndb.ts:147-163`). Then
  `saveDataToDisk` **drops and recreates all five tables and re-inserts every row**
  (`markdowndb.ts:302-328`, `databaseUtils.ts:6-13`), and rewrites `files.json`. The parse is
  incremental. The database update is a full rebuild. `README.md:97` says the same: "automatically
  rebuilding the database whenever a change is detected."
- **The host cannot control or stop it.** Watching is a boolean flag on `indexFolder`. The watcher
  object is a local `const` that is never returned or stored (`markdowndb.ts:116`, `v0.9.5` `:103`),
  so **it cannot be closed**. FrontierMCP's `StorageDriver.close()` and the exit-on-disconnect
  contract (T95) could not be honoured. The bench had to `process.exit()`. The only re-index a host
  can trigger is another whole `indexFolder`.
- **Stdout.** Every watch event logs to `console.log` (`markdowndb.ts:143, 166`): 33 lines for 33
  writes in §6. In a stdio MCP server, stdout is the protocol channel.
- **Races inside one process.** In `v0.9.5` the rebuild runs from an unawaited `.on("all", () =>
  this.saveDataToDisk(…))` (`v0.9.5 markdowndb.ts:159`). On `main` each handler awaits it, but the
  handlers are started with `void` and nothing serializes them. `MddbFile.deleteTable(this.db)` is
  not awaited in either version (`markdowndb.ts:305`). Measured: a reader polling during watch
  rebuilds hit **`SQLITE_ERROR: no such table: files`** 6 times over 33 writes on this repo and 17
  times at 1000 Tickets, and read the row as missing 13 times in a 10-write run. A FrontierMCP
  Board taken during a rebuild would see the workspace empty or erroring.
- **Several processes on one database file.** Four processes each ran `indexFolder` 15 times
  against one SQLite file, with the 200-Ticket fixture. **15 of the 60 indexes failed**, with
  `table \`tags\` already exists`, `table \`file_tags\` already exists` (issue #113's error) and
  `UNIQUE constraint failed: files.file_path`. Nothing in the source coordinates writers. There is no
  transaction around the drop-and-rebuild and no lock. A shared on-disk index is the one form in
  which MarkdownDB could look like "one model shared across processes", and this is how it fails.
  All four processes also rewrote the same cwd-relative `files.json`.
- **Staleness.** The database is a separate artifact that drifts as soon as anything edits the tree
  while no MarkdownDB process is watching, for example a `git checkout` between sessions. Nothing
  records which file state the database was built from.

## 5. Fit with the `StorageDriver` seam

Method by method against `src/storage/driver.ts:74-215`:

| Method | Could MarkdownDB serve it? |
| --- | --- |
| `listEfforts` | Partly. `getFiles({ folder })` and path inspection could enumerate directories. The Effort rules ("an Effort only once it holds a Header doc or `issues/`", Destination and Spec-opening extraction, `driver.ts:900-925`) would still be FrontierMCP code. |
| `listTickets` | Only for schema Tickets, from `metadata`. Legacy inference, the order derived from the filename, `<effort>#<order>` handles with `.2` suffixes, revision (mtime+size) and duplicate claims are not in MarkdownDB's model. |
| `workspaceWarnings`, `isId`, `mergeCollidingIdPattern` | No. These are id-pattern configuration (`frontier.yml`). |
| `assertAddressable` | No. It needs FrontierMCP's duplicate-id model. |
| `readTickets` | No. No body is stored, and the contract reads fresh by design (T27). |
| `updateTicket`, `createTickets`, `editMap`, `putSpec`, `migrateEffort` | No. MarkdownDB has no write API. |
| `readMap`, `readSpec` | No. MarkdownDB has no notion of typed sections or GENERATED blocks. |
| `close` | No. The watcher cannot be closed. |

On the specific questions:

- **(a) Legacy and Foreign Tickets.** MarkdownDB's parse cannot be replaced: `indexFolder` always
  runs `matter()` and the remark parse (§2). A `computedField` receives `(fileInfo, ast)` and not the
  source text, so `legacy.ts`'s prose regexes would have to re-read the file from
  `fileInfo.file_path` or reconstruct text from the AST. Either way **FrontierMCP would parse every
  file twice**, once by MarkdownDB's full AST and once by its own parser. Worse for this repo:
  **a single malformed fence aborts the entire index.** A fixture with one good Ticket and one with
  `title: [unclosed` made `indexFolder` throw `YAMLException: unexpected end of the stream within a
  flow collection` (verified). FrontierMCP's contract is the opposite: a malformed fence reads as no
  frontmatter and falls through to the Legacy parser (`frontmatter.ts:40-52`, "Lenient on read").
  A Foreign fence would be read by js-yaml with different scalar semantics from the `yaml` package
  that writes it (timestamps become `Date`, §2).
- **(b) Round-trip fidelity.** MarkdownDB is read-only. This is confirmed: no markdown write path
  exists in `src/lib`. Every write would stay exactly as it is today: `yaml` `parseDocument`, the
  serializer, atomic rename, guards (ADR 0003, ADR 0004, ADR 0006). The engine would be a second,
  disagreeing reader beside an unchanged writer.
- **(c) The revision check.** It reads the file's mtime and size immediately before the write and
  never trusts a cache (AGENTS.md write rules). An index cannot help, because the check exists
  precisely for the case where the index is stale. MarkdownDB also stores no mtime or size.
- **(d) "A Board never carries a body."** MarkdownDB does not store bodies, which is compatible. But
  it builds a full AST of every body to produce the index, so the scan pays more for prose than
  FrontierMCP's does. FrontierMCP reads the bytes and keeps no prose.
- **(e) Map typed sections and GENERATED blocks.** Out of MarkdownDB's model entirely. `header-doc.ts`
  would stay as it is. Indexing would add the Map's links and tags to tables nothing reads.

**Net.** Of fifteen interface members, MarkdownDB could partly help two (`listEfforts`,
`listTickets`), and only for schema-conformant Tickets with additional FrontierMCP code beside it.

## 6. Cost

### Method

Fixtures, all in the scratchpad:

- a `cp -R` snapshot of this repo's `.scratch/` taken today: 100 Tickets, 8 Efforts, 109 files,
  459,973 Ticket bytes, plus one marker Ticket the harness rewrites (110 rows indexed);
- synthetic 200- and 1000-Ticket trees generated with the same `synthTicket` / 3-Effort / 3,250-byte
  shape as `bench/scan-cost.ts`. The 1000-Ticket tree totals 3,311,838 Ticket bytes, the same figure
  `bench:scan --group=create` reports. They index as 207 and 1007 rows.

The harness (`mddb-bench.mjs`) runs 3 discarded warmups and n=30 per group:

- **cold**: a fresh `MarkdownDB` plus `init()` plus `indexFolder`, with gray-matter's cache cleared
  first, against `:memory:` and against a fresh SQLite file;
- **re-index after one change**: the marker is rewritten atomically (temporary file, then rename),
  then `indexFolder` runs again on the same instance. This is the only programmatic re-index;
- **query**: `getFiles()` with no filter, which returns every file with its frontmatter.

Groups are timed with `performance.now()` in one process, so as in T19 nothing is OS-cold. A
separate split harness (n=20) times the 0.9.5 internal `indexFolder` (walk and parse) apart from
`saveDataToDisk` (database rebuild), and gray-matter alone over the in-memory file texts. The watch
harness writes the marker atomically 33 times (30 kept) and polls the `files` row every 1ms until it
shows the new title. The memory harness runs under `--expose-gc` and forces GC twice before each
reading. FrontierMCP's numbers are a same-day `pnpm run bench:scan` with the bench unedited.

### Results, performance cores (median / p95, ms)

| Fixture | FrontierMCP cold | FrontierMCP re-scan | mddb cold `:memory:` | mddb cold file | mddb re-index, one change | mddb `getFiles()` |
| --- | --- | --- | --- | --- | --- | --- |
| this repo (101 Tickets) | 10.92 / 12.39 | 16.31 / 19.91 | **220.88 / 239.50** | 221.37 / 237.47 | 213.28 / 231.36 | 0.70 / 1.25 |
| ~200 Tickets | 15.87 / 17.99 | 20.07 / 28.99 | **187.62 / 222.49** | 177.54 / 189.31 | 174.13 / 181.61 | 0.67 / 0.77 |
| ~1000 Tickets | 52.42 / 79.40 | 63.55 / 68.77 | **841.56 / 889.88** | 844.79 / 877.97 | 836.96 / 881.74 | 2.48 / 2.69 |

FrontierMCP's warm read off its cache is 0.01ms at every size, so the fair comparison for MarkdownDB's
`getFiles()` is that number, not the scan.

**Where MarkdownDB's time goes** (split harness, medians, n=20):

| Fixture | walk + parse all files | database rebuild | gray-matter alone |
| --- | --- | --- | --- |
| this repo | 185.17 | 18.42 | 1.25 |
| ~200 | 166.70 | 10.41 | 1.01 |
| ~1000 | 817.66 | 16.89 | 4.84 |

About nine tenths of the cost is the full remark AST, which FrontierMCP never builds. Frontmatter
parsing alone is 1–5ms. The database itself is cheap to rebuild and cheap to query. This repo's
Tickets cost more per file than synthetic ones (221ms for 110 files against 188ms for 207) because
they hold more markdown structure for the AST to build.

**Watch path** (`:memory:`, FSEvents, n=30): write completed until the row is fresh, **101.15 /
136.38ms on this repo and 110.00 / 137.59ms at 1000 Tickets**, one full database rebuild per write.
FrontierMCP's same-day N=1 staleness is 79.24 / 86.05ms on this repo and 118.79 / 127.03ms at 1000.
The comparable figures come from different mechanisms. MarkdownDB re-parses only the changed file,
then rebuilds the database. FrontierMCP drops its scan after a 50ms debounce and re-scans on the
next read. The read errors listed in §4 occurred in these same runs.

**Retained memory** (one completed index, heap delta after forced GC):

| Fixture | mddb heap retained | after clearing gray-matter's cache | RSS delta | FrontierMCP heap Δ (same day) |
| --- | --- | --- | --- | --- |
| this repo | 3.92 MB | 2.40 MB | 83.6 MB | 2.4 MB |
| ~200 | 2.96 MB | 1.93 MB | 78.7 MB | 1.8 MB |
| ~1000 | 6.80 MB | 2.18 MB | 188.4 MB | 5.2 MB |

The difference between the first two columns is gray-matter's content-keyed cache, which keeps every
file's text it has ever parsed and grows with each edit in a long-lived process. An in-memory SQLite
database lives in native memory and is not in `heapUsed`. The RSS delta includes it along with
transient buffers, so it overstates retained cost in the same way T19 found for FrontierMCP.

### Slow cores

`taskpolicy -b`, background QoS, efficiency cores:

| Fixture | mddb cold `:memory:` | mddb re-index | mddb `getFiles()` |
| --- | --- | --- | --- |
| this repo, n=30 | **1280.49 / 1474.59** | 1255.26 / 1404.10 | 3.18 / 4.51 |
| ~1000, n=10 | **5540.89 / 6039.85** | 5468.62 / 5637.42 | 11.83 / 20.21 |

`bench:scan` was not re-run on slow cores today. AGENTS.md's slow-core figures for FrontierMCP are
17.93ms re-scan at the earlier, 33-Ticket size of this repo and 457.91ms at 1000. On a slow core,
one MarkdownDB re-index of this repo takes over a second, and every write from any process triggers
one in every watching process.

### A floor for per-file invalidation

A walk with no parsing (`walkfloor.mjs`, n=30) costs 0.97ms for readdir and stat of every file on
this repo and 2.60ms when every file is also read. At 1000 Tickets the figures are 3.55ms and
20.05ms. FrontierMCP's re-scan is 16.31ms and 63.55ms, so roughly two thirds of it at 1000 Tickets
is parsing. That is the part per-file invalidation could avoid (§8).

## 7. What it would actually buy

The costs T29's acceptance criteria name:

- **N scans per write across N processes.** Unchanged in count, and each one costs more. Every
  process holds its own MarkdownDB and its own watcher, so a write still costs N re-indexes, and with
  watch on each is a one-file parse plus a full table rebuild. MarkdownDB adds no coordination
  between processes. A shared database file is the only way to share its model, and §4 shows that
  failing a quarter of the time with four writers.
- **Resident memory per process.** Slightly worse. Heap retained is 3.9 MB here against 2.4 MB,
  with gray-matter's cache growing over the process's life, plus the native SQLite database and a
  module graph of 483 packages loaded into every session.
- **N recursive `fs.watch` handles.** Unchanged on macOS: one FSEvents stream per process. Worse
  elsewhere: chokidar 3 places a non-recursive `fs.watch` on each directory, where FrontierMCP
  places one recursive watch.

**New classes of problem:**

- **A second source of truth on disk** whenever a file database is used. It goes stale after `git
  checkout`, editor saves or plain file tools while no watcher is running. ADR 0001 says "any index
  the server builds is derived, in-memory, and rebuildable from a scan". A persistent index needs
  that ADR revised. `:memory:` avoids this, but then the database shares nothing between processes.
- **Files in the user's repository.** `.markdowndb/files.json` is written to whatever directory the
  MCP host launched the server from, on every rebuild, with no option to turn it off. That directory
  would need gitignoring in every consumer repository. A file database adds `markdown.db` and
  SQLite's journal files.
- **Locks.** No lock files are created by MarkdownDB itself (verified: no lock primitive in
  `src/lib`). A file-backed SQLite database does take SQLite's own file locks and journal files.
  Those are released when a process dies, so the AGENTS.md rationale (`spec.md:198`: a crashed
  session must never wedge the tracker) is probably not violated. That was not tested under a
  killed process.
- **Correctness exposure.** A malformed fence aborts the index. Reads during a rebuild fail or come
  back empty. Watchers cannot be closed. Stdout is logged to. Each contradicts a binding contract
  (lenient on read; every method answers as though it had just read; T95; the stdio channel).

## 8. Alternatives in the same space

**Keep the hand-written scan, add per-file invalidation.** The driver already holds an in-memory
model of the tree (AGENTS.md: "A driver is the workspace *cached and live*"). The missing part is
incremental update. `fs.watch` with `recursive: true` passes a `filename` with each event, so the
driver could re-parse only the files named, and could check by readdir and stat that nothing else
moved. The floor measured in §6 is ~1ms here and ~3.5ms at 1000 Tickets, against 16 and 64ms
re-scans today. This addresses the **cost of each of the N scans**. It leaves their **count**, the
**per-process memory** and the **N watchers** standing, and it adds no dependency. What it reopens:
the watcher's comment and T19 both rest on "per-file event granularity buys nothing against a 13ms
wholesale drop", and that claim weakens as the scan grows. Events can be coalesced or dropped (the
settle schedule exists because a just-attached watch loses events), so a stat walk or a periodic full
re-scan would still be needed as the backstop. ADR 0001 permits this as a driver-internal decision.
This option is inferred from the measurements and FrontierMCP's own source. Nothing was built.

**`node:sqlite` as an in-memory query engine over the existing parse.** Verified from Node's docs
and local runs: the module is **absent on 20.x** (Node 20.20.2 throws
`ERR_UNKNOWN_BUILTIN_MODULE`), and the v20 docs page returns 404. On 22.x it is "1.1 – Active
development", unflagged since v22.13.0, and emits an `ExperimentalWarning` on stderr under 22.17.1.
On 24.x it is "1.2 – Release candidate", a change the docs date to v24.15.0, which is exactly
FrontierMCP's floor. It loads without warning there. Bundled SQLite is 3.50.0 on 22.17.1 and 3.51.3
on 24.15.0. It needs no install and no native build. It would only replace the array filtering that
the Board, Frontier and Edge code do over `TicketSummary[]` today, with SQL. It changes nothing
about scan cost, watchers or cross-process sharing. It also cannot be the sole path while the 20.x
floor stands. At 0.01ms for a warm read there is nothing for a query engine to speed up.

**Other markdown indexers.** Not investigated. MarkdownDB's own README names comparables
(`README.md:483`, content-collections, with Contentlayer, Nuxt Content and Astro content
collections mentioned in `site/about.md`). These are all build-time content layers for site
generators, which is the same category as MarkdownDB and is a different job from a live,
lenient-read, round-trip-write tracker driver. That characterization comes from their positioning
in MarkdownDB's docs, not from their sources.

## Verified, claimed, undetermined

- **Verified by reading source or running code:** everything in §2, §3 except the non-darwin
  platforms, §4, §5 and §6. That covers the drop-and-rebuild, the cwd-relative `files.json`, the
  watcher that cannot be closed, stdout logging, the whole-index abort on malformed YAML, the
  `Date` coercion, gray-matter's cache, the `npx -y` crash under npm 12, the pnpm refusal, the
  read-during-rebuild errors and the multi-process failures. Also the `node:sqlite` status on all
  three floors, and the 5-against-483 package counts.
- **Claimed by the project's docs, not verified:** that MySQL and PostgreSQL "provide the same API
  and features" (`README.md:19`); that the tool suits "small to medium sites" (`README.md:15`).
- **Taken from release assets, not run:** that sqlite3 5.1.7 prebuilds load on darwin-x64,
  linux-x64/arm64 and win32-x64.
- **Not determined:** whether a new `mddb` release or a successor is planned; how SQLite's file
  locks behave when a MarkdownDB process is killed mid-rebuild; whether older npm versions in the
  field still fetch the sqlite3 prebuild under `npx -y` (assumed yes, from npm's prior default, not
  tested); how `main`'s unreleased changes perform, since only 0.9.5 was benchmarked. `main`'s
  `saveDataToDisk` is the same drop-and-rebuild, and its parse path is the same apart from reading
  through streams.

## What this means for T29

The evidence supports these options. None is chosen here.

1. **Close T29 as "no", with MarkdownDB recorded as considered and rejected.** The driver already
   holds the model the idea describes. MarkdownDB would make each scan 13–20 times slower (more on
   slow cores), add roughly 480 packages and a native binding that `npx -y` under npm 12 installs without,
   bring an on-disk index that ADR 0001 forbids, and leave all three T29 costs unchanged. Trade-off:
   nothing changes, and the N-scans-per-write cost stands at the size T19 measured. Today that is
   73ms combined per write across four sessions on this repo and 431ms at 1000 Tickets, on a fast
   core.
2. **"Partly": per-file invalidation inside the existing driver.** This targets the cost of each
   re-scan, which is mostly parsing, and leaves the count of scans, the per-process memory and the
   N watchers standing. It needs no dependency and no ADR beyond the driver's own internals. It does
   need a backstop for lost or coalesced events, and it retracts the "granularity buys nothing"
   rationale written in `watcher.ts` and T19. Trade-off: new code where staleness bugs live,
   bought to save ~15ms here and ~60ms at 1000 Tickets per write per process.
3. **"Yes": share one driver across processes**, as designed in the Map's Notes. This is the only
   option that changes the count of scans, the per-process memory and the watcher count together.
   MarkdownDB offers no part of it: no coordination, and a shared database file failed under
   concurrent writers. Trade-off: unchanged from T29's own pricing. The failure-mode tests are
   several times the size of the feature, against costs T19 judged an order of magnitude short of
   paying for it.
4. **Defer SQLite to the second driver ADR 0001 already plans**, and if it is ever built, build it
   on `node:sqlite` rather than `mddb`. The sqlite3 binding is deprecated upstream, `node:sqlite`
   ships with Node, and a SQLite driver would hold its rows as the store rather than as an index of
   markdown. Trade-off: needs the 20.x floor dropped, or a fallback, and it answers a different
   question from T29.
