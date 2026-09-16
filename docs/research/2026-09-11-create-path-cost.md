# Current create-path cost

Date: 2026-09-11. Answers [T49](../../.scratch/frontier-ids/issues/07-T49-what-the-drop-to-one-scan-actually-costs-measure.md).

The existing [scan benchmark](../../bench/scan-cost.ts) now has a `--group=create` mode.
This measures today's guarded driver `createTickets` call and an independent single workspace scan.
It does not implement or time a random-ID path. The source under measurement was commit `bec6e40`,
with only the benchmark and documentation changes in this slice.

## Method

Each group discards three warmups and retains 30 observations. It creates batches of one and three
Tickets into an existing Effort. Each created Ticket has roughly 3,250 bytes of generated prose,
plus serialized frontmatter, and no Edges. The production cycle-validation callback runs inside the
creation timer; request planning, MCP transport and result rendering are outside it.

Every create uses a fresh disposable copy of the fixture, and every standalone scan uses a fresh
driver over the unchanged base fixture. Copying, driver construction, cardinality verification and
cleanup are outside the timers. The two timers alternate order between iterations. Both drivers
have the watcher's unconditional settle schedule disabled; no competing writer is present. The
created count is checked against the requested batch and each resulting fixture must contain
exactly its initial count plus that batch. Temporary trees are removed after each iteration.

This measures a driver operation end to end, including its target-Effort pre-read, both guarded
workspace walks, validation, guard release, two-phase file write and target-Effort readback.
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

Copies prime the OS page cache. "Single scan" means process-cold, not disk-cold. No forced GC runs
between timings, and the independently observed scan is not necessarily identical in cost to the
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

All times below are milliseconds; p95 uses nearest rank (29th of 30 sorted observations).

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
