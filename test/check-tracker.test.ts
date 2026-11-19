import { chmod, mkdir, readdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { map } from './support/fixtures.ts';
import {
  cleanupFixtures,
  connectFrontier,
  makeFixtureTree,
  type FixtureTree,
} from './support/harness.ts';

afterEach(cleanupFixtures);

const ISSUES = '.scratch/alpha/issues';

function fence(lines: readonly string[], body = 'Body prose.'): string {
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`;
}

async function workspace(tree: FixtureTree = {}) {
  const root = await makeFixtureTree({ '.scratch/alpha/map.md': map('Somewhere.'), ...tree });
  return { root, frontier: await connectFrontier({ cwd: root, env: {} }) };
}

/** The lines of one section: those indented under `header`, up to the next unindented line. */
function section(text: string, header: RegExp): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex(line => header.test(line));
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && !line.startsWith('  '));
  return lines.slice(start + 1, end < 0 ? undefined : end).map(line => line.slice(2));
}

/** Everything a call returns before its diagnostics: the contract alone. */
function contractOf(text: string): string {
  return text.slice(0, text.search(/^diagnostics/m)).trimEnd();
}

function schemaKeys(text: string): string[] {
  return section(text, /^schema:/)
    .filter(line => !line.startsWith('other keys:'))
    .map(line => line.split('  ')[0] ?? '');
}

function contractCodes(text: string): Map<string, string> {
  return new Map(
    section(text, /^unsupported, diagnosed:/).map(line => {
      const [, code = '', effect = ''] = /^(\S+) \((\w+)\)/.exec(line) ?? [];
      return [code, effect];
    }),
  );
}

interface FieldLine {
  readonly required: boolean;
  readonly type: string;
  readonly line: string;
}

function fieldLines(text: string): Map<string, FieldLine> {
  return new Map(
    section(text, /^schema:/)
      .filter(line => !line.startsWith('other keys:'))
      .map(line => {
        const [key = '', required = '', rest = ''] = line.split('  ');
        return [key, { required: required === 'required', type: rest.split(' — ')[0] ?? '', line }];
      }),
  );
}

function layoutRole(text: string, path: string): string {
  const line = section(text, /^layout v\d+:/).find(entry => entry.startsWith(`${path}  `));
  return line?.slice(path.length + 2) ?? '';
}

interface Itemized {
  readonly code: string;
  readonly effect: string;
  readonly file: string;
  readonly line: string;
}

function itemized(text: string): Itemized[] {
  return section(text, /^diagnostics/).map(line => {
    const [, code = '', effect = '', file = ''] = /^(\S+) \((\w+)\) {2}(\S+)/.exec(line) ?? [];
    return { code, effect, file, line };
  });
}

function exampleOf(text: string): { path: string; contents: string } {
  const match = /^example (\S+):\n(`{3,})markdown\n([\s\S]*?)\n\2$/m.exec(text);
  if (match === null) throw new Error('no example in the result');
  return { path: match[1] ?? '', contents: `${match[3] ?? ''}\n` };
}

