# frontier-mcp

An MCP server that serves the markdown issue tracker under `.scratch/` as a queryable graph — so agents
stop re-parsing prose to learn what is open, blocked, or takeable.

## Stability

**Pre-1.0: the API can change in a breaking way on any release.** The tool surface is fixed at eight
tools, but their arguments, results, and the on-disk conventions under `.scratch/` are still being
settled — Ticket id format among them. Semver is honoured within `0.x` as best it can be, and the
`CHANGELOG.md` records every break, but a `0.x` bump is not a promise of compatibility. Pin an exact
version (see below) and read the changelog before moving the pin. From `v1.0.0` on, breaking changes
wait for a major.

## Requirements

- Node 20.20.2+ on 20.x, 22.17.1+ on 22.x, or 24.15.0+ on 24.x for `frontier-mcp@0.4.0`
- Node 16.20.2+ to run the setup bootstrap; pnpm for development of this repository

Node 24 LTS is recommended for new installations. The package floors passed on macOS, Linux, and Windows in
[runtime CI](https://github.com/51ck/frontier-mcp/actions/runs/35074448965).

## Install

Register FrontierMCP once in the client's user scope. The recommended setup downloads the bootstrap
from the published 0.4.1 tarball, installs the exact 0.4.0 server outside your project, verifies its
MCP handshake, and previews a Cursor user-scope entry before applying it. npm's current release is
0.4.1; the server stays pinned to 0.4.0 here because that is the exact version covered by the runtime
measurements in the installation guide.

```sh
SETUP_DIR="$(mktemp -d)"
curl -fsSL https://registry.npmjs.org/frontier-mcp/-/frontier-mcp-0.4.1.tgz \
  -o "$SETUP_DIR/frontier-mcp-0.4.1.tgz"
tar -xzf "$SETUP_DIR/frontier-mcp-0.4.1.tgz" -C "$SETUP_DIR" \
  package/scripts/frontier-setup.cjs
node "$SETUP_DIR/package/scripts/frontier-setup.cjs" --version 0.4.0 --apply
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
      "args": ["-y", "frontier-mcp@0.4.0"]
    }
  }
}
```

Restart Cursor after saving. The pin is the version you get; updates remain manual.

The [installation guide](docs/installation.md) covers Node 16 projects, a PowerShell bootstrap,
runtime managers, absolute desktop paths, Bun 0.4.0 support, Deno's Node fallback, other clients,
updates, recovery, and removal.

## First use in a repository

1. Open the repository in your editor. FrontierMCP resolves the workspace from the session working
   directory — walking upward to the nearest `.scratch/`, or `.git` in either form — so opening the
   project is the only setup step. A git worktree is its own workspace: it carries `.git` as a file,
   and it is served instead of the repository it was made from.
2. Read the tracker configuration document once: fetch MCP resource `frontier://tracker-doc`, or read
   [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) in a repo that vendors it.
3. Call `list_efforts` to see whether `.scratch/` exists yet.
4. Call `get_board` on an Effort to see the Frontier, then `get_tickets` only for the ids you work.

A repository with no `.scratch/` directory is not an error. Create the first Effort with
`create_tickets`, `edit_map`, or `spec` and `create: true`.

## Override the workspace

Optional, per call or per session:

- Pass `root` on any tool call to read another directory.
- Set `FRONTIER_ROOT` in the server environment for a non-standard layout.

The working directory is the one your client launched the server in, and it is fixed for the session.
Moving to another worktree mid-session does not retarget it — use `root`, `FRONTIER_ROOT`, or restart
the server.

## Tools

Eight tools: `list_efforts`, `get_board`, `get_tickets`, `create_tickets`, `update_ticket`,
`edit_map`, `spec`, `migrate_effort`. See the tracker configuration document for when to use each.

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
4. Replace the current `frontier-mcp@0.4.0` pin in your user MCP config with the exact version you
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
