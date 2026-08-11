/**
 * T19's measurement harness: what a full workspace scan actually costs, and
 * what N sessions sharing one repo pay for a single write.
 *
 * Throwaway by intent — it is not shipped (`bench` is absent from
 * `package.json`'s `files`) and nothing under `src/` imports it. It is typechecked
 * because a benchmark nobody can compile is a benchmark nobody re-runs.
 *
 * Three things it deliberately does not pretend to:
 *
 * - **No scan here is cold in the OS.** Dropping the page cache needs root, so
 *   every "cold" number below means *cold in this process* — a freshly built
 *   driver with no cached scan — over files macOS is almost certainly still
 *   holding in memory. Real first-touch-after-boot cost is higher by an unknown
 *   margin.
 * - **It measures one machine.** The attribution block printed with the results
 *   is what makes the numbers quotable; a number without it is folklore.
 * - **The multi-session groups use real OS processes**, following
 *   `test/cross-process-*.test.ts`. N drivers in one process would share a V8
 *   heap, a page cache and a scheduler, and would answer a different question
 *   than the one the Ticket asks.
 *
 * Run: `pnpm run bench:scan [--out=<path>] [--no-gc]`
 */
/*
 * `no-await-in-loop` is right about production code and wrong about this file.
 * Every loop here is sequential on purpose: iterations run concurrently would
 * measure contention rather than cost, and a trial that started before the last
 * one was acknowledged would measure the watcher coalescing two writes into one.
 */
// oxlint-disable no-await-in-loop
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { cpus, release, tmpdir, totalmem } from 'node:os';
import { dirname, join } from 'node:path';

import { createMarkdownDriver } from '../src/storage/markdown/driver.ts';

/**
 * Outside the repo on purpose. A results blob committed next to the harness
 * would be read later as a fact about whatever machine happened to run it.
 */
const DEFAULT_OUT = join(tmpdir(), 'frontier-scan-cost.json');

/** Discarded, not reported: V8 has not tiered up and the OS has not seen the tree. */
const SCAN_WARMUPS = 3;

/**
 * How the post-invalidation re-scan is provoked without touching the filesystem.
 *
 * `invalidate()` is private to the driver, and tripping the watcher to reach it
 * would fold the debounce and a lost-event risk into a number that is supposed
 * to be about walking a tree. The settle schedule is an unconditional
 * invalidation the driver already offers, at a delay the caller picks — so the
 * measured iteration constructs its driver with a single settle entry, times
 * cold and warm before it fires, waits, and times the re-scan after. An
 * iteration whose cold+warm overran the settle delay is counted and dropped
 * rather than reported, since its "warm" read may have been a re-scan.
 */
const MIN_SETTLE_MS = 150;
const SETTLE_HEADROOM = 5;
const SETTLE_MARGIN_MS = 20;

/** Synthesized workspaces mirror the real one's shape: a few Efforts, not one big bag. */
const SYNTH_EFFORTS = 3;

/**
 * The mean size of a real Ticket file under this repo's `.scratch/` at the time
 * of writing (32 files, mean 3250 bytes). Generating 200-byte stubs would
 * measure `readdir` and nothing else.
 */
const TARGET_TICKET_BYTES = 3250;

/** The Ticket a write moves, so a watching session can see the write land. */
const MARKER_FILE = '990-TBENCH-marker.md';
const MARKER_ID = 'TBENCH';

/** How often a watching session re-reads while waiting for a write to show up. */
const POLL_MS = 5;

/**
 * The driver's default settle schedule tops out at 1000ms, and each entry drops
 * the scan unconditionally. A settle firing next to a write would let a session
 * re-scan without paying the debounce, and report a staleness window it did not
 * live through — so no trial starts until the schedule is spent.
 */
const SETTLE_GRACE_MS = 1200;

/** A write nobody saw within this is recorded as lost rather than waited on forever. */
const TRIAL_TIMEOUT_MS = 5000;

/** Let the watchers quiesce between trials, so one write's events cannot bleed into the next. */
const BETWEEN_TRIALS_MS = 30;

