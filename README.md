# frontier-mcp

An MCP server that serves the markdown issue tracker under `.scratch/` as a queryable graph — so agents
stop re-parsing prose to learn what is open, blocked, or takeable.

## Requirements

- Node 24 or later
- pnpm for development

## Development

```bash
pnpm install
pnpm test
pnpm run check
pnpm run build
node src/bin.ts
```

## Releasing

Publishing is CI-only via [release-it](https://github.com/release-it/release-it).

1. Merge the work you want to ship to `master`.
2. On GitHub: **Actions → Release → Run workflow**, pick `patch` / `minor` / `major`.
3. The workflow runs checks + tests, bumps `package.json`, updates `CHANGELOG.md`, tags
   `v*`, creates a GitHub Release, and publishes to npm with `pnpm`.
4. Bump the pinned version in your user MCP config (`frontier-mcp@x.y.z`) when you want the
   new build — pins stay manual on purpose.

Local dry-run (no tag, no publish):

```bash
pnpm exec release-it --dry-run --increment=patch
```

First npm publish needs the package configured for **Trusted Publishing** on npmjs.com (GitHub
Actions OIDC for this repo), or an `NPM_TOKEN` repository secret as a fallback.

## License

MIT
