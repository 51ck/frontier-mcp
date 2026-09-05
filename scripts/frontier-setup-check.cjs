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
  symlink,
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
      ...isolatedManagerEnvironment(home),
      HOME: home,
      PATH: path.dirname(options.node16),
      XDG_DATA_HOME: path.join(home, 'data'),
    };
    const fnmRoot = path.join(temporary, 'fnm root with spaces');
    await mkdir(fnmRoot, { recursive: true });
    await linkNode(
      options.node24,
      path.join(fnmRoot, 'node-versions', 'v24.15.0', 'installation', 'bin', 'node'),
    );
    const fnm = path.join(fnmRoot, 'fnm');
    await writeFile(
      fnm,
      '#!/bin/sh\nif [ "$1" = list ]; then printf "v24.15.0\\n"; else printf "%s\\n" "$FRONTIER_NODE24"; fi\n',
      'utf8',
    );
    await chmod(fnm, 0o755);
    const managerEnvironment = {
      ...environment,
      FRONTIER_NODE24: options.node24,
      FNM_DIR: fnmRoot,
      PATH: '',
    };
    const managerSelected = await bootstrap(
      ['--version', options.version, '--client', 'manual'],
      project,
      managerEnvironment,
    );
    assert.equal(managerSelected.code, 0, managerSelected.stderr);
    assert.match(managerSelected.stdout, new RegExp(`Runtime: ${escapeRegex(options.node24)}`));
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
    assert.equal(configured.mcpServers.frontier.args.length, 0);
    assert.equal(path.isAbsolute(configured.mcpServers.frontier.command), true);
    const savedLaunch = await readFile(configured.mcpServers.frontier.command, 'utf8');
    assert.match(
      savedLaunch,
      new RegExp(escapeRegex(await testing.stableRuntimePath(options.node24))),
    );
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
    await managerDiscoveryCheck(temporary, home, options);
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