interface Summary {
  readonly n: number;
  readonly min: number;
  readonly median: number;
  readonly p95: number;
  readonly max: number;
  readonly mean: number;
}

interface Fixture {
  readonly name: string;
  readonly root: string;
  /** Where the marker Ticket lives — `<root>/.scratch/<effort>/issues`. */
  readonly issues: string;
  readonly effortCount: number;
  readonly ticketCount: number;
  readonly meanTicketBytes: number;
  readonly totalTicketBytes: number;
  /** Measured iterations for the scan group, and trials per session count. */
  readonly iterations: number;
  readonly trials: number;
}

interface ScanRun {
  readonly fixture: string;
  readonly warmupsDiscarded: number;
  readonly settleAtMs: number;
  readonly droppedIterations: number;
  readonly cold: Summary;
  readonly warm: Summary;
  readonly rescan: Summary;
}

interface MemoryRun {
  readonly fixture: string;
  readonly gcForced: boolean;
  readonly ticketCount: number;
  readonly baselineRss: number;
  readonly baselineHeapUsed: number;
  readonly afterRss: number;
  readonly afterHeapUsed: number;
  readonly deltaRss: number;
  readonly deltaHeapUsed: number;
}

interface SessionRun {
  readonly fixture: string;
  readonly sessions: number;
  readonly trials: number;
  readonly lostTrials: number;
  /** Write completed → the reading session's first call that reflected it. */
  readonly staleness: Summary;
  /** The cost of that call: one session's post-invalidation re-scan. */
  readonly rescan: Summary;
  /** Every session's re-scan for one write, added up. What the repo pays per write. */
  readonly aggregatePerWrite: Summary;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** A wall clock two processes can subtract across. `Date.now()` is too coarse for a 50ms window. */
const wallNow = () => performance.timeOrigin + performance.now();

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find(argument => argument.startsWith(prefix));
  return found?.slice(prefix.length);
}

function required(name: string): string {
  const value = option(name);
  if (value === undefined) throw new Error(`--${name}= is required`);
  return value;
}

const NOOP = () => {};

