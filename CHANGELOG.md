# Changelog

Package release notes for `frontier-mcp` (npm). Not part of the `.scratch/` issue tracker.

## [1.0.0](https://github.com/51ck/frontier-mcp/compare/v0.6.0...v1.0.0) (2026-11-13)

### ⚠ BREAKING CHANGES

* migrate_effort no longer accepts `rename`; filenames
  never change. MigrationChange drops fromName/toName for `filename`, and
  MigrationReport drops `renamed` for `directory`.
* the Board warning reads "are Foreign" and get_tickets flags
  "foreign" instead of "legacy".

### Features

* get_tickets surfaces Unimported keys on any Ticket (T102) ([db45862](https://github.com/51ck/frontier-mcp/commit/db4586213225168ef82cefa93cb4b8e3cfca455e))
* list_efforts explains a repository with no tracker (T105) ([2e48fc8](https://github.com/51ck/frontier-mcp/commit/2e48fc810077c8e446a62b6c3e13e116381b1a10))
* migrate_effort previews by handle, drops rename (T69) ([ed302c1](https://github.com/51ck/frontier-mcp/commit/ed302c16a163b84300e4519ad59ba8a8e26ea8b7))
* **setup:** Claude Code client target and a config doctor (T93) ([63c10b0](https://github.com/51ck/frontier-mcp/commit/63c10b00b1b4f19bf4062ccf6bbc22e220af7a14))
* the Board counts resolved, dropped and claimed Tickets missing their field (T85) ([baedcce](https://github.com/51ck/frontier-mcp/commit/baedcce249ed29f327fa852a0a0376b0041981c9))
* update_ticket drop_keys removes named Unimported keys (T103) ([2929008](https://github.com/51ck/frontier-mcp/commit/29290085f46b0a1fa6039fba155141f9c8a93460))

### Bug Fixes

* a file where .scratch/ belongs is not an absent tracker (T105) ([3f2e5fe](https://github.com/51ck/frontier-mcp/commit/3f2e5feda26a91258318b7a00699d18b43974ec5))
* a prose Edge never lands on another Effort by prefix (T82) ([7fededc](https://github.com/51ck/frontier-mcp/commit/7fededc4f9fe6657137100744427128cfbfb618b))
* a sub-slice never coarsens onto its own Ticket; a nested one stays whole (T82) ([c7a2a05](https://github.com/51ck/frontier-mcp/commit/c7a2a052e9cc20b4229bf50f4d6a2f5f39d2317b))
* a sub-slice reference is coarsened only within its own Effort, decided at scan (T82) ([0d89e16](https://github.com/51ck/frontier-mcp/commit/0d89e16a5115143039d42abeeea0c5d0739de31f))
* count a claim with no claimed_at; pin the lifecycle counts that matter (T85) ([5af40a1](https://github.com/51ck/frontier-mcp/commit/5af40a13d403329c0f6d1913497bc15c2646ba6b))
* drop_keys compares surviving values, not just key names (T103) ([0c1ba35](https://github.com/51ck/frontier-mcp/commit/0c1ba35bddae41df502db166bde02e64318e7f59))
* drop_keys reads its cut back and refuses one that damages the fence (T103) ([6fc33cf](https://github.com/51ck/frontier-mcp/commit/6fc33cfab12082350e75623719283cc4078505a1))
* migration holds its guards until every write settles; unambiguous report labels (T69) ([6b1e0e2](https://github.com/51ck/frontier-mcp/commit/6b1e0e21a586099d364364298240998dfc3a50db))
* refuse a multi-line add_fog or rule_out (T98) ([836bb4b](https://github.com/51ck/frontier-mcp/commit/836bb4b082eb96ffd89583e014ed61c74a68b25f))
* refuse U+2028/U+2029 in add_fog and rule_out (T98) ([50a32aa](https://github.com/51ck/frontier-mcp/commit/50a32aa8ebacb741a3f066db8a92defe25d35c92))
* **setup:** label the Windows command as PowerShell, double curly quotes (T93) ([149ee80](https://github.com/51ck/frontier-mcp/commit/149ee809b53cb1a45cd0638c5686697d3b8fa106))
* **setup:** per-client doctor failures and quoting (T93) ([0e5dc83](https://github.com/51ck/frontier-mcp/commit/0e5dc838a00ab402170bc88a469ce56999b83c2a))
* **setup:** restore on failed replace, refuse Windows shim, honest doctor (T93) ([598705f](https://github.com/51ck/frontier-mcp/commit/598705fb4e768fb7c5248f800e0b81b7165ec086))
* show the whole fence when an unimported entry cannot be cut cleanly (T102) ([fd07bf2](https://github.com/51ck/frontier-mcp/commit/fd07bf2754acb36bf10501b645bce4c1f940050a))
* state the Foreign predicate as implemented; get_tickets names the bare id (T77) ([b1ade0f](https://github.com/51ck/frontier-mcp/commit/b1ade0f68063f166fac84d44927c93b5bf185bb0))
* the Board says where a foreign-fenced Ticket's fields came from (T104) ([b919c4b](https://github.com/51ck/frontier-mcp/commit/b919c4bfd62c672260ca04dde8fdeac43abc6f21))
* **watcher:** survive a directory replaced by a file on Linux (T99) ([fe2cb0d](https://github.com/51ck/frontier-mcp/commit/fe2cb0d98db48e1045bb77d33b0fbc55cb8bc793)), references [nodejs/node#66791](https://github.com/nodejs/node/issues/66791)

### Code Refactoring

* Legacy becomes Foreign (T77) ([3451b97](https://github.com/51ck/frontier-mcp/commit/3451b975bf9560a6ffe000491f2e642c81047354))

## [0.6.0](https://github.com/51ck/frontier-mcp/compare/v0.5.0...v0.6.0) (2026-11-12)

### Features

* **ids:** warn on a duplicate id on read and refuse it on write ([7255874](https://github.com/51ck/frontier-mcp/commit/7255874c2df43db2470b793d66f10321faf77ff4))
* **ids:** warn on every create under a <N>-only id pattern ([31c70fe](https://github.com/51ck/frontier-mcp/commit/31c70feb0388574eb2209b53116b18a8eb0ec4cb))
* **read:** get_tickets surfaces a foreign fence without writing it ([4d2e474](https://github.com/51ck/frontier-mcp/commit/4d2e474cf6808cb21caa3e92cea62be0ae0e3eca))

### Bug Fixes

* **ids:** keep a duplicated Ticket off the Frontier ([3e6c2b6](https://github.com/51ck/frontier-mcp/commit/3e6c2b6c566dd1fbae422b54f5dac0ddcd4a568a))
* **ids:** keep duplicate claimants on their id and never write to detect one ([a77e7a0](https://github.com/51ck/frontier-mcp/commit/a77e7a0d5f80eedb29e3a8b5c375b079392bad6d))

## [0.5.0](https://github.com/51ck/frontier-mcp/compare/v0.4.1...v0.5.0) (2026-11-12)

### Features

* **ids:** mint from the compiled id pattern (T65) ([210a31a](https://github.com/51ck/frontier-mcp/commit/210a31a1d50eee954f0505387000b6fe64558b3d))
* **ids:** read and compile id_pattern from frontier.yml ([f06d03f](https://github.com/51ck/frontier-mcp/commit/f06d03f3999d5b954c97f7eea59542d9ddef0527))

### Bug Fixes

* **ids:** refuse a key naming an existing Ticket; steady the random tests ([1babcf3](https://github.com/51ck/frontier-mcp/commit/1babcf3d7003f82adf16222863b956492c2f6e0d))
* **map:** refuse a GENERATED marker in a Map value ([525c0d4](https://github.com/51ck/frontier-mcp/commit/525c0d4afceb290ad286f840d15b9f7f2d16f720))
* **map:** refuse Map values holding a level-2 heading ([3839134](https://github.com/51ck/frontier-mcp/commit/3839134bcdd8e6176edccf5934344f6bfbdb9b16))
* **runtime-check:** read the minted id instead of assuming T1 ([d81a84b](https://github.com/51ck/frontier-mcp/commit/d81a84bb71b5d5b57556e17ab5979aee9fd1b8dc))

## [0.4.1](https://github.com/51ck/frontier-mcp/compare/v0.4.0...v0.4.1) (2026-09-16)

### Bug Fixes

* **setup:** align the published bootstrap ([0db4822](https://github.com/51ck/frontier-mcp/commit/0db4822a59f6119ba4a6cfcbbe0661b272d01c50))

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
