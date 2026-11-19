import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupFixtures,
  connectFrontier,
  makeLegacyWorkspace,
  makeMarkedWorkspace,
} from './support/harness.ts';
import { tokens } from './support/tokens.ts';

afterEach(cleanupFixtures);

/** Every file under a directory, recursively, as path -> contents. */
async function snapshot(dir: string): Promise<Map<string, string>> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const paths = entries
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name))
    .toSorted();

  const stamped = await Promise.all(
    paths.map(async path => {
      const [info, contents] = await Promise.all([stat(path), readFile(path, 'utf8')]);
      return [path, `${String(info.size)}:${info.mtimeMs.toString()}:${contents}`] as const;
    }),
  );

  return new Map(stamped);
}

/**
 * The telegram fixture again as `create_tickets` writes it: the same fifteen
 * titles, the same Edges between them, each Ticket named for what it is. The
 * fixture's Tickets carry ids, so its own measurements say nothing about what
 * a Board of names costs.
 */
const NAMED_TELEGRAM = [
  ['group-boot', 'Grammy group boot', []],
  ['identity-bridge', 'Identity bridge', ['group-boot']],
  ['inbound-events', 'Inbound event → Session hub', ['identity-bridge']],
  ['outbound-send', 'Outbound send path', ['group-boot']],
  ['inline-keyboard', 'askWithOptions → inline keyboard', ['inbound-events', 'outbound-send']],
  ['reminder-delivery', 'Reminder delivery', ['inline-keyboard']],
  ['button-checkin', 'Button Check-in → core verbs', ['inline-keyboard', 'reminder-delivery']],
  ['freetext-checkin', 'Free-text Check-in handoff', ['inbound-events']],
  ['settings-command', '`/settings` (admins)', ['identity-bridge', 'outbound-send']],
  [
    'checklist-membership',
    'Checklist join / leave commands',
    ['identity-bridge', 'outbound-send', 'settings-command'],
  ],
  ['day-summary', 'Day Summary delivery', ['outbound-send']],
  [
    'scheduler-loop',
    'Scheduler loop in telegram process',
    ['reminder-delivery', 'button-checkin', 'day-summary'],
  ],
  [
    'reminder-chrome',
    'Reminder chrome hygiene',
    ['outbound-send', 'reminder-delivery', 'button-checkin'],
  ],
  ['help-progress', 'Help + progress command handoff', ['inbound-events', 'outbound-send']],
  [
    'character-settings',
    'Character `/settings` + force-choose + admin title',
    ['settings-command'],
  ],
] as const;

/** What reading the Effort the old way costs: every Ticket file, whole. */
async function costOfReadingWhole(root: string, effort: string): Promise<number> {
  const issues = join(root, '.scratch', effort, 'issues');
  const names = await readdir(issues);
  const bodies = await Promise.all(names.map(async name => readFile(join(issues, name), 'utf8')));

  return tokens(bodies.join(''));
}

