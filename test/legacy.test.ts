import { afterEach, describe, expect, it } from 'vitest';

import { cleanupFixtures, connectFrontier, makeLegacyWorkspace } from './support/harness.ts';

afterEach(cleanupFixtures);

/** Both Efforts, copied verbatim out of sobrina and tag-customizer. */
async function legacyRepo() {
  const root = await makeLegacyWorkspace({
    telegram: 'sobrina-telegram',
    'ship-0-5-0': 'tag-customizer-ship-0-5-0',
  });
  return { root, frontier: await connectFrontier({ cwd: root, env: {} }) };
}

describe('Legacy Tickets', () => {
  it('reads sobrina Tickets that carry a T-id in their heading', async () => {
    const { frontier } = await legacyRepo();

    const board = await frontier.call('get_board', { effort: 'telegram' });

    // `# T30 — Grammy group boot`, with `Status: resolved` below it.
    expect(board).toContain('T30');
    expect(board).toContain('Grammy group boot');
    expect(board).toContain('T30  Grammy group boot  build/resolved');
  });

  it('reads Edges out of **Depends on:** prose', async () => {
    const { frontier } = await legacyRepo();

    const board = await frontier.call('get_board', { effort: 'telegram' });
    const t32 = board.split('\n').find(line => line.includes('T32  Inbound event'));

    // `**Depends on:** T31 ([02-identity-bridge.md](...)), core T20 ([...](...))`
    expect(t32).toContain('blocked_by=');
    expect(t32).toContain('T31');
  });

  it('flags every Legacy Ticket in the warnings block', async () => {
    const { frontier } = await legacyRepo();

    const board = await frontier.call('get_board', { effort: 'telegram' });

    expect(board).toContain('warnings:');
    expect(board.toLowerCase()).toContain('legacy');
  });

  it('gives a Ticket with no T-id an addressable handle instead of no name', async () => {
    const { frontier } = await legacyRepo();

    const board = await frontier.call('get_board', { effort: 'ship-0-5-0' });

    // `# 01 — Is the data-map colour-space fix an r185 fix or a latent bug?`
    expect(board).toContain('Is the data-map colour-space fix');
    expect(board).toContain('ship-0-5-0#1');
    expect(board).not.toContain('(no id)');
  });

  it('fetches an id-less Ticket by that handle, so no Effort is unreachable', async () => {
    const { frontier } = await legacyRepo();

    const text = await frontier.call('get_tickets', { ids: ['ship-0-5-0#1'] });

    expect(text).toContain('Is the data-map colour-space fix');
    // The body, which is the whole point of fetching one.
    expect(text).toContain('was `0.147` doing the same wrong thing');
  });

  it('reads a Status line carrying a trailing note', async () => {
    const { frontier } = await legacyRepo();

    const board = await frontier.call('get_board', { effort: 'ship-0-5-0' });
    const release = board.split('\n').find(line => line.includes('Release'));

    // ``Status: resolved — **`0.5.0` published 2026-08-04**``
    expect(release).toContain('/resolved');
  });

  it('treats an em-dash Blocked by as no Edges at all', async () => {
    const { frontier } = await legacyRepo();

    const board = await frontier.call('get_board', { effort: 'ship-0-5-0' });
    const line = board.split('\n').find(entry => entry.includes('Is the data-map'));

    // `Blocked by: —`
    expect(line).not.toContain('blocked_by=');
  });

  it('ignores the research/ directory that is not part of the schema', async () => {
    const { frontier } = await legacyRepo();

    // ship-0-5-0 holds a research/ directory beside issues/.
    expect(await frontier.call('list_efforts')).toContain('ship-0-5-0  tickets=7');
  });

  it('serves a full body through get_tickets', async () => {
    const { frontier } = await legacyRepo();

    const text = await frontier.call('get_tickets', { ids: ['T30'] });

    expect(text).toContain('Grammy group boot');
    expect(text).toContain('Privacy Mode off');
  });
});
