/*
 * Loops here are sequential on purpose: each refused write is checked against
 * the file left by the one before it, and a tool run concurrently with another
 * would test the write queue rather than the rule.
 */
// oxlint-disable no-await-in-loop
import { chmod, lstat, mkdir, readdir, readFile, stat, symlink, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map, ticket } from './support/fixtures.ts';
import {
  cleanupFixtures,
  connectFrontier,
  makeFixtureTree,
  makeLegacyWorkspace,
  type ConnectedFrontier,
  type FixtureTree,
} from './support/harness.ts';

afterEach(cleanupFixtures);

const ISSUES = '.scratch/alpha/issues';

/** A marked fence holding exactly these lines, and a body. */
function fence(lines: readonly string[], body = 'Body prose.'): string {
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`;
}

const VALID = ['frontier: ticket', 'title: Valid one', 'status: open'];

async function workspace(tree: FixtureTree) {
  const root = await makeFixtureTree({ '.scratch/alpha/map.md': map('Somewhere.'), ...tree });
  return { root, frontier: await connectFrontier({ cwd: root, env: {} }) };
}

function ticketLines(board: string): string[] {
  return board.split('\n').filter(line => /^(> )?\S+ {2}/.test(line));
}

function warnings(board: string): string[] {
  const at = board.indexOf('warnings:');
  return at < 0 ? [] : board.slice(at).split('\n').slice(1);
}

/** Every file under a directory, path -> size, mtime and contents. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const files = entries.filter(entry => entry.isFile()).map(e => join(e.parentPath, e.name));
  const stamped = await Promise.all(
    files.toSorted().map(async path => {
      const [info, contents] = await Promise.all([stat(path), readFile(path, 'utf8')]);
      return [path, `${String(info.size)}:${String(info.mtimeMs)}:${contents}`] as const;
    }),
  );
  return Object.fromEntries(stamped);
}

/** A snapshot less the Efforts {@link everyTool} writes its own files into. */
function withoutElsewhere(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).filter(([path]) => !path.includes('/elsewhere-')),
  );
}

let runs = 0;

/**
 * Each of the eight tools once: reads and refused writes aimed at the named
 * file and Effort, and the writers that cannot be aimed at it landing in an
 * Effort of their own beside it.
 */
async function everyTool(frontier: ConnectedFrontier, effort: string, id: string): Promise<void> {
  runs += 1;
  const elsewhere = `elsewhere-${String(runs)}`;
  await frontier.call('list_efforts');
  await frontier.call('get_board', { effort });
  await frontier.call('get_tickets', { ids: [id] });
  await frontier.callExpectingError('update_ticket', { id, comment: 'Touch.' });
  await frontier.callExpectingError('update_ticket', { id, claim: { by: 'agent-1' } });
  await frontier.call('create_tickets', {
    effort: elsewhere,
    create: true,
    tickets: [{ name: 'other', title: 'Other' }],
  });
  await frontier.call('edit_map', { effort: elsewhere, create: true, destination: 'Away.' });
  await frontier.call('spec', { effort: elsewhere, create: true, content: '# Away\n' });
  await frontier.call('migrate_effort', { effort });
}

describe('the marker', () => {
  it('makes a valid file in issues/ a Ticket; the same file unmarked is not one', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/marked.md`]: fence(VALID),
      [`${ISSUES}/unmarked.md`]: fence(VALID.slice(1)),
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(ticketLines(board)).toEqual(['> marked  Valid one  build/open']);
    expect(warnings(board)).toEqual([
      '  unmarked-ticket-like: unmarked files that look like Tickets — add frontier: ticket by ' +
        `hand (1): ${ISSUES}/unmarked.md; get_tickets <name> gives each file's detail`,
    ]);
    expect(await frontier.call('list_efforts')).toMatch(
      /^alpha {2}tickets=1 {2}docs=map {2}frontier=1 {2}unmarked=1$/m,
    );
    for (const name of ['unmarked', 'alpha.unmarked']) {
      expect(await frontier.call('get_tickets', { ids: [name] })).toBe(
        `${name} is not a Ticket — unmarked, so it is not read as one:\n` +
          `  unmarked-ticket-like (suggestion)  ${ISSUES}/unmarked.md  key=frontier  ` +
          'expected=ticket — if this is a Ticket, add `frontier: ticket` to its frontmatter by hand',
      );
    }
  });

  it('counts when quoted, and as a value of any case only when it is ticket', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/single.md`]: fence(["frontier: 'ticket'", 'title: Single', 'status: open']),
      [`${ISSUES}/double.md`]: fence(['"frontier": "ticket"', 'title: Double', 'status: open']),
      [`${ISSUES}/upper.md`]: fence(['frontier: Ticket', 'title: Upper', 'status: open']),
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(ticketLines(board).map(line => line.split('  ')[0])).toEqual(['> double', '> single']);
    expect(board).toContain(
      `invalid-value: marked files holding an invalid value, excluded (1): ${ISSUES}/upper.md`,
    );
  });

  it('is the first line create_tickets writes, and a created file passes validation', async () => {
    const { root, frontier } = await workspace({});

    await frontier.call('create_tickets', {
      effort: 'alpha',
      tickets: [
        { name: 'made', title: 'Made', kind: 'decision', type: 'research', triage: 'needs-info' },
        { name: 'after', title: 'After', blocked_by: ['made'], body: 'Prose.' },
      ],
    });

    for (const name of ['made', 'after']) {
      const written = await readFile(join(root, ISSUES, `${name}.md`), 'utf8');
      expect(written.startsWith('---\nfrontier: ticket\ntitle: ')).toBe(true);
    }
    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(ticketLines(board)).toEqual([
      '> made  Made  decision/open  triage=needs-info',
      'after  After  build/open  blocked_by=made',
    ]);
    expect(board).not.toContain('warnings:');
    expect(await frontier.call('list_efforts')).not.toMatch(/excluded=|unmarked=/);
  });
});

describe('a marked file that does not validate', () => {
  const CASES: ReadonlyArray<
    readonly [what: string, fence: readonly string[], code: string, key: string, expected: string]
  > = [
    [
      'status not a Status',
      ['frontier: ticket', 'title: T', 'status: closed'],
      'invalid-value',
      'status',
      'open | claimed | resolved | dropped',
    ],
    [
      'no status',
      ['frontier: ticket', 'title: T'],
      'missing-key',
      'status',
      'open | claimed | resolved | dropped',
    ],
    ['no title', ['frontier: ticket', 'status: open'], 'missing-key', 'title', 'non-empty text'],
    ['kind not a Kind', [...VALID, 'kind: chore'], 'invalid-value', 'kind', 'build | decision'],
    [
      'triage not a role',
      [...VALID, 'triage: later'],
      'invalid-value',
      'triage',
      'needs-triage | needs-info | ready-for-agent | ready-for-human | wontfix',
    ],
    [
      'blocked_by not a list',
      [...VALID, 'blocked_by: upstream'],
      'invalid-value',
      'blocked_by',
      'a list of Ticket names',
    ],
    [
      'blocked_by holding a map',
      [...VALID, 'blocked_by: [{a: 1}]'],
      'invalid-value',
      'blocked_by',
      'a list of Ticket names',
    ],
    [
      'the marker holding another value',
      ['frontier: issue', 'title: T', 'status: open'],
      'invalid-value',
      'frontier',
      'ticket',
    ],
  ];

  it.each(CASES)(
    'with %s is off the Board and the Frontier, refused every write, and diagnosed',
    async (_what, fenceLines, code, key, expected) => {
      const file = `${ISSUES}/bad.md`;
      const { root, frontier } = await workspace({
        [file]: fence(fenceLines),
        [`${ISSUES}/waits.md`]: fence([
          ...VALID.slice(0, 1),
          'title: Waits',
          'status: open',
          'blocked_by: [bad]',
        ]),
      });
      const before = await readFile(join(root, file), 'utf8');

      const board = await frontier.call('get_board', { effort: 'alpha' });
      expect(ticketLines(board)).toEqual(['waits  Waits  build/open  blocked_by=bad?']);
      expect(board).toContain(`${code}: `);
      expect(board).toContain(file);

      const shown = await frontier.call('get_tickets', { ids: ['bad'] });
      expect(shown).toContain('bad is not a Ticket');
      expect(shown).toContain(`${code} (excluded)  ${file}  key=${key}  expected=${expected}`);
      expect(await frontier.call('get_tickets', { ids: ['alpha.bad'] })).toContain(file);

      for (const request of [
        { comment: 'Hi.' },
        { claim: { by: 'agent-1' } },
        { resolve: { answer_gist: 'Done.' } },
        { drop: { reason: 'Out.' } },
        { title: 'Renamed' },
        { blocked_by: [] },
      ]) {
        const error = await frontier.callExpectingError('update_ticket', { id: 'bad', ...request });
        expect(error).toContain('Nothing was written: bad is not a Ticket');
        expect(error).toContain(`key=${key}`);
      }
      expect(await readFile(join(root, file), 'utf8')).toBe(before);
      expect(await frontier.call('list_efforts')).toMatch(/excluded=1$/m);
    },
  );

  it('is named by its id when its fence parsed and carried one', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/01-T9-bad.md`]: fence(['frontier: ticket', 'id: T9', 'title: T', 'status: done']),
    });

    expect(await frontier.call('get_tickets', { ids: ['T9'] })).toContain(
      `invalid-value (excluded)  ${ISSUES}/01-T9-bad.md  key=status`,
    );
    // And by its file's name, as a Ticket named by its file would be.
    for (const name of ['T9-bad', 'alpha.T9-bad']) {
      expect(await frontier.call('get_tickets', { ids: [name] })).toContain(
        `invalid-value (excluded)  ${ISSUES}/01-T9-bad.md  key=status`,
      );
    }
  });

  it('is diagnosed as unparseable, not read as unmarked, when its YAML is broken', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/broken.md`]: fence(['frontier: ticket', 'title: [unclosed', 'status: open']),
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(warnings(board)).toEqual([
      '  yaml-unparseable: marked files whose frontmatter does not parse, excluded (1): ' +
        `${ISSUES}/broken.md; get_tickets <name> gives each file's detail`,
    ]);
    expect(board).not.toContain('unmarked');
    expect(await frontier.call('get_tickets', { ids: ['alpha.broken'] })).toContain(
      `yaml-unparseable (excluded)  ${ISSUES}/broken.md  expected=a YAML mapping`,
    );
  });

  it('keeps a lifecycle gap a counted warning, not a fault', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/done.md`]: fence(['frontier: ticket', 'title: Done', 'status: resolved']),
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(ticketLines(board)).toEqual(['done  Done  build/resolved']);
    expect(warnings(board)).toEqual(['  1/1 resolved Tickets carry no answer_gist']);
  });

  it('is grouped on the Board, three files named and the rest counted', async () => {
    const tree: FixtureTree = {};
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      tree[`${ISSUES}/${name}.md`] = fence(['frontier: ticket', 'title: T', 'status: nope']);
    }
    tree[`${ISSUES}/f.md`] = fence(['frontier: ticket', 'status: nope']);
    const { frontier } = await workspace(tree);

    const shown = warnings(await frontier.call('get_board', { effort: 'alpha' }));

    // f has two faults under two codes, so it is named once on each line.
    expect(shown).toEqual([
      `  missing-key: marked files missing title or status, excluded (1): ${ISSUES}/f.md; ` +
        "get_tickets <name> gives each file's detail",
      `  invalid-value: marked files holding an invalid value, excluded (6): ${ISSUES}/a.md ` +
        `${ISSUES}/b.md ${ISSUES}/c.md and 3 more; get_tickets <name> gives each file's detail`,
    ]);
    expect(await frontier.call('list_efforts')).toMatch(/tickets=0 .* excluded=6$/m);
  });
});

