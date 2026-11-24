import { symlink, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { StorageDriver } from '../src/storage/driver.ts';
import { createMarkdownDriver } from '../src/storage/markdown/driver.ts';
import { map, ticket } from './support/fixtures.ts';
import { cleanupFixtures, connectFrontier, makeFixtureTree } from './support/harness.ts';

afterEach(cleanupFixtures);

/** A Ticket named by its file: no `id` in the fence. */
function named(title: string, blockedBy: readonly string[] = [], status = 'open'): string {
  return (
    `---\nfrontier: ticket\ntitle: ${title}\nkind: build\nstatus: ${status}\n` +
    `blocked_by: [${blockedBy.join(', ')}]\n---\n\nBody prose.\n`
  );
}

function headerOf(text: string, heading: string): string {
  const lines = text.split('\n');
  const at = lines.findIndex(line => line.startsWith(`# ${heading} — `));
  return lines[at + 1] ?? '';
}

/**
 * `T1` in alpha is blocked on by a local id, a local name, an id in beta and a
 * name in beta; `T2` by nothing.
 */
async function blockedOnAcrossEfforts() {
  const root = await makeFixtureTree({
    '.scratch/alpha/map.md': map('Alpha.'),
    '.scratch/alpha/issues/01-T1-core.md': ticket('T1', 'Core'),
    '.scratch/alpha/issues/02-T2-leaf.md': ticket('T2', 'Leaf'),
    '.scratch/alpha/issues/03-T3-local.md': ticket('T3', 'Local', { blocked_by: ['T1'] }),
    '.scratch/alpha/issues/wiring.md': named('Wiring', ['T1']),
    '.scratch/beta/map.md': map('Beta.'),
    '.scratch/beta/issues/01-T9-remote.md': ticket('T9', 'Remote', { blocked_by: ['T1'] }),
    '.scratch/beta/issues/token-cache.md': named('Token cache', ['T1']),
  });
  return { root, frontier: await connectFrontier({ cwd: root, env: {} }) };
}

describe('get_tickets blocks=', () => {
  it('lists the Tickets naming this one, foreign ones as a Board renders a foreign blocker', async () => {
    const { frontier } = await blockedOnAcrossEfforts();

    const text = await frontier.call('get_tickets', { ids: ['T1'] });

    expect(headerOf(text, 'T1')).toBe(
      'effort=alpha  kind=build  status=open  blocks=T3,wiring,T9@beta,beta.token-cache',
    );
  });

  it('is absent for a Ticket nothing depends on', async () => {
    const { frontier } = await blockedOnAcrossEfforts();

    const text = await frontier.call('get_tickets', { ids: ['T2', 'beta.token-cache'] });

    expect(headerOf(text, 'T2')).toBe('effort=alpha  kind=build  status=open');
    expect(headerOf(text, 'beta.token-cache')).toBe(
      'effort=beta  kind=build  status=open  blocked_by=T1',
    );
  });

  it('gives each claimant of a duplicated id the Tickets naming that id', async () => {
    const root = await makeFixtureTree({
      '.scratch/alpha/map.md': map('Alpha.'),
      '.scratch/alpha/issues/01-T5-one.md': ticket('T5', 'One'),
      '.scratch/alpha/issues/02-T5-two.md': ticket('T5', 'Two'),
      '.scratch/alpha/issues/03-T6-after.md': ticket('T6', 'After', { blocked_by: ['T5'] }),
    });
    const frontier = await connectFrontier({ cwd: root, env: {} });

    const text = await frontier.call('get_tickets', { ids: ['T5'] });

    const headers = text.split('\n').filter(line => line.startsWith('effort=alpha'));
    expect(headers).toEqual([
      'effort=alpha  kind=build  status=open  blocks=T6',
      'effort=alpha  kind=build  status=open  blocks=T6',
    ]);
  });

  it('names ten and counts the rest', async () => {
    const tree: Record<string, string> = {
      '.scratch/alpha/map.md': map('Alpha.'),
      '.scratch/alpha/issues/hub.md': named('Hub'),
    };
    for (let index = 1; index <= 12; index++) {
      tree[`.scratch/alpha/issues/spoke${String(index).padStart(2, '0')}.md`] = named(
        `Spoke ${String(index)}`,
        ['hub'],
      );
    }
    const frontier = await connectFrontier({ cwd: await makeFixtureTree(tree), env: {} });

    const text = await frontier.call('get_tickets', { ids: ['hub'] });

    const spokes = Array.from({ length: 10 }, (_, i) => `spoke${String(i + 1).padStart(2, '0')}`);
    expect(headerOf(text, 'alpha.hub')).toBe(
      `effort=alpha  kind=build  status=open  blocks=${spokes.join(',')} and 2 more`,
    );
  });
});

/**
 * `core` blocks `freed` alone, `held` beside the still-open `other`, `T9` in
 * beta, `beta.cache` and the already-resolved `done`.
 */
async function resolvable() {
  const root = await makeFixtureTree({
    '.scratch/alpha/map.md': map('Alpha.'),
    '.scratch/alpha/issues/core.md': named('Core'),
    '.scratch/alpha/issues/other.md': named('Other'),
    '.scratch/alpha/issues/freed.md': named('Freed', ['core']),
    '.scratch/alpha/issues/held.md': named('Held', ['core', 'other']),
    '.scratch/alpha/issues/claimed.md': named('Claimed', ['core'], 'claimed\nclaimed_by: x'),
    '.scratch/alpha/issues/done.md': named('Done', ['core'], 'resolved\nanswer_gist: g'),
    '.scratch/beta/map.md': map('Beta.'),
    '.scratch/beta/issues/01-T9-remote.md': ticket('T9', 'Remote', { blocked_by: ['alpha.core'] }),
    '.scratch/beta/issues/cache.md': named('Cache', ['alpha.core']),
  });
  return { root, frontier: await connectFrontier({ cwd: root, env: {} }) };
}

/** `T7` waits on `T6` and on `T5`, carried by two files: one resolved, one at `second`. */
function duplicatedBlocker(second: string) {
  return {
    '.scratch/alpha/map.md': map('Alpha.'),
    '.scratch/alpha/issues/01-T5-one.md': ticket('T5', 'One', {
      status: 'resolved',
      answer_gist: 'g',
    }),
    '.scratch/alpha/issues/02-T5-two.md': ticket('T5', 'Two', {
      status: second,
      ...(second === 'resolved' ? { answer_gist: 'g' } : {}),
    }),
    '.scratch/alpha/issues/03-T6-gate.md': ticket('T6', 'Gate'),
    '.scratch/alpha/issues/04-T7-after.md': ticket('T7', 'After', { blocked_by: ['T5', 'T6'] }),
  };
}

describe('update_ticket resolve', () => {
  it('names the dependents it made takeable, and not one another blocker still holds', async () => {
    const { frontier } = await resolvable();

    const text = await frontier.call('update_ticket', {
      id: 'alpha.core',
      resolve: { answer_gist: 'landed' },
    });

    expect(text.split('\n').slice(1, 4)).toEqual([
      'alpha.core updated',
      'status=resolved  answer_gist=landed',
      'now takeable: freed, T9@beta, beta.cache',
    ]);
  });

  it('says nothing about the graph when no dependent became takeable', async () => {
    const { frontier } = await resolvable();

    const text = await frontier.call('update_ticket', {
      id: 'alpha.other',
      resolve: { answer_gist: 'landed' },
    });

    expect(text).not.toContain('takeable');
    expect(text.split('\n')).toHaveLength(3);
  });

  it('treats a duplicated id as satisfied only once every claimant is resolved', async () => {
    const open = await connectFrontier({
      cwd: await makeFixtureTree(duplicatedBlocker('open')),
      env: {},
    });
    expect(
      await open.call('update_ticket', { id: 'T6', resolve: { answer_gist: 'x' } }),
    ).not.toContain('takeable');

    const both = await connectFrontier({
      cwd: await makeFixtureTree(duplicatedBlocker('resolved')),
      env: {},
    });
    expect(await both.call('update_ticket', { id: 'T6', resolve: { answer_gist: 'x' } })).toContain(
      '\nnow takeable: T7',
    );
  });

  it('keeps the Map refresh warning, beneath the line', async () => {
    const { root, frontier } = await resolvable();
    const outside = await makeFixtureTree({ 'map.md': map('Away.') });
    await unlink(join(root, '.scratch/alpha/map.md'));
    await symlink(join(outside, 'map.md'), join(root, '.scratch/alpha/map.md'));

    const text = await frontier.call('update_ticket', {
      id: 'alpha.core',
      resolve: { answer_gist: 'landed' },
    });

    const lines = text.split('\n');
    expect(lines.slice(3, 5)).toEqual(['now takeable: freed, T9@beta, beta.cache', 'warnings:']);
    expect(lines[5]).toContain('may be stale');
  });

  it('names ten and counts the rest', async () => {
    const tree: Record<string, string> = {
      '.scratch/alpha/map.md': map('Alpha.'),
      '.scratch/alpha/issues/hub.md': named('Hub'),
    };
    for (let index = 1; index <= 13; index++) {
      tree[`.scratch/alpha/issues/spoke${String(index).padStart(2, '0')}.md`] = named(
        `Spoke ${String(index)}`,
        ['hub'],
      );
    }
    const frontier = await connectFrontier({ cwd: await makeFixtureTree(tree), env: {} });

    const text = await frontier.call('update_ticket', {
      id: 'hub',
      resolve: { answer_gist: 'x' },
    });

    const spokes = Array.from({ length: 10 }, (_, i) => `spoke${String(i + 1).padStart(2, '0')}`);
    expect(text).toContain(`\nnow takeable: ${spokes.join(', ')} and 3 more`);
  });

  it('is said of a resolve alone, not of another write', async () => {
    const { frontier } = await resolvable();
    const text = await frontier.call('update_ticket', { id: 'alpha.core', comment: 'note' });
    expect(text).not.toContain('takeable');
  });
});

describe('update_ticket drop', () => {
  it('names the open and claimed dependents left waiting on a blocker that never unblocks', async () => {
    const { frontier } = await resolvable();

    const text = await frontier.call('update_ticket', {
      id: 'alpha.core',
      drop: { reason: 'out of scope' },
    });

    expect(text.split('\n').slice(1, 4)).toEqual([
      'alpha.core updated',
      'status=dropped  dropped_reason=out of scope',
      'now blocked by a dropped Ticket, which never unblocks: ' +
        'claimed, freed, held, T9@beta, beta.cache',
    ]);
  });

  it('names a dependent another blocker also holds, and says nothing when none is left', async () => {
    const { frontier } = await resolvable();
    const text = await frontier.call('update_ticket', {
      id: 'alpha.other',
      drop: { reason: 'n/a' },
    });
    expect(text).toContain('\nnow blocked by a dropped Ticket, which never unblocks: held');

    const leaf = await frontier.call('update_ticket', { id: 'alpha.freed', drop: { reason: 'n' } });
    expect(leaf).not.toContain('never unblocks');
  });

  it('says nothing when the Ticket was already dropped', async () => {
    const { frontier } = await resolvable();
    await frontier.call('update_ticket', { id: 'alpha.core', drop: { reason: 'first' } });
    const again = await frontier.call('update_ticket', {
      id: 'alpha.core',
      drop: { reason: 'a better reason' },
    });
    expect(again).toContain('dropped_reason=a better reason');
    expect(again).not.toContain('never unblocks');
  });
});

describe('the reverse Edges', () => {
  it('come from what the call already read: no further read of the workspace', async () => {
    const { root } = await resolvable();
    const calls: string[] = [];
    const counting = (driverRoot: string): StorageDriver => {
      const driver = createMarkdownDriver(driverRoot);
      return {
        ...driver,
        listTickets: () => {
          calls.push('listTickets');
          return driver.listTickets();
        },
        readTickets: handles => {
          calls.push('readTickets');
          return driver.readTickets(handles);
        },
        updateTicket: (...args) => {
          calls.push('updateTicket');
          return driver.updateTicket(...args);
        },
        diagnosticsFor: handles => {
          calls.push('diagnosticsFor');
          return driver.diagnosticsFor(handles);
        },
      };
    };
    const frontier = await connectFrontier({ cwd: root, env: {}, createDriver: counting });

    calls.length = 0;
    expect(await frontier.call('get_tickets', { ids: ['alpha.core'] })).toContain('blocks=');
    expect(calls).toEqual(['readTickets']);

    calls.length = 0;
    expect(
      await frontier.call('update_ticket', { id: 'alpha.core', resolve: { answer_gist: 'g' } }),
    ).toContain('now takeable:');
    expect(calls).toEqual(['listTickets', 'updateTicket']);
  });
});