function deferred<T>() {
  let resolve: (value: T) => void = NOOP;
  const promise = new Promise<T>(settle => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function timed(operation: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  await operation();
  return performance.now() - started;
}

/**
 * Nearest-rank, which is the honest estimator at these sample counts — it names
 * a sample that was actually observed rather than interpolating between two.
 * Its cost is that a high quantile needs enough samples to sit below the last
 * one: at n=20 or fewer, `q=0.95` *is* the maximum, so a column headed p95
 * would be the worst case wearing a percentile's name. Every group here runs
 * n=30, where it lands on the second-highest.
 */
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function summarize(samples: readonly number[]): Summary {
  const sorted = samples.toSorted((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    n: sorted.length,
    min: sorted[0] ?? 0,
    median: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    max: sorted.at(-1) ?? 0,
    mean: sorted.length === 0 ? 0 : total / sorted.length,
  };
}

// ---------------------------------------------------------------- fixtures

const WORDS = [
  'workspace',
  'scan',
  'driver',
  'watcher',
  'invalidate',
  'debounce',
  'session',
  'process',
  'markdown',
  'frontmatter',
  'ticket',
  'effort',
  'board',
  'staleness',
  'revision',
  'guard',
  'allocation',
  'seam',
  'storage',
  'measurement',
];

function sentence(seed: number): string {
  const words: string[] = [];
  for (let i = 0; i < 13; i += 1) {
    words.push(WORDS[(seed * 7 + i * 3) % WORDS.length] ?? 'scan');
  }
  return `${words.join(' ')}.`;
}

function prose(target: number, seed: number): string {
  const lines = ['## Question', ''];
  let size = 13;
  let step = seed;
  while (size < target) {
    const line = sentence(step);
    lines.push(line);
    size += line.length + 1;
    step += 1;
    if (lines.length % 5 === 0) {
      lines.push('');
      size += 1;
    }
  }
  return `${lines.join('\n')}\n`;
}

const STATUS_CYCLE = ['open', 'claimed', 'open', 'resolved', 'open', 'dropped'];
const TRIAGE_CYCLE = ['ready-for-agent', 'needs-detail', 'needs-decision'];

function synthTicket(n: number): string {
  const kind = n % 3 === 0 ? 'decision' : 'build';
  const status = STATUS_CYCLE[n % STATUS_CYCLE.length] ?? 'open';
  const head = [
    '---',
    `id: T${String(n)}`,
    `title: A synthesized ticket about ${WORDS[n % WORDS.length] ?? 'scan'} number ${String(n)}`,
    `kind: ${kind}`,
    ...(kind === 'decision' ? ['type: task'] : []),
    `status: ${status}`,
    `triage: ${TRIAGE_CYCLE[n % TRIAGE_CYCLE.length] ?? 'ready-for-agent'}`,
    `blocked_by: ${n > 3 ? `[T${String(n - 3)}]` : '[]'}`,
    ...(status === 'resolved' ? ['answer_gist: The measured answer, in one line.'] : []),
    ...(status === 'dropped' ? ['dropped_reason: Out of scope for this Effort.'] : []),
    '---',
    '',
  ].join('\n');

  return head + prose(TARGET_TICKET_BYTES - head.length, n);
}

function synthMap(slug: string): string {
  return [
    `# ${slug}`,
    '',
    '## Destination',
    '',
    'A synthesized Effort, generated to give a scan something realistic to walk.',
    '',
    '## Decisions so far',
    '',
    '<!-- GENERATED -->',
    '<!-- /GENERATED -->',
    '',
  ].join('\n');
}

function synthSpec(slug: string): string {
  return `# ${slug} spec\n\nA synthesized Spec body, opaque to the driver.\n`;
}

function markerContents(title: string): string {
  return [
    '---',
    `id: ${MARKER_ID}`,
    `title: ${title}`,
    'kind: build',
    'status: open',
    'blocked_by: []',
    '---',
    '',
    'The Ticket a benchmark write moves.',
    '',
  ].join('\n');
}

/** Atomically, the way `writeAtomically` does it — a rename is what trips a watcher in production. */
async function writeMarker(issues: string, title: string): Promise<void> {
  const path = join(issues, MARKER_FILE);
  // The temporary name deliberately does not end in `.md`, so a scan racing the
  // rename cannot see a half-written Ticket.
  const temp = `${path}.bench-tmp`;
  await writeFile(temp, markerContents(title), 'utf8');
  await rename(temp, path);
}

async function synthesize(root: string, tickets: number): Promise<string> {
  const storage = join(root, '.scratch');
  const perEffort = Math.ceil(tickets / SYNTH_EFFORTS);
  let minted = 0;

  for (let e = 0; e < SYNTH_EFFORTS; e += 1) {
    const slug = `bench-${String(e + 1)}`;
    const issues = join(storage, slug, 'issues');
    await mkdir(issues, { recursive: true });
    await writeFile(join(storage, slug, 'map.md'), synthMap(slug), 'utf8');
    await writeFile(join(storage, slug, 'spec.md'), synthSpec(slug), 'utf8');

    const count = Math.min(perEffort, tickets - minted);
    for (let i = 0; i < count; i += 1) {
      minted += 1;
      const name = `${String(i + 1).padStart(3, '0')}-T${String(minted)}-synthesized.md`;
      await writeFile(join(issues, name), synthTicket(minted), 'utf8');
    }
  }

  return join(storage, 'bench-1', 'issues');
}

/** Every Ticket file under a workspace, so the harness reports the size it actually generated. */
async function ticketStats(
  root: string,
): Promise<{ count: number; bytes: number; efforts: number }> {
  const storage = join(root, '.scratch');
  const slugs = (await readdir(storage, { withFileTypes: true })).filter(entry =>
    entry.isDirectory(),
  );

  let count = 0;
  let bytes = 0;
  for (const slug of slugs) {
    const issues = join(storage, slug.name, 'issues');
    const files = await readdir(issues).catch(() => []);
    for (const file of files.filter(name => name.endsWith('.md'))) {
      count += 1;
      bytes += (await stat(join(issues, file))).size;
    }
  }

  return { count, bytes, efforts: slugs.length };
}

async function buildFixtures(scratch: string): Promise<{ dir: string; fixtures: Fixture[] }> {
  const dir = await mkdtemp(join(tmpdir(), 'frontier-bench-'));

  // The real Effort is copied rather than benchmarked in place: a concurrent
  // edit in the live repo would land inside a timed window and nobody would know.
  const realRoot = join(dir, 'real');
  await mkdir(realRoot, { recursive: true });
  await cp(scratch, join(realRoot, '.scratch'), { recursive: true });

  const plan: Array<{
    name: string;
    root: string;
    issues: string;
    iterations: number;
    trials: number;
  }> = [
    {
      name: 'real .scratch (frontier-v1 + hive + web)',
      root: realRoot,
      issues: join(realRoot, '.scratch', 'frontier-v1', 'issues'),
      iterations: 30,
      trials: 30,
    },
  ];

  // Thirty everywhere, including the sizes where a trial is slowest. At fifteen
  // the p95 estimator lands on the last sample, so the column would have been
  // the maximum wearing a percentile's name — and these are the numbers an
  // architecture argument gets quoted from.
  for (const [tickets, iterations, trials] of [
    [200, 30, 30],
    [1000, 30, 30],
  ] as const) {
    const root = join(dir, `synth-${String(tickets)}`);
    const issues = await synthesize(root, tickets);
    plan.push({
      name: `synthesized ~${String(tickets)} tickets`,
      root,
      issues,
      iterations,
      trials,
    });
  }

  const fixtures: Fixture[] = [];
  for (const entry of plan) {
    // Seeded before anything is counted, so the ticket count the harness reports
    // is the one every group actually scanned.
    await writeMarker(entry.issues, 'marker-0');
    const stats = await ticketStats(entry.root);
    fixtures.push({
      name: entry.name,
      root: entry.root,
      issues: entry.issues,
      effortCount: stats.efforts,
      ticketCount: stats.count,
      totalTicketBytes: stats.bytes,
      meanTicketBytes: Math.round(stats.bytes / Math.max(1, stats.count)),
      iterations: entry.iterations,
      trials: entry.trials,
    });
  }

  return { dir, fixtures };
}

// ------------------------------------------------- group 1: scan timings

async function measureScans(fixture: Fixture): Promise<ScanRun> {
  const warmup: number[] = [];
  for (let i = 0; i < SCAN_WARMUPS; i += 1) {
    const driver = createMarkdownDriver(fixture.root, { watcherSettleMs: [] });
    warmup.push(await timed(() => driver.listTickets()));
    await driver.listTickets();
    driver.close();
  }

  const settleAtMs = Math.max(MIN_SETTLE_MS, Math.ceil(SETTLE_HEADROOM * summarize(warmup).median));

  const cold: number[] = [];
  const warm: number[] = [];
  const rescan: number[] = [];
  let dropped = 0;

  for (let i = 0; i < fixture.iterations; i += 1) {
    const constructedAt = performance.now();
    const driver = createMarkdownDriver(fixture.root, { watcherSettleMs: [settleAtMs] });

    const coldMs = await timed(() => driver.listTickets());
    const warmMs = await timed(() => driver.listTickets());
    const overran = performance.now() - constructedAt >= settleAtMs;

    await sleep(Math.max(0, settleAtMs - (performance.now() - constructedAt) + SETTLE_MARGIN_MS));
    const rescanMs = await timed(() => driver.listTickets());
    driver.close();

    // Only the re-scan is in doubt when cold+warm overran: that "warm" read may
    // itself have been a re-scan, and the read after it a second warm one. The
    // cold sample was taken before any of that and is sound either way —
    // dropping the whole iteration would quietly trim the slow tail off two
    // distributions to protect a third.
    cold.push(coldMs);
    if (overran) {
      dropped += 1;
      continue;
    }
    warm.push(warmMs);
    rescan.push(rescanMs);
  }

  return {
    fixture: fixture.name,
    warmupsDiscarded: SCAN_WARMUPS,
    settleAtMs,
    droppedIterations: dropped,
    cold: summarize(cold),
    warm: summarize(warm),
    rescan: summarize(rescan),
  };
}

// ------------------------------------------------------- group 2: memory

async function measureMemory(fixture: Fixture, gc: boolean): Promise<MemoryRun> {
  const args = [
    ...(gc ? ['--expose-gc'] : []),
    import.meta.filename,
    '--role=memory',
    `--root=${fixture.root}`,
  ];

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] });
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
    });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve(buffer);
      else reject(new Error(`memory probe exited ${String(code)}`));
    });
  });

  const probe = JSON.parse(output.trim()) as {
    gc: boolean;
    ticketCount: number;
    baseline: { rss: number; heapUsed: number };
    after: { rss: number; heapUsed: number };
  };

  return {
    fixture: fixture.name,
    gcForced: probe.gc,
    ticketCount: probe.ticketCount,
    baselineRss: probe.baseline.rss,
    baselineHeapUsed: probe.baseline.heapUsed,
    afterRss: probe.after.rss,
    afterHeapUsed: probe.after.heapUsed,
    deltaRss: probe.after.rss - probe.baseline.rss,
    deltaHeapUsed: probe.after.heapUsed - probe.baseline.heapUsed,
  };
}

