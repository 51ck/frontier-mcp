import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import {
  cleanupFixtures,
  connectFrontier,
  makeFixtureTree,
  type ConnectedFrontier,
  type FixtureTree,
} from './support/harness.ts';

afterEach(cleanupFixtures);

function named(title: string, blockedBy: string[] = []): string {
  return `---\nfrontier: ticket\ntitle: ${title}\nkind: build\nstatus: open\nblocked_by: [${blockedBy.join(', ')}]\n---\n\nProse.\n`;
}

/**
 * alpha holds names at the edges of every length band — `api` (3), `host` (4),
 * `socket` (6), `gateway` (7) — and two ids. `holder` already carries a dangling Edge that is
 * one edit from `token-cache`.
 */
const WORKSPACE: FixtureTree = {
  '.git/HEAD': '',
  '.scratch/alpha/map.md': map('Somewhere.'),
  '.scratch/alpha/issues/token-cache.md': named('Cache the token'),
  '.scratch/alpha/issues/retry.md': named('Retry'),
  '.scratch/alpha/issues/host.md': named('Host'),
  '.scratch/alpha/issues/api.md': named('Api'),
  '.scratch/alpha/issues/ui.md': named('Ui'),
  '.scratch/alpha/issues/socket.md': named('Socket'),
  '.scratch/alpha/issues/gateway.md': named('Gateway'),
  '.scratch/alpha/issues/holder.md': named('Holder', ['tokin-cache']),
  '.scratch/alpha/issues/01-T52-legacy.md': ticket('T52', 'Legacy'),
  '.scratch/alpha/issues/02-Tik4z0t-minted.md': ticket('Tik4z0t', 'Minted'),
  '.scratch/beta/map.md': map('Elsewhere.'),
  '.scratch/beta/issues/cache.md': named('Cache'),
  '.scratch/beta/issues/ledger.md': named('Ledger'),
  '.scratch/beta/issues/01-Tq7w2xz-far.md': ticket('Tq7w2xz', 'Far'),
};

type Write = (frontier: ConnectedFrontier, references: string[]) => Promise<string>;
type Refusal = (frontier: ConnectedFrontier, references: string[]) => Promise<string>;

/** Each write path, as: write these Edges from a Ticket of alpha, then name the file they land in. */
const PATHS: readonly (readonly [string, string, Write, Refusal])[] = [
  [
    'create_tickets',
    'newcomer.md',
    (frontier, references) =>
      frontier.call('create_tickets', {
        effort: 'alpha',
        tickets: [{ name: 'newcomer', title: 'Newcomer', blocked_by: references }],
      }),
    (frontier, references) =>
      frontier.callExpectingError('create_tickets', {
        effort: 'alpha',
        tickets: [{ name: 'newcomer', title: 'Newcomer', blocked_by: references }],
      }),
  ],
  [
    'update_ticket',
    'holder.md',
    (frontier, references) =>
      frontier.call('update_ticket', { id: 'alpha.holder', blocked_by: references }),
    (frontier, references) =>
      frontier.callExpectingError('update_ticket', { id: 'alpha.holder', blocked_by: references }),
  ],
];

async function start(tree: FixtureTree = WORKSPACE) {
  const root = await makeFixtureTree(tree);
  return { root, frontier: await connectFrontier({ cwd: root, env: {} }) };
}

async function snapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  await Promise.all(
    ['alpha', 'beta'].map(async effort => {
      const dir = join(root, '.scratch', effort, 'issues');
      await Promise.all(
        (await readdir(dir)).map(async file => {
          files[`${effort}/${file}`] = await readFile(join(dir, file), 'utf8');
        }),
      );
    }),
  );
  return files;
}

async function storedEdges(root: string, file: string): Promise<string[]> {
  const text = await readFile(join(root, '.scratch', 'alpha', 'issues', file), 'utf8');
  const list = /^blocked_by: \[(.*)\]$/m.exec(text)?.[1] ?? '';
  return list === '' ? [] : list.split(', ');
}