describe('where a Ticket may sit', () => {
  it('diagnoses a marked file directly in the Effort with where it belongs, and moves nothing', async () => {
    const { root, frontier } = await workspace({
      '.scratch/alpha/stray.md': fence(VALID),
      '.scratch/alpha/notes.md': '# Notes\n\nNot a Ticket.\n',
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });

    expect(ticketLines(board)).toEqual([]);
    expect(warnings(board)).toEqual([
      '  ticket-outside-issues: marked files outside issues/, excluded until moved there by ' +
        "hand (1): .scratch/alpha/stray.md; get_tickets <name> gives each file's detail",
    ]);
    expect(await readFile(join(root, '.scratch/alpha/stray.md'), 'utf8')).toBe(fence(VALID));
    expect(await frontier.call('list_efforts')).toMatch(/excluded=1$/m);
    for (const name of ['stray', 'alpha.stray']) {
      expect(await frontier.call('get_tickets', { ids: [name] })).toContain(
        'ticket-outside-issues (excluded)  .scratch/alpha/stray.md  ' +
          'expected=.scratch/alpha/issues/stray.md',
      );
    }
  });

  it('never reads a directory below issues/ or beside it, however deep', async () => {
    const deep: FixtureTree = {};
    for (const dir of [
      `${ISSUES}/nested`,
      `${ISSUES}/nested/deeper/still`,
      '.scratch/alpha/research',
      '.scratch/alpha/research/issues',
      '.scratch/alpha/research/a/b/c/issues',
    ]) {
      deep[`${dir}/hidden.md`] = fence(VALID);
    }
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      ...deep,
      [`${ISSUES}/real.md`]: fence(VALID),
    });
    // Unlistable before the server starts: a scan that entered either one
    // would fail with EACCES rather than pass.
    const sealed = [join(root, ISSUES, 'nested'), join(root, '.scratch/alpha/research')];
    await Promise.all(sealed.map(async dir => chmod(dir, 0o000)));

    try {
      const frontier = await connectFrontier({ cwd: root, env: {} });
      const board = await frontier.call('get_board', { effort: 'alpha' });
      expect(ticketLines(board)).toEqual(['> real  Valid one  build/open']);
      expect(warnings(board)).toEqual([
        `  directory-in-issues: directories inside issues/, never read (1): ${ISSUES}/nested/`,
      ]);
      expect(await frontier.call('get_tickets', { ids: ['hidden'] })).toBe('not found: hidden');
      expect(await frontier.call('list_efforts')).toMatch(/^alpha {2}tickets=1 .* excluded=1$/m);
    } finally {
      await Promise.all(sealed.map(async dir => chmod(dir, 0o755)));
    }
  });
});

