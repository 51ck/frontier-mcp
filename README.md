# frontier-mcp

An MCP server that serves the markdown issue tracker under `.scratch/` as a queryable graph — so agents
stop re-parsing prose to learn what is open, blocked, or takeable.

## Requirements

- Node 24 or later
- pnpm for development

## Install

Add it to your user MCP config, pinned to a released version:

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
2. On GitHub: **Actions → Release → Run workflow**, pick `patch` / `minor` / `major`.
3. The workflow runs checks + tests, bumps `package.json`, updates `CHANGELOG.md`, tags
   `v*`, creates a GitHub Release, and publishes to npm with `pnpm`.
4. Bump the pinned version in your user MCP config (`frontier-mcp@x.y.z`) when you want the
   new build — pins stay manual on purpose.

The workflow is dispatchable from any branch but refuses to run off `master`: release-it commits,
tags and pushes before it publishes, so a release from a feature branch would rewrite that branch.

Local dry-run (no tag, no publish). It needs a clean working tree and an upstream branch, so commit
first:

```bash
pnpm run release:dry
```

npm publishing uses **Trusted Publishing** — GitHub Actions OIDC, configured for this repo on
npmjs.com, so there is no `NPM_TOKEN` to rotate.

Before changing `.release-it.json` or the workflow, read the release-it bullet in
[AGENTS.md](./AGENTS.md) Work Guidance. Several settings there look removable and are not — the
absent `registry-url`, `npm.skipChecks`, and the pnpm 10 pin each exist for a reason recorded in one
place so it cannot drift.

## License

MIT