const NEAR_MISSES: readonly (readonly [string, string, string])[] = [
  ['a one-character slip', 'token-cachr', 'token-cache'],
  ['a slip written in another case', 'TOKEN-CACHR', 'token-cache'],
  ['a transposition, at length 4 where one edit is all that is allowed', 'hots', 'host'],
  ['a transposition at length 6, likewise', 'sokcet', 'socket'],
  ['one edit at length 4', 'hxst', 'host'],
  ['one edit at length 6', 'sockxt', 'socket'],
  ['two edits at length 7', 'gxtxway', 'gateway'],
  ['one edit where the shorter string has length 4', 'retr', 'retry'],
  ['one edit where the shorter string has length 6', 'gatewa', 'gateway'],
  ['a slip of an id in the Effort', 'Tik4z0', 'Tik4z0t'],
  ['a slip of an id in another Effort', 'Tq7w2xy', 'Tq7w2xz'],
  ['a transposition inside a full name across Efforts', 'beta.ledgre', 'beta.ledger'],
  ['a slip inside a full name on its own Effort', 'alpha.token-cachr', 'token-cache'],
  ['a slip of an id inside a full name', 'beta.Tq7w2xy', 'Tq7w2xz'],
];

/** Each is past what its length allows: one edit at 3, two at 4 and 6, three at 7. */
const DANGLING = [
  'uj',
  'apj',
  'T53',
  'hxxt',
  'sxckxt',
  'gxxxway',
  'gatew',
  'ret',
  'not-written-yet',
  'beta.unwritten',
  'gamma.token-cachr',
];

describe.each(PATHS)('an Edge supplied to %s', (_tool, file, write, refusal) => {
  it('is refused as a probable typo when it is a near miss, naming the Ticket to write', async () => {
    const { root, frontier } = await start();
    const before = await snapshot(root);

    const errors = await Promise.all(
      NEAR_MISSES.map(([, reference]) => refusal(frontier, ['retry', reference])),
    );
    NEAR_MISSES.forEach(([, reference, nearest], index) => {
      expect(errors[index], reference).toContain(`'${reference}' names no Ticket`);
      expect(errors[index], reference).toContain(`close to '${nearest}'`);
      expect(errors[index], reference).toContain(`Write '${nearest}' if that is the Ticket meant`);
      expect(errors[index], reference).toContain(
        `If a Ticket named '${reference}' is still to be written, declare it in the same ` +
          'create_tickets call or create it first. Nothing was written.',
      );
    });

    expect(await snapshot(root)).toEqual(before);
  });

  it('is refused when it is exactly a name in another Effort, naming it in full', async () => {
    const { root, frontier } = await start();
    const before = await snapshot(root);

    const error = await refusal(frontier, ['ledger']);
    expect(error).toContain(
      "'ledger' names no Ticket of alpha, and is the name of beta.ledger. Write that full name",
    );
    expect(error).toContain(
      "If a Ticket of alpha named 'ledger' is still to be written, declare it in the same " +
        'create_tickets call or create it first. Nothing was written.',
    );
    expect(await refusal(frontier, ['CACHE'])).toContain('the name of beta.cache');
    expect(await snapshot(root)).toEqual(before);
  });

  it('is stored as written and shown dangling when it is unlike any name', async () => {
    const { root, frontier } = await start();

    await write(frontier, DANGLING);

    expect(await storedEdges(root, file)).toEqual(DANGLING);
    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain(`blocked_by=${DANGLING.map(edge => `${edge}?`).join(',')}`);
    expect(board).toContain('dangling Edges');
  });

  it('is stored in the shortest form that resolves, in the stored spelling', async () => {
    const { root, frontier } = await start();

    await write(frontier, [
      'alpha.retry',
      'alpha.T52',
      'Token-Cache',
      'tik4z0t',
      'BETA.Ledger',
      'beta.Tq7w2xz',
    ]);

    expect(await storedEdges(root, file)).toEqual([
      'retry',
      'T52',
      'token-cache',
      'Tik4z0t',
      'beta.ledger',
      'Tq7w2xz',
    ]);
  });

  it('keeps the full name when the id alone would mean a Ticket of its own Effort', async () => {
    const { root, frontier } = await start({
      ...WORKSPACE,
      '.scratch/alpha/issues/tq7w2xz.md': named('Shadows the id'),
    });

    await write(frontier, ['beta.Tq7w2xz', 'alpha.tq7w2xz']);

    expect(await storedEdges(root, file)).toEqual(['beta.Tq7w2xz', 'tq7w2xz']);
  });

  it('is settled against the files on disk, not a scan taken before one was hand-written', async () => {
    const { root, frontier } = await start();
    await frontier.call('get_board', { effort: 'alpha' });
    await writeFile(
      join(root, '.scratch', 'alpha', 'issues', 'tq7w2xz.md'),
      named('Shadows the id'),
    );

    await write(frontier, ['beta.Tq7w2xz']);

    expect(await storedEdges(root, file)).toEqual(['beta.Tq7w2xz']);
  });

  it('is refused when it is the form a Board shows, naming the form to write', async () => {
    const { root, frontier } = await start();
    const before = await snapshot(root);

    expect(await refusal(frontier, ['Tq7w2xz@beta'])).toContain(
      "'Tq7w2xz@beta' is how a Board shows an Edge into another Effort, not a name. Write 'Tq7w2xz'.",
    );
    expect(await refusal(frontier, ['ledger@beta'])).toContain("Write 'beta.ledger'.");
    expect(await snapshot(root)).toEqual(before);

    await write(frontier, ['unwritten@beta', 'ledger@gamma']);
    expect(await storedEdges(root, file)).toEqual(['unwritten@beta', 'ledger@gamma']);
  });

  it('is stored once when two of them mean one Ticket, where the first stood', async () => {
    const { root, frontier } = await start();

    await write(frontier, ['beta.Tq7w2xz', 'retry', 'tq7w2xz', 'alpha.Retry', 'soon', 'SOON']);

    expect(await storedEdges(root, file)).toEqual(['Tq7w2xz', 'retry', 'soon']);
  });

  it('is stored as the id when two files claim it, whichever claimant it named', async () => {
    const { root, frontier } = await start({
      ...WORKSPACE,
      '.scratch/alpha/issues/03-T380-here.md': ticket('T380', 'Here'),
      '.scratch/beta/issues/03-T380-there.md': ticket('T380', 'There'),
    });

    await write(frontier, ['beta.t380', 'alpha.T380']);

    expect(await storedEdges(root, file)).toEqual(['T380']);
  });

  it('is refused for the exact name in another Effort before a near miss in its own', async () => {
    const { frontier } = await start({
      ...WORKSPACE,
      '.scratch/alpha/issues/ledgers.md': named('Ledgers'),
    });

    const error = await refusal(frontier, ['ledger']);

    expect(error).toContain('is the name of beta.ledger');
    expect(error).not.toContain('ledgers');
  });

  it('follows an Effort slug that itself contains a dot', async () => {
    const { root, frontier } = await start({
      ...WORKSPACE,
      '.scratch/v2/issues/socket.md': named('Not this one'),
      '.scratch/v2.api/issues/stream.md': named('Stream'),
    });

    expect(await refusal(frontier, ['v2.api.strema'])).toContain("close to 'v2.api.stream'");

    await write(frontier, ['V2.API.Stream', 'v2.api.unwritten']);
    expect(await storedEdges(root, file)).toEqual(['v2.api.stream', 'v2.api.unwritten']);
  });
});