describe('Markdown that is not a Ticket', () => {
  it('is not counted, not diagnosed, and byte-identical after every tool', async () => {
    const { root, frontier } = await workspace({
      [`${ISSUES}/README.md`]: '# How we file Tickets\n\nRead the tracker doc.\n',
      [`${ISSUES}/notes.md`]: '---\nauthor: someone\n---\n\nScratch notes beside the Tickets.\n',
      [`${ISSUES}/01-T1-real.md`]: ticket('T1', 'Real'),
    });
    const before = await snapshot(join(root, '.scratch/alpha'));

    expect(await frontier.call('list_efforts')).toMatch(
      /^alpha {2}tickets=1 {2}docs=map {2}frontier=1$/m,
    );
    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(ticketLines(board)).toEqual(['> T1  Real  build/open']);
    expect(board).not.toContain('warnings:');
    expect(await frontier.call('get_tickets', { ids: ['README', 'notes'] })).toBe(
      'not found: README notes',
    );
    for (const id of ['README', 'notes']) await everyTool(frontier, 'alpha', id);

    expect(await snapshot(join(root, '.scratch/alpha'))).toEqual(before);
  });
});

describe('the two verbatim fixture Efforts', () => {
  const EFFORTS = { telegram: 'sobrina-telegram', 'ship-0-5-0': 'tag-customizer-ship-0-5-0' };

  it('hold no Ticket and no diagnostic, and stay byte-identical after every tool', async () => {
    const root = await makeLegacyWorkspace(EFFORTS);
    const before = await snapshot(join(root, '.scratch'));
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('list_efforts')).toBe(
      [
        `root: ${root}`,
        'ship-0-5-0  tickets=0  docs=map  frontier=0',
        'telegram  tickets=0  docs=spec  frontier=0',
      ].join('\n'),
    );
    for (const effort of Object.keys(EFFORTS)) {
      const board = await frontier.call('get_board', { effort });
      expect(board).toContain('(no tickets)');
      expect(board).not.toContain('warnings:');
    }
    await everyTool(frontier, 'telegram', 'T30');
    await everyTool(frontier, 'ship-0-5-0', 'srgb-data-maps-verdict');

    expect(withoutElsewhere(await snapshot(join(root, '.scratch')))).toEqual(before);
  });
});

