# Current create-path cost

Date: 2026-09-13 (analysis completed; measurements saved 2026-09-11). Answers [T49](../../.scratch/frontier-ids/issues/07-T49-what-the-drop-to-one-scan-actually-costs-measure.md).

Supersedes the incomplete [2026-09-11 findings](./2026-09-11-create-path-cost.md), adding both
background-QoS runs and the interpretation for the ADR. No new benchmark run was needed; all four
retained sample sets were rechecked against their summaries.

The existing [scan benchmark](../../bench/scan-cost.ts) now has a `--group=create` mode.
This measures the guarded driver `createTickets` call and an independent single workspace scan.
It does not implement or time a random-ID path. The source under measurement was commit `bec6e40`,
with only the benchmark and documentation changes in this slice.

## Method

Each group discards three warmups and retains 30 observations. It creates batches of one and three
Tickets into an existing Effort. Each created Ticket has roughly 3,250 bytes of generated prose,
plus serialized frontmatter, and no Edges. The production cycle-validation callback runs inside the
creation timer; request planning, MCP transport and result rendering are outside it.

Every create uses a fresh disposable copy of the fixture, and every standalone scan uses a fresh
driver over the unchanged base fixture. Copying, driver construction, fixture-cardinality verification
and cleanup are outside the timers. The returned batch-length assertion is inside the create timer.
The two timers alternate order between iterations. Both drivers have the watcher's unconditional settle schedule disabled; no competing writer is present. The
created count is checked against the requested batch and each resulting fixture must contain
exactly its initial count plus that batch. Temporary trees are removed after each iteration.

This measures a driver operation end to end, including its target-Effort pre-read, initial workspace
scan, guarded re-scan, validation, guard release, two-phase file write and target-Effort readback.
It is not the full `create_tickets` MCP round trip: that also plans against a Board scan and renders
a response. Nor does it measure contention, retries, crashed guards, new-Effort creation or large
batch serialization. [Driver call](../../src/storage/markdown/driver.ts),
[reservation and write path](../../src/storage/markdown/create.ts),
[production batch validation](../../src/tools/create-tickets.ts).

The copied real workspace contains **95 Tickets in 8 Efforts**, 424,392 Ticket bytes, mean 4,467 bytes;
creation targets `frontier-v1`. The synthetic workspace has **exactly 1,000 Tickets in 3 Efforts**,
3,311,838 Ticket bytes, mean 3,312 bytes; creation targets `bench-1`. Unlike the original scan/session
benchmark, this mode adds no marker Ticket. Counts remain fixed between trials. Header docs and
non-Ticket files also remain in the real copy; they are not part of the Ticket byte total.

Copies prime the OS page cache. "Single scan" means a fresh driver cache in the same warmed
process, not a fresh process or cold disk. No forced GC runs between timings, and the independently observed scan is not necessarily identical in cost to the
second walk occurring under guards. A difference of medians is arithmetic on two distributions,
not a percentile of a new implementation and not isolated guard overhead.

## Machine and reproduction

Node v24.15.0, V8 13.6.233.17-node.48, macOS kernel 25.5.0, darwin arm64,
Apple M4 Pro, 12 cores, 24 GB. Raw JSON includes the core index, threadpool setting, fixture sizes,
all paired retained samples, and summary statistics. Paths are temporary artifacts, not repository
records. Only this dated interpretation is committed.

```sh
pnpm run bench:scan --group=create --out=/tmp/frontier-t49-default.json
UV_THREADPOOL_SIZE=1 pnpm run bench:scan --group=create --out=/tmp/frontier-t49-threadpool1.json
taskpolicy -b pnpm run bench:scan --group=create --out=/tmp/frontier-t49-slow.json
UV_THREADPOOL_SIZE=1 taskpolicy -b pnpm run bench:scan --group=create --out=/tmp/frontier-t49-slow-threadpool1.json
```

