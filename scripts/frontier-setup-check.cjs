#!/usr/bin/env node
'use strict';

// A real end-to-end check for the standalone bootstrap. It deliberately runs
// the setup script under Node 16 while saving and launching the selected Node.

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SETUP = path.join(ROOT, 'scripts', 'frontier-setup.cjs');
const { testing } = require('./frontier-setup.cjs');
const options = parseArguments(process.argv.slice(2));

let temporary;
main().catch(error => {
  process.stderr.write(`Frontier setup check failed: ${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});

async function main() {
  try {
    temporary = await mkdtemp(path.join(os.tmpdir(), 'frontier-setup-test-'));
    const home = path.join(temporary, 'home with spaces');
    const projectPath = path.join(temporary, 'project Node 16');
    await mkdir(projectPath, { recursive: true });
    const project = await realpath(projectPath);
    await writeFile(path.join(project, '.nvmrc'), '16.20.2\n', 'utf8');
    await writeFile(path.join(project, 'package.json'), '{"engines":{"node":"16.20.2"}}\n', 'utf8');
    await writeFile(path.join(project, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n', 'utf8');
    assert.equal(await reportedVersion(options.node16), '16.20.2');
    assert.equal(await reportedVersion(options.node24), '24.15.0');
    const projectSnapshot = await Promise.all(
      ['.nvmrc', 'package.json', 'pnpm-lock.yaml'].map(file =>
        readFile(path.join(project, file), 'utf8'),
      ),
    );
    const environment = {
      ...process.env,
      HOME: home,
      PATH: path.dirname(options.node16),
      XDG_DATA_HOME: path.join(home, 'data'),
    };
    const shim = path.join(temporary, 'project-sensitive-node');
    await writeFile(
      shim,
      `#!/bin/sh\nif [ "$(pwd -P)" = "${project}" ]; then exec "${options.node24}" "$@"; fi\nexec "${options.node16}" "$@"\n`,
      'utf8',
    );
    await chmod(shim, 0o755);
    const basic = ['--version', options.version, '--node', shim];

    const manual = await bootstrap([...basic, '--client', 'manual'], project, environment);
    assert.equal(manual.code, 0, manual.stderr);
    assert.match(
      manual.stdout,
      new RegExp(`Package: frontier-mcp@${escapeRegex(options.version)}`),
    );
    assert.match(manual.stdout, /Node 24/);
    const currentBootstrap = await bootstrapWith(
      options.node24,
      [...basic, '--client', 'manual'],
      project,
      environment,
    );
    assert.equal(currentBootstrap.code, 0, currentBootstrap.stderr);

    const configPath = path.join(home, '.cursor', 'mcp.json');
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({ mcpServers: { other: { command: 'other' } } }),
      'utf8',
    );
    const applied = await bootstrap([...basic, '--apply'], project, environment);
    assert.equal(applied.code, 0, applied.stderr);
    const configured = JSON.parse(await readFile(configPath, 'utf8'));
    assert.deepEqual(configured.mcpServers.other, { command: 'other' });
    assert.equal(
      configured.mcpServers.frontier.command,
      await testing.stableRuntimePath(options.node24),
    );
    assert.equal(path.isAbsolute(configured.mcpServers.frontier.args[0]), true);
    await testing.protocolCheck(
      {
        command: configured.mcpServers.frontier.command,
        args: configured.mcpServers.frontier.args,
      },
      project,
      minimalDesktopEnvironment(options.node16, home),
    );

    const again = await bootstrap([...basic, '--apply'], project, environment);
    assert.equal(again.code, 0, again.stderr);
    assert.match(again.stdout, /reused after verification/);

    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          frontier: { command: 'npx', args: ['frontier-mcp'] },
          other: { command: 'other' },
        },
      }),
      'utf8',
    );
    const refused = await bootstrap([...basic, '--apply'], project, environment);
    assert.notEqual(refused.code, 0);
    assert.match(refused.stderr, /--replace/);
    const replaced = await bootstrap([...basic, '--apply', '--replace'], project, environment);
    assert.equal(replaced.code, 0, replaced.stderr);
    assert.equal(
      (await readdir(path.dirname(configPath))).some(name => name.includes('frontier-backup-')),
      true,
    );

    const stableConfig = await readFile(configPath, 'utf8');
    const identicalPreview = await testing.prepareConfig(configPath, {
      command: configured.mcpServers.frontier.command,
      args: configured.mcpServers.frontier.args,
    });
    await writeFile(configPath, JSON.stringify({ changed: true }), 'utf8');
    await assert.rejects(
      testing.applyConfig(configPath, identicalPreview, false),
      /changed since preview/,
    );
    await writeFile(configPath, stableConfig, 'utf8');
    const disappearingPreview = await testing.prepareConfig(configPath, {
      command: configured.mcpServers.frontier.command,
      args: configured.mcpServers.frontier.args,
    });
    await rm(configPath);
    await assert.rejects(
      testing.applyConfig(configPath, disappearingPreview, false),
      /changed since preview/,
    );
    await writeFile(configPath, stableConfig, 'utf8');

    const preview = await testing.prepareConfig(configPath, {
      command: configured.mcpServers.frontier.command,
      args: [...configured.mcpServers.frontier.args, '--race-fixture'],
    });
    const beforeRace = await readFile(configPath, 'utf8');
    const backupsBeforeRace = new Set(await readdir(path.dirname(configPath)));
    const concurrentContents = JSON.stringify({ changed: true });
    await assert.rejects(
      testing.applyConfig(configPath, preview, true, async () => {
        await writeFile(configPath, concurrentContents, 'utf8');
      }),
      /changed since preview/,
    );
    assert.equal(await readFile(configPath, 'utf8'), concurrentContents);
    const backupAfterRace = (await readdir(path.dirname(configPath))).find(
      name => name.includes('frontier-backup-') && !backupsBeforeRace.has(name),
    );
    assert.notEqual(backupAfterRace, undefined);
    assert.equal(
      await readFile(path.join(path.dirname(configPath), backupAfterRace), 'utf8'),
      beforeRace,
    );

    await writeFile(configPath, '{', 'utf8');
    const malformed = await bootstrap([...basic, '--apply'], project, environment);
    assert.notEqual(malformed.code, 0);
    assert.equal(await readFile(configPath, 'utf8'), '{');
    const manualWithMalformedCursor = await bootstrap(
      [...basic, '--client', 'manual'],
      project,
      environment,
    );
    assert.equal(manualWithMalformedCursor.code, 0, manualWithMalformedCursor.stderr);

    const incompatible = await bootstrap(['--version', options.version], project, environment);
    assert.notEqual(incompatible.code, 0);
    assert.match(incompatible.stderr, /requires/);
    await assert.rejects(
      testing.protocolCheck(
        { command: options.node24, args: [path.join(project, 'missing-server.js')] },
        project,
      ),
    );
    assert.deepEqual(
      await Promise.all(
        ['.nvmrc', 'package.json', 'pnpm-lock.yaml'].map(file =>
          readFile(path.join(project, file), 'utf8'),
        ),
      ),
      projectSnapshot,
    );

    process.stdout.write('Frontier setup check passed.\n');
  } finally {
    if (temporary !== undefined) await rm(temporary, { recursive: true, force: true });
  }
}