describe('one bad value', () => {
  it('in a circular anchor excludes its file and breaks no call, here or elsewhere', async () => {
    const long = 'x'.repeat(500);
    const { frontier } = await workspace({
      [`${ISSUES}/loop.md`]: fence([...VALID, 'blocked_by: &loop [*loop]']),
      [`${ISSUES}/long.md`]: fence(['frontier: ticket', 'title: Long', `status: ${long}`]),
      [`${ISSUES}/fine.md`]: fence(VALID),
      '.scratch/beta/issues/other.md': fence(['frontier: ticket', 'title: Other', 'status: open']),
    });

    expect(ticketLines(await frontier.call('get_board', { effort: 'beta' }))).toEqual([
      '> other  Other  build/open',
    ]);
    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(ticketLines(board)).toEqual(['> fine  Valid one  build/open']);
    expect(board).toContain(`${ISSUES}/loop.md`);

    const loop = await frontier.call('get_tickets', { ids: ['loop'] });
    expect(loop).toContain('key=blocked_by');
    expect(loop).toContain('found=[circular list]');
    const shown = await frontier.call('get_tickets', { ids: ['long'] });
    const found = /found=(\S+)/.exec(shown)?.[1] ?? '';
    expect(found).toBe(`${'x'.repeat(79)}…`);
  });
});

