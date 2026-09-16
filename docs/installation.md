# Install FrontierMCP

FrontierMCP is installed once in an MCP client's user configuration. That one server can serve every
repository you open. Pin the package to an exact version: pre-1.0 releases may contain breaking
changes, and pins never update themselves.

## Current release

The current release is `frontier-mcp@0.3.1`. It requires Node 24. A simple Cursor user
configuration is:

```json
{
  "mcpServers": {
    "frontier": {
      "command": "npx",
      "args": ["-y", "frontier-mcp@0.3.1"]
    }
  }
}
```

Save it as `~/.cursor/mcp.json`, preserving any other entries under `mcpServers`, then restart
Cursor. Other MCP clients use the same command and arguments in their user-level server list.

This direct `npx` form uses the Node and `npx` on the client's `PATH`. Desktop applications often
start with a smaller `PATH` than a terminal and do not load shell-managed runtimes. Use an absolute
executable or the setup bootstrap when that applies.

## Runtime requirements

The current source emits a package for Node 20.20.2+ on 20.x, 22.17.1+ on 22.x, and 24.15.0+ on
24.x. Node 24 LTS is the recommendation for a new installation. Node 20 is compatible with that
emitted package but is end-of-life. The published `0.3.1` package predates this range and declares
Node 24 or newer, so use Node 24 for every `0.3.1` example in this guide.

