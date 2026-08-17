---
id: T54
title: Where the pattern lives
kind: decision
type: grilling
status: resolved
triage: ready-for-agent
blocked_by: []
answer_gist: A YAML file at the root of the storage directory, `<storageDir>/frontier.yml`, holding one `id_pattern` key — the env var and the server argument fail on cardinality rather than lifetime, since `root` is a per-call argument and one process deliberately serves many workspaces; absent file or absent key means T35's default and is not an error, while an unparseable file or an illegal pattern warns on read and refuses on write, reusing T38's split exactly
---

## Question

FrontierMCP has **no per-repo configuration today**. `FRONTIER_ROOT` names which repo is served, not
how a repo behaves; the driver's options — `storageDir`, watcher timings — come from the server
constructing it, not from the workspace. A pattern would be the first thing a repo says about itself,
and that is an architectural first rather than a knob.

Candidates, none obviously right:

- A file under `.scratch/` — canonical with the tracker it configures, travels with the branch,
  visible to a hand-writing agent with no server. Also a new file kind in a directory whose whole
  contents are currently Efforts.
- Frontmatter on something that already exists — nothing repo-level exists to hang it on.
- An environment variable — invisible to a hand-writer, and per-session rather than per-repo, so two
  sessions could disagree about the same workspace.
- A server argument — registered once at user scope, which is the wrong lifetime entirely: the
  pattern belongs to the repo, not to the person opening it.

Whatever holds it is also where a bad pattern is caught, which ties this to how the consumer is
warned. And it must be readable by an agent working the tracker **without** the server, since the
file conventions are canonical either way.

## Acceptance criteria

- [x] Where the pattern lives is decided, with the lifetime argument stated
- [x] What a workspace with no pattern set means is stated — the T35 default, presumably, but said
      rather than assumed
- [x] How a hand-writing agent with no server reads it is answered
- [x] What happens when the file is malformed or names an illegal pattern is decided

## Answer

**The pattern lives in a YAML file at the root of the storage directory: `<storageDir>/frontier.yml`, conventionally `.scratch/frontier.yml`.**

```yaml
# The Ticket id pattern for this repo. See frontier://tracker-doc.
id_pattern: T<b36{6}>
```

A map with one key today, so that a second repo-level setting has a home without inventing a second file. Nothing else is added now.

## Why not the alternatives

The charting framing was lifetime, and lifetime does dispatch the server argument — registered once at user scope, one value for every repo that user opens. But the decisive objection to both the environment variable and the server argument is **cardinality**, which is sharper and comes straight out of `src/workspace.ts:52`:

> Resolve which workspace a call serves. First match wins: 1. an explicit `root` argument on the call, 2. the `FRONTIER_ROOT` environment variable, 3. the working directory, walked upward to the nearest root marker.

`root` is a **per-call** argument. One server process therefore serves many workspaces by design — that is the documented behaviour, not an accident, and the comment at `:43` spells out that a client retargets a call with `root` rather than restarting. A process-wide value cannot express a per-workspace setting: whatever `FRONTIER_ROOT` or a server flag said would be right for at most one of the repos that session touches and silently wrong for the rest. It is not that the lifetime is too long; it is that there is one slot and several answers.

That also disposes of `FRONTIER_ROOT` as precedent. It names *which* repo is served — a property of the session — and the pattern is a property of the repo. They are the same shape only if you squint.

**Frontmatter on something that already exists** stays rejected for the reason charting gave: nothing repo-level exists to hang it on. Every document in `.scratch/` belongs to an Effort, and hanging a repo-wide setting on one arbitrary Effort's Map would make that Effort load-bearing for every other.

## Why a file under the storage directory is right

**It binds to the storage, which is what actually owns the id space.** `.scratch` may be a symlink — `src/workspace.ts:99`: "Follows symlinks: a `.scratch` pointed at shared storage is still the tracker." Two repos pointed at one storage directory share their Tickets and therefore share one id space, and putting the pattern inside that directory means they automatically share the pattern too. Any other location would let them disagree about the format of ids they are jointly minting. This is the argument that makes it the storage directory rather than the repo root.

**It is not a new file kind in a directory that holds only Efforts.** That objection dissolves on inspection: the Effort scan reads directories and nothing else — `src/storage/markdown/driver.ts:761` filters `entry.isDirectory()`. Non-Effort entries already live at that level and are already invisible to it; ADR 0005's guard files are exactly that, and its comment says so — "the storage scan yields it no Effort because it is not a directory." A plain file needs no new exclusion rule.