function parseArguments(args) {
  const values = {
    node16: process.env.FRONTIER_NODE16,
    node24: process.env.FRONTIER_NODE24,
    version: process.env.FRONTIER_SETUP_RELEASE ?? '0.3.1',
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === '--node16' && value !== undefined) {
      values.node16 = value;
      index += 1;
    } else if (argument === '--node24' && value !== undefined) {
      values.node24 = value;
      index += 1;
    } else if (argument === '--version' && value !== undefined) {
      values.version = value;
      index += 1;
    } else {
      throw new Error(
        'Usage: frontier-setup-check.cjs --node16 PATH --node24 PATH [--version X.Y.Z]',
      );
    }
  }
  if (values.node16 === undefined || values.node24 === undefined) {
    throw new Error('Set FRONTIER_NODE16 and FRONTIER_NODE24 to run the setup check.');
  }
  return values;
}

function bootstrap(args, cwd, env) {
  return bootstrapWith(options.node16, args, cwd, env);
}

function bootstrapWith(runtime, args, cwd, env) {
  return run(runtime, [SETUP, ...args], { cwd, env });
}

async function reportedVersion(runtime) {
  const result = await run(runtime, ['--version'], { cwd: ROOT, env: process.env });
  assert.equal(result.code, 0, result.stderr);
  return result.stdout.trim().replace(/^v/, '');
}

function run(command, args, runOptions) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...runOptions, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stderr, stdout }));
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function minimalDesktopEnvironment(node16, home) {
  const environment = { HOME: home, PATH: path.dirname(node16) };
  for (const name of ['USERPROFILE', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP']) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  return environment;
}