The package-runtime matrix passed the three stated floors on macOS, Linux, and Windows in
[runtime CI run 35074448965](https://github.com/51ck/frontier-mcp/actions/runs/35074448965). The same
run passed the real-fnm setup job on all three operating systems.

The bootstrap's minimum is Node 16.20.2. Older Node 16 releases are not supported. The bootstrap
selects a separate supported Node for the server and stores that Node's absolute path. It does not
change the project's `.nvmrc`, `package.json`, lockfile, manager default, or shell profile. A project
pinned to Node 16 can therefore use FrontierMCP without changing its own runtime.

Developing FrontierMCP itself requires Node 24 because the source runs through Node's native
TypeScript support. Consumers run the compiled `dist/bin.js` and follow the published package's
engine range instead.

## Automatic setup

Automated setup is the recommended installation path once a release includes
`scripts/frontier-setup.cjs`. The current release, `0.3.1`, does not include that file, so there is no
released bootstrap download command yet. Do not extract it from the `0.3.1` tarball.

The bootstrap can currently be exercised from this source checkout with the released package pin:

```sh
node scripts/frontier-setup.cjs --version 0.3.1 --node "/absolute/path/to/node" --apply
```

Run it from the consumer project so runtime-marker discovery starts there. Omit `--apply` to preview
the change. Omit `--node` to let setup search installed versions from fnm, nvm, nvm-windows, Volta,
asdf, and mise. It keeps a compatible current Node; otherwise it prefers Node 24 LTS and then the
highest compatible managed version. Discovery never installs Node. If no suitable version exists,
setup prints the relevant installation command. If no manager exists, install fnm and run
`fnm install 24`.

Setup reads the pinned release's engine declaration, installs that exact package in an immutable
user-data directory, and verifies MCP initialization plus `tools/list`. It then prints the proposed
entry. `--apply` writes Cursor user scope. For another client, use `--client manual` and copy the
printed `frontier` entry into that client's user configuration. Use `--replace` only after reviewing
a different existing `frontier` entry; setup creates a backup first.

The generated launcher stores absolute paths, including paths with spaces, and needs no arguments in
the client configuration:

```json
{
  "mcpServers": {
    "another-server": {
      "command": "/absolute/path/to/another-server"
    },
    "frontier": {
      "command": "/absolute/path/to/generated/frontier-launcher",
      "args": []
    }
  }
}
```

On Windows, setup creates a `.cmd` launcher and tests it through the system `cmd.exe`. The client
must support batch-file commands. Setup refuses malformed Cursor JSON and a file changed since its
preview. A separate editor can still write between setup's final read and rename; close concurrent
configuration editors before applying or restoring a backup.

## Select Node manually

Use an exact installed Node release and resolve its real executable before configuring a desktop
client. First open a shell under a compatible Node selected by your manager and install the package
outside the consumer project. This POSIX recipe gives the exact pin a stable directory and prints
the absolute `ENTRY` used below:

```sh
INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/frontier-mcp/0.3.1"
mkdir -p "$INSTALL_DIR"
pnpm --dir "$INSTALL_DIR" add --save-exact frontier-mcp@0.3.1
ENTRY="$INSTALL_DIR/node_modules/frontier-mcp/dist/bin.js"
test -f "$ENTRY" && printf '%s\n' "$ENTRY"
```

The PowerShell equivalent is:

```powershell
$InstallDir = Join-Path $env:LOCALAPPDATA "frontier-mcp\0.3.1"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
pnpm --dir "$InstallDir" add --save-exact frontier-mcp@0.3.1
$Entry = Join-Path $InstallDir "node_modules\frontier-mcp\dist\bin.js"
if (-not (Test-Path -LiteralPath $Entry)) { throw "FrontierMCP entry was not installed" }
$Entry
```

Both commands require pnpm in that compatible Node shell and may access the npm registry. They do
not add files to the consumer project. The examples below use 24.15.0, the supported 24.x floor in
the current source. Commands in the last column run the absolute `ENTRY`; quotes protect paths with
spaces.

| Manager | Discover and install | Resolve or run 24.15.0 |
| --- | --- | --- |
| fnm | `fnm list`; if missing, `fnm install 24.15.0` | `fnm exec --using 24.15.0 node -p "process.execPath"`; `fnm exec --using 24.15.0 node "ENTRY"` |
| nvm (macOS/Linux) | `. "$NVM_DIR/nvm.sh" --no-use`; `nvm ls --no-colors`; if missing, `nvm install 24.15.0` | `nvm exec 24.15.0 node -p "process.execPath"`; `nvm exec 24.15.0 node "ENTRY"` |
| nvm-windows (`cmd.exe`) | `nvm list`; `nvm root`; if missing, `nvm install 24.15.0` | Use `ROOT\v24.15.0\node.exe`; run `"ROOT\v24.15.0\node.exe" "ENTRY"` |
| Volta | `volta list all`; if missing, `volta fetch node@24.15.0` | `volta run --node 24.15.0 node -p "process.execPath"`; `volta run --node 24.15.0 node "ENTRY"` |
| asdf | `asdf list nodejs`; if missing, `asdf install nodejs 24.15.0` | `ASDF_NODEJS_VERSION=24.15.0 asdf which node`; `ASDF_NODEJS_VERSION=24.15.0 asdf exec node "ENTRY"` |
| mise | `mise ls --installed --no-header node`; if missing, `mise install node@24.15.0` | `mise which node --tool node@24.15.0`; `mise exec node@24.15.0 -- node "ENTRY"` |

For nvm, set `NVM_DIR` to the actual installation directory. Avoid `nvm use` in nvm-windows: it
changes a shared symlink used by other consoles. For a desktop client, store the resolved absolute
Node path and the absolute JavaScript entry rather than a manager command or shim:

```json
{
  "mcpServers": {
    "another-server": {
      "command": "/absolute/path/to/another-server"
    },
    "frontier": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/frontier-mcp/dist/bin.js"]
    }
  }
}
```

The bootstrap has direct fixture coverage for discovery, layout fallback, absolute-path selection,
and repair instructions for all six managers. Real fnm setup has passed on macOS, Linux, and Windows
in [runtime CI run 35074448965](https://github.com/51ck/frontier-mcp/actions/runs/35074448965).
The other manager integrations use representative fixtures; treat them as recipes with automated
contract coverage rather than measurements of every manager and operating-system release.

## Bun and Deno projects

The saved launcher chooses a runtime when the MCP server starts. It walks upward from the launch
directory to the nearest `.scratch/` directory or `.git` file or directory, then checks markers from
the launch directory through that workspace root. It does not inspect siblings or ancestors above
the root.

- Bun markers are `packageManager: "bun@..."` in `package.json`, `bun.lock`, and `bun.lockb`.
- Deno markers are `deno.json`, `deno.jsonc`, and `deno.lock`.
- Mixed Bun and Deno markers use the configured Node and report the conflict on stderr.
- No workspace marker or no runtime marker also uses Node with an stderr explanation.

Set `FRONTIER_RUNTIME` to `node`, `bun`, or `deno` in the MCP server's environment to override marker
selection. The override still has to pass the compatibility allowlist. Runtime selection happens
once at server startup; changing a tool's `root` argument does not restart or retarget that process.

The only measured alternate-runtime tuple is `frontier-mcp@0.3.1` on macOS arm64 with Bun 1.3.14 or
Deno 2.9.6. Every other package version, runtime version, platform, or architecture falls back to
the configured Node. Supply `--bun "/absolute/path/to/bun"` or
`--deno "/absolute/path/to/deno"` during setup when a desktop application cannot see those programs
on `PATH`.

The exact measured launch commands are:

```sh
bun x --bun frontier-mcp@0.3.1
deno run --no-config --no-lock --node-modules-dir=none --no-prompt \
  --allow-read --allow-write --allow-env npm:frontier-mcp@0.3.1
```

For a manual user-scope MCP configuration, map those commands to `command` and `args`. Use one
`frontier` entry and retain every unrelated server. Bun:

```json
{
  "mcpServers": {
    "another-server": {
      "command": "/absolute/path/to/another-server"
    },
    "frontier": {
      "command": "/absolute/path/to/bun",
      "args": ["x", "--bun", "frontier-mcp@0.3.1"]
    }
  }
}
```

Deno:

```json
{
  "mcpServers": {
    "another-server": {
      "command": "/absolute/path/to/another-server"
    },
    "frontier": {
      "command": "/absolute/path/to/deno",
      "args": [
        "run",
        "--no-config",
        "--no-lock",
        "--node-modules-dir=none",
        "--no-prompt",
        "--allow-read",
        "--allow-write",
        "--allow-env",
        "npm:frontier-mcp@0.3.1"
      ]
    }
  }
}
```

`--bun` overrides the package's Node shebang. The Deno command ignores project configuration and
lockfiles, creates no project `node_modules`, grants only filesystem and environment access, and
cannot prompt for more permissions. Either package runner may contact the registry when its cache
lacks `0.3.1`. If an allowed alternate runtime starts and package resolution then fails, the launcher
exits with that error instead of starting Node after a partial launch.

On the measured tuple, Bun and Deno passed MCP initialization, tool and resource calls, filesystem
watcher invalidation after the settle period, and real cross-process claim and id-allocation checks.
Equivalent Windows, Linux, and other-architecture behavior remains unverified. Node is the supported
fallback for those cases.

## Update, recover, or remove

To update, choose an exact published version after reading `CHANGELOG.md`, then rerun setup with that
pin. Setup installs versions in separate directories and prints a new launcher entry; it does not
move an existing pin. Restart the MCP client after applying the new entry.

For the direct `npx` configuration, replace `frontier-mcp@0.3.1` with the exact released pin and
restart. For an absolute Node/`ENTRY` configuration, repeat the manual install recipe with the new
pin in a new versioned directory. Change the `frontier` entry's first `args` value to that new
absolute `dist/bin.js` path. If the new package requires a different Node executable, change
`command` to its new absolute path too. Keep the prior directory until the new entry has completed an
MCP restart successfully. Bun and Deno pins are version-coupled to their measured allowlist; use Node
until the new package/runtime tuple has been verified.

If setup replaced a Cursor configuration, it prints `Backup: PATH`. Close other configuration
editors, copy that file over `~/.cursor/mcp.json`, and restart Cursor. The backup contains the file as
it existed before setup; it cannot recover an unrelated edit written after setup's final check.

To remove FrontierMCP, delete only the `frontier` property from `mcpServers`, leave the other server
entries in place, save valid JSON, and restart the client. Installed version directories are inert
after the entry is removed. You may delete them later from the user-data location printed by setup.

If a manager later removes the saved Node executable, the launcher exits with a manager-specific
repair command. Install that runtime again and rerun setup so the saved command is verified before
the client uses it.

## Open a repository

Open the repository in the client and restart its MCP servers if needed. FrontierMCP resolves the
workspace by walking upward from the server's working directory to the nearest `.scratch/` directory
or `.git` file or directory. A Git worktree's `.git` file makes that worktree its own workspace.

Pass `root` on a tool call to serve another directory, or set `FRONTIER_ROOT` in the server
environment for a fixed non-standard layout. The launch working directory is fixed for the process;
opening a different worktree requires `root`, `FRONTIER_ROOT`, or a server restart.
