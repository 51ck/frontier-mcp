# frontier-mcp

An MCP server that serves the markdown issue tracker under `.scratch/` as a queryable graph — so agents
stop re-parsing prose to learn what is open, blocked, or takeable.

## Stability

**Pre-1.0: the API can change in a breaking way on any release.** The tool surface is fixed at eight
tools, but their arguments, results, and the on-disk conventions under `.scratch/` are still being
settled. Semver is honoured within `0.x` as best it can be, and the
`CHANGELOG.md` records every break, but a `0.x` bump is not a promise of compatibility. Pin an exact
version (see below) and read the changelog before moving the pin. From `v1.0.0` on, breaking changes
wait for a major.

## Requirements

- Node 20.20.2+ on 20.x, 22.17.1+ on 22.x, or 24.15.0+ on 24.x for `frontier-mcp@0.5.0`
- Node 16.20.2+ to run the setup bootstrap; pnpm for development of this repository

Node 24 LTS is recommended for new installations. The package floors passed on macOS, Linux, and Windows in
[runtime CI](https://github.com/51ck/frontier-mcp/actions/runs/43211864369), on commit `7bc26d9`.
That commit has the same tree as `9c28ac4`; the `v0.5.0` commit adds only the version bump and
changelog.

## Install

Register FrontierMCP once in the client's user scope. The recommended setup downloads the bootstrap
from the published 0.5.0 tarball, installs the exact 0.5.0 server outside your project, verifies its
MCP handshake, and previews a Cursor user-scope entry before applying it. The guide states what was
measured for 0.5.0 and what still rests on earlier releases.

```sh
SETUP_DIR="$(mktemp -d)"
curl -fsSL https://registry.npmjs.org/frontier-mcp/-/frontier-mcp-0.5.0.tgz \
  -o "$SETUP_DIR/frontier-mcp-0.5.0.tgz"
tar -xzf "$SETUP_DIR/frontier-mcp-0.5.0.tgz" -C "$SETUP_DIR" \
  package/scripts/frontier-setup.cjs
node "$SETUP_DIR/package/scripts/frontier-setup.cjs" --version 0.5.0 --apply
```

It may run from a project pinned to Node 16; project runtime markers are evaluated later from the
client's working directory when the saved launcher starts. Omit `--apply` for a preview. For a manual
Cursor entry instead:

```json
{
  "mcpServers": {
    "another-server": {
      "command": "/absolute/path/to/another-server"
    },
    "frontier": {
      "command": "npx",
      "args": ["-y", "frontier-mcp@0.5.0"]
    }
  }
}
```

Restart Cursor after saving. The pin is the version you get; updates remain manual.

For Claude Code, register it with the CLI rather than editing a file:

```sh
claude mcp add --scope user frontier -- npx -y frontier-mcp@0.5.0
```

Claude Code keeps user and local scope in `~/.claude.json` and reads project scope from
`.mcp.json` in the directory it starts in and every directory above it. For Codex, `codex mcp add frontier -- npx -y frontier-mcp@0.5.0`
writes `~/.codex/config.toml`.

User scope is the recommendation: one entry serves every repository. To pin a version per
repository and commit it for a team instead, put the same `frontier` entry in the file each client
reads from the repository root:

| Client | Per-repository file |
| --- | --- |
| Claude Code | `.mcp.json` (each user approves it once; `claude mcp list` shows it pending until then) |
| Cursor | `.cursor/mcp.json` |
| Codex | Not verified. `codex mcp add` writes user scope, `~/.codex/config.toml`; whether Codex reads a project-level file is untested here |

Neither Claude Code nor Cursor reads `.agents/mcp.json`. This repository keeps its entry there and
makes it reachable by committing `.mcp.json` and `.cursor/mcp.json` as symlinks to it; copying
only `.agents/mcp.json` leaves Claude Code and Cursor without the server, and neither reports an
error. To see which files declare `frontier` and which installed clients read them, run the setup
script's doctor from the repository.

Published releases through 0.6.0 ship bootstrap revision 2, which rejects `--doctor` and
`--client claude-code`. Until a release carries revision 3, run the doctor from a source checkout:

```sh
node path/to/frontier-mcp/scripts/frontier-setup.cjs --doctor --project .
```

The [installation guide](docs/installation.md) covers Node 16 projects, a PowerShell bootstrap,
runtime managers, absolute desktop paths, Bun and Deno (enabled only for older pins), other
clients, updates, recovery, and removal.

## First use in a repository

1. Open the repository in your editor. FrontierMCP resolves the workspace from the session working
   directory — walking upward to the nearest `.scratch/`, or `.git` in either form — so opening the
   project is the only setup step. A git worktree is its own workspace: it carries `.git` as a file,
   and it is served instead of the repository it was made from.
2. Read the tracker configuration document once: fetch MCP resource `frontier://tracker-doc`, or read
   [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) in a repo that vendors it.
3. Call `list_efforts` to see whether `.scratch/` exists yet.
4. Call `get_board` on an Effort to see the Frontier, then `get_tickets` only for the Tickets you work.

A repository with no `.scratch/` directory is not an error. Create the first Effort with
`create_tickets`, `edit_map`, or `spec` and `create: true`.

## Ticket names

A Ticket is named by its path: `<effort>.<name>`, the name being its file's stem, so
`.scratch/auth/issues/token-cache.md` is `auth.token-cache`. Whoever creates a Ticket chooses the
name — one to three words for what it is — and Edges use it: bare inside the Effort, in full across
Efforts.

```json
{
  "effort": "auth",
  "tickets": [
    { "name": "token-cache", "title": "Cache the access token" },
    { "name": "refresh-flow", "title": "Refresh an expired token", "blocked_by": ["token-cache"] }
  ]
}
```

A Ticket whose frontmatter carries an `id` is named by that id instead. The naming rules, the
references a call accepts and the hand-written file conventions are in
[`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md); the reasoning is in
[ADR 0008](docs/adr/0008-a-ticket-is-named-by-its-path.md).

## Upgrading from 2.x

**Existing Tickets stop being Tickets on upgrade.** In 3.0 a file is a Ticket only when its
frontmatter carries the line `frontier: ticket` and it sits directly in an Effort's `issues/`
([ADR 0009](docs/adr/0009-a-ticket-is-recognized-by-an-explicit-marker.md)). Until the line is
added, a 2.x Ticket is an unmarked file: off every Board, off the Frontier, never written. Its id
and its name come back unchanged once it is marked.

**The server never adds the marker.** Nothing is migrated, normalized or moved, and
`migrate_effort` is gone. Add the line by hand, or have an agent add it, after upgrading:

```yaml
---
frontier: ticket
id: T12
title: Cache the access token
status: open
---
```

To find the files to mark:

- `list_efforts` suffixes an Effort `unmarked=N` while N of its `issues/` files have frontmatter
  holding `title` and `status` but no marker.
- `get_board` names them on an `unmarked-ticket-like` warning line, three at a time with a count.
- `check_tracker` lists every one, with the schema, the layout contract and a valid example.
- A file with no frontmatter at all, such as one 2.x read from prose, is not listed. Run 2.x's
  `migrate_effort` on its Effort before upgrading, or write its frontmatter by hand.

Once marked, a file must also validate. One that does not — an unknown `status`, a missing `title`,
YAML that does not parse — is counted `excluded=N` and named on the Board with its fault, and
`get_tickets` on its name gives the detail. A hand edit carries no revision check, so mark files
while no session is writing to the tracker. A vendored copy of the tracker document should be
replaced with revision 9.

## Upgrading from 1.x

**Existing Tickets need no action.** Every id a file already carries keeps resolving, as an Edge and
as tool input, and no existing file is renamed or rewritten. There is no migration step.

One case needs a hand: two files of one Effort with no `id` whose names differ only in the `NN-`
prefix, such as `01-notes.md` and `02-notes.md`. Both are now called `notes`. The Board lists them
under `duplicate names`, and every write to either is refused until one file is renamed.

What breaks in 2.0:

- **`create_tickets` takes `name` and refuses `key`.** Every Ticket in the call needs a `name`, and
  siblings in one call name each other by it.
- **A created Ticket is `issues/<name>.md`** with no `id` field and no `NN-` sort-order prefix.
  Anything that read an id out of a new file or its filename finds none.
- **Nothing mints an id.** `id_pattern` in `.scratch/frontier.yml` is ignored; a file that still
  sets it draws one Board warning and can be deleted.
- **`<effort>#<order>` is gone**, and so is the Board's `no id` warning. A Ticket with no `id` is
  addressed by its name.
- **A fenced Ticket holding keys outside the schema** is counted on the Board as holding Unimported
  keys, and `update_ticket` `drop_keys` removes them.
- **A Board lists blockers above the Tickets they block.** An existing `NN-` prefix only breaks
  ties.
- **An Edge that looks like a slip is refused** rather than left dangling: a near miss of an
  existing name, a bare name only another Effort has, or the Board's `T9@beta` form.
- **Two branches adding the same name conflict in git** (add/add). Rename one side's file before
  merging.
- **Creating a Ticket needs a filesystem with hard links.**

An Effort slug that would step outside `.scratch/` is refused, as it has been since 1.0.1. A vendored
copy of the tracker document should be replaced with revision 8. Then read
[Upgrading from 2.x](#upgrading-from-2x).

## Override the workspace

Optional, per call or per session:

- Pass `root` on any tool call to read another directory.
- Set `FRONTIER_ROOT` in the server environment for a non-standard layout.

The working directory is the one your client launched the server in, and it is fixed for the session.
Moving to another worktree mid-session does not retarget it — use `root`, `FRONTIER_ROOT`, or restart
the server.

## Tools

Eight tools: `list_efforts`, `get_board`, `get_tickets`, `create_tickets`, `update_ticket`,
`edit_map`, `spec`, `check_tracker`. See the tracker configuration document for when to use each.

## Development

```bash
pnpm install
pnpm test
pnpm run check
pnpm run build
pnpm run test:runtime
FRONTIER_NODE16=/path/to/node16 FRONTIER_NODE24=/path/to/node24 pnpm run test:setup
node src/bin.ts
```

## Releasing

Publishing is CI-only via [release-it](https://github.com/release-it/release-it). There is no local
publish script, and adding one would mean minting the long-lived npm token that the CI setup exists
to avoid.

1. Merge the work you want to ship to `master`.
2. On GitHub: **Actions → Release → Run workflow**, pick `auto` / `patch` / `minor` / `major`.
   `auto` is the default and derives the bump from the conventional commits since the last release —
   `feat:` gives a minor, `fix:` a patch. Pick an explicit one to override it. If nothing since the
   last tag is releasable, `auto` exits green having shipped nothing, so confirm a new tag appeared.
3. The workflow runs checks + tests, bumps `package.json`, updates `CHANGELOG.md`, tags
   `v*`, creates a GitHub Release, and publishes to npm with `pnpm`.
4. Replace the current `frontier-mcp@0.5.0` pin in your user MCP config with the exact version you
   released when you want the new build — pins stay manual on purpose.

The workflow is dispatchable from any branch but refuses to run off `master`: release-it commits,
tags and pushes as part of the run, so a release from a feature branch would rewrite that branch.

Local dry-run (no tag, no publish). It needs a clean working tree and an upstream branch, so commit
first:

```bash
pnpm run release:dry
```

npm publishing uses **Trusted Publishing** — GitHub Actions OIDC, configured for this repo on
npmjs.com, so there is no `NPM_TOKEN` to rotate.

Before changing `.release-it.json` or the workflow, read the release-it bullet in
[AGENTS.md](./AGENTS.md) Work Guidance. Several settings there look removable and are not — the
absent `registry-url`, `npm.skipChecks`, `npm.publishArgs`, and the pnpm 10 pin each exist for a
reason recorded in one place so it cannot drift.

## License

MIT — see [LICENSE](./LICENSE).
