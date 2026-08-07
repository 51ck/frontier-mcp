# frontier-mcp

An MCP server that serves the markdown issue tracker under `.scratch/` as a queryable graph — so agents
stop re-parsing prose to learn what is open, blocked, or takeable.

## Requirements

- Node 24 or later
- npx (or pnpm for development of this package)

## Install once (user scope)

Register Frontier once in your **user-level** MCP configuration. Every repository you open in Cursor
then gets the server automatically — no per-repo `mcp.json` file and no registry fetch on every session
start when you pin the version.

### Cursor

Edit `~/.cursor/mcp.json` (create the file if it does not exist):

```json
{
  "mcpServers": {
    "frontier": {
      "command": "npx",
      "args": ["-y", "frontier-mcp@0.1.0"]
    }
  }
}
```

Replace `0.1.0` with the latest release you intend to run. Pinning the version avoids an npm registry
round-trip deciding which build starts each session.

Restart Cursor after saving.

### Claude Code and other MCP clients

Use the same command and pinned package argument in your client's user-scope MCP server list:

```json
{
  "mcpServers": {
    "frontier": {
      "command": "npx",
      "args": ["-y", "frontier-mcp@0.1.0"]
    }
  }
}
```

## First use in a repository

1. Open the repository in your editor. Frontier resolves the workspace from the session working
   directory — walking upward to the nearest `.scratch/` or `.git/` — so opening the project is the
   only setup step.
2. Read the tracker configuration document once. In Cursor, fetch MCP resource `frontier://tracker-doc`,
   or read [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) in a repo that vendors it.
3. Call `list_efforts` to see whether `.scratch/` exists yet.
4. Call `get_board` on an Effort to see the Frontier, then `get_tickets` only for the ids you work.

A repository with no `.scratch/` directory is not an error. Create the first Effort with
`create_tickets`, `edit_map`, or `spec` and `create: true`.

## Override the workspace

Optional, per call or per session:

- Pass `root` on any tool call to read another directory.
- Set `FRONTIER_ROOT` in the server environment for a non-standard layout.

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

## License

MIT