describe('check_tracker on a clean workspace', () => {
  it('returns the contract with its layout version and says there is nothing to fix', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/good.md`]: fence(['frontier: ticket', 'title: Good', 'status: open']),
      [`${ISSUES}/README.md`]: '# Notes\n',
    });

    const text = await frontier.call('check_tracker');

    expect(text).toMatch(/^layout v1:$/m);
    expect(schemaKeys(text)).toContain('frontier');
    expect(section(text, /^schema:/).join('\n')).toContain(
      'status  required  open | claimed | resolved | dropped',
    );
    expect(section(text, /^schema:/).at(-1)).toMatch(/^other keys: .*Unimported, not malformed/);
    expect(text.trimEnd().split('\n').at(-1)).toBe('diagnostics: none, nothing to fix');
    expect(await frontier.call('check_tracker', { effort: 'alpha' })).toMatch(
      /^diagnostics in alpha: none, nothing to fix$/m,
    );
  });

  it('returns an example Ticket that validates where it says it goes', async () => {
    const { root, frontier } = await workspace();
    const { path, contents } = exampleOf(await frontier.call('check_tracker'));
    const at = path.replace('<effort>', 'alpha');
    await mkdir(join(root, ISSUES), { recursive: true });
    await writeFile(join(root, at), contents, 'utf8');

    const name = at.slice(at.lastIndexOf('/') + 1, -'.md'.length);
    // A fresh server, so no cached scan from before the file landed answers.
    const fresh = await connectFrontier({ cwd: root, env: {} });
    const board = await fresh.call('get_board', { effort: 'alpha' });
    expect(board).toMatch(new RegExp(`^(> )?${name} {2}`, 'm'));
    expect(board).not.toMatch(/excluded|unmarked/);
    expect(await fresh.call('check_tracker')).toMatch(/^diagnostics: none, nothing to fix$/m);
  });
});

/** One file or placement per code the scan raises, and decoys it must not read. */
async function faulty() {
  const { root, frontier } = await workspace({
    [`${ISSUES}/good.md`]: fence(['frontier: ticket', 'title: Good', 'status: open']),
    [`${ISSUES}/broken-yaml.md`]: '---\nfrontier: ticket\ntitle: [unclosed\n---\n',
    [`${ISSUES}/no-title.md`]: fence(['frontier: ticket', 'status: open']),
    [`${ISSUES}/bad-status.md`]: fence(['frontier: ticket', 'title: Bad', 'status: closed']),
    [`${ISSUES}/look-alike.md`]: fence(['title: Look', 'status: open']),
    [`${ISSUES}/sealed.md`]: fence(['frontier: ticket', 'title: Sealed', 'status: open']),
    [`${ISSUES}/nested/deep.md`]: fence(['frontier: ticket', 'status: nope']),
    '.scratch/alpha/loose.md': fence(['frontier: ticket', 'title: Loose', 'status: open']),
    '.scratch/alpha/notes/marked.md': fence(['frontier: ticket', 'status: nope']),
    '.scratch/strays/stray.md': fence(['frontier: ticket', 'title: Stray', 'status: open']),
    '.scratch/beta/map.md': map('Beta.'),
    '.scratch/gamma/issues/fine.md': fence(['frontier: ticket', 'title: Fine', 'status: open']),
    'elsewhere/issues/outside.md': fence(['frontier: ticket', 'status: nope']),
    'elsewhere/map.md': map('Outside.'),
  });
  await symlink(join(root, 'elsewhere', 'issues'), join(root, '.scratch/beta/issues'));
  await symlink(join(root, 'elsewhere', 'map.md'), join(root, '.scratch/gamma/map.md'));
  await chmod(join(root, ISSUES, 'sealed.md'), 0o000);
  return { root, frontier };
}

describe('check_tracker on a workspace with faults', () => {
  it('itemizes every code the contract lists, with file, key, expected and found', async () => {
    const { frontier } = await faulty();
    const text = await frontier.call('check_tracker');
    const found = itemized(text);
    const codes = contractCodes(text);

    // Every code the scan raised is in the contract, at the effect it raised it with,
    // and every code in the contract was raised here.
    expect([...new Set(found.map(entry => entry.code))].toSorted()).toEqual(
      [...codes.keys()].toSorted(),
    );
    for (const entry of found) expect(entry.effect, entry.line).toBe(codes.get(entry.code));

    const line = (file: string) => found.find(entry => entry.file === file)?.line;
    expect(line(`${ISSUES}/bad-status.md`)).toContain(
      'key=status  expected=open | claimed | resolved | dropped  found=closed — ',
    );
    expect(line(`${ISSUES}/no-title.md`)).toContain('key=title  expected=non-empty text');
    expect(line(`${ISSUES}/look-alike.md`)).toContain('key=frontier  expected=ticket');
    expect(line('.scratch/strays/stray.md')).toContain('ticket-outside-issues');
    expect(line('.scratch/alpha/loose.md')).toContain(`expected=${ISSUES}/loose.md`);
    expect(text).toMatch(/^diagnostics \(\d+\):$/m);
  });

  it('reads only supported locations, and writes nothing', async () => {
    const { root, frontier } = await faulty();
    const before = await snapshot(root);

    const files = itemized(await frontier.call('check_tracker')).map(entry => entry.file);

    expect(files).toContain(`${ISSUES}/nested/`);
    for (const unread of [
      `${ISSUES}/nested/deep.md`,
      '.scratch/alpha/notes/marked.md',
      '.scratch/beta/issues/outside.md',
      'elsewhere/issues/outside.md',
      `${ISSUES}/good.md`,
    ]) {
      expect(files).not.toContain(unread);
    }
    expect(await snapshot(root)).toEqual(before);
  });

  it('narrows to one Effort, and refuses one it does not know as get_board does', async () => {
    const { frontier } = await faulty();

    const files = itemized(await frontier.call('check_tracker', { effort: 'gamma' })).map(
      entry => entry.file,
    );
    expect(files).toEqual(['.scratch/gamma/map.md']);

    const refusals = await Promise.all(
      ['nowhere', 'strays'].map(async effort => [
        await frontier.callExpectingError('check_tracker', { effort }),
        await frontier.callExpectingError('get_board', { effort }),
      ]),
    );
    for (const [refused, board] of refusals) expect(refused).toBe(board);
  });
});

describe('the schema check_tracker shows', () => {
  it('is every key the validator checks, and nothing it does not', async () => {
    const { frontier } = await workspace();
    const keys = schemaKeys(await frontier.call('check_tracker'));
    expect(keys.length).toBeGreaterThan(3);

    // A mapping is wrong for every schema key, so each file names its key as at fault.
    const tree: FixtureTree = {};
    for (const key of keys) {
      const lines = ['frontier: ticket', 'title: T', 'status: open'].filter(
        line => !line.startsWith(`${key}:`),
      );
      tree[`${ISSUES}/key-${key}.md`] = fence([...lines, `${key}: {a: 1}`]);
    }
    tree[`${ISSUES}/key-stray.md`] = fence([
      'frontier: ticket',
      'title: T',
      'status: open',
      'stray: {a: 1}',
    ]);
    const { frontier: checked } = await workspace(tree);

    const found = itemized(await checked.call('check_tracker'));
    const atFault = found.map(entry => /key=(\S+)/.exec(entry.line)?.[1]);
    expect(new Set(atFault)).toEqual(new Set(keys));
    for (const key of keys) {
      expect(found.find(entry => entry.file === `${ISSUES}/key-${key}.md`)?.line).toContain(
        `key=${key}`,
      );
    }
    // A key outside the schema is Unimported, not a fault.
    expect(found.map(entry => entry.file)).not.toContain(`${ISSUES}/key-stray.md`);
  });
});

describe('the layout check_tracker shows', () => {
  it('skips a dot-directory under storage, as it says, on every read', async () => {
    const valid = fence(['frontier: ticket', 'title: Hidden', 'status: open']);
    const { frontier } = await workspace({
      '.scratch/.hidden/issues/hidden.md': valid,
      '.scratch/.hidden/map.md': map('Hidden.'),
      '.scratch/.stray/stray.md': valid,
    });
    const text = await frontier.call('check_tracker');
    expect(layoutRole(text, '.scratch/<effort>/')).toContain('not starting .');
    expect(section(text, /^ignored, no diagnostic:/).join('\n')).toContain(
      'every directory there whose name is not a slug',
    );

    expect(await frontier.call('list_efforts')).not.toContain('.hidden');
    expect(await frontier.callExpectingError('get_board', { effort: '.hidden' })).toBe(
      await frontier
        .callExpectingError('get_board', { effort: 'nowhere' })
        .then(refused => refused.replaceAll('nowhere', '.hidden')),
    );
    expect(await frontier.call('get_tickets', { ids: ['hidden'] })).toBe('not found: hidden');
    expect(itemized(text).map(entry => entry.file)).toEqual([]);
  });

  it('names a Ticket by its id when it carries one, as it says', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/01-stem.md`]: fence([
        'frontier: ticket',
        'id: 02',
        'title: Named',
        'status: open',
      ]),
    });
    const text = await frontier.call('check_tracker');
    expect(layoutRole(text, '.scratch/<effort>/issues/<name>.md')).toContain(
      'named by its id when set, else by the stem less any <digits>- prefix, unless that leaves nothing',
    );
    expect(await frontier.call('get_board', { effort: 'alpha' })).toMatch(/^(> )?02 {2}/m);
    expect(await frontier.call('get_tickets', { ids: ['stem'] })).toBe('not found: stem');
  });
});