async function runMemoryProbe(): Promise<void> {
  const root = required('root');
  const forceGc = (globalThis as { gc?: () => void }).gc;

  forceGc?.();
  const baseline = process.memoryUsage();

  // Settle is disabled here and nowhere else in this group's justification:
  // an unconditional invalidation would drop the cached scan this probe exists
  // to weigh, and the sample would report a driver holding nothing.
  const driver = createMarkdownDriver(root, { watcherSettleMs: [] });
  const tickets = await driver.listTickets();
  const efforts = await driver.listEfforts();

  forceGc?.();
  const after = process.memoryUsage();

  // `tickets` and `efforts` are read after the sample, so the scan they came
  // from is still reachable when it is taken.
  process.stdout.write(
    `${JSON.stringify({
      gc: forceGc !== undefined,
      ticketCount: tickets.length,
      effortCount: efforts.length,
      baseline: { rss: baseline.rss, heapUsed: baseline.heapUsed },
      after: { rss: after.rss, heapUsed: after.heapUsed },
    })}\n`,
  );

  driver.close();
}

// ------------------------------- groups 3 and 4: N sessions, one writer

interface Sighting {
  readonly at: number;
  readonly scanMs: number;
}

interface Session {
  readonly ready: Promise<void>;
  saw(title: string): Promise<Sighting>;
  stop(): void;
}

