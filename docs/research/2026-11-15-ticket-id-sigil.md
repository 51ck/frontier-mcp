# A sigil for Ticket ids

Date: **2026-11-15**. Ticket: **T7yghip** (Whether a sigil on Ticket ids lets them be short and
readable, Effort `ids-patterns`,
[`07-T7yghip-…`](../../.scratch/ids-patterns/issues/07-T7yghip-whether-a-sigil-on-ticket-ids-lets-them-be-short.md)).
Waiting on it: `Tptzdka` (whether `id_pattern` accepts the Effort slug with a per-Effort counter,
GitHub issue #53).

Answers: whether a reserved marker on a Ticket id can carry recognition so that the rest of the id
may be short and readable, which marker characters survive the places an id is written, and what
actually makes an id readable while two trees can still mint without talking. This is evidence and
a recommendation for the decision. It does not make it.

> **Dated snapshot, not a contract.** Per the `docs/research/` rule in [AGENTS.md](../../AGENTS.md),
> this records what primary sources said and what ran on this machine on its date. Do not update it
> in place. Every upstream file was read at the tip of its default branch, not at a pinned commit.

Every claim below is marked one of three ways:

- **[sourced]** — a primary source said it; the URL follows. All URLs were fetched on 2026-11-15.
- **[measured]** — it ran here; the method is in [What was examined](#what-was-examined).
- **[inference]** — my reasoning from the other two. Nothing was run or read to confirm it.

This document does not re-argue T36 or T55. Those closed a sigil on *Temporary keys*. Section 3
says what an id sigil changes in what they rest on, which is nothing.

## What was examined

- **FrontierMCP** at commit `0121fe61890135f50e4c8dfade9722289b14f77d` (`master`, v1.0.0):
  [ADR 0006](../adr/0006-ids-are-minted-by-pattern-and-guarded-only-when-counted.md),
  `src/storage/markdown/id-pattern.ts`, `src/storage/markdown/create.ts`,
  `src/tools/create-tickets.ts`, `src/tools/get-board.ts`, `src/storage/markdown/legacy.ts`, and
  Tickets T35, T36, T51, T52, T53, T55, T56, T58.
- **Throwaway scripts**, kept outside the repository and not committed:
  - `yaml-test.mjs` parses each candidate spelling with the repository's own `yaml` 2.9.1
    (`parseDocument`), as a plain scalar, in a flow sequence and in a block sequence, and writes it
    back through the document API with `flowCollectionPadding: false`.
  - `surfaces.sh` creates `07-<id>-slug.md` on APFS (macOS 27.2), commits messages with git 2.54.0,
    checks branch names with `git check-ref-format --branch`, and passes each candidate unquoted to
    `/bin/sh`, `/bin/bash`, `/bin/zsh -f` and `/bin/zsh -f -i`.
  - The same filename loop ran in an `alpine:3` container (Linux 6.10, case-sensitive overlay
    filesystem). The PowerShell cases ran in PowerShell 7.5.13 inside the
    `mcr.microsoft.com/dotnet/sdk:9.0` container, on Linux, not on Windows.
  - `md.mjs` renders prose through `micromark` with `micromark-extension-gfm` 3.0.0. That is
    CommonMark plus GFM syntax. It contains none of GitHub's or GitLab's host autolinks.
  - `tokens.mjs` counts tokens with three tokenizers; see section 5.
  - `collide.mjs` is closed-form collision arithmetic with one simulation as a check.
- **Machine**: Node v24.15.0, darwin arm64, Apple M4 Pro. **Nothing here was timed**, so there is
  no slow-core figure to report and none was needed: every test is a pass or fail, and the
  arithmetic is exact.
- **Prior art** was read from upstream source files, repository docs and vendor documentation.
  No blog post or summary was used.
- **This repository's Tickets** were used for one thing only: as the text of a 100-line Board in
  the token measurement. They are one author's data and are not presented as evidence of what
  consumers do.

## 1. Prior art on markers

| Tool | Marker | What the marker is for | Where it bites |
| --- | --- | --- | --- |
| GitHub | `#26`, `GH-26`, `owner/repo#26`; a bare 40-hex SHA; `@name` | Autolinking in "conversations": issues, pull requests, commits, mentions | `#` plus digits links to whatever issue or pull request holds that number; closing keywords act on it |
| GitHub custom autolinks | A configured prefix, such as `JIRA-`, then a numeric or alphanumeric identifier | Linking an external tracker's keys | Prefixes may not overlap: `TICKET` and `TICK` cannot both exist |
| GitLab | `#123` issue, `!123` merge request, `&123` epic, `~123` label, `%123` milestone, `$123` snippet, `@user`, `^alert#123`, bare `9ba12248` commit, `[[Home]]` wiki page | One sigil per object type, so a number alone says nothing and the sigil says the type | Nearly every ASCII punctuation mark is taken; `\#123` is the documented escape |
| Phabricator / Phorge | A letter monogram: `T123` task, `D123` revision, `{T123}` for the full name | Type by letter, recognised in any prose with no punctuation | Ordinary words match. The shipped default `remarkup.ignored-object-names` is `/^(Q|V|M|P)\d$/` |
| Jira | `<project key>-<issue number>`, `ABC-123` | The key names the project; the number counts within it | The key must start with a letter; hyphens inside a key are unsupported; the issue-key pattern itself cannot be configured |
| Linear | Team identifier plus a number assigned in order of creation | Team scoping | Moving an issue to another team gives it a new id; the old one keeps resolving server-side |
| Beads | `<prefix>-<base36 hash>`, default `bd-a1b2`; children `bd-a3f8.1` | Prefix names the project; hash makes ids merge-safe | Hash length changes as the database grows |
| `ticket` (`tk`) | `<dir initials>-<4 random [a-z0-9]>`, `nw-5c46` | Same split as Beads, fixed length | Accepts any unambiguous substring on input |
| git-bug | A hash, shown truncated to 7 characters | No marker at all | Input accepts any unambiguous prefix and complains when it is ambiguous |
| Fossil | A random 40-hex "ticket UUID" | No marker; `[...]` in wiki text makes a link | Not a hash of anything, by its own documentation |
| git | No marker; abbreviated object names | Length grows with the repository | Abbreviations that were unique stop being unique |
| Backlog.md | `<PREFIX>-<n>`, default `TASK-1`; children `BACK-760.1` | Configurable prefix, workspace counter | Cross-branch duplicates; see below |
| Taskwarrior | A small integer index into the "working set", over a UUID | Typing | The integer changes when the working set is rebuilt |

The claims behind the table, each **[sourced]**:

- **GitHub.** References are converted "within conversations"; "Autolinked references are not
  created in wikis or files in a repository". The table of forms lists `#26`, `GH-26` and
  `jlord/sheetsee.js#26`, and a full SHA.
  <https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/autolinked-references-and-urls>
  (read as
  <https://raw.githubusercontent.com/github/docs/main/content/get-started/writing-on-github/working-with-advanced-formatting/autolinked-references-and-urls.md>).
  Closing keywords work "in the pull request's description or in a commit message", as
  `Closes #10`.
  <https://raw.githubusercontent.com/github/docs/main/content/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue.md>
- **GitHub custom autolinks.** Defined by "a reference prefix and a target URL"; identifiers may be
  alphanumeric; "Reference prefixes cannot have overlapping names"; they apply to "issues, pull
  requests, commit messages, and release descriptions".
  <https://raw.githubusercontent.com/github/docs/main/content/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/configuring-autolinks-to-reference-external-resources.md>
- **GitHub mentions and math.** `@` plus a username notifies that person; `$` delimits inline math.
  <https://raw.githubusercontent.com/github/docs/main/content/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax.md>,
  <https://raw.githubusercontent.com/github/docs/main/content/get-started/writing-on-github/working-with-advanced-formatting/writing-mathematical-expressions.md>
- **GitLab.** The reference table, the `\#123` escape and the `[[Home]]` wiki form are in
  "GitLab-specific references". <https://gitlab.com/gitlab-org/gitlab/-/raw/master/doc/user/markdown.md>
- **Phabricator.** "You can link to Phabricator objects … by mentioning the name of an object",
  with `T123` and `D123`, and "See the Phabricator configuration setting
  `remarkup.ignored-object-names` to modify this behavior".
  <https://raw.githubusercontent.com/phacility/phabricator/master/src/docs/user/userguide/remarkup.diviner>.
  The default value and its comments ("Q1, Q2, etc., are common abbreviations for Quarter", "M4 is
  a carbine"):
  <https://raw.githubusercontent.com/phacility/phabricator/master/src/applications/config/option/PhabricatorCoreConfigOptions.php>.
  This is the archived Phabricator tree. Phorge's copy of the remarkup guide is now a stub pointing
  into the running install, so Phorge's current text was not read.
- **Jira (Data Center).** Default key pattern `([A-Z][A-Z]+)`; supported formats need a letter
  first and allow only letters, digits and underscore; "You cannot configure the issue key
  pattern"; keys are `<project key>-<issue number>`.
  <https://confluence.atlassian.com/adminjiraserver/changing-the-project-key-format-938847081.html>
- **Linear.** Issues "are given a unique issue ID number that is assigned in consecutive order";
  on a move between teams "we generate a new issue ID" and "Old URLs will still work".
  <https://linear.app/docs/creating-issues>
- **Beads.** Hash ids exist because "Traditional sequential IDs (`#1`, `#2`, `#3`) break when …
  Different branches have independent numbering".
  <https://raw.githubusercontent.com/steveyegge/beads/main/docs/core-concepts/hash-ids.md>.
  The id is `prefix + "-" +` a base36 encoding of the leading bytes of
  `sha256(title|description|creator|timestamp-nanoseconds|nonce)`.
  <https://raw.githubusercontent.com/steveyegge/beads/main/internal/idgen/hash.go>.
  **The adaptive rule, exactly:** starting at the minimum length, take the first length `L` for
  which `1 - exp(-n² / (2·36^L))` is at most the threshold, where `n` is the number of issues in
  the database; defaults are threshold 0.25, minimum 3, maximum 8.
  <https://raw.githubusercontent.com/steveyegge/beads/main/internal/storage/domain/adaptive.go>.
  On a collision inside one database it retries with a new nonce, ten per length, then one
  character longer.
  <https://raw.githubusercontent.com/steveyegge/beads/main/docs/core-concepts/adaptive-ids.md>.
  **The documentation and the source disagree on the minimum:** the doc page says "Default: 4
  chars" and tabulates 4 characters up to 500 issues; `DefaultAdaptiveConfig()` returns
  `MinLength: 3`, which by the same formula gives 3 characters up to about 160 issues. The
  collision tables are in
  <https://raw.githubusercontent.com/steveyegge/beads/main/engdocs/COLLISION_MATH.md>.
- **`ticket`.** `generate_id` takes the first letter of each segment of the directory name and
  four characters from `tr -dc 'a-z0-9' < /dev/urandom`; `ticket_path` matches `*<id>*.md` and
  errors when more than one file matches.
  <https://raw.githubusercontent.com/wedow/ticket/master/ticket>
- **git-bug.** "this hash is displayed truncated to a 7 characters string to a human user … you
  can enter as few characters as you want, as long as there is no ambiguity."
  <https://raw.githubusercontent.com/git-bug/git-bug/master/doc/design/data-model.md>
- **Fossil.** "Ticket identifiers appear to be SHA1 hash strings, but they are not really the hash
  of any identifiable artifact. They are just random hexadecimal numbers."
  <https://fossil-scm.org/home/doc/trunk/www/tickets.wiki>. Text in square brackets links to "the
  artifact ID of a check-in or ticket". <https://fossil-scm.org/home/wiki_rules>
- **git.** `core.abbrev` unset or `auto` computes a length "based on the approximate number of
  packed objects in your repository"; the minimum is 4.
  <https://raw.githubusercontent.com/git/git/master/Documentation/config/core.adoc>. The rule in
  source: `len = msb(count) + 1`, then `DIV_ROUND_UP(len, 2)`, then no shorter than
  `FALLBACK_DEFAULT_ABBREV`, which is 7.
  <https://raw.githubusercontent.com/git/git/master/odb.c>,
  <https://raw.githubusercontent.com/git/git/master/object-name.h>. In words: enough hex digits
  that a collision is expected only at about the square of the current object count, and never
  fewer than 7. That is 7 characters up to 16,383 objects, 10 at a million.
- **Backlog.md.** "Task IDs use a configurable prefix (`backlog init --task-prefix`): the default
  produces `TASK-1`-style IDs". <https://raw.githubusercontent.com/MrLesk/Backlog.md/main/README.md>.
  Its own backlog shows what a counted id costs a markdown tracker in git. `BACK-97` (done, 2025)
  made creation scan every local and remote branch for the highest id.
  <https://raw.githubusercontent.com/MrLesk/Backlog.md/main/backlog/completed/back-97%20-%20Cross-branch-task-ID-checking-and-branch-info.md>.
  `BACK-760.1` (open, created 2026-10-11) records the bill: "On version 1.53.0 one
  `backlog task create` started 62 git processes in a clone with 13 recent branches", and proposes
  reserving ids in a git ref shared by every branch and worktree.
  <https://raw.githubusercontent.com/MrLesk/Backlog.md/main/backlog/tasks/back-760.1%20-%20Reserve-task-IDs-in-records-shared-by-every-branch-and-worktree.md>.
  The repository's file listing also carries tasks titled for detecting, warning about and
  repairing duplicate ids (`back-516`, `back-772`, `back-790`); only their titles were read.
- **Taskwarrior.** "The ID number is the index (1-based) of the tasks in the working set"; "All
  tasks … have a UUID, and are always addressable by UUID"; "the ID numbers of pending tasks remain
  small, and less prone to error during data entry. One downside is that ID numbers change
  occasionally". <https://taskwarrior.org/docs/ids/>

Four things follow. All **[inference]**.

**Markers come in two kinds, and only one is free.** Punctuation sigils (`#`, `!`, `&`) are owned
by a renderer: GitLab can spend six of them because it controls the one place they are read. A
letter or word prefix (`T`, `PROJ-`, `bd-`) is part of the string and needs nothing from whatever
displays it. Every file-based tracker in the table uses the second kind or no marker at all.

**A letter monogram has one known cost, and it does not apply here.** Phabricator needed a
configurable ignore list because it recognises monograms in free prose. FrontierMCP never scans
prose for ids on the write path; `isId` is asked only about an Edge or a Temporary key the caller
supplied.

**Dotted children are an existing convention.** Beads (`bd-a3f8.1`) and Backlog.md (`BACK-760.1`)
both write "child n of this id" as `.n`, and this repository's prose parser already reads `T38.1`
as a sub-slice of `T38` (`src/storage/markdown/legacy.ts`, the `TICKET_REF` pattern). Issue #53's
`PROJ-123.1` reads the same way: Ticket 1 of the Effort `PROJ-123`.

**Nobody separates a displayed id from a stored one without paying for it.** Taskwarrior's short
integers change. Linear's team prefix changes on a move and is rescued by a server-side redirect.
git-bug and `ticket` accept prefixes and must handle ambiguity. T35 already rejected prefix lookup
for that reason.

## 2. Which marker characters survive

### YAML frontmatter

**[measured]**, `yaml` 2.9.1. "ok" means the value read back is the string that was written. Each
candidate was tried with a numeric body (`12`) and a base36 body (`k4z`).

| Marker | `id: X` | `blocked_by: [X, X2]` | `- X` | What the library writes for it |
| --- | --- | --- | --- | --- |
| `#12`, `#k4z` | **null** (comment) | **parse error** `MISSING_CHAR` | **[null, null]** | `"#12"`, quoted |
| `@12`, `@k4z` | **error** `BAD_SCALAR_START` | **error** | **error** | `"@12"`, quoted |
| `!12`, `!k4z` | **`""`** (read as a tag) | **`["", ""]`** | **`["", ""]`** | `"!12"`, quoted |
| `&12`, `&k4z` | **null** (read as an anchor) | **[null, null]** | **[null, null]** | `"&12"`, quoted |
| `*12`, `*k4z` | **error**, unresolved alias | **error** | **error** | `"*12"`, quoted |
| `%12`, `%k4z` | **error** `BAD_SCALAR_START` | **error** | **error** | `"%12"`, quoted |
| `` `12 `` | **error** `BAD_SCALAR_START` | **error** | **error** | quoted |
| `\|12`, `>12` | **error** | **error** | **error** | quoted |
| `.12` | **0.12** (number) | **[0.12, 0.13]** | **[0.12, 0.13]** | `".12"`, quoted |
| `.k4z` | ok | ok | ok | plain |
| `-12`, `+12` | **-12**, **12** (number) | numbers | numbers | quoted |
| `-k4z`, `+k4z` | ok | ok | ok | plain |
| `~12`, `$12`, `^12`, `:12`, `/12`, `_12`, `?12`, `=12` and the `k4z` forms | ok | ok | ok | plain |
| `T12`, `Tk4z` | ok | ok | ok | plain |
| no marker, `12` | **12** (number) | **[12, 13]** | **[12, 13]** | `"12"`, quoted |
| no marker, `k4z` | ok | ok | ok | plain |

Marker in the middle or at the end, and bare values:

| Value | Plain scalar | Flow sequence |
| --- | --- | --- |
| `PROJ-123.1`, `auth.3`, `T12#3`, `auth#3`, `T12:3`, `T12@beta`, `T12?`, `T-12`, `T_12`, `T.12`, `T12.`, `T12~`, `T1e3` | ok | ok |
| `T12 #3` | **`T12`**, the rest is a comment | **error** |
| `T12: 3` | **error** | **`{T12: 3}`**, a mapping |
| `1.1`, `1.10` | **1.1** (number; `1.10` and `1.1` become the same value) | same |
| `0x1f` | **31** | same |
| `1e3` | **1000** | same |
| `null`, `~` | **null** | same |
| `True` | **true** | same |

Three results matter more than the rest.

- **`!` and `&` do not fail. They silently change meaning.** `id: !12` reads as the empty string
  and `id: &12` as null, with no parse error, so a hand-written file loses its id and its Edges
  without a message. `#` does the same for a plain scalar and breaks the fence outright in a flow
  sequence. **[measured]**
- **The server never writes one of these wrong.** The `yaml` document API quotes every dangerous
  spelling. The exposure is the hand-edit path, which the Local Contracts keep legal and which the
  read side is lenient about. **[measured]** for the quoting, **[inference]** for where it lands.
- **"No marker" fails for a random tail as well as for a counter.** A base36 draw can be all
  digits, `1e3`, `0x1f` or `null`. A 3-character base36 tail is all digits with probability
  (10/36)³ = 2.1%. T52's rule 3, a leading letter or underscore, is what prevents this, and it is
  doing that job for random patterns as much as for counted ones. **[measured]** for the cases,
  arithmetic for the rate.

The YAML specification agrees on the causes: `@` and `` ` `` are "reserved for future use";
"Plain scalars must not begin with most indicators", with `:`, `?` and `-` excepted when a safe
character follows; and "Plain scalars must never contain the `: ` and ` #` character
combinations", which is the `T12: 3` and `T12 #3` rows. **[sourced]** YAML 1.2.2, the "Indicator
Characters" and "Plain Style" sections,
<https://raw.githubusercontent.com/yaml/yaml-spec/main/spec/1.2.2/spec.md>

### Filenames

**[measured]** on APFS and on Linux: every candidate except `/` can be created as
`07-<id>-slug.md`. APFS folded `07-Tab7-x.md` and `07-TAB7-x.md` into one file; Linux kept two.

**[sourced]** for Windows, not tested: `<`, `>`, `:`, `"`, `/`, `\`, `|`, `?`, `*` are reserved,
and a name may not end in a space or a period.
<https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file> (read as
<https://raw.githubusercontent.com/MicrosoftDocs/win32/docs/desktop-src/FileIO/naming-a-file.md>).
So `:` and `/` are out on Windows, and with them `?` and `*`.

### git

**[measured]**, git 2.54.0. A commit message whose lines begin with the id, committed with
`--cleanup=strip`, which is what git applies when the message goes through an editor:

```
marker [#] editor-mode (cleanup=strip): subject=[body text] body=[]
marker [@] editor-mode (cleanup=strip): subject=[@12 resolve the thing] body=[body text|@12 is done, see also @12|]
marker [T] editor-mode (cleanup=strip): subject=[T12 resolve the thing] body=[body text|T12 is done, see also T12|]
marker [#] with -F and default cleanup (whitespace, not edited): subject=[#12 resolve the thing] body=[body|#12 is done|]
marker [#] mid-line: subject=[fix: resolve #12 mid-line]
line-start # commit after amend through an editor: subject=[body] body=[]
```

Every other marker behaved as `@` and `T` did. **A subject that begins with `#12` survives
`git commit -m` and is deleted by the next `git commit --amend`, reword or squash**: the subject
line is taken for a comment, and the first body line is promoted to subject. The documentation
says the same: lines beginning with `core.commentChar`, default `#`, are removed "after the editor
returns", and the default cleanup is `strip` "if the message is to be edited" and `whitespace`
otherwise. **[sourced]**
<https://raw.githubusercontent.com/git/git/master/Documentation/config/core.adoc>,
<https://raw.githubusercontent.com/git/git/master/Documentation/git-commit.adoc>

A branch named for the Ticket, `<id>-slug`: `~12`, `^12`, `:12`, `.12` and `-12` are illegal ref
names; the rest are legal. **[measured]** with `git check-ref-format --branch`.

### Markdown, and what the hosts add to it

**[measured]**: under CommonMark with GFM, every candidate renders literally, both mid-line
(`Blocked by X and X2, see [[X]].`) and at the start of a line. `#12` with no space is not a
heading, `-12` is not a list item, and `~12 and ~13` is not strikethrough. Markdown itself is not
the hazard.

The hosts are, and none of this was tested, because testing it means posting. **[sourced]** from
the documents cited in section 1:

| Marker | GitHub (issue, pull request, commit message) | GitLab |
| --- | --- | --- |
| `#12` | Links to issue or pull request 12 of the repository. `fixes #12` in a commit message or pull request body **closes it** on merge | Issue 12 |
| `@name` | Mentions and notifies that user or team | Same |
| `!12` | Nothing | Merge request 12 |
| `&12` | Nothing | Epic 12 |
| `~12` | Nothing | Label 12 |
| `%12` | Nothing | Milestone 12 |
| `$12` | Two on one line delimit inline math | Snippet 12 |
| `^12` | Nothing | Only `^alert#12` |
| A hex string | A full SHA links to that commit | `9ba12248` links to that commit |
| `[[T52]]` | Nothing | A wiki page link |
| `T12`, `PROJ-123.1`, `Tk4z0` | Nothing, unless the repository configured a custom autolink with that prefix | Nothing (`GL-123` is taken) |

This repository's own numbers show the first row is not hypothetical: its issue tracker already
holds a pull request #52 and an issue #53, and its Tickets are numbered past 100. A `#`-marked
Ticket id would link nearly every low-numbered Ticket to an unrelated pull request. **[inference]**

Two notes on the last rows. GitHub does not autolink in "files in a repository", so `[[T52]]` in a
Ticket body is inert there. Whether GitLab applies its `[[…]]` wiki reference when it renders a
repository file was not verified.

### Shells

**[measured]**. The candidate was passed unquoted as `printf '<%s>' X tail`, in a directory holding
files named `12`, `k4z` and `T12`. Only failures are listed; every other combination printed the
argument unchanged.

| Marker | `sh`, `bash` (macOS 27.2) | `zsh -f` | `zsh -f -i` | PowerShell 7.5.13 |
| --- | --- | --- | --- | --- |
| `#` | Comment: the argument and the rest of the line vanish | Same | ok | Comment: the cmdlet prompts for its missing argument |
| `@` | ok | ok | ok | `@12` is read as splatting and becomes an empty argument |
| `!` | ok | ok | History expansion: `event not found` | ok |
| `&` | Backgrounds the command, then runs `12` as a command | Same | Same | Parse error, or tries to run `k4z` |
| `~` | ok | `~12` is a directory-stack entry, `~k4z` a user name: error | Same | ok |
| `$` | `$12` becomes `2`, `$k4z` becomes nothing | Both become nothing | Same | Both become an empty argument |
| `*`, `?` | Glob: `*12` became `12 T12` | Same, and `?k4z` is `no matches found` | Same | ok |
| `=` | ok | `=12` is command lookup: error | Same | ok |
| `.12` | ok | ok | ok | Becomes the number `0.12` |
| `%`, `^`, `:`, `/`, `-`, `_`, `T`, and `PROJ-123.1`, `T12@beta`, `auth#3` | ok | ok | ok | ok |

`-12` passes through every shell unchanged and is then read as an option by most command-line
tools, `git` and `grep` included. **[inference]**, not run. PowerShell's own documentation lists
the characters that end or change an argument, and says "`< > @ #` are only special at the start
of a token", which is exactly the sigil position. **[sourced]**
<https://raw.githubusercontent.com/MicrosoftDocs/PowerShell-Docs/main/reference/7.5/Microsoft.PowerShell.Core/About/about_Parsing.md>

One more PowerShell result: `T12,T13`, the form `get_board` prints after `blocked_by=`, becomes a
two-element array, printed `T12 T13`. That is about the comma, not about any marker.

### JSON tool arguments

Every candidate is an ordinary JSON string character: "All Unicode characters may be placed
within the quotation marks, except for the characters that MUST be escaped: quotation mark,
reverse solidus, and the control characters". **[sourced]** RFC 8259 section 7,
<https://www.rfc-editor.org/rfc/rfc8259.txt>. A tool argument is the
one surface where no marker costs anything, and it is the surface agents use most.

### Markers this product already spends

From `src/tools/get-board.ts` and the rendering rules in AGENTS.md: `@` is the droppable Effort
annotation in `T9@beta`, `#` separates a Handle (`<effort>#<order>`), `?` marks an unresolvable
Edge (`T9?`), `.2` disambiguates a Handle, `.n` is a prose sub-slice, and `,` joins Edges. Of the
candidates, `#` and `@` are spent twice over: once by the hosts and once by this product.

### Verdict by candidate

| Candidate | First place it fails | Usable as a stored sigil |
| --- | --- | --- |
| `#` | YAML comment; shell comment; git comment line; GitHub and GitLab issue link; Handle separator | No |
| `@` | YAML reserved; PowerShell splat; mention on both hosts; Edge annotation | No |
| `!` | YAML tag, silently empty; interactive history; GitLab merge request | No |
| `&` | YAML anchor, silently null; shell background; GitLab epic | No |
| `~` | zsh; git ref name; GitLab label | No |
| `%` | YAML directive indicator; GitLab milestone | No |
| `$` | Shell variable in every shell; GitHub math; GitLab snippet | No |
| `^` | git ref name; and outside T52's filename alphabet | No |
| `:` | Windows filename; git ref name | No |
| `/` | Filename on every platform | No |
| `.` | `.12` is a YAML number and a PowerShell number; hidden file in other positions; git ref name | Not leading. Fine inside an id |
| `-` | `-12` is a YAML number and an option flag; git ref name | Not leading. Fine inside an id |
| `_` | Nothing found | Yes, and already legal as a first character |
| A leading letter | Nothing found | Yes. It is what every legal pattern already has |
| No marker | A numeric or number-like id is a YAML number, null or boolean | No |

**The only markers that survive every surface are the ones T52 rule 3 already requires.**
**[measured]** for each cell, **[inference]** for the summary.

## 3. Stored in the id, or written only

"Stored" means the marker is a character of the id on disk. "Written only" means ids are stored as
now and the marker is added when the Board prints one or prose names one, and perhaps accepted on
input.

| | Stored | Written only |
| --- | --- | --- |
| What it is, concretely | A different leading literal in `id_pattern` | A new rendering rule, and a new input rule if it is accepted back |
| Existing `T<n>` and `T<b36{6}>` ids | Unchanged on disk. Under the default they stay inside the pattern (`^T[0-9a-z]+$`). Under any other pattern they "sit outside its namespace" (ADR 0006): still ids where a Ticket holds them, no longer ids when dangling | Unchanged on disk; every one of them gains a second spelling |
| Edges already stored | Keep resolving, since Edges resolve against the ids on disk before the pattern is asked (`checkEdges`: `ids.has(edge) \|\| isId(edge)`) | Keep resolving |
| Commit messages and pull request bodies naming old ids | Still true, since nothing is renamed | Still true, but new prose and old prose now spell the same Ticket two ways, and a text search for one misses the other |
| `isId` | One anchored predicate, as now | Unchanged if the marker is display-only. If accepted on input, every name-resolution site must strip it; T58 counted four such sites sharing no helper |
| Temporary-key check | As now: a key matching the pattern is refused | Unchanged, plus a new question: is a key that looks like a *marked* id refused too |
| A pasted Board id | Works | Fails unless input accepts the marker. T58 met this with `T9@beta` on one Edge in eight and chose to reject and teach; a display sigil puts it on every id |
| Cost in the tool surface | None. `id_pattern` is the existing config key | A rendering rule on `get_board` and `get_tickets`, and wording in tool descriptions |

**[inference]** throughout, from the code and Tickets named.

Three conclusions.

- **A stored sigil is not a new mechanism. It is the literal-first rule.** Any marker that passes
  section 2 is a letter or `_`, and a pattern beginning with one is already legal. A consumer who
  wants `F-<N>` or `_<b36{4}>` can write it today.
- **A written-only sigil buys nothing that survives section 2 and reintroduces what T52 rule 3
  exists to prevent.** The useful written-only markers are exactly the punctuation the hosts own.
  An id with two spellings is the "alternate spelling" class that rule was written against. The
  repository already has a written-only marker that is safe on GitHub, the `[[T52]]` link
  convention in Ticket prose, and it costs the tool layer nothing because nothing parses it.
- **T36 and T55 rest on the same two things afterwards as before.** They rest on every legal
  predicate being anchored and narrow, and on the undetectable mistake being id-to-id, which no
  sigil can touch. An id sigil inside the legal alphabet *is* the anchor. One outside it does not
  survive. T55's closing note also still holds: `@` cannot appear in an id, so a caller may prefix
  Temporary keys with `@` by private convention. The one thing that would move their footing is
  admitting `<effort>` as a leading token, which is `Tptzdka`'s question; section 6 says what the
  anchor would be then.

## 4. What makes an id readable while merge-safe

A sigil shortens nothing. What follows compares the tails.

### Collision arithmetic

**[measured]** in the sense that `collide.mjs` computed it; the formulas are stated so they can be
checked by hand.

**A. The blind birthday bound**, `P = 1 - exp(-n(n-1)/2N)`: `n` ids drawn with no check at all.
This is the figure Beads documents and tunes its length to.

| Tail | Space `N` | n=100 | n=1000 | n=10000 |
| --- | --- | --- | --- | --- |
| `b36{3}` | 46,656 | 10.07% | >99.99% | >99.99% |
| `b36{4}` | 1,679,616 | 0.294% | 25.72% | >99.99% |
| `b36{5}` | 60,466,176 | 0.0082% | 0.823% | 56.26% |
| `b36{6}` | 2,176,782,336 | 0.00023% | 0.023% | 2.27% |
| Crockford `{4}` | 1,048,576 | 0.471% | 37.90% | >99.99% |
| Crockford `{5}` | 33,554,432 | 0.015% | 1.48% | 77.46% |
| Crockford `{6}` | 1,073,741,824 | 0.00046% | 0.047% | 4.55% |

**This is not FrontierMCP's exposure.** The random plan redraws any id its own scan already holds,
up to 1000 times (`MAX_REDRAWS`, `src/storage/markdown/create.ts`), so one tree never duplicates.
T35 said the same: randomness "only defends against ids that exist but have not merged into this
tree".

**B. Two branches minting independently before a merge.** The merge base holds `B` ids; each
branch mints `m` more, each redrawing against what it can see. A duplicate needs one of branch A's
new ids to equal one of branch B's: `P = 1 - ∏(1 - m/(N-B-i))` for `i < m`, about
`1 - exp(-m²/(N-B))`.

| Tail | B=100, m=10 | B=100, m=50 | B=1000, m=10 | B=1000, m=50 | B=1000, m=200 | B=10000, m=50 | B=10000, m=200 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `b36{3}` | 0.215% | 5.23% | 0.219% | 5.33% | 58.52% | 6.60% | 66.62% |
| `b36{4}` | 0.0060% | 0.149% | 0.0060% | 0.149% | 2.36% | 0.150% | 2.37% |
| `b36{5}` | 0.00017% | 0.0041% | 0.00017% | 0.0041% | 0.066% | 0.0041% | 0.066% |
| `b36{6}` | 0.0000046% | 0.00011% | 0.0000046% | 0.00011% | 0.0018% | 0.00011% | 0.0018% |
| Crockford `{4}` | 0.0095% | 0.238% | 0.0095% | 0.238% | 3.75% | 0.240% | 3.78% |
| Crockford `{5}` | 0.00030% | 0.0075% | 0.00030% | 0.0075% | 0.119% | 0.0075% | 0.119% |

A simulation of one cell (`b36{3}`, B=1000, m=50, 20,000 runs) gave 5.45% against the formula's
5.33%.

**The exposure depends on how much is minted between merges, squared, and hardly at all on how
large the workspace is.** Compare the B=100 and B=10000 columns at m=50: 0.149% and 0.150% for
`b36{4}`. Workspace size enters only through the number of merges a project lives through:

**C. Over a project's life**, growing to `n` Tickets through merges of two branches of 10 new
Tickets each, the chance of at least one duplicate ever:

| Tail | n=100 | n=1000 | n=10000 |
| --- | --- | --- | --- |
| `b36{3}` | 1.07% | 10.27% | 70.06% |
| `b36{4}` | 0.030% | 0.297% | 2.94% |
| `b36{5}` | 0.00083% | 0.0083% | 0.083% |
| `b36{6}` | 0.000023% | 0.00023% | 0.0023% |

**D. Occupancy**, which is the redraw rate inside one tree: `b36{3}` is 2.1% full at 1000 Tickets
and 21% at 10000; `b36{4}` is 0.06% and 0.6%. The redraw budget is never near.

**E. Counter plus random suffix, `T<N>-<b36{s}>`.** Both branches count from the same maximum, so
the j-th mint on each side has the same counter, and a duplicate id needs the same suffix as well:
`P = 1 - (1 - 36^-s)^m`.

| Suffix | m=1 | m=10 | m=50 | m=200 |
| --- | --- | --- | --- | --- |
| none: `T<N>`, `PROJ-123.<n>` | certain | certain | certain | certain |
| `b36{1}` | 2.78% | 24.55% | 75.55% | 99.64% |
| `b36{2}` | 0.077% | 0.769% | 3.79% | 14.31% |
| `b36{3}` | 0.0021% | 0.021% | 0.107% | 0.428% |
| `b36{4}` | 0.00006% | 0.0006% | 0.0030% | 0.012% |

Two things about E. Its exposure grows linearly in `m`, not as the square. And **the counter adds
no merge safety at all**: at ten Tickets a side, `T<N>-<b36{2}>` (six or seven characters) is at
0.77% where the shorter `T<b36{4}>` (five characters) is at 0.006%. A counter buys order and
sayability; only the suffix buys safety.

**F. Collision-driven growth.** The smallest base36 length keeping the blind bound under a
threshold:

| n | P ≤ 25% (Beads' default) | P ≤ 1% | P ≤ 0.1% |
| --- | --- | --- | --- |
| 100 | 3 | 4 | 5 |
| 500 | 4 | 5 | 6 |
| 1000 | 5 | 5 | 6 |
| 5000 | 5 | 6 | 7 |
| 10000 | 6 | 7 | 7 |

git's rule gives 7 hex characters at every one of those sizes.

### What a duplicate costs here

A cross-tree duplicate is not silent in FrontierMCP. It is one grouped warning on every Board,
every write addressed to it refuses with `DuplicateId`, neither claimant is takeable, and a human
renumbers one file by hand (AGENTS.md rendering and write rules). What cannot be repaired is prose
that already named the id. **[sourced]** from AGENTS.md. So the percentages above are the chance of
a loud, bounded repair, not of silent corruption. **[inference]**

### The shapes

- **`T<b36{6}>`, today.** Seven characters. Not sayable, no order, look-alike characters present
  (`0`/`o`, `1`/`l`/`i`). Merge exposure is negligible at every size in table C.
- **Shorter random, fixed length.** `T<b36{4}>` is five characters with the exposure in tables B
  and C: 0.006% for two branches of ten, 0.3% over a 1000-Ticket life. Still not sayable and still
  unordered. It is shorter junk. **No code changes are needed to accept it**: `idMatcher`
  (`src/storage/markdown/id-pattern.ts`) matches a random token at any length precisely so that
  ids from an earlier pattern stay recognised, so under the default `Tk4z0` and `Tik4z0t` are both
  ids already. **[sourced]** from the source file.
- **Shorter random, growing on demand (Beads, git).** Section 1 gives both rules. Both scale on
  the size of the store. For a tracker whose duplicates come only from unmerged branches, tables B
  and C say that is the wrong variable: store size barely moves the per-merge exposure. Beads'
  25% threshold is a blind-birthday figure for a store that retries its own collisions, as
  FrontierMCP does; applied here it would start a new workspace at three characters, which is the
  1% row of table C at 100 Tickets in order to save one character. It would need a new token or a
  changed meaning for `{n}`, and ids of mixed length in one Effort. **[inference]**
- **Counter plus short suffix, `T<N>-<b36{2..4}>`.** Already legal, and T56's warning already
  names `T<N>-<b36{4}>`. `T126-k4z` is sayable as far as the hyphen, carries creation order, and
  two of them differ visibly in the part a reader looks at first. It sorts by number only under a
  numeric-aware sort; a plain string sort puts `T10-…` before `T9-…`. The counter is dense, so
  T52's warning applies to the counter half: a mistyped digit lands on a real counter, but the
  suffix then fails to match, so the typo dangles and shows on the Board instead of resolving to
  the wrong Ticket. That is a safety property `T<N>` alone does not have. **[inference]** It mints
  under guards: two scans instead of one and guard files a crash can strand, the costs ADR 0006
  prices.
- **Per-Effort counter under the slug, `PROJ-123.1` (issue #53).** Sayable, ordered within its
  Effort, names its Effort. No random part, so table E's first row applies: a duplicate is certain
  whenever two unmerged trees each add a Ticket to the same Effort. With one Effort living on one
  branch, that needs two clones of that branch, or one Ticket filed into the Effort from the
  default branch while the Effort's branch also adds one. The same-tree case is covered by a guard
  keyed on slug plus counter. `<effort>.<n>-<b36{2}>` closes the cross-tree case at 0.77% per ten
  Tickets and costs the readability that was the point. Three legality facts from section 2 bind
  it: a slug that begins with a digit can produce `123.1`, which YAML reads as the number 123.1,
  and `1.10` and `1.1` as the same number; a slug must stay inside `[A-Za-z0-9._-]`; and the id
  is long (section 5).
- **A restricted alphabet (Crockford base32).** The specification excludes `I`, `L`, `O` ("Can be
  confused with 1 / 1 / 0") and `U` ("Accidental obscenity"), decodes `i`, `l` as 1 and `o` as 0,
  and says "When encoding, only upper case letters are used". **[sourced]**
  <https://www.crockford.com/base32.html>. It costs 4 of 36 symbols: Crockford `{5}` sits between
  `b36{4}` and `b36{5}` in table B. It removes the worst look-alikes and exactly one accidental
  word. Its upper-case encoding rule cannot be followed here, because APFS folds case and T35
  fixed the random alphabets to lower case; in lower case `l` is the character most worth
  removing. T35 already weighed it and chose base36 so that the validation pattern and the mint
  alphabet coincide. It would need a new token.
- **Pronounceable ids (proquints).** A proquint is five letters, consonant-vowel-consonant-vowel-
  consonant, from 16 consonants and 4 vowels: "we get 16 bits out of 5 letters". The proposal's
  example is `127.0.0.1` as `lusab-babad`. **[sourced]**
  <https://raw.githubusercontent.com/dsw/proquint/master/proquint-proposal.txt>. One quint is a
  space of 65,536, between `b36{3}` and `b36{4}`, at five characters where base36 needs three and
  a bit. Two quints are 32 bits in eleven characters. Sayable; no order. Needs a new token.
- **Word pairs.** Two words from the EFF short list of 1,296 words is 1,296² = 1,679,616
  possibilities, which is exactly 36⁴: `shrug-elder` has the same collision arithmetic as `Tk4z0`
  at twice the length. **[sourced]** for the list, <https://www.eff.org/files/2016/09/08/eff_short_wordlist_1.txt>;
  the equality is arithmetic. Sayable and easy to tell apart; no order; it produces phrases nobody
  chose (the sample run drew `army-slum`). Needs a word list shipped in the package and a new
  token.

### Comparison

Tokens are the `o200k_base` mean from section 5. "Two branches" is table B or E at ten new Tickets
a side, then fifty.

| Shape | Example | Chars | Tokens | Sayable | Sorts by creation | Look-alike risk | Two branches, 10 / 50 each | Coordination | Legal today |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `T<b36{6}>` | `Tik4z0t` | 7 | 4.58 | No | No | Yes | 0.0000046% / 0.00011% | None | Yes, the default |
| `T<b36{5}>` | `Tv05xg` | 6 | 3.96 | No | No | Yes | 0.00017% / 0.0041% | None | Yes |
| `T<b36{4}>` | `Tk4z0` | 5 | 3.29 | No | No | Yes | 0.0060% / 0.149% | None | Yes |
| `T<b36{3}>` | `T72v` | 4 | 2.83 | Barely | No | Yes | 0.215% / 5.23% | None | Yes |
| Crockford `{5}`, lower | `T8wzh1` | 6 | 4.08 | No | No | Reduced | 0.00030% / 0.0075% | None | No, new token |
| `T<N>` | `T126` | 2–5 | 2.00 | Yes | Numerically | Low | certain / certain | Guards | Yes, with a warning on every create |
| `T<N>-<b36{2}>` | `T126-k4` | 5–8 | 4.00 | Mostly | Numerically | Low | 0.769% / 3.79% | Guards | Yes |
| `T<N>-<b36{3}>` | `T126-k4z` | 6–9 | 4.75 | Mostly | Numerically | Low | 0.021% / 0.107% | Guards | Yes |
| `T<N>-<b36{4}>` | `T126-k4z0` | 7–10 | 5.29 | Mostly | Numerically | Low | 0.0006% / 0.0030% | Guards | Yes, the form T56 names |
| `<effort>.<n>` | `PROJ-123.4` | 10+ | 6.00 | Yes | Within its Effort | Low | certain when both trees add to one Effort | Guards per Effort | No, issue #53 |
| `<effort>.<n>-<b36{2}>` | `PROJ-123.4-k9` | 13+ | 8.13 | Partly | Within its Effort | Low | 0.769% / 3.79% within one Effort | Guards per Effort | No |
| One proquint | `T-tafug` | 7 | 3.58 | Yes | No | Low | 0.15% / 3.7% | None | No, new token |
| Two proquints | `dafis-bovat` | 11 | 5.13 | Yes | No | Low | negligible | None | No, new token |
| Word pair | `shrug-elder` | ~10 | 3.71 | Yes | No | None | 0.0060% / 0.149% | None | No, new token and a word list |
| Beads style | `bd-u1yz` | 7 | 4.04 | No | No | Yes | 0.0060% / 0.149% | None | Yes, as `bd-<b36{4}>` |

The one-proquint row is computed from the same formula with `N` = 65,536. "Legal today" for the
Beads style holds because a literal may contain `-`.

## 5. Token cost

**[measured]**. Three tokenizers, each a **proxy for whatever model reads the Board**:
`o200k_base` and `cl100k_base` from `js-tiktoken` 1.0.21 (OpenAI encodings), and
`@anthropic-ai/tokenizer` 0.0.4, Anthropic's published legacy tokenizer. None is the tokenizer of
a current model. The three agree to within about half a token per id on every shape, which is the
reason to believe the ordering and to distrust the third digit. The repository's own convention,
bytes divided by four (`test/support/tokens.ts`), would have put the default id at 1.75 tokens;
it is 4.6. Random strings tokenize badly, so that convention undercounts ids specifically.

Per id, 24 ids per shape from a seeded generator. Counted shapes use creation orders spread over
1 to 480. Mean, then minimum and maximum. "In context" is what one id adds when it follows
`blocked_by=` or a comma on a Board line, under `o200k_base`.

| Shape | Chars | `o200k_base` | `cl100k_base` | Anthropic legacy | In context | Samples |
| --- | --- | --- | --- | --- | --- | --- |
| `T<b36{6}>` (default) | 7.0 | 4.58 (3–6) | 4.71 (3–7) | 4.67 (3–6) | 3.96 | `Tqohq5v` `Txfkfi5` |
| `T<b36{5}>` | 6.0 | 3.96 (3–5) | 4.04 (3–5) | 4.04 (3–5) | 3.35 | `T1hxfm` `Tv05xg` |
| `T<b36{4}>` | 5.0 | 3.29 (2–5) | 3.46 (2–5) | 3.46 (2–5) | 2.75 | `Tlrom` `Th6oj` |
| `T<b36{3}>` | 4.0 | 2.83 (2–4) | 3.00 (2–4) | 2.96 (2–4) | 2.08 | `T72v` `Tkb0` |
| Crockford `{5}`, lower | 6.0 | 4.08 (3–6) | 4.17 (3–6) | 4.13 (3–5) | 3.38 | `T8wzh1` `Te23n2` |
| Crockford `{4}`, lower | 5.0 | 3.58 (2–5) | 3.67 (2–5) | 3.67 (2–5) | 2.81 | `Tvkz1` `Tq5yc` |
| Crockford `{5}`, upper | 6.0 | 3.71 (3–6) | 3.88 (3–6) | 3.88 (3–6) | 3.46 | `TR16DH` `T9QYB7` |
| `T<b16{7}>` | 8.0 | 4.83 (3–6) | 4.96 (4–6) | 4.92 (3–6) | 4.00 | `T0712066` `Tba1cf24` |
| `T<N>` | 3.8 | 2.00 (2–2) | 2.00 (2–2) | 2.00 (2–2) | 1.00 | `T5` `T29` |
| `T<N>-<b36{2}>` | 6.8 | 4.00 (3–5) | 4.04 (3–5) | 4.42 (4–5) | 3.00 | `T14-r9` `T32-ab` |
| `T<N>-<b36{3}>` | 7.8 | 4.75 (3–6) | 4.75 (3–6) | 5.21 (4–6) | 3.75 | `T17-ch3` `T28-2kw` |
| `T<N>-<b36{4}>` | 8.8 | 5.29 (4–7) | 5.29 (4–7) | 5.63 (4–7) | 4.29 | `T8-80ei` `T35-0n6s` |
| `PROJ-123.<n>` | 11.8 | 6.00 (6–6) | 6.00 (6–6) | 6.00 (6–6) | 6.00 | `PROJ-123.6` `PROJ-123.33` |
| `PROJ-123.<n>-<b36{2}>` | 14.8 | 8.13 (7–9) | 8.13 (7–9) | 8.54 (8–9) | 8.13 | `PROJ-123.17-l6` |
| `bd-<b36{4}>` | 7.0 | 4.04 (3–5) | 4.04 (3–5) | 4.58 (4–5) | 4.04 | `bd-u1yz` `bd-jatn` |
| `T-<proquint>` | 7.0 | 3.58 (3–4) | 3.67 (3–4) | 4.33 (4–5) | 2.58 | `T-tafug` `T-divus` |
| Two proquints | 11.0 | 5.13 (4–6) | 5.38 (4–6) | 5.96 (5–7) | 4.63 | `dafis-bovat` |
| Word pair | 10.1 | 3.71 (2–5) | 3.83 (2–5) | 4.29 (3–6) | 3.42 | `shrug-elder` `geek-knelt` |
| `#<N>` | 3.8 | 2.00 (2–2) | 2.00 (2–2) | 2.00 (2–2) | 1.00 | `#15` `#30` |
| UUID v4, for scale | 36.0 | 21.83 (18–25) | 21.92 (18–25) | 23.42 (20–28) | 21.67 | |

A Board of 100 Ticket lines, in `get_board`'s line format (`id  title  kind/status  triage=…
blocked_by=…  gist=…`), built from the first 100 Tickets of this repository with every id and
every Edge replaced by an id of the shape under test: 167 id occurrences, 100 own ids and 67
Edges. 77 lines carry a gist.

| Shape | Id tokens on the Board | Board without gists: `o200k` / `cl100k` / Anthropic legacy | Change from default | Board with gists (`o200k`) | Ids as a share of the gist-less Board |
| --- | --- | --- | --- | --- | --- |
| `T<b36{6}>` (default) | 795 | 3416 / 3419 / 3767 | 0 | 8074 | 23.3% |
| `T<b36{5}>` | 691 | 3306 / 3314 / 3670 | −110 | 7964 | 20.9% |
| `T<b36{4}>` | 577 | 3190 / 3191 / 3549 | −226 | 7848 | 18.1% |
| `T<b36{3}>` | 483 | 3091 / 3099 / 3455 | −325 | 7749 | 15.6% |
| Crockford `{5}`, lower | 704 | 3311 / 3317 / 3664 | −105 | 7969 | 21.3% |
| `T<N>` | 334 | 2924 / 2918 / 3299 | −492 | 7582 | 11.4% |
| `T<N>-<b36{2}>` | 681 | 3271 / 3271 / 3693 | −145 | 7929 | 20.8% |
| `T<N>-<b36{3}>` | 782 | 3372 / 3376 / 3829 | −44 | 8030 | 23.2% |
| `T<N>-<b36{4}>` | 886 | 3476 / 3476 / 3921 | +60 | 8134 | 25.5% |
| `PROJ-123.<n>` | 1002 | 3659 / 3653 / 3967 | +243 | 8317 | 27.4% |
| `PROJ-123.<n>-<b36{2}>` | 1373 | 4030 / 4024 / 4386 | +614 | 8688 | 34.1% |
| `bd-<b36{4}>` | 714 | 3371 / 3377 / 3750 | −45 | 8029 | 21.2% |
| `T-<proquint>` | 607 | 3197 / 3227 / 3704 | −219 | 7855 | 19.0% |
| Two proquints | 829 | 3467 / 3524 / 3931 | +51 | 8125 | 23.9% |
| Word pair | 577 | 3222 / 3228 / 3675 | −194 | 7880 | 17.9% |
| UUID v4 | 3652 | 6297 / 6308 / 6914 | +2881 | 10955 | 58.0% |

What the measurement says. **[measured]** for the numbers, **[inference]** for the reading.

- **Today's ids are almost a quarter of a gist-less Board.** The default's own argument, T35's
  "half the length" of a ULID, did not count this.
- **Token cost follows how word-like the id is, not how long it is.** A ten-character word pair
  costs fewer tokens than a seven-character random id. A counter costs two tokens up to three
  digits.
- **`T<N>-<b36{2}>` and `T<N>-<b36{3}>` cost no more than the default** while being the only legal
  shapes that are both ordered and merge-tolerant.
- **Issue #53's shape is the most expensive legal-looking one**, because the slug is repeated in
  every id: 26% more id tokens than today on a Board where, by construction, every line shares the
  Effort the Board header already names.
- **The whole range is a few percent of a real Board.** With gists, the best and worst practical
  shapes differ by about 550 tokens in 8,000. Readability is the argument for changing shape;
  token cost is a tie-breaker.

## 6. Is the leading `T` already the sigil?

Yes. **[inference]**, resting on sections 2 and 3.

`compileIdPattern` refuses any pattern whose first token is not a literal beginning with a letter
or underscore, and the reason it prints is the one this research re-derived from the surfaces: it
"keeps every id predicate anchored and narrow" and keeps an id from being "a YAML scalar with a
normalising alternate spelling". Section 2 found that a letter or underscore is the only marker
that survives YAML, filenames, git, both hosts and four shells, and section 1 found that every
file-based tracker surveyed uses a letter or word prefix or nothing. The marker the Ticket asks
about exists, is stored, is the consumer's to choose, and is already the cheapest one available.

So the complaint is about the tail. Three of its four parts, "cannot be said aloud, do not sort,
carry no hint of order", are a request for a counter, and no random tail of any length or alphabet
answers them. The fourth, "two of them are hard to tell apart at a glance", is helped by a shorter
tail and answered by a counter.

**The smallest change that answers it is a line of configuration, and it ships today:**

```yaml
# .scratch/frontier.yml
id_pattern: T<N>-<b36{3}>
```

New Tickets become `T126-k4z`. Existing `T<n>` and `T<b36{6}>` ids keep resolving as Edges where a
Ticket holds them. One consequence of ADR 0006 should be known before switching: under a
non-default pattern the old ids are outside the namespace, so `max + 1` starts from the highest
counter among ids that match the *new* pattern, which is 1 in a workspace that has none.
**[sourced]** from ADR 0006 and `counterMatcher`. A workspace holding `T1` to `T109` would mint
`T1-k4z` next to an existing `T1`. They are different ids and nothing breaks, but it reads badly;
whether a counted pattern should start above the highest number in sight is a question for the
build, not for this document.

**On issue #53's anchor.** The Ticket hoped a sigil would let `<effort>` stop costing the typo
check. It does not: no marker outside the legal alphabet survives, and a marker inside it in front
of the slug (`T-PROJ-123.1`) defeats the request. But the shape `<effort>.<n>` carries its own
anchor at the other end. A predicate of the form "a legal slug, then `.`, then digits" refuses
every key in T55's table (`blah`, `auth`, `parse`) for the same reason a prefix anchor does: none
of them ends in a dot and a number. The slug must begin with a letter or underscore for the YAML
reason shown in section 2, where `1.1` and `1.10` collapse into one number. What comes back is the
question T52 recorded as dissolved rather than answered, whether an unknown slug is well-formed.
The existing rule that a dangling Edge is a Board warning and never a refusal answers it one way;
that is `Tptzdka`'s decision.

## Recommendation

In priority order.

**1. Add no sigil mechanism, stored or written.** The literal-first rule is the sigil. Every
punctuation candidate fails at least one surface, and the two most natural ones fail worst: `#`
is a comment in YAML, in three shells and in an edited commit message, links to an unrelated pull
request on GitHub and can close it; `@` is reserved in YAML, splats in PowerShell and notifies a
stranger. A written-only marker gives every id a second spelling for no surviving benefit. Record
the result in ADR 0006 beside the leading-literal rule, so the next reader does not reopen it:
the rule exists for the typo check and for YAML, and it is also the id's marker.

**2. Answer the complaint with the counted-plus-suffix pattern, and name `T<N>-<b36{3}>` as the
readable form.** It is legal now, needs no tool, argument or token, costs the same tokens as the
default, and is the only shape in the comparison that is ordered, mostly sayable and merge-
tolerant at once. Three characters of suffix, not two: at ten Tickets a side `{2}` is 0.77% per
merge, which is a duplicate every hundred-odd merges, where `{3}` is 0.021%. `{4}`, the form T56's
warning names, is safer than anything needs and costs half a token more per id. Moving the named
form from `{4}` to `{3}` touches a pinned test and the tracker doc; it is a small build Ticket and
optional. This repository can adopt the pattern in `frontier.yml` today, with the counter-start
caveat in section 6.

**3. Keep the default random, and shorten it to `T<b36{4}>`.** The default has to mint with no
coordination and no guard files, which rules out a counter there. Within random, six characters
buys a safety margin nothing in tables B and C needs: four characters is 0.006% per merge of two
ten-Ticket branches and 0.3% over a 1000-Ticket life, for a duplicate that is loud and repaired by
renaming one file. It saves two characters and 1.3 tokens per id, 6.6% of a gist-less Board. The
change is one constant (`DEFAULT_ID_PATTERN`): the matcher already accepts any tail length, so no
existing id changes meaning and nothing migrates. It should be stated plainly as what it is,
shorter junk, and it is third because it answers only the smallest part of the complaint. If the
owner would rather keep a wider margin, `T<b36{5}>` is 0.008% over the same life and still saves a
character.

**4. For `Tptzdka`: the sigil does not decide it; the dot-counter tail can carry recognition.**
What this research contributes to that decision: a suffix anchor keeps T55's typo check without a
leading literal (section 6); a slug must begin with a letter or underscore and stay in the id
alphabet (section 2); the shape is the most expensive in tokens of any considered (section 5); it
collides with certainty when two unmerged trees add to one Effort, which the owner's stated
practice makes rare and nothing makes impossible (table E); `.n` already means "child of" in two
other trackers and in this repository's prose parser (section 1); and Backlog.md is a live example
of where a counted id in a branching markdown tracker leads, to scanning every branch on create
and then to a shared ref (section 1). The last point argues for keeping the cross-tree case a
warned, accepted exposure, as `T<N>` is today, and against ever trying to coordinate it.

## What this deliberately leaves out

- **A written-only or display-only sigil.** Section 3. It doubles every id's spelling and makes
  the Board print strings the tools refuse.
- **Short display ids over stored ids (Taskwarrior's split).** The display id changes; an agent
  copies ids into commit messages, where a changed id is a wrong id. A Handle already exists as
  the unstable address and is deliberately not an id.
- **Prefix lookup on input (git, git-bug, `ticket`).** T35 rejected it for the ambiguity it adds
  to `get_tickets`, Edge resolution and prose. Nothing found here changes that; shortening the
  stored id is the same saving without the failure mode.
- **Adaptive length.** It scales on store size, which is the wrong variable for a tracker whose
  duplicates come from unmerged branches, and it needs a new token for a one-character saving
  while the workspace is small.
- **A Crockford token.** It removes look-alikes that matter when a human transcribes an id by
  hand, which T35 chose not to optimise for, and a counter makes moot. It costs entropy and a
  second alphabet to document. Cheap to add later if transcription errors are ever observed.
- **Proquints and word pairs.** Sayable, and a word pair is even cheap in tokens, but each needs a
  new token, a word pair needs a word list in the package, neither carries order, and a word pair
  emits phrases nobody chose into commit history.
- **Renaming or re-minting any existing id.** Never; the contract forbids it and nothing here
  needs it.
- **A GitHub custom autolink for Ticket ids.** It could make `T126-k4z` clickable in pull
  requests. It is repository configuration outside `.scratch/`, and how its prefix matching treats
  a one-letter prefix was not verified.
- **Whether a counted pattern should start above existing `T<n>` numbers.** Raised in section 6;
  a build question with its own Ticket if recommendation 2 is taken.
- **Eliding the Effort slug from ids on a single-Effort Board** to recover issue #53's token cost.
  It is a display-only spelling and falls under the first item.

## What could not be verified

- **Host rendering.** Nothing was posted to GitHub or GitLab. Every autolink claim is from their
  documentation, including that `#12` in a commit message links and that closing keywords act
  there.
- **Whether GitLab renders `[[T52]]` as a wiki link inside a repository file view.** Its
  documentation lists the form; where it applies was not established.
- **Windows.** No filename test and no Windows PowerShell or `cmd.exe` test ran. The filename
  rules are Microsoft's documentation; PowerShell ran as 7.5.13 on Linux.
- **Linear's team identifier format and its commit "magic words".** The pages are rendered
  client-side and the fetched HTML did not contain them. Only the creation-order and
  move-between-teams statements were read.
- **Jira Cloud's key rules.** Only the Data Center page was read.
- **Phorge's current remarkup guide and its default ignore list.** The archived Phabricator
  sources were read instead.
- **Fossil's minimum ticket-prefix length**, and Backlog.md's duplicate-id tasks beyond their
  titles and the two files quoted.
- **Upstream commits.** Every file was read at the tip of its default branch on the date above;
  no commit hash was recorded.
- **The consuming model's tokenizer.** All three tokenizers are proxies. The ordering of shapes is
  consistent across them; absolute counts are not a promise.
- **Accidental words in random tails.** Not measured; there is no agreed list to measure against.
- **`-12` as an option flag to command-line tools.** Stated from general knowledge of option
  parsing, not run.
- **Anything timed.** No benchmark was run, so nothing was re-run under `taskpolicy -b`.