**It travels with the branch, and it survives a `.scratch`-only workspace.** `.scratch` is itself a root marker (`workspace.ts:24`), so a project with no `.git` is still served — and the pattern, living inside `.scratch`, is still there. This is the same property that got git-derived tokens ruled out of scope, now cutting the other way.

**YAML, not a new format.** ADR 0003 already commits the product to the `yaml` package, and every Ticket carries a YAML frontmatter block, so a hand-writing agent reading this file is reading something it already parses. `storageDir` is a driver construction parameter defaulting to `.scratch` (`driver.ts:52`), so the path is stated relative to it rather than hardcoded — the file follows a renamed storage directory for free.

**It is a repo-level configuration first, and that is worth naming.** FrontierMCP has had nothing a repo says about itself until now. The commitment is real, and the containment is that the file is read once when the driver reads storage, is not watched for hot-reload, and holds settings that are properties of the *stored data* rather than of the server or the session. A setting that fails that test does not belong in this file.

## A workspace with no pattern set

**Absent file, or present file with no `id_pattern` key: the default, and not an error.** The default is [[T35]]'s `T<b36{6}>`. The overwhelming majority of repos will never contain this file, and that is the intended state — the map is explicit that this Effort decides whether the default can be *overridden*, not what it is.

One sequencing note for the build, because the code does not match the decision yet: `MINTED_ID` is still `/^T(\d+)$/` at `src/domain.ts:18`, so `T<b36{6}>` is decided and unbuilt. This Effort's build lands after T35's, and the default the pattern reader falls back to is the base36 one, not today's `T<n>`.

## The hand-writing agent

It reads `<storageDir>/frontier.yml`, takes `id_pattern` if present, and uses the default if the file or the key is missing. One file, one key, a format it already parses, in a directory it is already working in. It needs no server for any of that, which is the requirement.

But it has to be **told** to, and that is where this collides with something. `docs/agents/issue-tracker.md` hardcodes the format in eight places — `id: T12 # T<n>, repo-unique, never reused` at `:115`, the filename convention at `:102`, and the Hand-publish instruction at `:167` telling it to "assign the next repo-global `T<n>` by scanning as described above." That document is served as `frontier://tracker-doc` from `src/tracker-doc.ts:14`, read off disk out of the npm tarball (`package.json:13`), and registered as a **static** resource — `resources: { listChanged: false }` at `src/server.ts:137`, because "the resource is static packaged configuration." It is byte-identical for every repo that loads it and cannot be per-repo without dropping that.

T54 does not own the rewrite; the map records it as a fog patch overlapping `frontier-ids` [[T39]] and [[T50]], and it should resolve there. What T54 fixes is the **shape** of the fix, because the constraint above rules one of the two options out:

> The tracker doc must stop *stating* the id format and start *pointing at* it — "read `id_pattern` from `<storageDir>/frontier.yml`; if it is absent the pattern is `T<b36{6}>`" — rather than being generated per repo. Pointing keeps the resource static and makes it true everywhere; generating would force `listChanged` to become real and make a packaged file into a computed one, for no gain.

## A malformed file, or an illegal pattern

**Reads warn. Writes refuse.** The same split [[T38]] chose, for the same reason, and deliberately not a new mechanism.

| Condition | Behaviour |
| --- | --- |
| File absent | Default. Not an error. |
| File present, no `id_pattern` | Default. Not an error. |
| File unparseable as YAML | Warn on read, refuse every write. |
| `id_pattern` present but illegal under [[T52]] | Warn on read, refuse every write, naming the rule it breaks. |
| `id_pattern` legal but collision-prone | Warn only. Writes proceed. |

The reasoning for the middle rows: **falling back to the default on a broken file is the one unacceptable option.** It would mint ids in a format the consumer did not ask for, and an id is the single thing this product promises never to change — so the damage is permanent and arrives silently, in the one place where silence is unaffordable. Refusing reads as well is equally wrong, by T38's own argument: a repo whose configuration is broken is exactly the repo you most need to be able to look at, and refusing to render the Board is the worst possible moment to refuse.

The last row is the distinction that keeps the map's standing preference intact. **Illegality refuses; unwisdom warns.** A pattern that breaks a [[T52]] rule has no defensible interpretation and cannot be minted from at all. A pattern that is merely dangerous — `T<N>` and its cross-tree exposure, or a short random token and its birthday odds — is a choice the consumer is entitled to make, and "warn, never prevent" governs it. A malformed file is not a choice, so that preference has no claim on it.

**Where it is caught:** the pattern compiles once, when the driver reads storage. That single compile is what produces both the read warning and the write refusal, so there is one failure and one message rather than a check at every call site. [[T56]] owns the wording and the collision-prone thresholds; T54 owns only the split above and where the failure originates.