describe('an Edge to a sibling of the same create_tickets call', () => {
  it('is refused when it is a slip of the sibling name, and creates nothing', async () => {
    const { root, frontier } = await start();
    const before = await snapshot(root);

    const error = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [
        { name: 'parse', title: 'Parse' },
        { name: 'render', title: 'Render', blocked_by: ['pasre'] },
      ],
    });

    expect(error).toContain("'pasre' names no Ticket and is close to 'parse'");
    expect(await snapshot(root)).toEqual(before);
  });

  it('resolves between near-named siblings, and never takes a forward reference for the Ticket itself', async () => {
    const { root, frontier } = await start();

    const text = await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [
        { name: 'step-1', title: 'First' },
        { name: 'step-2', title: 'Second', blocked_by: ['alpha.Step-1'] },
        { name: 'lonely', title: 'Lonely', blocked_by: ['lonley'] },
      ],
    });

    expect(text).toContain('blocked_by=lonley?');
    expect(await storedEdges(root, 'step-2.md')).toEqual(['step-1']);
    expect(await storedEdges(root, 'lonely.md')).toEqual(['lonley']);
  });
});

describe('an Edge a Ticket already carries', () => {
  it('is kept through an update that adds and removes others, though it is a near miss', async () => {
    const { root, frontier } = await start();

    await frontier.call('update_ticket', {
      id: 'alpha.holder',
      blocked_by: ['tokin-cache', 'retry', 'not-written-yet'],
    });
    expect(await storedEdges(root, 'holder.md')).toEqual([
      'tokin-cache',
      'retry',
      'not-written-yet',
    ]);

    await frontier.call('update_ticket', { id: 'alpha.holder', blocked_by: ['tokin-cache'] });
    expect(await storedEdges(root, 'holder.md')).toEqual(['tokin-cache']);
  });

  it('is exempt on that Ticket only, and a new near miss beside it is still refused', async () => {
    const { root, frontier } = await start();
    const before = await snapshot(root);

    expect(
      await frontier.callExpectingError('update_ticket', {
        id: 'alpha.host',
        blocked_by: ['tokin-cache'],
      }),
    ).toContain("close to 'token-cache'");
    expect(
      await frontier.callExpectingError('update_ticket', {
        id: 'alpha.holder',
        blocked_by: ['tokin-cache', 'tokin-cach'],
      }),
    ).toContain("'tokin-cach' names no Ticket");
    expect(await snapshot(root)).toEqual(before);
  });

  it('does not stop unrelated writes while it dangles', async () => {
    const { root, frontier } = await start();

    await frontier.call('update_ticket', { id: 'alpha.holder', comment: 'Still waiting.' });
    await frontier.call('update_ticket', { id: 'alpha.host', blocked_by: ['retry'] });
    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [{ name: 'unrelated', title: 'Unrelated', blocked_by: ['host'] }],
    });

    expect(await storedEdges(root, 'holder.md')).toEqual(['tokin-cache']);
    expect(await storedEdges(root, 'unrelated.md')).toEqual(['host']);
  });
});