describe('the cost of a Board', () => {
  it('reproduces the spec measurement of what reading an Effort whole costs', async () => {
    const legacy = await makeLegacyWorkspace({
      telegram: 'sobrina-telegram',
      'ship-0-5-0': 'tag-customizer-ship-0-5-0',
    });
    const marked = await makeMarkedWorkspace({
      telegram: 'sobrina-telegram',
      'ship-0-5-0': 'tag-customizer-ship-0-5-0',
    });

    // The spec's Problem Statement: telegram is 15 Tickets / 32.7 KB ~ 8.2k
    // tokens, ship-0-5-0 is 7 Tickets / 52.7 KB ~ 13k. These are the numbers the
    // whole project argues from, so they are pinned, not merely bounded.
    expect(await costOfReadingWhole(legacy, 'telegram')).toBeCloseTo(8200, -2.5);
    expect(await costOfReadingWhole(legacy, 'ship-0-5-0')).toBeCloseTo(13100, -2.5);
    // The same Tickets with schema frontmatter and the marker, which every
    // Board below is measured on: 8,661 and 13,459, the frontmatter's cost.
    expect(await costOfReadingWhole(marked, 'telegram')).toBeCloseTo(8700, -2.5);
    expect(await costOfReadingWhole(marked, 'ship-0-5-0')).toBeCloseTo(13500, -2.5);
  });

  it('answers the same question for a small, pinned fraction of that', async () => {
    const root = await makeMarkedWorkspace({
      telegram: 'sobrina-telegram',
      'ship-0-5-0': 'tag-customizer-ship-0-5-0',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const measured = await Promise.all(
      (
        [
          ['telegram', 15, 15],
          ['ship-0-5-0', 30, 7],
        ] as const
      ).map(async ([effort, floor, count]) => {
        const text = await frontier.call('get_board', { effort });
        return {
          floor,
          count,
          listed: text.split('\n').filter(line => /^(> )?\S+ {2}/.test(line)).length,
          board: tokens(text),
          whole: await costOfReadingWhole(root, effort),
        };
      }),
    );

    for (const { board, whole, floor, count, listed } of measured) {
      // Every Ticket is on the Board: one that lost some would pass both bounds below.
      expect(listed).toBe(count);

      // The criterion is a comparison, so it is asserted as one: the Board is
      // measured *against* reading the same Effort whole, in one assertion.
      expect(whole / board).toBeGreaterThan(floor);

      // And pinned, not merely bounded — a Board that doubled would still clear
      // a ratio floor on an Effort this expensive, and quietly giving back the
      // saving is the regression this file exists to catch. Measured: 432 for
      // telegram, whose Tickets carry ids, and 378 for ship-0-5-0, whose seven
      // are named by their files.
      expect(board).toBeLessThan(500);
    }
  });

  it('holds for an Effort of named Tickets, at the same bodies', async () => {
    const root = await makeMarkedWorkspace({ telegram: 'sobrina-telegram' });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const issues = join(root, '.scratch', 'telegram', 'issues');
    const files = (await readdir(issues)).toSorted();
    // Prose only: the fixture's own frontmatter is not part of what create_tickets is given.
    const bodies = await Promise.all(
      files.map(async file =>
        (await readFile(join(issues, file), 'utf8')).replace(/^---\n[\s\S]*?\n---\n/, ''),
      ),
    );

    await frontier.call('create_tickets', {
      effort: 'telegram-named',
      create: true,
      tickets: NAMED_TELEGRAM.map(([name, title, blocked_by], index) => ({
        name,
        title,
        blocked_by: [...blocked_by],
        body: bodies[index],
      })),
    });

    const board = await frontier.call('get_board', { effort: 'telegram-named' });
    const whole = await costOfReadingWhole(root, 'telegram-named');

    // Every line opens with a name and no Ticket is unnamed.
    for (const [name, title] of NAMED_TELEGRAM) expect(board).toContain(`${name}  ${title}`);
    expect(board).not.toContain('warnings:');

    // The same Board with each name swapped for the three-character id the
    // fixture's Ticket carries (T30 to T44): what naming costs on a Board.
    const asIds = NAMED_TELEGRAM.reduce(
      (text, [name], index) => text.replaceAll(name, `T${String(30 + index)}`),
      board,
    );

    // Measured: 354 tokens against 8,651 read whole, 24x; the id rendering
    // is 244. Fifteen names and twenty-four Edges cost 110 tokens, under three
    // a reference, and the Board stays below either fixture's.
    expect(whole / tokens(board)).toBeGreaterThan(20);
    expect(tokens(board)).toBeLessThan(400);
    expect(tokens(board) / tokens(asIds)).toBeLessThan(1.5);

    // What the Board would cost if each line showed two tags, rendered as
    // get_tickets does. Boards show none; that choice is frontier-search's.
    // Measured: 81 tokens, 354 to 435, about 5 a line.
    let lines = 0;
    const tagged = board
      .split('\n')
      .map(line => {
        if (!NAMED_TELEGRAM.some(([name]) => line.replace(/^> /, '').startsWith(`${name}  `))) {
          return line;
        }
        lines += 1;
        return `${line}  tags=telegram,backend`;
      })
      .join('\n');
    expect(lines).toBe(NAMED_TELEGRAM.length);
    expect(tokens(tagged) - tokens(board)).toBeCloseTo(81, -1.5);
  });

  it('does not grow when an Effort carries far longer bodies', async () => {
    const root = await makeMarkedWorkspace({
      telegram: 'sobrina-telegram',
      'ship-0-5-0': 'tag-customizer-ship-0-5-0',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const cheap = tokens(await frontier.call('get_board', { effort: 'telegram' }));
    const expensive = tokens(await frontier.call('get_board', { effort: 'ship-0-5-0' }));

    // ship-0-5-0 costs 1.6x telegram to read whole while holding half the
    // Tickets, because resolved Tickets carry their full answers. The Boards
    // must not track that: the one with fewer Tickets must not cost more than
    // the Ticket count alone would explain.
    const wholeRatio =
      (await costOfReadingWhole(root, 'ship-0-5-0')) / (await costOfReadingWhole(root, 'telegram'));
    expect(wholeRatio).toBeGreaterThan(1.5);
    expect(expensive).toBeLessThan(cheap * 1.5);
  });
});

describe('the cost of check_tracker', () => {
  it('costs less schema than the migrate_effort it replaced, and a fixed result', async () => {
    const root = await makeMarkedWorkspace({
      telegram: 'sobrina-telegram',
      'ship-0-5-0': 'tag-customizer-ship-0-5-0',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const { tools } = await frontier.client.listTools();
    const schema = tokens(JSON.stringify(tools.find(tool => tool.name === 'check_tracker')));

    // migrate_effort's tool entry measured 181 tokens on the wire before it was
    // replaced; the slot is paid in every session, so the successor must not
    // cost more. Measured: 170.
    expect(schema).toBeLessThanOrEqual(181);
    expect(schema).toBeCloseTo(170, -1.5);

    // The full result on the marked fixtures, which hold no diagnostic: the
    // contract alone. Measured: 1350 — about three Boards, paid only when called.
    // The extra keys' rules took it from 1266.
    // It does not depend on the workspace: the legacy fixture, holding no
    // Ticket and nothing diagnosed, returns the same text.
    const full = await frontier.call('check_tracker');
    expect(full).toMatch(/^diagnostics: none, nothing to fix$/m);
    expect(tokens(full)).toBeCloseTo(1350, -1.5);
    const legacy = await makeLegacyWorkspace({ telegram: 'sobrina-telegram' });
    expect(await (await connectFrontier({ cwd: legacy, env: {} })).call('check_tracker')).toBe(
      full,
    );
  });
});

describe('reads', () => {
  it('never modify a file, so querying the tracker is not a source of git noise', async () => {
    const root = await makeMarkedWorkspace({
      telegram: 'sobrina-telegram',
      'ship-0-5-0': 'tag-customizer-ship-0-5-0',
    });
    const before = await snapshot(root);

    const frontier = await connectFrontier({ cwd: root, env: {} });
    await frontier.call('list_efforts');
    await frontier.call('get_board', { effort: 'telegram' });
    await frontier.call('get_board', { effort: 'ship-0-5-0' });
    await frontier.call('get_tickets', { ids: ['T30', 'T31', 'T44'] });

    const after = await snapshot(root);

    expect(before.size).toBeGreaterThan(20);
    expect([...after.entries()]).toEqual([...before.entries()]);
  });
});

describe('the cost of extra', () => {
  it('adds one argument to create_tickets and update_ticket, measured on the wire', async () => {
    const root = await makeMarkedWorkspace({ telegram: 'sobrina-telegram' });
    const frontier = await connectFrontier({ cwd: root, env: {} });
    const { tools } = await frontier.client.listTools();
    const entry = (name: string) => tokens(JSON.stringify(tools.find(tool => tool.name === name)));

    // Paid in every session. Measured before extra: create_tickets 460,
    // update_ticket 957; after: 525 and 1042, +65 and +85. The values are
    // checked in code, not in the schema, which would add the JSON grammar.
    expect(entry('create_tickets')).toBeCloseTo(525, -1.5);
    expect(entry('update_ticket')).toBeCloseTo(1042, -1.5);
  });
});
