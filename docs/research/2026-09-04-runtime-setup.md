# Runtime selection for setup and manual installation

Date: **2026-09-04**. Ticket: **none — direct user research request**.

Implementation Tickets: **T88–T92**, on `frontier-v1`; breakdown below.

This is a dated research snapshot, not a compatibility contract. It records primary-source
findings and implementation recommendations. Runtime support must follow the package's declared
engine and its verification results. Repository inspection started at commit
`7147352e86ec2248bd6baded5002a5b91befdc56`.

## Findings

A setup script can run under Node 16 and configure FrontierMCP to use a different, already
installed runtime. The project can keep its existing Node version. The bootstrap must be independent
of the server's dependencies; the saved MCP command must select the intended executable explicitly.
This is an implementation conclusion from Node's CommonJS support, the version managers' command
interfaces below, and MCP's subprocess transport. [Node 16 CommonJS documentation](https://nodejs.org/download/release/v16.20.2/docs/api/modules.html),
[MCP stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio).

At the start of this investigation, [`package.json`](../../package.json) declared `node >=24` and
installed `@modelcontextprotocol/server@2.0.0` declared `node >=20`. The server's published entry
is compiled JavaScript at `dist/bin.js`; development uses `node src/bin.ts`. These are different
runtime requirements. Node's built-in type stripping arrived in 22.6 and was enabled by default
in 22.18; Node 20 does not run the source entry unaided.
[Node TypeScript documentation](https://nodejs.org/api/typescript.html#type-stripping).

The source uses `Array.prototype.toSorted()` and recursive `fs.watch()`. Node 20 introduced the
copying array methods; recursive watching on Linux arrived in 19.1. Those APIs and the SDK's
declared engine make Node 20 a plausible minimum for **compiled** FrontierMCP. They do not establish
whole-program compatibility, nor override the package's initial `>=24` declaration.
[`driver.ts`](../../src/storage/markdown/driver.ts),
[`watcher.ts`](../../src/storage/markdown/watcher.ts),
[Node 20 announcement](https://nodejs.org/en/blog/announcements/v20-release-announce#v8-113),
[Node filesystem documentation](https://nodejs.org/api/fs.html#fswatchfilename-options-listener).

For a new runtime installation, recommend Node 24 through fnm. Node's current release table lists
24 and 22 as LTS, and 20 as EOL. A successful Node 20 compatibility check would justify using an
existing installation, but would not make it the recommended new installation.
[Node release table](https://nodejs.org/en/about/previous-releases).

## Bootstrap design

Use a standalone `.cjs` file with built-in modules and conservative JavaScript syntax. Downloading
that file and running `node setup.cjs` avoids loading the server before version selection. Node 16
recognizes `.cjs` as CommonJS even inside an ESM project.
[Node 16 CommonJS documentation](https://nodejs.org/download/release/v16.20.2/docs/api/modules.html).

"Any Node" needs a stated, tested lower bound. Supporting Node 16 does not prove support for every
historic Node release. A dependency-free file can target older releases, but its syntax and every
API it uses must be checked there. Download tooling may impose its own minimum. Do not rely on
installing the main package under an old runtime to obtain the bootstrap: its engine declaration and
dependency installation happen before the script can select a replacement runtime. These are design
constraints, not claims that an implementation has passed compatibility tests.

Recommended selection policy:

1. Honor an explicit runtime override.
2. Detect Bun or Deno project markers, then verify the installed runtime and actual server command.
3. If a project runtime fails verification, explain the failure and select a supported installed Node
   instead. Do not silently save Bun or Deno configuration from project markers alone.
4. Otherwise prefer an installed Node version meeting the server's verified minimum, with Node 24
   LTS preferred for a new configuration.
5. Search version managers for an installed suitable Node if the current executable is too old.
6. If a manager exists but has no suitable runtime, print its install command. If no manager exists
   and Node is too old, recommend fnm and `fnm install 24`.
7. Save configuration only after the chosen command completes a protocol check. Report failures
   before replacing an existing entry.

That ordering is a proposed product policy, not a standard. Project markers such as `bun.lock`,
`bun.lockb`, `deno.json`, `deno.jsonc`, `deno.lock`, and `packageManager: "bun@..."` are useful
evidence, but repositories can contain more than one. A runtime override resolves ambiguous cases.
[Bun lockfiles](https://bun.com/docs/pm/lockfile),
[Deno configuration](https://docs.deno.com/runtime/fundamentals/configuration/).

The implementation Tickets should require an explicit target client and configuration scope.
Repository configuration can select a runtime from that repository's markers. A user-wide entry
serving several repositories cannot infer all their runtime preferences from the directory where
setup happened; it needs a documented fixed-runtime policy or an explicit per-project launcher
design. Mixed Bun/Deno markers must produce a visible decision or require the override, rather than
silently guessing from the first file found. These are recommendations for the requested workflow.

Configuration application must preserve unrelated servers and settings, handle the selected client's
actual JSON/JSONC/TOML format, and reject malformed existing configuration without overwriting it.
Show the target path and resulting `frontier` entry before application; make reruns idempotent and
replace only the intended entry. Do not scan and rewrite every installed client's configuration.
The manual guide should document each supported client and scope, exact launcher arguments,
runtime discovery, fnm fallback, compatibility limits, and the automated setup command once shipped.

## Version managers

Discovery should use the manager's own installed-version listing when available, then resolve and
probe a real Node executable. Presence on `PATH` is only one signal: nvm is a shell function, and a
desktop MCP client may not load the shell initialization that created it. Always supply a version
explicitly so a project's `.nvmrc` or other version pin cannot select Node 16 again.
[nvm README](https://github.com/nvm-sh/nvm#usage).

| Manager | Discover installed versions and executable | Launch without changing project defaults |
| --- | --- | --- |
| fnm | `fnm list`; inspect `FNM_DIR` if supplied; probe selected version with `fnm exec --using VERSION node --version` | `fnm exec --using VERSION COMMAND ...`; resolve the executable during setup for desktop use. [fnm commands](https://github.com/Schniz/fnm/blob/master/docs/commands.md) |
| nvm, macOS/Linux | Source the existing `NVM_DIR/nvm.sh` with `--no-use`; `nvm ls`; `nvm which VERSION` | Save the resolved Node path, or use `nvm exec VERSION COMMAND ...` in a wrapper that sources nvm. Do not depend on an interactive shell profile. [nvm README](https://github.com/nvm-sh/nvm#usage) |
| nvm-windows | `nvm list`; `nvm root`; `NVM_HOME`; inspect the selected version's real `node.exe` | Save the version-directory executable. Avoid `nvm use`: it switches a shared symlink and affects other open consoles. [nvm-windows README](https://github.com/coreybutler/nvm-windows#whats-the-big-difference), [configuration](https://github.com/coreybutler/nvm-windows/wiki) |
| Volta | `volta list all`; probe `volta run --node VERSION node --version` | `volta run --node VERSION COMMAND ...` overrides the project pin for that command. [list](https://docs.volta.sh/reference/list), [run](https://docs.volta.sh/reference/run) |
| asdf | `asdf list nodejs`; set `ASDF_NODEJS_VERSION=VERSION` for `asdf which node` | The same environment override with `asdf exec COMMAND ...`; it takes precedence over `.tool-versions`. [commands](https://asdf-vm.com/manage/commands.html), [version overrides](https://asdf-vm.com/manage/versions.html#via-environment-variable) |
| mise | `mise ls --installed --json node`; `mise which node --tool node@VERSION` | `mise exec node@VERSION -- COMMAND ...`; resolve installed versions first because execution can install missing tools. [ls](https://mise.jdx.dev/cli/ls.html), [which](https://mise.jdx.dev/cli/which.html), [exec](https://mise.jdx.dev/cli/exec.html), [installation example](https://mise.jdx.dev/demo.html) |

fnm is a suitable default recommendation because it has macOS, Linux and Windows builds and explicit
per-command version selection. Its documented installation options include `brew install fnm`,
`winget install Schniz.fnm`, and a Linux installation script. Installing a manager or Node should
remain an explicit installation step; discovery need not modify the user's shell files.
[fnm installation documentation](https://github.com/Schniz/fnm#installation).

After selecting Node, prefer an absolute executable path and absolute JavaScript entry path. If a
package runner starts a child with `#!/usr/bin/env node`, its child can still find the old Node unless
the selected Node directory leads the child `PATH`. A direct `node /path/to/dist/bin.js` avoids that
second lookup. This follows from the server's
[`bin.ts` shebang](../../src/bin.ts) and the documented
[Bun explanation of Node shebang execution](https://bun.com/docs/pm/bunx#shebangs).

## Bun

Bun documents the Node filesystem API as implemented, and its filesystem guide explicitly supports
recursive `fs.watch()`. That covers a major FrontierMCP requirement. It is evidence for testing Bun,
not proof that the SDK, stdio, revision checks, and concurrent writes all behave identically.
[Bun Node compatibility](https://bun.com/docs/runtime/nodejs-compat#node-fs),
[recursive watch example](https://bun.com/guides/read-file/watch).

The npm-package launch form is:

```sh
bun x --bun frontier-mcp@VERSION
```

`bunx` aliases `bun x`. The `--bun` flag must precede the package name; otherwise a Node shebang
launches Node. A bare `bunx frontier-mcp` can therefore reproduce the original Node 16 failure.
Use the absolute Bun executable in desktop configuration. A local installed package can also run as
`/absolute/path/to/bun /absolute/path/to/frontier-mcp/dist/bin.js`.
[Bun package execution documentation](https://bun.com/docs/pm/bunx).

## Deno

Deno supports `node:` imports and npm packages with executable `bin` entries. The candidate command
for an isolated npm install is:

```sh
deno run --no-config --no-lock --node-modules-dir=none --no-prompt \
  --allow-read --allow-write --allow-env npm:frontier-mcp@VERSION
```

These flags are a starting point for verification. Read permission covers workspace discovery,
tracker data, and package documents. Write permission covers tracker mutations. Environment
permission covers workspace selection and dependency environment reads. No application network,
subprocess, or native-library permission is implied. Deno fetches the initial module graph itself;
that is separate from permission to perform network requests during execution.
[npm CLI execution](https://docs.deno.com/runtime/fundamentals/node/#run-an-npm-cli-tool),
[security model](https://docs.deno.com/runtime/fundamentals/security/).

`--no-config` and `--no-lock` prevent automatic discovery of the served project's Deno configuration
and lockfile. `--node-modules-dir=none` resolves npm packages in Deno's cache. `--no-prompt` makes
missing permissions fail instead of waiting for terminal input in an MCP session.
[Deno run options](https://docs.deno.com/runtime/reference/cli/run/).

The noninteractive permission behavior is documented separately in Deno's
[permission guidance](https://docs.deno.com/runtime/fundamentals/security/#adjusting-permissions-at-runtime).

Broad read/write/env grants match the server's existing ability to serve different roots; a fixed-root
configuration can narrow them after testing package-resource access and ancestor discovery. Avoid
`-A` as the documentation default. Deno's Node filesystem documentation exposes `watch`, but only
tests can establish that recursive invalidation works for FrontierMCP on each supported platform.
[Deno filesystem API](https://docs.deno.com/api/node/fs/#watch),
[`workspace.ts`](../../src/workspace.ts), [`tracker-doc.ts`](../../src/tracker-doc.ts).

## Local runtime smoke results

The coordinating agent ran a throwaway MCP subprocess probe on **macOS, arm64**, on this research
date, against this checkout's compiled `dist/bin.js` and installed dependencies. These are measured
results, independent of the runtime vendors' compatibility claims. The probe began with an empty
`.scratch/`, created an Effort and Ticket through MCP, then edited the Ticket file from outside the
server after a 1.3-second watcher-settle wait. It polled the Board for the new title for three seconds.

| Runtime | MCP initialization, tools and packaged resource | Ticket create, Board/body read, claim and release | External title edit reaches Board |
| --- | --- | --- | --- |
| Node 16.20.2 | Initialization alone did not establish usable support | Creation failed on `toSorted` | Not reached |
| Node 20.20.2 | Passed; eight tools | Passed | Passed |
| Node 22.17.1 | Passed; eight tools | Passed | Passed |
| Node 24.15.0 | Passed; eight tools | Passed | Passed |
| Bun 1.3.14 | Passed; eight tools | Passed | Failed: stale title |
| Deno 2.9.6 | Passed; eight tools | Passed | Failed: stale title |

The Bun/Deno stale Board also occurred when the temporary workspace path was resolved to its real
path, ruling out the temporary-directory symlink as the explanation for this probe. It also occurred
with the Effort and its `issues` directory created before server startup. The exact cause remains
unresolved; this result does not establish that every Bun/Deno watcher use fails. It is enough to
withhold automatic selection for these tested versions until the regression is understood and fixed.

Deno ran the local compiled entry with `run --no-config --no-lock --node-modules-dir=manual
--no-prompt --allow-read --allow-write --allow-env`. `manual` was appropriate for the local installed
dependency tree. The isolated `npm:` command above uses `none` and was **not** exercised by this
probe. Nor did the probe validate published package installation, Windows/Linux, every tool operation,
or cross-process contention. The throwaway probe was `/tmp/frontier-runtime-smoke.cjs`; its checks
and findings are recorded here because that temporary file is not a durable test artifact.

The Node 20 and 22 passes make lowering the compiled package's minimum worth an implementation
Ticket. They do not change `package.json` or the current Node 24 support contract. The Bun/Deno
Ticket should reproduce the watcher failure and establish version/platform coverage before enabling
automatic selection, with a supported Node fallback whenever compatibility is unverified or fails.

An additional first-use failure was filed as **T87**: starting with only a repository marker and no
`.scratch/`, then calling `create_tickets` with `create: true`, failed while opening the id reservation
guard. Creating an empty `.scratch/` let the runtime checks proceed. This is a separate server bug,
not evidence that an alternate runtime is incompatible.

## Implementation breakdown

The user requested research and implementation Tickets, not implementation in this task. The
`/to-tickets` breakdown was published as open build Tickets with `ready-for-agent` triage:

| Ticket | Delivers | Blocked by |
| --- | --- | --- |
| T88 | Verify the packaged Node runtime minimum separately from development | None |
| T89 | Bootstrap under Node 16, select an explicit compatible Node, and apply a pinned MCP entry | None |
| T90 | Discover and use installed runtimes through the six Node managers | T89 |
| T91 | Select Bun/Deno from the launch workspace only when verified; otherwise use Node | T89, T88 |
| T92 | Consolidate the automatic and manual installation guide | T89, T90, T91 |

T89 can land using the current Node 24 requirement while T88 verifies whether it can be lowered.
The first configuration writer targets Cursor user scope, matching the existing install flow; other
clients receive printable launch settings. Cursor documents separate user and project locations in
its [MCP configuration guidance](https://cursor.com/docs/mcp).

T91 settles the user-scope ambiguity by evaluating project markers at server launch, not by applying
the setup directory's runtime preference to every future project. The choice stays fixed for that
server session, including calls with a different `root`. No new MCP tool or tracker-knowledge
vendoring is needed, so the existing onboarding decision Ticket T61 does not block this work.

## Verification required before claiming compatibility

Record actual versions and platforms in the installation documentation when checks complete.
Promote the relevant smoke coverage into existing MCP-level tests, including nested directories
created after startup. Repeat the existing concurrency checks before promising equivalent claim
and id-allocation guarantees.

Also check the exact saved launcher in a project pinned to Node 16, with a minimal desktop-style
environment. Run bootstrap verification under its stated oldest supported Node, and verify that
configuration merging preserves unrelated servers. An initialization-only check is useful for
setup, but cannot establish filesystem or concurrency compatibility. Stdout must contain only
MCP messages; wrapper and setup diagnostics belong on stderr.
[MCP stdio requirements](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio).

DOX pass: this note and the new Tickets are root-owned under the existing research/tracker contract.
The root User Preferences records the requested installation behavior. Ownership, the Child DOX
Index, public install documentation and runtime requirements remain unchanged; implementation
Tickets carry their own contract/documentation updates when they land.
