import { defineConfig } from 'vitest/config';

/**
 * Run after every in-process test, one file at a time: each is load enough to
 * starve the tests beside it on a slow core — spawned processes, or a
 * 1,502-Ticket batch held open as a race window. Under `taskpolicy -b` the
 * default pool runs on the efficiency cores alone, and timeouts are wall-clock.
 */
const HEAVY = [
  'test/cross-process-claim.test.ts',
  'test/cross-process-create.test.ts',
  'test/create-mid-batch.test.ts',
];

/** Last and alone: it bounds a spawned process's exit in wall-clock time, which any load stretches. */
const TIMED = ['test/exit-on-disconnect.test.ts'];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'in-process',
          include: ['test/**/*.test.ts'],
          exclude: [...HEAVY, ...TIMED],
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: 'heavy',
          include: HEAVY,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
      {
        test: { name: 'timed', include: TIMED, sequence: { groupOrder: 2 } },
      },
    ],
  },
});