function startSession(root: string, trials: number): Session {
  const child: ChildProcess = spawn(
    process.execPath,
    [import.meta.filename, '--role=session', `--root=${root}`, `--trials=${String(trials)}`],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );

  const seen = new Map<string, Sighting>();
  const waiting = new Map<string, (sighting: Sighting) => void>();
  const ready = deferred<void>();

  const handle = (line: string) => {
    if (line === 'READY') {
      ready.resolve();
      return;
    }
    const [tag, title, at, scanMs] = line.split(' ');
    if (tag !== 'SAW' || title === undefined || at === undefined || scanMs === undefined) return;
    const sighting = { at: Number(at), scanMs: Number(scanMs) };
    seen.set(title, sighting);
    waiting.get(title)?.(sighting);
    waiting.delete(title);
  };

  let buffer = '';
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    buffer += chunk;
    let index = buffer.indexOf('\n');
    while (index >= 0) {
      handle(buffer.slice(0, index).trim());
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf('\n');
    }
  });

  return {
    ready: ready.promise,
    saw(title) {
      const already = seen.get(title);
      if (already !== undefined) return Promise.resolve(already);
      const pending = deferred<Sighting>();
      waiting.set(title, pending.resolve);
      return pending.promise;
    },
    stop() {
      child.kill('SIGKILL');
    },
  };
}