describe('the value forms check_tracker states', () => {
  it('says what is read as text, what is unset, and what is only a convention', async () => {
    const { frontier } = await workspace();
    const fields = fieldLines(await frontier.call('check_tracker'));
    const line = (key: string) => fields.get(key)?.line ?? '';

    for (const key of ['title', 'type', 'claimed_at']) {
      expect(line(key)).toContain('a scalar as YAML reads it (02 is 2)');
    }
    expect(line('id')).toContain('kept as written (02 stays 02)');
    for (const key of ['status', 'kind', 'triage']) {
      expect(line(key)).toContain('spaces trimmed');
    }
    expect(line('type')).toContain('convention only: decision only');
    expect(line('claimed_at')).toContain('convention only: an ISO timestamp');
    for (const key of ['kind', 'triage']) {
      expect(line(key)).toContain('null is unset');
      expect(line(key)).toContain('a blank string is invalid-value');
    }
    expect(line('title')).toContain('absent, null or blank is missing-key');
    expect(line('status')).toContain('absent, null or blank is missing-key');
    expect(line('blocked_by')).toContain(
      'a null or blank entry is dropped; any other scalar entry is as written',
    );
  });

  it('holds to them on disk', async () => {
    const base = ['frontier: ticket', 'status: open'];
    const { frontier } = await workspace({
      [`${ISSUES}/scalars.md`]: fence([
        ...base,
        'title: 42',
        'type: banana',
        'claimed_at: yesterday',
      ]),
      [`${ISSUES}/null-enums.md`]: fence([...base, 'title: N', 'kind: null', 'triage: null']),
      [`${ISSUES}/blank-kind.md`]: fence([...base, 'title: B', 'kind: ""']),
      [`${ISSUES}/blank-triage.md`]: fence([...base, 'title: B', 'triage: ""']),
      [`${ISSUES}/edges.md`]: fence([...base, 'title: E', 'blocked_by: [null, "", true]']),
    });
    const faults = itemized(await frontier.call('check_tracker'));
    expect(faults.map(entry => `${entry.file} ${entry.code}`).toSorted()).toEqual([
      `${ISSUES}/blank-kind.md invalid-value`,
      `${ISSUES}/blank-triage.md invalid-value`,
    ]);
    const board = await frontier.call('get_board', { effort: 'alpha' });
    expect(board).toMatch(/^(> )?scalars {2}/m);
    expect(board).toMatch(/^(> )?null-enums {2}/m);
    expect(board).toMatch(/^(> )?edges {2}.*blocked_by=true\?$/m);
  });
});

