# Changelog

Package release notes for `frontier-mcp` (npm). Not part of the `.scratch/` issue tracker.

## [0.3.1](https://github.com/51ck/frontier-mcp/compare/v0.3.0...v0.3.1) (2026-08-20)

### Bug Fixes

* declare the tool side effects that were defaulting to true ([d561a1c](https://github.com/51ck/frontier-mcp/commit/d561a1c3adf73f43dc136eb5184f0e0888c26e53))
* **map:** render a gist containing $ patterns verbatim ([5fbf9a9](https://github.com/51ck/frontier-mcp/commit/5fbf9a93082026a96ff55baa9baef6bed738bfe7))

## [0.3.0](https://github.com/51ck/frontier-mcp/compare/v0.2.1...v0.3.0) (2026-08-13)

### Features

* **ci:** let the release dispatch derive its own increment ([de7ecd7](https://github.com/51ck/frontier-mcp/commit/de7ecd7d1cbc23f1a1e746367de1215c5dbd5d1f))
* move onto the v2 scoped SDK family ([dba3051](https://github.com/51ck/frontier-mcp/commit/dba30511db506a7d92dbe35c920fea62296cc7fa))

## [0.2.1](https://github.com/51ck/frontier-mcp/compare/v0.2.0...v0.2.1) (2026-08-11)

### Bug Fixes

* report the published version in the handshake ([c46b3f5](https://github.com/51ck/frontier-mcp/commit/c46b3f56d6b2178df7e9f34a32adee0eabae5ca7))

## [0.2.0](https://github.com/51ck/frontier-mcp/compare/v0.1.0...v0.2.0) (2026-08-11)

### Features

* **T11,T31:** a write names the workspace it resolved ([9237c2c](https://github.com/51ck/frontier-mcp/commit/9237c2c93c019d368bc9c646b1cd9a78c3aa7a66))
* **T27:** bodies are fetched by id through the driver ([8e76021](https://github.com/51ck/frontier-mcp/commit/8e760214e8b5572ea578a5e30b403c60951acd50))
* **T28:** the storage directory is a driver construction parameter ([24294f7](https://github.com/51ck/frontier-mcp/commit/24294f7d95f3091989d1fcdd79b26552540959ed))

### Bug Fixes

* **release:** publish past pnpm's own clean-tree check ([e26d441](https://github.com/51ck/frontier-mcp/commit/e26d44118958df530e1b5643e2cb752e52ad1eee))
* **T10:** a dangling .git symlink still marks a root ([218ee39](https://github.com/51ck/frontier-mcp/commit/218ee391d907ec452d9dede217e99ea78d6726e5))
* **T10:** a git worktree is its own workspace ([de3b13e](https://github.com/51ck/frontier-mcp/commit/de3b13e3ae7693e1b6e069524ca8c714795a9f33))
* **T31:** migrate_effort names the workspace only when it wrote ([2b943de](https://github.com/51ck/frontier-mcp/commit/2b943dea5e397fb1b35e0957586f3985918ff874))
* **T32:** the watcher settles after it attaches ([d4d8d93](https://github.com/51ck/frontier-mcp/commit/d4d8d93a462125d8e7006f8e718598153b3ee200))
