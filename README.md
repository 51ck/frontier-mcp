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

- Node 20.20.2+ on 20.x, 22.17.1+ on 22.x, or 24.15.0+ on 24.x to run the published package
- npx to run it; pnpm for development of this package

The emitted package supports those three release lines from their stated floors; it does not claim
odd-numbered or later Node majors. Node 24 LTS is recommended for new installations. Node 20 is
compatible with the compiled package but is end-of-life. Developing FrontierMCP still requires Node
24 because `node src/bin.ts` uses Node's native TypeScript execution; consumers run the emitted
`dist/bin.js` instead.

The package-runtime check has been run on macOS arm64 with Node 20.20.2, 22.17.1, and 24.15.0.
[Compatibility CI](https://github.com/51ck/frontier-mcp/actions/runs/34771254854) passed those versions
on macOS, Linux, and Windows. This verifies the package; manager setup has separate checks.

## Set up from a Node 16 project (source checkout)

The released `0.3.1` package still declares `Node >=24`. The source checkout contains a bootstrap for
testing the next installation path; it is not yet a downloadable released artifact. The release-ready
package includes bootstrap revision 1, but a public versioned download can exist only after a release
has an actual tag or asset. It runs under Node 16, installs the requested released package outside the
project, and saves an absolute compatible Node path for Cursor. It never changes the project's Node
pin, package files, or lockfile. The bootstrap is tested on Node 16.20.2; the setup smoke selects
Node 24.15.0. Those are tested floors, not a claim about every older Node 16 release.

From this source checkout, choose an already installed compatible Node and an exact released pin:

```bash
node scripts/frontier-setup.cjs --version 0.3.1 --node /absolute/path/to/node --apply
```

For a release that contains `scripts/frontier-setup.cjs`, the bootstrap can be extracted directly
from its registry tarball without installing the server or evaluating its engine requirement. This
is the distribution procedure for the next release; `0.3.1` does not contain the file. Set
`VERSION` to the exact published version after confirming that its tarball includes the bootstrap:

```bash
VERSION=X.Y.Z
curl --fail --location "https://registry.npmjs.org/frontier-mcp/-/frontier-mcp-${VERSION}.tgz" --output frontier-mcp.tgz
tar -xzf frontier-mcp.tgz package/scripts/frontier-setup.cjs
node package/scripts/frontier-setup.cjs --version "$VERSION" --node /absolute/path/to/node
```

Review the preview, then repeat the last command with `--apply` for Cursor user scope. For another
client, replace `--apply` with `--client manual` and copy the printed `frontier` entry into its user
configuration. Downloads and extraction run in a temporary directory outside the consumer project;
run the bootstrap with the consumer project as the working directory if its runtime needs discovery.
The commands above are a release procedure, not a working quick-start for `0.3.1`.

When the current Node is too old, omit `--node` and setup looks only at already installed releases
from fnm, nvm, nvm-windows, Volta, asdf, and mise. It keeps the current Node if it is suitable;
otherwise it prefers Node 24 LTS, then the highest compatible managed version. An explicit `--node`
always wins. Setup queries installed-version commands first, then probes the known local layouts if
the command is unavailable, fails, or returns unrecognized output. nvm runs in a child shell loaded
with `--no-use`; no startup profile is sourced. Discovery never installs a runtime, changes a manager's default, writes a project pin,
or loads a shell profile. If no detected manager has a suitable release, setup prints that manager's
Node 24 installation command. With no manager, it recommends `fnm install 24`.

The setup smoke has verified fnm discovery on macOS arm64. Its nvm, nvm-windows, Volta, asdf, and
mise layouts are simulated from their documented on-disk locations; Windows and Linux manager behavior
has not been measured locally. The runtime compatibility CI matrix is configured separately from these
manager fixtures. The setup CI matrix provisions real fnm on all three operating systems and checks
registration and the saved launcher; its first successful run is still pending.

The saved entry runs a generated launcher that holds the real Node executable and package entry, so
`.nvmrc`, `.tool-versions`, `mise.toml`, Volta pins, and an editor's stripped `PATH` cannot select the
project's Node 16. If that managed executable is later removed, the launcher writes its manager's
repair command to stderr; rerun setup after repairing it. Use the automatic setup whenever possible:
it verifies this exact command before saving it.
Windows uses a `.cmd` launcher and requires a client with batch-file support, such as clients built
with the MCP SDK's stdio transport. Setup checks that launcher through the system `cmd.exe`.

For a terminal-only manual launch, resolve the package entry once and make the manager choose an
installed version explicitly. Replace `ENTRY` with the absolute `dist/bin.js` path of the pinned
installation. These are manager commands, not desktop configuration: editors often do not load the
shell setup that places a manager on `PATH`.

| Manager | Manual terminal launch |
| --- | --- |
| fnm | `fnm exec --using 24.15.0 node "ENTRY"` |
| nvm (macOS/Linux) | `. "$NVM_DIR/nvm.sh" --no-use && nvm exec 24.15.0 node "ENTRY"` |
| nvm-windows (cmd.exe) | `"C:\path\to\nvm\v24.15.0\node.exe" "ENTRY"` |
| Volta | `volta run --node 24.15.0 node "ENTRY"` |
| asdf | `ASDF_NODEJS_VERSION=24.15.0 asdf exec node "ENTRY"` |
| mise | `mise exec node@24.15.0 -- node "ENTRY"` |

Use an exact version already installed by that manager. Some manual commands can download a missing
version; setup only examines local installations. Set `NVM_DIR` to your nvm installation directory
before the nvm recipe. For desktop clients, prefer the absolute Node path produced by setup over
these shell-dependent commands.

The bootstrap reads that pin's registry metadata before installing it. For `0.3.1`, pass a Node 24
executable; the newer source package range does not change the requirements of an existing release.
It uses pnpm associated with that selected Node, or its Corepack installation. If neither is present,
it stops with pnpm installation guidance and makes no project or Cursor changes. Run without `--apply`
to preview, add `--client manual` to print an entry for another client, and add `--replace` only after
reviewing a different existing `frontier` entry. A replacement creates a backup beside Cursor's config.

The script runs its exact saved command through MCP initialization and `tools/list` in a temporary empty
directory before it touches Cursor. It refuses malformed Cursor JSON and changes detected after it
prepares the backup and replacement file. An unrelated editor can still write in the one final-read to
rename syscall interval; the bootstrap cannot make that uncooperative writer participate in its guard.
Each changed existing configuration has a backup of the prior file. To restore it, stop concurrent
configuration edits and copy the printed `Backup:` path over `~/.cursor/mcp.json`, then restart Cursor.
That backup cannot recover an unrelated edit made after the final check.

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

MIT — see [LICENSE](./LICENSE).