async function measureSessions(fixture: Fixture, count: number): Promise<SessionRun> {
  const trials = fixture.trials;
  const sessions = Array.from({ length: count }, () => startSession(fixture.root, trials));

  try {
    await Promise.all(sessions.map(session => session.ready));
    await sleep(SETTLE_GRACE_MS);

    const staleness: number[] = [];
    const rescan: number[] = [];
    const aggregate: number[] = [];
    let lost = 0;

    for (let k = 1; k <= trials; k += 1) {
      const title = `marker-${String(k)}`;
      await writeMarker(fixture.issues, title);
      const writeAt = wallNow();

      const sightings = await Promise.all(
        sessions.map(session =>
          Promise.race([session.saw(title), sleep(TRIAL_TIMEOUT_MS).then(() => undefined)]),
        ),
      );

      if (sightings.some(sighting => sighting === undefined)) {
        lost += 1;
      } else {
        let sum = 0;
        for (const sighting of sightings) {
          if (sighting === undefined) continue;
          staleness.push(sighting.at - writeAt);
          rescan.push(sighting.scanMs);
          sum += sighting.scanMs;
        }
        aggregate.push(sum);
      }

      await sleep(BETWEEN_TRIALS_MS);
    }

    return {
      fixture: fixture.name,
      sessions: count,
      trials,
      lostTrials: lost,
      staleness: summarize(staleness),
      rescan: summarize(rescan),
      aggregatePerWrite: summarize(aggregate),
    };
  } finally {
    for (const session of sessions) session.stop();
  }
}

/**
 * One session: a driver with the production watcher settings, re-reading every
 * {@link POLL_MS} and reporting the first read that reflects a new marker. That
 * read is the post-invalidation re-scan the write cost this process, and the
 * moment it returned is the far end of the staleness window.
 */
async function runSession(): Promise<void> {
  const root = required('root');
  const trials = Number(required('trials'));
  const driver = createMarkdownDriver(root);

  const markerTitle = (tickets: readonly { id: string | undefined; title: string }[]) =>
    tickets.find(ticket => ticket.id === MARKER_ID)?.title;

  let seen = markerTitle(await driver.listTickets());
  process.stdout.write('READY\n');

  let reported = 0;
  while (reported < trials) {
    const started = performance.now();
    const tickets = await driver.listTickets();
    const scanMs = performance.now() - started;
    const title = markerTitle(tickets);

    if (title !== undefined && title !== seen) {
      seen = title;
      reported += 1;
      process.stdout.write(`SAW ${title} ${String(wallNow())} ${scanMs.toFixed(3)}\n`);
    }
    await sleep(POLL_MS);
  }

  driver.close();
}

// ----------------------------------------------------------- the report

function attribution() {
  const cores = cpus();
  return {
    node: process.version,
    v8: process.versions.v8,
    platform: `${process.platform} ${process.arch}`,
    kernel: release(),
    cpu: cores[0]?.model ?? 'unknown',
    cores: cores.length,
    memoryGb: Math.round(totalmem() / 1024 ** 3),
  };
}