describe('a write that would leave a file the scan excludes', () => {
  it('is refused at input for a blank title, and nothing of the batch is created', async () => {
    const { root, frontier } = await workspace({ [`${ISSUES}/held.md`]: fence(VALID) });
    const before = await snapshot(join(root, '.scratch'));

    const created = await frontier.callExpectingError('create_tickets', {
      effort: 'alpha',
      tickets: [
        { name: 'good', title: 'Good' },
        { name: 'blank', title: '   ' },
      ],
    });
    expect(created).toContain('title must not be blank');
    const updated = await frontier.callExpectingError('update_ticket', {
      id: 'held',
      title: ' \t ',
    });
    expect(updated).toContain('title must not be blank');

    expect(await snapshot(join(root, '.scratch'))).toEqual(before);
  });

  it('is refused when an edit would change what an anchored marker resolves to', async () => {
    const file = `${ISSUES}/tied.md`;
    const { root, frontier } = await workspace({
      [file]: fence(['title: &marker ticket', 'frontier: *marker', 'status: open']),
    });
    const before = await readFile(join(root, file), 'utf8');
    expect(ticketLines(await frontier.call('get_board', { effort: 'alpha' }))).toEqual([
      '> tied  ticket  build/open',
    ]);

    const error = await frontier.callExpectingError('update_ticket', {
      id: 'tied',
      title: 'Renamed',
    });

    expect(error).toContain('Nothing was written');
    expect(await readFile(join(root, file), 'utf8')).toBe(before);
    expect(ticketLines(await frontier.call('get_board', { effort: 'alpha' }))).toEqual([
      '> tied  ticket  build/open',
    ]);
  });
});

describe('a symlinked issues/', () => {
  it('is not followed by any read or write, and is diagnosed', async () => {
    const outside = await makeFixtureTree({ 'elsewhere/away.md': fence(VALID) });
    const root = await makeFixtureTree({ '.scratch/alpha/map.md': map('Somewhere.') });
    await symlink(join(outside, 'elsewhere'), join(root, ISSUES), 'dir');
    // An Effort of nothing but a linked issues/ is still seen, so it can be diagnosed.
    await mkdir(join(root, '.scratch/beta'));
    await symlink(join(outside, 'elsewhere'), join(root, '.scratch/beta/issues'), 'dir');
    const before = await snapshot(outside);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toContain('(no tickets)');
    expect(warnings(board)).toEqual([
      '  symlinked-issues: issues/ directories that are symbolic links, never followed (1): ' +
        '.scratch/alpha/issues',
    ]);
    expect(await frontier.call('list_efforts')).toMatch(/^beta {2}tickets=0 .*excluded=1$/m);
    expect(await frontier.call('get_tickets', { ids: ['away'] })).toBe('not found: away');
    await frontier.callExpectingError('update_ticket', { id: 'away', comment: 'Leak.' });
    expect(
      await frontier.callExpectingError('create_tickets', {
        effort: 'alpha',
        tickets: [{ name: 'new', title: 'New' }],
      }),
    ).toContain('symbolic link');

    expect(await snapshot(outside)).toEqual(before);
  });

  it('leaves a symlinked storage directory followed', async () => {
    const real = await makeFixtureTree({ 'store/alpha/issues/kept.md': fence(VALID) });
    const root = await makeFixtureTree({ 'README.md': '# Repo\n' });
    await symlink(join(real, 'store'), join(root, '.scratch'), 'dir');
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(ticketLines(await frontier.call('get_board', { effort: 'alpha' }))).toEqual([
      '> kept  Valid one  build/open',
    ]);
  });
});