function withoutKey(key: string): string[] {
  return ['frontier: ticket', 'title: E', 'status: open'].filter(
    line => !line.startsWith(`${key}:`),
  );
}

describe('the contract against the validator', () => {
  it('reads a key it does not advertise, holding a mapping, as Unimported', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/stray.md`]: fence([
        'frontier: ticket',
        'title: S',
        'status: open',
        'priority: {a: 1}',
      ]),
    });
    const text = await frontier.call('check_tracker');
    expect(fieldLines(text).has('priority')).toBe(false);
    expect(itemized(text)).toEqual([]);
    expect(await frontier.call('get_board', { effort: 'alpha' })).toMatch(/^(> )?stray {2}/m);
  });

  it('raises missing-key for a removed field exactly when it says the field is required', async () => {
    const { frontier } = await workspace();
    const fields = fieldLines(await frontier.call('check_tracker'));
    const full: Record<string, string> = {
      frontier: 'ticket',
      id: 'K1',
      title: 'Full',
      kind: 'build',
      type: 'task',
      status: 'open',
      triage: 'ready-for-agent',
      blocked_by: '[]',
      claimed_by: 'me',
      claimed_at: '2026-11-19T00:00:00Z',
      answer_gist: 'gist',
      dropped_reason: 'reason',
    };
    expect(new Set(Object.keys(full))).toEqual(new Set(fields.keys()));

    const tree: FixtureTree = {};
    for (const key of fields.keys()) {
      const lines = Object.entries(full)
        .filter(([other]) => other !== key)
        .map(([other, value]) => `${other}: ${other === 'id' ? `K-${key}` : value}`);
      tree[`${ISSUES}/without-${key}.md`] = fence(lines);
    }
    const { frontier: checked } = await workspace(tree);
    const found = itemized(await checked.call('check_tracker'));
    for (const [key, field] of fields) {
      const codes = found
        .filter(entry => entry.file === `${ISSUES}/without-${key}.md`)
        .map(entry => entry.code);
      // Without the marker the file is no Ticket at all, only a look-alike.
      const expected =
        key === 'frontier' ? ['unmarked-ticket-like'] : field.required ? ['missing-key'] : [];
      expect(codes, key).toEqual(expected);
    }
  });

  it('accepts exactly the values each enum advertises', async () => {
    const { frontier } = await workspace();
    const fields = fieldLines(await frontier.call('check_tracker'));
    const enums = [...fields].filter(([, field]) => field.type.includes(' | '));
    expect(enums.map(([key]) => key).toSorted()).toEqual(['kind', 'status', 'triage']);

    const tree: FixtureTree = {};
    for (const [key, field] of enums) {
      for (const value of field.type.split(' | ')) {
        tree[`${ISSUES}/${key}-ok-${value}.md`] = fence([...withoutKey(key), `${key}: ${value}`]);
      }
      tree[`${ISSUES}/${key}-bad.md`] = fence([...withoutKey(key), `${key}: zzz`]);
    }
    const { frontier: checked } = await workspace(tree);
    const found = itemized(await checked.call('check_tracker'));
    expect(found.map(entry => entry.file).toSorted()).toEqual(
      enums.map(([key]) => `${ISSUES}/${key}-bad.md`).toSorted(),
    );
    for (const [key, field] of enums) {
      const line = found.find(entry => entry.file === `${ISSUES}/${key}-bad.md`)?.line ?? '';
      // The validator's own list of what it accepts is the list advertised.
      expect(line).toContain(`expected=${field.type}  found=zzz`);
    }
  });
});

describe('the tracker doc', () => {
  it('carries the contract check_tracker returns, verbatim between its markers', async () => {
    const { frontier } = await workspace();
    const contract = contractOf(await frontier.call('check_tracker'));
    const doc = readFileSync(
      join(import.meta.dirname, '..', 'docs', 'agents', 'issue-tracker.md'),
      'utf8',
    );

    const pinned =
      /<!-- check_tracker contract -->\n````text\n([\s\S]*?)\n````\n<!-- \/check_tracker contract -->/.exec(
        doc,
      );
    // On failure, paste the contract from check_tracker between the markers.
    expect(pinned?.[1]).toBe(contract);

    // The Diagnostics table lists exactly the contract's codes.
    const table = [...doc.matchAll(/^\| `([a-z-]+)` \| (excluded|suggestion) \|/gm)].map(
      m => `${m[1]} ${m[2]}`,
    );
    expect(table.toSorted()).toEqual(
      [...contractCodes(contract)].map(([code, effect]) => `${code} ${effect}`).toSorted(),
    );
  });
});

async function snapshot(dir: string): Promise<Record<string, string>> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const files = entries
    .filter(entry => entry.isFile() && !entry.name.startsWith('sealed'))
    .map(entry => join(entry.parentPath, entry.name));
  const stamped = await Promise.all(
    files.toSorted().map(async path => {
      const [info, contents] = await Promise.all([stat(path), readFile(path, 'utf8')]);
      return [path, `${String(info.size)}:${String(info.mtimeMs)}:${contents}`] as const;
    }),
  );
  return Object.fromEntries(stamped);
}

describe('the rules check_tracker states, held against what the server does', () => {
  it('reads a numeric title as YAML gives it and an id as written', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/num.md`]: fence(['frontier: ticket', 'id: 02', 'title: 02', 'status: " open "']),
    });
    expect(await frontier.call('get_board', { effort: 'alpha' })).toMatch(
      /^(> )?02 {2}2 {2}build\/open/m,
    );
  });

  it('keeps a stem that is nothing but the prefix', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/01-.md`]: fence(['frontier: ticket', 'title: Bare', 'status: open']),
    });
    expect(await frontier.call('get_board', { effort: 'alpha' })).toMatch(/^(> )?01- {2}Bare/m);
  });

  it('never serves a directory whose name is not a slug', async () => {
    const { frontier } = await workspace({
      '.scratch/a\\b/issues/one.md': fence(['frontier: ticket', 'title: One', 'status: open']),
    });
    expect(await frontier.call('list_efforts')).not.toContain('a\\b');
    expect(await frontier.call('get_tickets', { ids: ['one'] })).toBe('not found: one');
  });

  it('says frontier.yml is the one file under storage it reads', async () => {
    const { frontier } = await workspace();
    const ignored = section(await frontier.call('check_tracker'), /^ignored, no diagnostic:/).join(
      '\n',
    );
    expect(ignored).toContain('but frontier.yml (read only for a Board warning)');
  });

  it('keeps a diagnostic on one line when a filename holds a newline', async () => {
    const { frontier } = await workspace({
      [`${ISSUES}/bad\npath.md`]: fence(['frontier: ticket', 'status: open']),
    });
    const lines = (await frontier.call('check_tracker'))
      .split('\n')
      .filter(entry => entry.includes('bad'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('bad\\u000apath.md');
  });
});