describe('an Edge list reads back what was written', () => {
  const DIGITS: FixtureTree = {
    '.git/HEAD': '',
    '.scratch/alpha/map.md': map('Somewhere.'),
    '.scratch/alpha/issues/02.md': named('Two'),
    '.scratch/alpha/issues/7.md': named('Seven'),
    '.scratch/alpha/issues/1.0.md': named('Release'),
    '.scratch/alpha/issues/waits.md': named('Waits', ['02', '7', '1.0', 'true', '~']),
    '.scratch/alpha/issues/later.md': named('Later'),
  };

  it('takes an unquoted entry YAML reads as a number for the text it was written as', async () => {
    const { frontier } = await start(DIGITS);

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(board).toContain('waits  Waits  build/open  blocked_by=02,7,1.0,true?');
    expect(board).toContain('dangling Edges (1), pointing at no Ticket in this workspace: true');
  });

  it('writes such a name so that it reads back as itself', async () => {
    const { root, frontier } = await start(DIGITS);

    await frontier.call('update_ticket', { id: 'alpha.later', blocked_by: ['02', '1.0'] });

    expect(await readFile(join(root, '.scratch/alpha/issues/later.md'), 'utf8')).toContain(
      'blocked_by: ["02", "1.0"]',
    );
    expect(await frontier.call('get_board', { effort: 'alpha' })).toContain(
      'later  Later  build/open  blocked_by=02,1.0',
    );
  });

  it.each([
    ['02', 'blocked_by: [02]'],
    ['1.10', 'blocked_by: [1.10]'],
    ['02', 'note: &two 02\nblocked_by: [*two]'],
  ])(
    'reads id: %s and the Edge in %j as one name, so the dependent is takeable',
    async (id, edges) => {
      const { frontier } = await start({
        '.git/HEAD': '',
        '.scratch/alpha/map.md': map('Somewhere.'),
        '.scratch/alpha/issues/a.md': `---\nfrontier: ticket\nid: ${id}\ntitle: Done\nkind: build\nstatus: resolved\nanswer_gist: Yes.\nblocked_by: []\n---\n`,
        '.scratch/alpha/issues/c.md': `---\nfrontier: ticket\ntitle: Waits\nkind: build\nstatus: open\n${edges}\n---\n`,
      });

      const board = await frontier.call('get_board', { effort: 'alpha' });

      expect(board).toContain(`${id}  Done  build/resolved`);
      expect(board).toContain(`> c  Waits  build/open  blocked_by=${id}`);
      expect(board).not.toContain('dangling');
      expect(await frontier.call('get_tickets', { ids: [id] })).toContain(`# ${id} — Done`);
    },
  );
});
