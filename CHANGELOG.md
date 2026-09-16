# Changelog

Package release notes for `frontier-mcp` (npm). Not part of the `.scratch/` issue tracker.

## [0.4.0](https://github.com/51ck/frontier-mcp/compare/v0.3.1...v0.4.0) (2026-09-16)

### Features

* add standalone runtime setup ([73f0396](https://github.com/51ck/frontier-mcp/commit/73f03967aa2809c1cd02242e1978380b9da2c45b))
* detect foreign fences; add reopen/release ([7147352](https://github.com/51ck/frontier-mcp/commit/7147352e86ec2248bd6baded5002a5b91befdc56))
* discover managed Node runtimes ([abf92c6](https://github.com/51ck/frontier-mcp/commit/abf92c6802650004471ab9ac37affe400e4ec4f9))
* **setup:** select verified project runtimes ([0fa6029](https://github.com/51ck/frontier-mcp/commit/0fa602906b3c3d2fd10075daf4f3bc9512d7cc2a))
* **setup:** verify managed runtimes ([dcc9a0a](https://github.com/51ck/frontier-mcp/commit/dcc9a0a801aedb26a1529f9ee8f8d7c49e6c30e0))

### Bug Fixes

* diagnose runtime CI and support native pnpm ([2190503](https://github.com/51ck/frontier-mcp/commit/219050356763db96afc77a2dc51292dc0ac11d3e))
* exit when the stdio client disconnects ([eb00c0f](https://github.com/51ck/frontier-mcp/commit/eb00c0f3736574521d5870b0c15392c09e387832))
* handle Windows filesystem races ([6c57a2d](https://github.com/51ck/frontier-mcp/commit/6c57a2d560c5cb4da6bd599e63380ff4696e5d6b))
* initialize tracker before id reservation ([d087c8e](https://github.com/51ck/frontier-mcp/commit/d087c8eb1249faa10c2cbfb13f41ee9025758147))
* **setup:** accept bounded launcher shutdown ([0d76b67](https://github.com/51ck/frontier-mcp/commit/0d76b678e1fee5f44ae9c981014e98ef26e2dc7e))
* **setup:** close Windows launcher trees ([b180317](https://github.com/51ck/frontier-mcp/commit/b180317c16d625bbdd6403584cbcbcff139e45fd))
* **setup:** retry transient preflight cleanup ([664d7e6](https://github.com/51ck/frontier-mcp/commit/664d7e6844035beb3ac9a254e205bfccc7593772))

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
