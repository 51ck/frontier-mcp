import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
const LIFECYCLE_NAME = 'runtime-lifecycle';
const CONTENDED_NAME = 'contended';
const WATCHER_SETTLE_MS = 1_300;
const WATCHER_TIMEOUT_MS = 5_000;

const { runtime, entry } = parseArguments(process.argv.slice(2));

await access(entry);

let workspace;
try {
  workspace = await mkdtemp(join(tmpdir(), 'frontier-runtime-'));
  await writeFile(join(workspace, '.git'), 'gitdir: ./git\n', 'utf8');

  const ticket = await verifyPublicSurface(workspace);
  await verifyWatcher(workspace, ticket);
  await verifyCrossProcessClaim(workspace, ticket);
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

/** Returns the full name the Ticket answers to and the file its name implies. */
async function verifyPublicSurface(root) {
  let created;
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

    const report = await call(client, 'create_tickets', {
      effort: 'alpha',
      create: true,
      tickets: [
        {
          name: LIFECYCLE_NAME,
          title: 'Runtime lifecycle',
          body: 'Created through the packaged server.',
        },
      ],
    });
    const id = `alpha.${LIFECYCLE_NAME}`;
    assert(
      /^(\S+) +Runtime lifecycle$/m.exec(report)?.[1] === id,
      `create_tickets reports the Ticket by its full name ${id}; got\n${report}`,
    );
    const issues = join(root, '.scratch', 'alpha', 'issues');
    assertEqual(
      await readdir(issues),
      [`${LIFECYCLE_NAME}.md`],
      'the created Ticket is the one file its name implies, with no sort-order prefix',
    );
    const path = join(issues, `${LIFECYCLE_NAME}.md`);
    assert(
      !/^id:/m.test(frontmatterOf(await readFile(path, 'utf8'))),
      'a created Ticket carries no id field',
    );
    const board = await call(client, 'get_board', { effort: 'alpha' });
    assert(board.includes('Runtime lifecycle'), 'created Ticket appears on its Board');
    const ticket = await call(client, 'get_tickets', { ids: [id] });
    assert(
      ticket.includes('Created through the packaged server.'),
      'created Ticket body is readable',
    );

    await call(client, 'update_ticket', { id, claim: { by: 'runtime-check' } });
    await call(client, 'update_ticket', { id, release: true });
    await call(client, 'update_ticket', {
      id,
      resolve: { answer_gist: 'Runtime check landed.' },
    });
    await call(client, 'update_ticket', {
      id,
      reopen: { reason: 'Exercise the full lifecycle.' },
    });
    const updated = await readFile(path, 'utf8');
    assert(
      /^status:\s*open$/m.test(frontmatterOf(updated)) &&
        updated.includes('Exercise the full lifecycle.'),
      'updates addressed by name land in the file the name implies',
    );
    assert(!/^id:/m.test(frontmatterOf(updated)), 'an update adds no id field');

    created = { id, path };
  });
  return created;
}

async function verifyWatcher(root, ticket) {
  await withServer(root, 'watcher', async client => {
    await call(client, 'get_board', { effort: 'alpha' });
    await sleep(WATCHER_SETTLE_MS);
    // Settle timers invalidate the first scan even if the runtime never delivers
    // a filesystem event. Prime it again so the edit must trigger invalidation.
    await call(client, 'get_board', { effort: 'alpha' });

    const ticketPath = ticket.path;
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

    const issues = join(root, '.scratch', 'external', 'issues');
    await mkdir(issues, { recursive: true });
    await writeFile(
      join(issues, '01-T100-external.md'),
      '---\nid: T100\ntitle: New external directory\nkind: build\nstatus: open\nblocked_by: []\n---\n',
      'utf8',
    );
    await waitFor(
      async () => call(client, 'list_efforts', {}),
      efforts => efforts.includes('external'),
      'an Effort created outside the server after watcher settling becomes visible',
    );
    await call(client, 'get_board', { effort: 'external' });
    await sleep(WATCHER_SETTLE_MS);
    await call(client, 'get_board', { effort: 'external' });
    const newTicketPath = join(issues, '01-T100-external.md');
    await writeFile(
      newTicketPath,
      (await readFile(newTicketPath, 'utf8')).replace(
        'New external directory',
        'Edited new directory',
      ),
      'utf8',
    );
    await waitFor(
      async () => call(client, 'get_board', { effort: 'external' }),
      board => board.includes('Edited new directory'),
      'an external edit inside a newly created directory reaches its Board',
    );
  });
}

async function verifyCrossProcessClaim(root, ticket) {
  const servers = await Promise.all(
    Array.from({ length: CLAIMANTS }, (_, index) => openServer(root, `claim-${String(index)}`)),
  );

  try {
    await Promise.all(servers.map(({ client }) => call(client, 'get_board', { effort: 'alpha' })));
    const outcomes = await Promise.all(
      servers.map(({ client }, index) => {
        const by = `claim-${String(index)}`;
        return callResult(client, 'update_ticket', { id: ticket.id, claim: { by } }).then(
          result => ({
            by,
            result,
          }),
        );
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

    const ticketPath = ticket.path;
    const onDisk = await readFile(ticketPath, 'utf8');
    const holder = /claimed_by:\s*(\S+)/.exec(onDisk)?.[1];
    assert(holder === winners[0]?.by, 'the process told it won is the process recorded on disk');
  } finally {
    await closeServers(servers);
  }
}

async function verifyCrossProcessCreate(root) {
  const storage = join(root, '.scratch');
  const before = await filesUnder(storage);

  const servers = await Promise.all(
    Array.from({ length: CREATORS }, (_, index) => openServer(root, `create-${String(index)}`)),
  );

  try {
    await Promise.all(servers.map(({ client }) => call(client, 'get_board', { effort: 'alpha' })));
    const outcomes = await Promise.all(
      servers.map(({ client }, creator) => {
        const title = `Creator ${String(creator)}`;
        return callResult(client, 'create_tickets', {
          effort: 'alpha',
          tickets: [{ name: CONTENDED_NAME, title }],
        }).then(result => ({ title, result }));
      }),
    );
    const winners = outcomes.filter(({ result }) => result.isError !== true);
    assert(
      winners.length === 1,
      `exactly one separate server process creates a name; got ${winners.length}\n` +
        outcomes
          .map(
            ({ title, result }, index) =>
              `${title}: ${JSON.stringify(result)}\nServer stderr:\n${servers[index].stderr()}`,
          )
          .join('\n'),
    );

    const contended = join('alpha', 'issues', `${CONTENDED_NAME}.md`);
    assertEqual(
      await filesUnder(storage),
      [...before, contended].toSorted(),
      'concurrent creation of one name leaves exactly one file and nothing else in storage',
    );
    const onDisk = await readFile(join(storage, contended), 'utf8');
    const title = /^title:\s*(.+)$/m.exec(frontmatterOf(onDisk))?.[1];
    assert(title === winners[0]?.title, 'the process told it created the Ticket wrote the file');
    assert(!/^id:/m.test(frontmatterOf(onDisk)), 'a concurrently created Ticket carries no id');
  } finally {
    await closeServers(servers);
  }
}

/** Every file below a directory, hidden ones included, as sorted relative paths. */
async function filesUnder(directory, prefix = '') {
  const entries = await readdir(join(directory, prefix), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(item =>
      item.isDirectory()
        ? filesUnder(directory, join(prefix, item.name))
        : [join(prefix, item.name)],
    ),
  );
  return nested.flat().toSorted();
}

function frontmatterOf(contents) {
  return /^---\r?\n([\s\S]*?)\r?\n---/.exec(contents)?.[1] ?? '';
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