async function managerDiscoveryCheck(checkTemporary, home, checkOptions) {
  const nvmDirectory = path.join(checkTemporary, 'custom nvm directory');
  await linkNode(
    checkOptions.node24,
    path.join(nvmDirectory, 'versions', 'node', 'v24.15.0', 'bin', 'node'),
  );
  await writeFile(path.join(nvmDirectory, 'nvm.sh'), 'nvm() { :; }\n', 'utf8');
  const fnmDirectory = path.join(checkTemporary, 'custom fnm directory');
  await linkNode(
    checkOptions.node24,
    path.join(fnmDirectory, 'node-versions', 'v24.15.0', 'installation', 'bin', 'node'),
  );
  const voltaDirectory = path.join(checkTemporary, 'custom volta directory');
  await linkNode(
    checkOptions.node24,
    path.join(voltaDirectory, 'tools', 'image', 'node', '24.15.0', 'bin', 'node'),
  );
  await writeManager(
    path.join(voltaDirectory, 'bin', 'volta'),
    '#!/bin/sh\nif [ "$1" = list ]; then printf "Node runtimes:\\n  v24.15.0\\nPackage binaries:\\n"; else exit 91; fi\n',
  );
  const asdfDirectory = path.join(checkTemporary, 'custom asdf directory');
  await linkNode(
    checkOptions.node24,
    path.join(asdfDirectory, 'installs', 'nodejs', '24.15.0', 'bin', 'node'),
  );
  await writeManager(path.join(asdfDirectory, 'bin', 'asdf'), '#!/bin/sh\nexit 91\n');
  const miseDirectory = path.join(checkTemporary, 'custom mise directory');
  await linkNode(
    checkOptions.node24,
    path.join(miseDirectory, 'installs', 'node', '24.15.0', 'bin', 'node'),
  );
  await writeManager(path.join(miseDirectory, 'bin', 'mise'), '#!/bin/sh\nexit 91\n');
  const windowsNvmDirectory = path.join(checkTemporary, 'custom nvm-windows directory');
  await linkNode(checkOptions.node24, path.join(windowsNvmDirectory, 'v24.15.0', 'node.exe'));
  await writeFile(path.join(windowsNvmDirectory, 'settings.txt'), 'root: fixture\n', 'utf8');

  const layouts = [
    ['fnm', 'FNM_DIR', fnmDirectory, 'darwin', 'fnm install 24'],
    ['nvm', 'NVM_DIR', nvmDirectory, 'darwin', 'nvm install 24'],
    ['nvm-windows', 'NVM_HOME', windowsNvmDirectory, 'win32', 'nvm install 24'],
    ['volta', 'VOLTA_HOME', voltaDirectory, 'darwin', 'volta fetch node@24'],
    ['asdf', 'ASDF_DATA_DIR', asdfDirectory, 'darwin', 'asdf install nodejs latest:24'],
    ['mise', 'MISE_DATA_DIR', miseDirectory, 'darwin', 'mise install node@24'],
  ];
  await Promise.all(
    layouts.map(async ([manager, variable, root, platform, repair]) => {
      const isolated = { ...isolatedManagerEnvironment(home), [variable]: root };
      const selected = await testing.selectRuntime(undefined, '^24.15.0', {
        currentExecutable: checkOptions.node16,
        environment: isolated,
        platform,
      });
      assert.equal(selected.manager, manager, `Individual ${manager} discovery`);
      assert.equal(selected.repairCommand, repair);
      const emptyRoot = path.join(checkTemporary, `empty ${manager}`);
      await mkdir(emptyRoot, { recursive: true });
      if (manager === 'nvm') await writeFile(path.join(emptyRoot, 'nvm.sh'), 'nvm() { :; }\n');
      else if (manager === 'nvm-windows')
        await writeFile(path.join(emptyRoot, 'settings.txt'), 'root: fixture\n');
      else await writeManager(path.join(emptyRoot, 'bin', manager), '#!/bin/sh\nexit 0\n');
      await assert.rejects(
        testing.selectRuntime(undefined, '^24.15.0', {
          currentExecutable: checkOptions.node16,
          environment: { ...isolated, [variable]: emptyRoot },
          platform,
        }),
        error => error.message.includes(`${manager}: ${repair}`),
        `Missing ${manager} installation should retain manager guidance`,
      );
    }),
  );

  const noManager = await testing.discoverManagedRuntimes(
    { ...isolatedManagerEnvironment(home), APPDATA: path.join(checkTemporary, 'empty roaming') },
    'win32',
  );
  assert.equal(noManager.managers.length, 0, 'APPDATA alone is not nvm-windows evidence');

  const managerEnvironment = {
    ...isolatedManagerEnvironment(home),
    HOME: home,
    NVM_DIR: nvmDirectory,
    FNM_DIR: fnmDirectory,
    VOLTA_HOME: voltaDirectory,
    ASDF_DATA_DIR: asdfDirectory,
    MISE_DATA_DIR: miseDirectory,
    PATH: '',
  };
  const discovery = await testing.discoverManagedRuntimes(managerEnvironment, 'darwin');
  assert.deepEqual(
    discovery.managers.map(manager => manager.manager),
    ['fnm', 'nvm', 'volta', 'asdf', 'mise'],
  );
  assert.equal(discovery.runtimes.length, 1);
  assert.equal(
    discovery.runtimes[0].executable,
    await testing.stableRuntimePath(checkOptions.node24),
  );
  const runtime = await testing.selectRuntime(undefined, '^24.15.0', {
    currentExecutable: checkOptions.node16,
    environment: managerEnvironment,
    platform: 'darwin',
  });
  assert.equal(runtime.manager, 'fnm');

  const windowsDiscovery = await testing.discoverManagedRuntimes(
    { ...managerEnvironment, NVM_HOME: windowsNvmDirectory },
    'win32',
  );
  assert.equal(
    windowsDiscovery.managers.some(manager => manager.manager === 'nvm-windows'),
    true,
  );

  await assert.rejects(
    testing.selectRuntime(undefined, '^24.15.0', {
      currentExecutable: checkOptions.node16,
      environment: isolatedManagerEnvironment(home),
      platform: 'darwin',
    }),
    /Install fnm.*fnm install 24/,
  );

  const wrapper = await testing.durableLaunch(
    {
      executable: path.join(checkTemporary, 'removed Node'),
      repairCommand: 'nvm install 24',
      version: { major: 24, minor: 15, patch: 0 },
    },
    { directory: checkTemporary, entry: path.join(checkTemporary, 'server.js') },
  );
  const repaired = await run(wrapper.command, [], {
    cwd: checkTemporary,
    env: { PATH: '/usr/bin:/bin' },
  });
  assert.equal(repaired.code, 127);
  assert.match(repaired.stderr, /nvm install 24/);
  const originalWrapper = await readFile(wrapper.command, 'utf8');
  const changedWrapper = await testing.durableLaunch(
    { executable: checkOptions.node24, repairCommand: 'fnm install 24' },
    { directory: checkTemporary, entry: path.join(checkTemporary, 'server.js') },
  );
  assert.notEqual(changedWrapper.command, wrapper.command);
  assert.equal(await readFile(wrapper.command, 'utf8'), originalWrapper);

  const batch = testing.windowsLaunchWrapper(
    {
      executable: 'C:\\Node (managed)\\node&24!^.exe',
      repairCommand: 'fnm install 24 & rerun',
    },
    'C:\\Frontier (user)\\entry%24.js',
  );
  assert.match(batch, /setlocal DisableDelayedExpansion/);
  assert.equal(batch.includes('"C:\\Node (managed)\\node&24!^.exe"'), true);
  assert.equal(batch.includes('"C:\\Frontier (user)\\entry%%24.js"'), true);
  assert.equal(batch.includes('runtime: C:\\Node ^(managed^)\\node^&24!^^.exe'), true);
}

function isolatedManagerEnvironment(home) {
  const environment = { HOME: home, USERPROFILE: home, PATH: '' };
  for (const variable of [
    'FNM_DIR',
    'NVM_DIR',
    'NVM_HOME',
    'VOLTA_HOME',
    'ASDF_DIR',
    'ASDF_DATA_DIR',
    'MISE_DATA_DIR',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
    'APPDATA',
    'LOCALAPPDATA',
  ])
    environment[variable] = path.join(home, 'uninstalled managers', variable);
  return environment;
}

async function linkNode(source, target) {
  await mkdir(path.dirname(target), { recursive: true });
  await symlink(source, target);
}

async function writeManager(target, source) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, source, 'utf8');
  await chmod(target, 0o755);
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