const ms = (value: number) => `${value.toFixed(2)}ms`;
const mb = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)}MB`;
const pad = (text: string, width: number) => text.padEnd(width);
const padLeft = (text: string, width: number) => text.padStart(width);

function row(summary: Summary, label: string): string {
  return [
    pad(label, 14),
    padLeft(ms(summary.median), 12),
    padLeft(ms(summary.p95), 12),
    padLeft(ms(summary.min), 12),
    padLeft(ms(summary.max), 12),
    padLeft(String(summary.n), 6),
  ].join('');
}

const say = (text = '') => {
  process.stdout.write(`${text}\n`);
};

const HEADER = [
  pad('', 14),
  padLeft('median', 12),
  padLeft('p95', 12),
  padLeft('min', 12),
  padLeft('max', 12),
  padLeft('n', 6),
].join('');

async function runBenchmark(): Promise<void> {
  const out = option('out') ?? DEFAULT_OUT;
  const gc = !process.argv.includes('--no-gc');
  const repo = join(import.meta.dirname, '..');

  const machine = attribution();
  say('T19 — what a workspace scan actually costs');
  say('='.repeat(78));
  say(
    `${machine.node} (v8 ${machine.v8}) · ${machine.platform} · kernel ${machine.kernel}\n` +
      `${machine.cpu} · ${String(machine.cores)} cores · ${String(machine.memoryGb)}GB`,
  );
  say();
  say('CAVEATS, read before quoting anything below:');
  say('  · "cold" means cold in this Node process, never cold in the OS page cache —');
  say('    dropping that needs root. First-touch-after-boot cost is higher by an');
  say('    unknown margin, and every number here is the optimistic end.');
  say('  · Groups 3 and 4 use real OS processes, one driver and one recursive');
  say('    fs.watch each; the writer is this harness, writing atomically.');
  say('  · A watching session polls every 5ms, which costs it a cached listTickets');
  say('    per poll. That allocation churn is inside the numbers it reports.');
  say();

  const { dir, fixtures } = await buildFixtures(join(repo, '.scratch'));

  try {
    say('Fixtures');
    say('-'.repeat(78));
    for (const fixture of fixtures) {
      say(
        `  ${pad(fixture.name, 42)} ${padLeft(String(fixture.ticketCount), 5)} tickets · ` +
          `${String(fixture.effortCount)} efforts · mean ${String(fixture.meanTicketBytes)}B · ` +
          `${(fixture.totalTicketBytes / 1024).toFixed(0)}KB total`,
      );
    }
    say();

    say('1. Scan timings — cold (fresh driver), warm (cached), post-invalidation re-scan');
    say('-'.repeat(78));
    const scans: ScanRun[] = [];
    for (const fixture of fixtures) {
      const run = await measureScans(fixture);
      scans.push(run);
      say(`  ${fixture.name}`);
      say(
        `    ${String(run.warmupsDiscarded)} warmup iterations discarded (V8 tier-up and first ` +
          `OS touch); settle at ${String(run.settleAtMs)}ms; ` +
          `${String(run.droppedIterations)} iterations dropped as overrunning it`,
      );
      say(`  ${HEADER}`);
      say(`  ${row(run.cold, '  cold')}`);
      say(`  ${row(run.warm, '  warm')}`);
      say(`  ${row(run.rescan, '  re-scan')}`);
      say();
    }

    say('2. Resident memory per process, one driver holding one completed scan');
    say('-'.repeat(78));
    const memory: MemoryRun[] = [];
    for (const fixture of fixtures) {
      const run = await measureMemory(fixture, gc);
      memory.push(run);
      say(
        `  ${pad(fixture.name, 42)} rss ${padLeft(mb(run.baselineRss), 8)} → ` +
          `${padLeft(mb(run.afterRss), 8)} (Δ ${mb(run.deltaRss)}) · ` +
          `heapUsed Δ ${mb(run.deltaHeapUsed)} · gc ${run.gcForced ? 'forced' : 'not available'}`,
      );
    }
    say();
    say('  Baseline is taken after module load and before the driver exists.');
    say();

    say('3 & 4. N sessions sharing one repo: what one write costs them, and how stale they are');
    say('-'.repeat(78));
    const runs: SessionRun[] = [];
    for (const fixture of fixtures) {
      say(`  ${fixture.name}`);
      for (const count of [1, 2, 4]) {
        const run = await measureSessions(fixture, count);
        runs.push(run);
        say(
          `    N=${String(count)} · ${String(run.trials)} writes · ` +
            `${String(run.lostTrials)} lost`,
        );
        say(`    ${HEADER}`);
        say(`    ${row(run.staleness, '  staleness')}`);
        say(`    ${row(run.rescan, '  re-scan')}`);
        say(`    ${row(run.aggregatePerWrite, '  Σ per write')}`);
      }
      say();
    }

    const results = { attribution: machine, gcForced: gc, fixtures, scans, memory, sessions: runs };
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(results, undefined, 2)}\n`, 'utf8');
    say(`Raw results: ${out}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const role = option('role') ?? 'benchmark';
if (role === 'session') await runSession();
else if (role === 'memory') await runMemoryProbe();
else await runBenchmark();
