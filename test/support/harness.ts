import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { cp, mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { createFrontierMCP, type CreateServerOptions } from '../../src/server.ts';

/** A fixture tree, written verbatim: each key is a file path, each value its contents. */
export type FixtureTree = Record<string, string>;

const cleanups: Array<() => Promise<void>> = [];

/** A fresh temporary directory, registered for teardown. Returns its real path. */
async function makeTempRoot(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'frontier-')));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

/** Build a fixture tree in a fresh temporary directory. Returns its real path. */
export async function makeFixtureTree(tree: FixtureTree): Promise<string> {
  const root = await makeTempRoot();

  // Recursive mkdir tolerates the races between entries sharing a parent.
  await Promise.all(
    Object.entries(tree).map(async ([path, contents]) => {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents, 'utf8');
    }),
  );

  return root;
}

/**
 * A workspace built from Efforts copied verbatim out of the real repos, keyed
 * slug -> directory name under `test/fixtures/legacy/`. These files are the
 * actual input Frontier has to survive; hand-written fixtures would be more
 * polite than the real thing.
 */
export async function makeLegacyWorkspace(efforts: Record<string, string>): Promise<string> {
  const root = await makeTempRoot();

  await mkdir(join(root, '.git'), { recursive: true });
  await Promise.all(
    Object.entries(efforts).map(async ([slug, fixture]) =>
      cp(
        join(import.meta.dirname, '..', 'fixtures', 'legacy', fixture),
        join(root, '.scratch', slug),
        {
          recursive: true,
        },
      ),
    ),
  );

  return root;
}

export interface ConnectedFrontier {
  readonly client: Client;
  /** Call a tool and return its text content, asserting the call succeeded. */
  call(name: string, args?: Record<string, unknown>): Promise<string>;
  /** Call a tool expected to fail, and return the error text. */
  callExpectingError(name: string, args?: Record<string, unknown>): Promise<string>;
}

/**
 * The one test seam: a real MCP client speaking to the server in-process, over
 * a linked transport pair. Every test enters here, so nothing below the tool
 * layer gets a test entry point of its own.
 */
export async function connectFrontier(
  options: CreateServerOptions = {},
): Promise<ConnectedFrontier> {
  const frontier = createFrontierMCP(options);
  // Mirrors bin.ts: a workspace that cannot be scanned yet forfeits the warm
  // start, and nothing more.
  await frontier.warmUp().catch(() => {});

  const client = new Client({ name: 'frontier-test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([frontier.server.connect(serverTransport), client.connect(clientTransport)]);

  cleanups.push(async () => {
    await client.close();
    await frontier.close();
  });

  const invoke = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as Array<{ type: string; text?: string }> | undefined)
      ?.filter(part => part.type === 'text')
      .map(part => part.text ?? '')
      .join('\n');
    return { isError: result.isError === true, text: text ?? '' };
  };

  return {
    client,
    async call(name, args) {
      const { isError, text } = await invoke(name, args);
      if (isError) throw new Error(`${name} failed: ${text}`);
      return text;
    },
    async callExpectingError(name, args) {
      const { isError, text } = await invoke(name, args);
      if (!isError) throw new Error(`${name} unexpectedly succeeded: ${text}`);
      return text;
    },
  };
}

/** Tear down every fixture tree and connection made during a test file. */
export async function cleanupFixtures(): Promise<void> {
  const pending = cleanups.splice(0);
  await Promise.allSettled(pending.map(cleanup => cleanup()));
}