Background QoS requests the machine's slow end; it is not proof of hard CPU affinity. The core index
is the measured calibration. Threadpool size one limits libuv file work to one worker; comparable
times would support a CPU-dominated interpretation for these OS-warm fixtures, not a claim that disk
never matters. Existing scan figures in root AGENTS.md are a different dated measurement and remain
unchanged.

## Observations

All times below are milliseconds. Both quantiles use nearest rank: the median is the 15th of
30 sorted observations, and p95 is the 29th. The median is therefore the lower middle observation,
not the average of the two middle observations. Differences use unrounded medians before rounding.
Each row retains 30 paired observations after three discarded warmups.

| Run | Core index | Tickets | Batch | Single scan median / p95 | Create median / p95 | Create median minus scan median (arithmetic) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Default | 10.63 | 95 | 1 | 9.17 / 10.71 | 28.20 / 30.93 | 19.03 |
| Default | 10.63 | 95 | 3 | 8.73 / 9.10 | 28.63 / 30.42 | 19.90 |
| Default | 10.63 | 1000 | 1 | 80.33 / 93.56 | 212.66 / 226.64 | 132.33 |
| Default | 10.63 | 1000 | 3 | 79.59 / 99.79 | 213.01 / 231.16 | 133.42 |
| Threadpool 1 | 10.55 | 95 | 1 | 9.38 / 10.26 | 28.74 / 31.43 | 19.36 |
| Threadpool 1 | 10.55 | 95 | 3 | 8.95 / 9.84 | 29.08 / 30.32 | 20.13 |
| Threadpool 1 | 10.55 | 1000 | 1 | 81.49 / 94.03 | 215.17 / 234.25 | 133.68 |
| Threadpool 1 | 10.55 | 1000 | 3 | 82.08 / 101.95 | 218.55 / 242.42 | 136.47 |
| Background QoS | 25.13 | 95 | 1 | 22.63 / 60.44 | 79.62 / 157.59 | 56.99 |
| Background QoS | 25.13 | 95 | 3 | 17.76 / 45.82 | 62.19 / 83.75 | 44.43 |
| Background QoS | 25.13 | 1000 | 1 | 217.87 / 317.56 | 525.47 / 774.03 | 307.60 |
| Background QoS | 25.13 | 1000 | 3 | 243.95 / 305.38 | 653.13 / 805.87 | 409.18 |
| Background QoS, pool 1 | 29.58 | 95 | 1 | 26.16 / 43.27 | 86.87 / 113.06 | 60.71 |
| Background QoS, pool 1 | 29.58 | 95 | 3 | 32.84 / 52.65 | 109.98 / 143.05 | 77.14 |
| Background QoS, pool 1 | 29.58 | 1000 | 1 | 300.88 / 362.81 | 745.57 / 833.71 | 444.69 |
| Background QoS, pool 1 | 29.58 | 1000 | 3 | 299.08 / 398.39 | 743.61 / 920.51 | 444.53 |

## Interpretation

The default run puts current driver creation at about 28–29ms for 95 Tickets and 213ms for
1,000 Tickets. The independently timed scans cost about 9ms and 80ms respectively. At background
QoS, creation costs 62–80ms for 95 Tickets and 525–653ms for 1,000; the corresponding scans cost
18–23ms and 218–244ms. Background QoS with one libuv worker records 87–110ms and 744–746ms for
creation, with scans of 26–33ms and 299–301ms. These ranges span the one- and three-Ticket batches;
they are not confidence intervals. The table retains each batch's p95 rather than hiding the spread.

The slow runs satisfy the requested `taskpolicy -b` measurement, but their calibration is essential.
The recorded core indices are 25.13ms and 29.58ms, about 2.36 and 2.78 times the default run's
10.63ms. They did not reproduce the older scan snapshot's 52ms slow-end index in
[root AGENTS.md](../../AGENTS.md). Background QoS is a scheduling request, not hard affinity;
these observations cannot be described as the machine's guaranteed slowest execution or scaled as
though they had that older calibration. The index is measured once per run, so it also cannot
correct for scheduling changes within a run.