describe('field edge cases', () => {
  it('reads a marked file past a leading BOM, and a write keeps the BOM', async () => {
    const file = `${ISSUES}/bom.md`;
    const { root, frontier } = await workspace({ [file]: `﻿${fence(VALID)}` });

    expect(ticketLines(await frontier.call('get_board', { effort: 'alpha' }))).toEqual([
      '> bom  Valid one  build/open',
    ]);
    await frontier.call('update_ticket', { id: 'bom', comment: 'Seen.' });
    const after = await readFile(join(root, file), 'utf8');
    expect(after.startsWith('﻿---\nfrontier: ticket\n')).toBe(true);
    expect(after).toContain('Seen.');
  });

  it('excludes a blank kind or triage, and reads a null blocked_by as no Edges', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/kind.md`]: fence([...VALID, 'kind: ""']),
      [`${ISSUES}/triage.md`]: fence([...VALID, "triage: ' '"]),
      [`${ISSUES}/edges.md`]: fence([...VALID, 'blocked_by:']),
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(ticketLines(board)).toEqual(['> edges  Valid one  build/open']);
    expect(await frontier.call('get_tickets', { ids: ['kind'] })).toContain('key=kind');
    expect(await frontier.call('get_tickets', { ids: ['triage'] })).toContain('key=triage');
  });

  it('cannot mark an indented root mapping or a flow-mapping fence', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/indented.md`]: fence(['  frontier: ticket', '  title: T', '  status: open']),
      [`${ISSUES}/flow.md`]: fence(['{frontier: ticket, title: T, status: open}']),
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(ticketLines(board)).toEqual([]);
    // Neither carries the column-0 marker line, so both read as unmarked look-alikes.
    expect(warnings(board)).toEqual([
      '  unmarked-ticket-like: unmarked files that look like Tickets — add frontier: ticket by ' +
        `hand (2): ${ISSUES}/flow.md ${ISSUES}/indented.md; get_tickets <name> gives each file's detail`,
    ]);
  });
});

describe('a diagnosed file answers to its id', () => {
  it('when unmarked in issues/ or marked beside the Header docs', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/cache.md`]: fence(['id: LEGACY', 'title: Cache', 'status: open']),
      '.scratch/alpha/stray.md': fence([...VALID, 'id: STRAY-1']),
    });

    for (const [id, code] of [
      ['LEGACY', 'unmarked-ticket-like (suggestion)'],
      ['STRAY-1', 'ticket-outside-issues (excluded)'],
    ] as const) {
      expect(await frontier.call('get_tickets', { ids: [id] })).toContain(code);
      expect(await frontier.call('get_tickets', { ids: [`alpha.${id.toLowerCase()}`] })).toContain(
        code,
      );
      const error = await frontier.callExpectingError('update_ticket', { id, comment: 'Touch.' });
      expect(error).toContain(code);
    }
  });

  it('when a schema field holds a value that is not text, named as that key', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/sample.md`]: fence([
        'frontier: ticket',
        'id: LEGACY',
        'title: {toString: null}',
        'status: open',
      ]),
      [`${ISSUES}/listed.md`]: fence([...VALID, 'claimed_by: [a, b]']),
    });

    for (const name of ['LEGACY', 'sample']) {
      const shown = await frontier.call('get_tickets', { ids: [name] });
      expect(shown).toContain(`invalid-value (excluded)  ${ISSUES}/sample.md  key=title`);
      expect(shown).not.toContain('yaml-unparseable');
    }
    expect(await frontier.call('get_tickets', { ids: ['listed'] })).toContain(
      `invalid-value (excluded)  ${ISSUES}/listed.md  key=claimed_by`,
    );
  });
});

