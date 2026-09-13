import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOL_NAMES = [
  'create_tickets',
  'edit_map',
  'get_board',
  'get_tickets',
  'list_efforts',
  'migrate_effort',
  'spec',
  'update_ticket',
];
const TRACKER_DOC_URI = 'frontier://tracker-doc';
const CLAIMANTS = 4;
const CREATORS = 4;
const TICKETS_PER_CREATOR = 3;
const WATCHER_SETTLE_MS = 1_300;
const WATCHER_TIMEOUT_MS = 5_000;

const { runtime, entry } = parseArguments(process.argv.slice(2));

await access(entry);

let workspace;
try {
  workspace = await mkdtemp(join(tmpdir(), 'frontier-runtime-'));
  await writeFile(join(workspace, '.git'), 'gitdir: ./git\n', 'utf8');

  await verifyPublicSurface(workspace);
  await verifyWatcher(workspace);
  await verifyCrossProcessClaim(workspace);
  await verifyCrossProcessCreate(workspace);

  console.log(`Runtime check passed: ${runtime} ${entry}`);
} finally {
  if (workspace !== undefined) await rm(workspace, { recursive: true, force: true });
}

function parseArguments(args) {
  let selectedRuntime = process.execPath;
  let selectedEntry = join(ROOT, 'dist', 'bin.js');

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === '--runtime' && value !== undefined) {
      selectedRuntime = value;
      index += 1;
    } else if (argument === '--entry' && value !== undefined) {
      selectedEntry = value;
      index += 1;
    } else {
      throw new Error('Usage: runtime-check.mjs [--runtime executable] [--entry dist/bin.js]');
    }
  }

  return {
    runtime: isAbsolute(selectedRuntime) ? selectedRuntime : resolve(selectedRuntime),
    entry: isAbsolute(selectedEntry) ? selectedEntry : resolve(selectedEntry),
  };
}

async function verifyPublicSurface(root) {
  await withServer(root, 'surface', async client => {
    const { tools } = await client.listTools();
    assertEqual(
      tools.map(tool => tool.name).toSorted(),
      TOOL_NAMES,
      'the server exposes exactly the eight public tools',
    );

    const { resources } = await client.listResources();
    assert(
      resources.some(resource => resource.uri === TRACKER_DOC_URI),
      'the tracker resource is listed',
    );
    const { contents } = await client.readResource({ uri: TRACKER_DOC_URI });
    const trackerDoc = contents.map(content => ('text' in content ? content.text : '')).join('\n');
    assert(trackerDoc.includes('get_board'), 'the shipped tracker resource is readable');

    await call(client, 'create_tickets', {
      effort: 'alpha',
      create: true,
      tickets: [{ title: 'Runtime lifecycle', body: 'Created through the packaged server.' }],
    });
    const board = await call(client, 'get_board', { effort: 'alpha' });
    assert(board.includes('Runtime lifecycle'), 'created Ticket appears on its Board');
    const ticket = await call(client, 'get_tickets', { ids: ['T1'] });
    assert(
      ticket.includes('Created through the packaged server.'),
      'created Ticket body is readable',
    );

    await call(client, 'update_ticket', { id: 'T1', claim: { by: 'runtime-check' } });
    await call(client, 'update_ticket', { id: 'T1', release: true });
    await call(client, 'update_ticket', {
      id: 'T1',
      resolve: { answer_gist: 'Runtime check landed.' },
    });
    await call(client, 'update_ticket', {
      id: 'T1',
      reopen: { reason: 'Exercise the full lifecycle.' },
    });
  });
}

async function verifyWatcher(root) {
  await withServer(root, 'watcher', async client => {
    await call(client, 'get_board', { effort: 'alpha' });
    await sleep(WATCHER_SETTLE_MS);

    const ticketPath = join(root, '.scratch', 'alpha', 'issues', '01-T1-runtime-lifecycle.md');
    const original = await readFile(ticketPath, 'utf8');
    await writeFile(
      ticketPath,
      original.replace('Runtime lifecycle', 'Changed outside the server'),
      'utf8',
    );

    await waitFor(
      async () => call(client, 'get_board', { effort: 'alpha' }),
      board => board.includes('Changed outside the server'),
      'an external nested Ticket edit reaches the Board after watcher settling',
    );
  });
}