With default QoS, reducing the threadpool to one changes create medians by roughly 1–3%, while the
core indices are close (10.63ms versus 10.55ms). That supports CPU work dominating these particular
OS-warm trials. Under background QoS the one-worker run is slower, but its core index is also about
18% slower, and the groups run sequentially without repeated randomized run-level comparisons.
The experiment cannot separate worker-count effects from scheduling and run-to-run load. It does
not establish that file I/O never matters, nor measure cold-disk behavior. The three-Ticket
batch sometimes finishing before the one-Ticket batch is further reason not to infer a per-Ticket
write cost from differences between groups.

Creation includes more than two scans: target-Effort reads, guard operations, validation and file
writes all contribute. Subtracting an independent scan therefore leaves a mixture of costs. No
phase was instrumented separately, and the scan removed by a future implementation need not cost
exactly what the independent scan did. Neither the difference of medians nor a difference of p95s
is an observed latency or saving for a random-ID implementation.

## Wording the ADR can quote

> At source commit `bec6e40`, on an Apple M4 Pro using Node v24.15.0, 30 retained observations per
> group measured the existing driver `createTickets` call and an independent fresh-driver scan on
> OS-warm disposable fixtures. For a one-Ticket batch at 1,000 Tickets, default QoS measured
> 212.66ms create median / 226.64ms p95 and 80.33ms scan median / 93.56ms p95. Background QoS
> (core index 25.13ms) measured 525.47ms / 774.03ms for creation and 217.87ms / 317.56ms for a
> scan. Background QoS with `UV_THREADPOOL_SIZE=1` (core index 29.58ms) measured 745.57ms /
> 833.71ms for creation and 300.88ms / 362.81ms for a scan. Subtracting the scan median from the
> create median gives 132.33ms, 307.60ms and 444.69ms respectively. Those differences are
> arithmetic residuals, not measured latencies of the proposed one-scan path or measured savings.
> The alternative allocation path remains unimplemented and unmeasured. The complete table also
> reports the 95-Ticket real workspace and three-Ticket batches.

This replaces the earlier practice of halving a doubled single-scan timing with two independently
observed quantities. It provides evidence for T49 and input to T72's ADR; it does not choose or
implement the allocation strategy.

## Provenance and verification

Primary measurement sources are the four local JSON artifacts below. Each carries attribution,
fixture sizes, 30 retained sample pairs per group and summaries. Their identical Ticket counts
and byte totals match the fixture description above. The local `frontier-t49-slow.sh` records the
two background-QoS commands shown under reproduction. These files remain outside the repository;
the hashes identify the exact artifacts inspected and do not make temporary storage durable.
The measured source revision comes from the original run record, rather than a commit field in the
JSON. Production call boundaries were checked against `src/storage/markdown/driver.ts`,
`src/storage/markdown/create.ts` and `src/tools/create-tickets.ts`; the method and quantiles come
from `bench/scan-cost.ts`, all linked above.

Independent recomputation checked n, min, nearest-rank median, nearest-rank p95, max and mean for
all 32 distributions (960 individual timings), and the 16 differences of medians. Every stored
summary matched within 1e-9ms absolute or 1e-12 relative tolerance. Table cells were rendered from
those checked values. No application behavior changed and no timing samples were regenerated.

| Artifact under `/private/tmp/` | SHA-256 |
| --- | --- |
| `frontier-t49-default.json` | `382f78ddb817e147f3d32cf29a21d1893051737a4df5fe6110e371b5fe0f6a31` |
| `frontier-t49-threadpool1.json` | `d873d047d7dddcf1a5693172b086b5245b4f09e4ffdbc5614bf8c62ad3fb48ec` |
| `frontier-t49-slow.json` | `829384456b3d88a36f0aefcd816beaeac5222c1e79d6faaae9bd399b6cd61a6b` |
| `frontier-t49-slow-threadpool1.json` | `d335b01969b42ad007b412a4c42f76bf6d14697b2e10aa050aae39ea3128ce27` |
| `frontier-t49-slow.sh` | `929ffe987d03270415f94b70008dec71b7385b2a6a099d31e9e74f69e1dffd7c` |