describe('a marked file in a directory that is not an Effort', () => {
  it('is diagnosed by name, and the directory stays out of list_efforts', async () => {
    const root = await makeFixtureTree({
      '.scratch/beta/map.md': map('Elsewhere.'),
      '.scratch/alpha/stray.md': fence(VALID),
      '.scratch/notes/readme.md': '# Notes\n',
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('get_tickets', { ids: ['alpha.stray'] })).toContain(
      'ticket-outside-issues (excluded)  .scratch/alpha/stray.md  ' +
        'expected=.scratch/alpha/issues/stray.md',
    );
    const efforts = await frontier.call('list_efforts');
    expect(efforts).not.toMatch(/^alpha /m);
    expect(efforts).not.toMatch(/^notes /m);
    expect(await frontier.callExpectingError('get_board', { effort: 'alpha' })).toContain('alpha');
    expect(
      await frontier.callExpectingError('create_tickets', {
        effort: 'alpha',
        tickets: [{ name: 'fresh', title: 'Fresh' }],
      }),
    ).toContain("No Effort 'alpha'");
  });
});

describe('a symlinked Effort directory', () => {
  it('is not served by any read or write, and is named on every Board', async () => {
    const outside = await makeFixtureTree({
      'real/map.md': map('Away.'),
      'real/spec.md': '# Away\n\nA spec.\n',
      'real/issues/away.md': fence(VALID),
    });
    const root = await makeFixtureTree({ '.scratch/beta/map.md': map('Here.') });
    await symlink(join(outside, 'real'), join(root, '.scratch/alpha'), 'dir');
    const before = await snapshot(outside);
    const frontier = await connectFrontier({ cwd: root, env: {} });

    expect(await frontier.call('list_efforts')).not.toMatch(/^alpha/m);
    expect(warnings(await frontier.call('get_board', { effort: 'beta' }))).toContain(
      '  symlinked-effort: Effort directories that are symbolic links, never followed (1): ' +
        '.scratch/alpha; replace each link with the directory itself by hand',
    );
    expect(await frontier.call('get_tickets', { ids: ['away'] })).toBe('not found: away');
    await frontier.callExpectingError('update_ticket', { id: 'away', comment: 'Leak.' });
    for (const [tool, args] of [
      ['create_tickets', { effort: 'alpha', create: true, tickets: [{ name: 'new', title: 'N' }] }],
      ['edit_map', { effort: 'alpha' }],
      ['edit_map', { effort: 'alpha', create: true, destination: 'Moved.' }],
      ['spec', { effort: 'alpha' }],
      ['spec', { effort: 'alpha', create: true, content: '# Overwritten\n' }],
    ] as const) {
      expect(await frontier.callExpectingError(tool, args)).toContain('symbolic link');
    }

    expect(await snapshot(outside)).toEqual(before);
  });
});

describe('a file the scan cannot open', () => {
  it('is diagnosed unreadable in issues/, ignored elsewhere, and every other Effort is served', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Somewhere.'),
      '.scratch/notes/README.md': '# Notes\n',
      [`${ISSUES}/kept.md`]: fence(VALID),
      [`${ISSUES}/sealed.md`]: fence(VALID),
    });
    const sealed = [join(root, '.scratch/notes/README.md'), join(root, `${ISSUES}/sealed.md`)];
    await Promise.all(sealed.map(async path => chmod(path, 0o000)));
    try {
      const frontier = await connectFrontier({ cwd: root, env: {} });
      const board = await frontier.call('get_board', { effort: 'alpha' });
      expect(ticketLines(board)).toEqual(['> kept  Valid one  build/open']);
      expect(warnings(board)).toEqual([
        '  unreadable: files in issues/ the server cannot read, excluded (1): ' +
          `${ISSUES}/sealed.md; get_tickets <name> gives each file's detail`,
      ]);
      expect(await frontier.call('list_efforts')).toMatch(/^alpha .*excluded=1$/m);
      expect(await frontier.call('get_tickets', { ids: ['sealed'] })).toContain(
        `unreadable (excluded)  ${ISSUES}/sealed.md`,
      );
    } finally {
      await Promise.all(sealed.map(async path => chmod(path, 0o644)));
    }
  });
});