async function verifyCrossProcessClaim(root) {
  const servers = await Promise.all(
    Array.from({ length: CLAIMANTS }, (_, index) => openServer(root, `claim-${String(index)}`)),
  );

  try {
    await Promise.all(servers.map(({ client }) => call(client, 'get_board', { effort: 'alpha' })));
    const outcomes = await Promise.all(
      servers.map(({ client }, index) => {
        const by = `claim-${String(index)}`;
        return callResult(client, 'update_ticket', { id: 'T1', claim: { by } }).then(result => ({
          by,
          result,
        }));
      }),
    );
    const winners = outcomes.filter(({ result }) => result.isError !== true);
    assert(
      winners.length === 1,
      `exactly one separate server process claims a Ticket; got ${winners.length}\n` +
        outcomes
          .map(
            ({ by, result }, index) =>
              `${by}: ${JSON.stringify(result)}\nServer stderr:\n${servers[index].stderr()}`,
          )
          .join('\n'),
    );

    const ticketPath = join(root, '.scratch', 'alpha', 'issues', '01-T1-runtime-lifecycle.md');
    const onDisk = await readFile(ticketPath, 'utf8');
    const holder = /claimed_by:\s*(\S+)/.exec(onDisk)?.[1];
    assert(holder === winners[0]?.by, 'the process told it won is the process recorded on disk');
  } finally {
    await closeServers(servers);
  }
}

async function verifyCrossProcessCreate(root) {
  const servers = await Promise.all(
    Array.from({ length: CREATORS }, (_, index) => openServer(root, `create-${String(index)}`)),
  );

  try {
    await Promise.all(servers.map(({ client }) => call(client, 'get_board', { effort: 'alpha' })));
    const outcomes = await Promise.all(
      servers.map(({ client }, creator) =>
        callResult(client, 'create_tickets', {
          effort: 'alpha',
          tickets: Array.from({ length: TICKETS_PER_CREATOR }, (_, ticket) => ({
            title: `Creator ${String(creator)} Ticket ${String(ticket)}`,
          })),
        }),
      ),
    );
    assert(
      outcomes.every(result => result.isError !== true),
      'every concurrent batch is created',
    );

    const issues = join(root, '.scratch', 'alpha', 'issues');
    const files = (await readdir(issues)).filter(name => name.endsWith('.md'));
    assert(
      files.length === 1 + CREATORS * TICKETS_PER_CREATOR,
      'every concurrent Ticket has a file',
    );
    const ids = await Promise.all(
      files.map(
        async file => /^id:\s*(T\d+)$/m.exec(await readFile(join(issues, file), 'utf8'))?.[1],
      ),
    );
    assert(
      ids.every(id => id !== undefined),
      'every concurrent Ticket has an id',
    );
    assert(new Set(ids).size === ids.length, 'concurrent creation never issues an id twice');
  } finally {
    await closeServers(servers);
  }
}

async function openServer(root, name) {
  const transport = new StdioClientTransport({
    command: runtime,
    args: [entry],
    cwd: root,
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', chunk => {
    stderr += chunk.toString();
  });

  const client = new Client({ name: `frontier-runtime-check-${name}`, version: '0.0.0' });
  try {
    await client.connect(transport);
    return { client, transport, stderr: () => stderr };
  } catch (error) {
    await transport.close();
    throw new Error(`Could not start ${runtime} ${entry}: ${String(error)}\n${stderr}`, {
      cause: error,
    });
  }
}

async function withServer(root, name, action) {
  const server = await openServer(root, name);
  try {
    await action(server.client);
  } catch (error) {
    throw new Error(`${String(error)}\nServer stderr:\n${server.stderr()}`, { cause: error });
  } finally {
    await server.client.close();
    await server.transport.close();
  }
}

async function closeServers(servers) {
  await Promise.all(
    servers.map(async ({ client, transport }) => {
      await client.close();
      await transport.close();
    }),
  );
}

async function call(client, name, arguments_) {
  const result = await callResult(client, name, arguments_);
  if (result.isError === true) {
    const text = (result.content ?? []).map(content => content.text ?? '').join('\n');
    throw new Error(`${name} failed: ${text}`);
  }
  return (result.content ?? []).map(content => content.text ?? '').join('\n');
}

function callResult(client, name, arguments_) {
  return client.callTool({ name, arguments: arguments_ });
}

async function waitFor(probe, ready, description, deadline = Date.now() + WATCHER_TIMEOUT_MS) {
  const value = await probe();
  if (ready(value)) return;
  if (Date.now() >= deadline) {
    throw new Error(`Timed out waiting for ${description}. Last value:\n${value}`);
  }
  await sleep(50);
  return waitFor(probe, ready, description, deadline);
}

function assert(condition, description) {
  if (!condition) throw new Error(`Runtime check failed: ${description}`);
}

function assertEqual(actual, expected, description) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), description);
}

function sleep(milliseconds) {
  return new Promise(done => setTimeout(done, milliseconds));
}
