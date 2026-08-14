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

- Node 24 or later
- npx to run it; pnpm for development of this package

## Install once (user scope)

Register FrontierMCP once in your **user-level** MCP config, pinned to a released version. Every
repository you open then gets the server automatically — no per-repo `mcp.json` file.

In Cursor, edit `~/.cursor/mcp.json` (create the file if it does not exist); other MCP clients take the
same command and arguments in their own user-scope server list:

```json
{
  "mcpServers": {
    "frontier": {
      "command": "npx",
      "args": ["-y", "frontier-mcp@x.y.z"]
    }
  }
}
```

Replace `x.y.z` with a published version — see the
[releases](https://github.com/51ck/frontier-mcp/releases). The pin is the version you get; nothing
bumps it for you.

Restart your editor after saving.

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
4. Bump the pinned version in your user MCP config (`frontier-mcp@x.y.z`) when you want the
   new build — pins stay manual on purpose.

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

MIT