describe('a symlinked Header doc', () => {
  it('is never read or written through, by any tool or the Map refresh', async () => {
    const outside = await makeFixtureTree({
      'map.md': map('Away.'),
      'spec.md': '# Away\n\nA spec.\n',
    });
    const { root, frontier } = await workspace({
      [`${ISSUES}/one.md`]: fence(VALID),
      [`${ISSUES}/two.md`]: fence(VALID),
    });
    const dir = join(root, '.scratch/alpha');
    await unlink(join(dir, 'map.md'));
    await symlink(join(outside, 'map.md'), join(dir, 'map.md'));
    await symlink(join(outside, 'spec.md'), join(dir, 'spec.md'));
    const before = await snapshot(outside);

    for (const [tool, args] of [
      ['spec', { effort: 'alpha' }],
      ['spec', { effort: 'alpha', content: '# Overwritten\n', expected_revision: 'x' }],
      ['edit_map', { effort: 'alpha' }],
      ['edit_map', { effort: 'alpha', destination: 'Moved.', expected_revision: 'x' }],
    ] as const) {
      expect(await frontier.callExpectingError(tool, args)).toContain('symbolic link');
    }
    for (const [id, edit] of [
      ['one', { resolve: { answer_gist: 'Settled.' } }],
      ['two', { drop: { reason: 'Ruled out.' } }],
    ] as const) {
      expect(await frontier.call('update_ticket', { id, ...edit })).toContain('may be stale');
    }

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).not.toContain('Away');
    expect(warnings(board)).toContain(
      '  symlinked-header-doc: map.md or spec.md files that are symbolic links, never followed ' +
        '(2): .scratch/alpha/map.md .scratch/alpha/spec.md',
    );
    expect(await snapshot(outside)).toEqual(before);
    expect((await lstat(join(dir, 'map.md'))).isSymbolicLink()).toBe(true);
    expect((await lstat(join(dir, 'spec.md'))).isSymbolicLink()).toBe(true);
  });
});

describe('a tagged scalar', () => {
  it('is read as written, never excluded', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/dated.md`]: fence([
        ...VALID.slice(0, 2),
        'status: claimed',
        'id: !!timestamp 2026-11-19',
        'claimed_by: someone',
        'claimed_at: !!timestamp 2026-11-19',
        'blocked_by: [!!timestamp 2026-11-18]',
      ]),
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(ticketLines(board)).toEqual([
      '2026-11-19  Valid one  build/claimed  blocked_by=2026-11-18?  claimed_by=someone',
    ]);
    expect(await frontier.call('get_tickets', { ids: ['2026-11-19'] })).toContain('2026-11-19');
  });

  it('is read as written inside an aliased list', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/aliased.md`]: fence([
        ...VALID,
        'edges: &edges [!!timestamp 2026-11-18]',
        'blocked_by: *edges',
      ]),
    });

    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(ticketLines(board)).toEqual(['aliased  Valid one  build/open  blocked_by=2026-11-18?']);
    expect(board).not.toContain('invalid-value');
  });
});

describe('an unmarked look-alike with a blank value', () => {
  it('still gets the suggestion, since only the keys are compared', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/draft.md`]: '---\nid: FIX-1\ntitle: Draft\nstatus:\n---\n\nProse.\n',
    });

    expect(warnings(await frontier.call('get_board', { effort: 'alpha' }))).toEqual([
      expect.stringMatching(/^ {2}unmarked-ticket-like: .*\.scratch\/alpha\/issues\/draft\.md/),
    ]);
  });
});

describe('a diagnostic-only directory', () => {
  it('counts as a spelling an Effort may not be created beside', async () => {
    const { root, frontier } = await workspace({ '.scratch/Gamma/stray.md': fence(VALID) });

    expect(
      await frontier.callExpectingError('create_tickets', {
        effort: 'gamma',
        create: true,
        tickets: [{ name: 'new', title: 'New' }],
      }),
    ).toContain("there is 'Gamma'");
    expect(await readdir(join(root, '.scratch/Gamma'))).toEqual(['stray.md']);
  });

  it('becomes an Effort when create_tickets starts it by its exact name', async () => {
    const { root, frontier } = await workspace({ '.scratch/gamma/stray.md': fence(VALID) });

    expect(await frontier.call('list_efforts')).not.toMatch(/^gamma/m);
    await frontier.call('create_tickets', {
      effort: 'gamma',
      create: true,
      tickets: [{ name: 'new', title: 'New' }],
    });
    expect((await readdir(join(root, '.scratch/gamma'))).toSorted()).toEqual([
      'issues',
      'stray.md',
    ]);
    expect(await frontier.call('list_efforts')).toMatch(/^gamma .*tickets=1/m);
  });
});
