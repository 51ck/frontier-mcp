#!/usr/bin/env node
'use strict';

// This file deliberately has no dependencies and uses syntax Node 16 accepts.
// It must choose a runtime before FrontierMCP itself is installed or imported.
// FrontierMCP setup bootstrap revision 2.

const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const {
  access,
  chmod,
  copyFile,
  mkdtemp,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} = require('node:fs/promises');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');

const PACKAGE = 'frontier-mcp';
const SERVER = 'frontier';
const REGISTRY = 'https://registry.npmjs.org';
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
const REQUEST_TIMEOUT_MS = 15_000;

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`frontier setup failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

async function main(args) {
  const options = parseArguments(args);
  if (options.help) {
    printUsage();
    return;
  }

  const release = await readRelease(options.version);
  const runtime = await selectRuntime(options.node, release.engines.node);
  const installation = await findOrInstall(runtime, options.version);
  const alternatives = await resolveAlternativeRuntimes(options);
  const launch = await durableLaunch(runtime, installation, {
    alternatives,
    version: options.version,
  });

  // The preflight starts in a disposable empty directory. It proves the exact
  // saved executable and entry work without creating or changing a tracker in
  // the repository where setup was invoked.
  await verifyLaunch(launch);

  const target =
    options.client === 'cursor' ? cursorConfigPath() : 'your MCP client user configuration';
  const preview =
    options.client === 'cursor'
      ? await prepareConfig(target, launch)
      : { desired: { command: launch.command, args: launch.args } };
  printPreview({ runtime, release, installation, target, preview, client: options.client });

  if (!options.apply || options.client === 'manual') return;
  await applyConfig(target, preview, options.replace);
  process.stdout.write(
    `Applied Cursor user configuration at ${target}. Restart Cursor to use it.\n`,
  );
}

function parseArguments(args) {
  const options = {
    apply: false,
    bun: undefined,
    client: 'cursor',
    deno: undefined,
    help: false,
    node: undefined,
    replace: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === '--apply') {
      options.apply = true;
    } else if (argument === '--replace') {
      options.replace = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument === '--version' && value !== undefined) {
      options.version = value;
      index += 1;
    } else if (argument === '--node' && value !== undefined) {
      options.node = value;
      index += 1;
    } else if (argument === '--bun' && value !== undefined) {
      options.bun = value;
      index += 1;
    } else if (argument === '--deno' && value !== undefined) {
      options.deno = value;
      index += 1;
    } else if (argument === '--client' && value !== undefined) {
      options.client = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  if (
    !options.help &&
    (options.version === undefined || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(options.version))
  ) {
    throw new Error('Pass an exact released version, for example --version 0.3.1.');
  }
  if (options.client !== 'cursor' && options.client !== 'manual') {
    throw new Error('--client must be cursor or manual.');
  }
  if (options.client === 'manual' && options.apply) {
    throw new Error('--apply is available only for Cursor user configuration.');
  }
  return options;
}

function printUsage() {
  process.stdout.write(`FrontierMCP setup bootstrap revision 2

Usage: node scripts/frontier-setup.cjs --version X.Y.Z [options]

Options:
  --node PATH       Use this Node executable instead of the current one.
  --bun PATH        Save this Bun candidate for verified project launches.
  --deno PATH       Save this Deno candidate for verified project launches.
  --client NAME     cursor (default) writes Cursor user scope; manual prints an entry.
  --apply           Write the previewed Cursor entry.
  --replace         Replace an existing different frontier entry, with a backup.
`);
}

function readRelease(version) {
  const url = `${REGISTRY}/${PACKAGE}/${encodeURIComponent(version)}`;
  return readJson(url).then(release => {
    if (release.name !== PACKAGE || release.version !== version || !release.engines?.node) {
      throw new Error(`Registry metadata for ${PACKAGE}@${version} has no usable Node engine.`);
    }
    return release;
  });
}

function readJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: REQUEST_TIMEOUT_MS }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`Could not read ${url}: HTTP ${response.statusCode}.`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Could not parse registry metadata from ${url}: ${error.message}`));
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error(`Timed out reading ${url}.`)));
    request.on('error', error => reject(new Error(`Could not read ${url}: ${error.message}`)));
  });
}

async function selectRuntime(override, range, options = {}) {
  const environment = options.environment ?? process.env;
  const currentExecutable = options.currentExecutable ?? process.execPath;
  if (!isKnownEngineRange(range)) {
    throw new Error(
      `${PACKAGE} declares ${range}. This bootstrap understands only >=N and ^N.N.N clauses joined with ||; use a bootstrap released for that package version.`,
    );
  }
  if (override !== undefined) {
    const runtime = await resolvedRuntime(path.resolve(override), environment, 'override');
    if (supportsRange(runtime.version, range)) return runtime;
    throw new Error(
      `${runtime.executable} is Node ${formatVersion(runtime.version)}, but ${PACKAGE} requires ${range}.`,
    );
  }

  const current = await resolvedRuntime(path.resolve(currentExecutable), environment, 'current');
  if (supportsRange(current.version, range)) return current;

  const discovery = await discoverManagedRuntimes(
    environment,
    options.platform ?? process.platform,
  );
  const selected = selectManagedRuntime(discovery.runtimes, range);
  if (selected !== undefined) return selected;

  throw new Error(
    `${current.executable} is Node ${formatVersion(current.version)}, but ${PACKAGE} requires ${range}. ` +
      missingRuntimeGuidance(discovery.managers),
  );
}

async function resolvedRuntime(requested, environment, source, manager, repairCommand) {
  const executable = await stableRuntimePath(requested, environment);
  const version = await nodeVersion(executable, environment);
  return { executable, version, source, manager, repairCommand };
}

async function stableRuntimePath(requested, environment) {
  try {
    const { stdout } = await run(requested, ['-p', 'process.execPath'], {
      capture: true,
      env: environment,
    });
    const selected = stdout.trim();
    if (!path.isAbsolute(selected))
      throw new Error('The selected Node did not report an absolute path.');
    const resolved = await realpath(selected);
    // A manager shim can choose an executable from the setup project's pin.
    // Save the process it actually selected, never the shim itself.
    await nodeVersion(resolved, environment);
    return resolved;
  } catch (error) {
    throw new Error(
      `Could not resolve a stable Node executable from ${requested}: ${error.message}`,
      {
        cause: error,
      },
    );
  }
}

async function nodeVersion(executable, environment) {
  const { stdout } = await run(executable, ['--version'], { capture: true, env: environment });
  const match = /^v(\d+)\.(\d+)\.(\d+)\s*$/.exec(stdout);
  if (match === null) throw new Error(`${executable} did not report a Node version.`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

// This bootstrap intentionally recognizes the engine forms FrontierMCP has
// released. A new range needs a new bootstrap; refusing is safer than silently
// accepting a runtime with an incomplete semver implementation.
function supportsRange(version, range) {
  return range.split('||').some(part => supportsComparator(version, part.trim()));
}

function isKnownEngineRange(range) {
  return range.split('||').every(part => isKnownRange(part.trim()));
}

function isKnownRange(range) {
  return /^(?:>=|\^)(?:0|[1-9]\d*)\.\d+\.\d+$/.test(range) || /^(?:>=)(?:0|[1-9]\d*)$/.test(range);
}

function supportsComparator(version, comparator) {
  const match = /^(>=|\^)(\d+)(?:\.(\d+)\.(\d+))?$/.exec(comparator);
  if (match === null) return false;
  const floor = {
    major: Number(match[2]),
    minor: Number(match[3] ?? 0),
    patch: Number(match[4] ?? 0),
  };
  if (match[1] === '^' && version.major !== floor.major) return false;
  return compareVersions(version, floor) >= 0;
}

function compareVersions(left, right) {
  for (const part of ['major', 'minor', 'patch']) {
    if (left[part] !== right[part]) return left[part] - right[part];
  }
  return 0;
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

const MANAGER_ORDER = ['fnm', 'nvm', 'nvm-windows', 'volta', 'asdf', 'mise'];

async function discoverManagedRuntimes(environment, platform) {
  const discoveries = await Promise.all([
    discoverFnm(environment, platform),
    discoverNvm(environment, platform),
    discoverNvmWindows(environment, platform),
    discoverVolta(environment, platform),
    discoverAsdf(environment, platform),
    discoverMise(environment, platform),
  ]);
  const managers = discoveries.filter(discovery => discovery.found);
  const runtimes = deduplicateRuntimes(discoveries.flatMap(discovery => discovery.runtimes));
  return { managers, runtimes };
}

async function discoverFnm(environment, platform) {
  const repairCommand = 'fnm install 24';
  const roots = uniquePaths([
    environment.FNM_DIR,
    environment.XDG_DATA_HOME && path.join(environment.XDG_DATA_HOME, 'fnm'),
    platform === 'darwin' &&
      path.join(homeDirectory(environment), 'Library', 'Application Support', 'fnm'),
    platform === 'win32' && environment.APPDATA && path.join(environment.APPDATA, 'fnm'),
    path.join(homeDirectory(environment), '.local', 'share', 'fnm'),
    path.join(homeDirectory(environment), '.fnm'),
  ]);
  const command = await managerCommand('fnm', roots, environment, platform);
  const listed = await managerListedVersions(command, ['list'], environment);
  const runtimes = await runtimesFromLayouts(
    roots.map(root => ({
      root: path.join(root, 'node-versions'),
      suffix: ['installation', ...nodeLayout(platform)],
    })),
    'fnm',
    repairCommand,
    environment,
    listed,
  );
  return managerResult(
    'fnm',
    repairCommand,
    command !== undefined || runtimes.length > 0,
    runtimes,
  );
}

async function discoverNvm(environment, platform) {
  if (platform === 'win32') return emptyDiscovery('nvm', 'nvm install 24');
  const script = await nvmScript(environment);
  const repairCommand = 'nvm install 24';
  const roots = uniquePaths([
    environment.NVM_DIR,
    environment.XDG_CONFIG_HOME === undefined
      ? undefined
      : path.join(environment.XDG_CONFIG_HOME, 'nvm'),
    path.join(homeDirectory(environment), '.nvm'),
  ]);
  const listed =
    script === undefined
      ? undefined
      : await managerListedVersions(
          '/bin/bash',
          [
            '--noprofile',
            '--norc',
            '-c',
            '. "$1" --no-use; nvm ls --no-colors',
            'frontier-setup',
            script,
          ],
          {
            ...environment,
            NVM_DIR: path.dirname(script),
            PATH: `${environment.PATH ?? ''}:/usr/bin:/bin`,
          },
        );
  const runtimes = await runtimesFromLayouts(
    roots.map(root => ({ root: path.join(root, 'versions', 'node'), suffix: ['bin', 'node'] })),
    'nvm',
    repairCommand,
    environment,
    listed,
  );
  return managerResult('nvm', repairCommand, script !== undefined || runtimes.length > 0, runtimes);
}

async function nvmScript(environment) {
  const directories = [
    environment.NVM_DIR,
    environment.XDG_CONFIG_HOME === undefined
      ? undefined
      : path.join(environment.XDG_CONFIG_HOME, 'nvm'),
    path.join(homeDirectory(environment), '.nvm'),
  ].filter(Boolean);
  return firstAccessible(directories.map(directory => path.join(directory, 'nvm.sh')));
}

async function discoverNvmWindows(environment, platform) {
  const repairCommand = 'nvm install 24';
  if (platform !== 'win32') return emptyDiscovery('nvm-windows', repairCommand);
  const directRoots = uniquePaths([environment.NVM_HOME, nvmWindowsDefaultRoot(environment)]);
  const command = await managerCommand('nvm', directRoots, environment, platform);
  const root = await nvmWindowsRoot(command, environment);
  const roots = uniquePaths([root, ...directRoots]);
  const listed = await managerListedVersions(command, ['list'], environment);
  const runtimes = await runtimesFromLayouts(
    roots.map(candidate => ({ root: candidate, suffix: ['node.exe'] })),
    'nvm-windows',
    repairCommand,
    environment,
    listed,
  );
  const evidence = await Promise.all(roots.map(nvmWindowsRootEvidence));
  return managerResult(
    'nvm-windows',
    repairCommand,
    command !== undefined || evidence.some(Boolean) || runtimes.length > 0,
    runtimes,
  );
}

function nvmWindowsDefaultRoot(environment) {
  return environment.APPDATA === undefined ? undefined : path.join(environment.APPDATA, 'nvm');
}

async function nvmWindowsRootEvidence(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.some(
      entry =>
        entry.name === 'settings.txt' ||
        entry.name === 'nvm.exe' ||
        (entry.isDirectory() && /^v\d+\.\d+\.\d+$/.test(entry.name)),
    );
  } catch {
    return false;
  }
}

async function nvmWindowsRoot(command, environment) {
  if (environment.NVM_HOME !== undefined) return environment.NVM_HOME;
  if (command === undefined) return undefined;
  try {
    const { stdout } = await run(command, ['root'], {
      env: managerQueryEnvironment(environment),
      label: 'nvm root',
      cwd: os.tmpdir(),
      timeout: 5000,
    });
    return stdout.trim().replace(/^Current Root:\s*/i, '');
  } catch {
    return undefined;
  }
}

async function discoverVolta(environment, platform) {
  const repairCommand = 'volta fetch node@24';
  const roots = uniquePaths([
    environment.VOLTA_HOME,
    platform === 'win32' &&
      environment.LOCALAPPDATA &&
      path.join(environment.LOCALAPPDATA, 'Volta'),
    path.join(homeDirectory(environment), '.volta'),
  ]);
  const command = await managerCommand('volta', roots, environment, platform);
  const listed = command === undefined ? [] : await voltaListedVersions(command, environment);
  const runtimes = await runtimesFromLayouts(
    roots.map(root => ({
      root: path.join(root, 'tools', 'image', 'node'),
      suffix: nodeLayout(platform),
    })),
    'volta',
    repairCommand,
    environment,
    listed,
  );
  return managerResult(
    'volta',
    repairCommand,
    command !== undefined || runtimes.length > 0,
    runtimes,
  );
}

async function discoverAsdf(environment, platform) {
  const repairCommand = 'asdf install nodejs latest:24';
  if (platform === 'win32') return emptyDiscovery('asdf', repairCommand);
  const roots = uniquePaths([
    environment.ASDF_DATA_DIR,
    environment.ASDF_DIR,
    path.join(homeDirectory(environment), '.asdf'),
  ]);
  const command = await managerCommand('asdf', roots, environment, platform);
  const listed = await managerListedVersions(command, ['list', 'nodejs'], environment);
  const runtimes = await runtimesFromLayouts(
    roots.map(root => ({ root: path.join(root, 'installs', 'nodejs'), suffix: ['bin', 'node'] })),
    'asdf',
    repairCommand,
    environment,
    listed,
  );
  return managerResult(
    'asdf',
    repairCommand,
    command !== undefined || runtimes.length > 0,
    runtimes,
  );
}

async function discoverMise(environment, platform) {
  const repairCommand = 'mise install node@24';
  const roots = uniquePaths([
    environment.MISE_DATA_DIR,
    environment.XDG_DATA_HOME && path.join(environment.XDG_DATA_HOME, 'mise'),
    platform === 'win32' && environment.LOCALAPPDATA && path.join(environment.LOCALAPPDATA, 'mise'),
    path.join(homeDirectory(environment), '.local', 'share', 'mise'),
  ]);
  const command = await managerCommand('mise', roots, environment, platform);
  const listed = await managerListedVersions(
    command,
    ['ls', '--installed', '--no-header', 'node'],
    environment,
  );
  const runtimes = await runtimesFromLayouts(
    roots.map(root => ({
      root: path.join(root, 'installs', 'node'),
      suffix: nodeLayout(platform),
    })),
    'mise',
    repairCommand,
    environment,
    listed,
  );
  return managerResult(
    'mise',
    repairCommand,
    command !== undefined || runtimes.length > 0,
    runtimes,
  );
}

function emptyDiscovery(manager, repairCommand) {
  return { found: false, manager, repairCommand, runtimes: [] };
}

function nodeLayout(platform) {
  return platform === 'win32' ? ['node.exe'] : ['bin', 'node'];
}

function managerResult(manager, repairCommand, found, runtimes) {
  return { found, manager, repairCommand, runtimes };
}

async function runtimesFromLayouts(layouts, manager, repairCommand, environment, listed) {
  const candidates = (await Promise.all(layouts.map(runtimeCandidatesFromLayout))).flat();
  const allowed =
    listed === undefined || listed.length === 0
      ? candidates
      : candidates.filter(candidate =>
          listed.some(version => compareVersions(version, candidate.version) === 0),
        );
  const outcomes = await Promise.allSettled(
    allowed.map(async candidate => {
      const runtime = await resolvedRuntime(
        candidate.executable,
        environment,
        'manager',
        manager,
        repairCommand,
      );
      if (compareVersions(runtime.version, candidate.version) !== 0)
        throw new Error('Runtime version does not match its manager directory.');
      return runtime;
    }),
  );
  return outcomes.filter(outcome => outcome.status === 'fulfilled').map(outcome => outcome.value);
}

async function runtimeCandidatesFromLayout(layout) {
  try {
    return (await readdir(layout.root, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .flatMap(entry => {
        const version = /^v?\d+\.\d+\.\d+$/.test(entry.name)
          ? listedVersions(entry.name)[0]
          : undefined;
        return version === undefined
          ? []
          : [{ executable: path.join(layout.root, entry.name, ...layout.suffix), version }];
      });
  } catch {
    return [];
  }
}

function listedVersions(output) {
  const versions = [];
  const expression = /(?:v|node@)?(\d+)\.(\d+)\.(\d+)/g;
  let match;
  while ((match = expression.exec(output)) !== null) {
    const version = { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
    if (!versions.some(candidate => compareVersions(candidate, version) === 0))
      versions.push(version);
  }
  return versions;
}

function deduplicateVersions(versions) {
  return versions.filter(
    (version, index) =>
      versions.findIndex(candidate => compareVersions(candidate, version) === 0) === index,
  );
}

function voltaInstalledNodeVersions(output) {
  let inNodeRuntimes = false;
  const versions = [];
  for (const line of output.split(/\r?\n/)) {
    if (/^\s*Node runtimes:\s*$/i.test(line)) {
      inNodeRuntimes = true;
    } else if (/^\S.*:\s*$/.test(line)) {
      inNodeRuntimes = false;
    } else if (inNodeRuntimes) {
      versions.push(...listedVersions(line));
    }
  }
  return deduplicateVersions(versions);
}

async function voltaListedVersions(command, environment) {
  try {
    const { stdout } = await run(command, ['list', 'all', '--format', 'plain'], {
      env: managerQueryEnvironment(environment),
      label: 'volta list',
      cwd: os.tmpdir(),
      timeout: 5000,
    });
    return voltaInstalledNodeVersions(stdout);
  } catch {
    return [];
  }
}

// Commands are read-only installed-version queries. Missing commands, older CLI
// syntax, and unrecognized output fall back to probing the known local layouts.
async function managerListedVersions(command, args, environment) {
  if (command === undefined) return undefined;
  try {
    const { stdout } = await run(command, args, {
      cwd: os.tmpdir(),
      env: managerQueryEnvironment(environment),
      timeout: 5000,
    });
    return listedVersions(stdout);
  } catch {
    return undefined;
  }
}

function managerQueryEnvironment(environment) {
  // A manager executable may itself be a Bash script. Noninteractive Bash
  // sources BASH_ENV even when no shell profile was requested.
  return { ...environment, BASH_ENV: '', NO_COLOR: '1' };
}

function deduplicateRuntimes(runtimes) {
  const byPath = new Map();
  for (const runtime of runtimes) {
    if (!byPath.has(runtime.executable)) byPath.set(runtime.executable, runtime);
  }
  return [...byPath.values()];
}

function selectManagedRuntime(runtimes, range) {
  return runtimes
    .filter(runtime => supportsRange(runtime.version, range))
    .reduce(
      (selected, candidate) =>
        selected === undefined || compareManagedRuntimes(candidate, selected) < 0
          ? candidate
          : selected,
      undefined,
    );
}

function compareManagedRuntimes(left, right) {
  const lts = Number(right.version.major === 24) - Number(left.version.major === 24);
  if (lts !== 0) return lts;
  const version = compareVersions(right.version, left.version);
  if (version !== 0) return version;
  const manager = MANAGER_ORDER.indexOf(left.manager) - MANAGER_ORDER.indexOf(right.manager);
  if (manager !== 0) return manager;
  return left.executable.localeCompare(right.executable);
}

function missingRuntimeGuidance(managers) {
  if (managers.length === 0)
    return 'No supported Node version manager was found. Install fnm, then run `fnm install 24` and rerun setup. Setup will not alter project pins or shell profiles.';
  const commands = managers
    .map(manager => `${manager.manager}: ${manager.repairCommand}`)
    .join('; ');
  return `No compatible installed Node was found. Install Node 24 LTS with one detected manager (${commands}), then rerun setup. Setup will not alter project pins or shell profiles.`;
}

async function managerCommand(name, roots, environment, platform) {
  const extensions = platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  const rooted = roots.flatMap(root => [
    ...extensions.map(extension => path.join(root, 'bin', `${name}${extension}`)),
    ...extensions.map(extension => path.join(root, `${name}${extension}`)),
  ]);
  return firstAccessible([...rooted, ...commandCandidatesOnPath(name, environment, platform)]);
}

function commandCandidatesOnPath(name, environment, platform) {
  const directories = (environment.PATH ?? '').split(path.delimiter).filter(Boolean);
  const extensions = platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  return directories.flatMap(directory =>
    extensions.map(extension => path.join(directory, `${name}${extension}`)),
  );
}

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean))];
}

async function firstAccessible(candidates) {
  const checks = await Promise.all(
    candidates.map(async candidate => {
      try {
        await access(candidate);
        return candidate;
      } catch {
        return undefined;
      }
    }),
  );
  return checks.find(Boolean);
}

async function resolveAlternativeRuntimes(options, environment = process.env) {
  return {
    bun: await resolveAlternativeRuntime('bun', options.bun, environment),
    deno: await resolveAlternativeRuntime('deno', options.deno, environment),
  };
}

async function resolveAlternativeRuntime(name, override, environment) {
  const requested =
    override === undefined
      ? await firstAccessible(commandCandidatesOnPath(name, environment, process.platform))
      : path.resolve(override);
  if (requested === undefined) return undefined;
  try {
    return await realpath(requested);
  } catch (error) {
    if (override === undefined) return undefined;
    throw new Error(`Could not resolve the requested ${name} executable ${requested}.`, {
      cause: error,
    });
  }
}

async function durableLaunch(runtime, installation, options = {}) {
  const selector = launcherSelectorSource({
    alternatives: options.alternatives ?? {},
    entry: installation.entry,
    node: runtime.executable,
    packageVersion: options.version,
    repairCommand: runtime.repairCommand ?? 'fnm install 24',
  });
  const selectorDigest = createHash('sha256').update(selector).digest('hex').slice(0, 24);
  const selectorPath = path.join(installation.directory, `frontier-select-${selectorDigest}.cjs`);
  await writeImmutable(selectorPath, selector);
  const contents =
    process.platform === 'win32'
      ? windowsLaunchWrapper(runtime, selectorPath)
      : posixLaunchWrapper(runtime, selectorPath);
  const digest = createHash('sha256').update(contents).digest('hex').slice(0, 24);
  const wrapper = path.join(
    installation.directory,
    `frontier-launch-${digest}${process.platform === 'win32' ? '.cmd' : ''}`,
  );
  // A preview must never redirect a launcher already named by saved configuration.
  await writeImmutable(wrapper, contents);
  if (process.platform !== 'win32') await chmod(wrapper, 0o755);
  return { command: wrapper, args: [] };
}

async function writeImmutable(target, contents) {
  try {
    await writeFile(target, contents, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST' || (await readFile(target, 'utf8')) !== contents) throw error;
  }
}

function posixLaunchWrapper(runtime, selector) {
  const repair = runtime.repairCommand ?? 'fnm install 24';
  return `#!/bin/sh
if [ ! -x ${shellQuote(runtime.executable)} ]; then
  printf '%s\\n' ${shellQuote(`FrontierMCP cannot find its configured Node runtime: ${runtime.executable}`)} >&2
  printf '%s\\n' ${shellQuote(`Repair it with ${repair}, then rerun FrontierMCP setup.`)} >&2
  exit 127
fi
exec ${shellQuote(runtime.executable)} ${shellQuote(selector)} "$@"
`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function windowsLaunchWrapper(runtime, selector) {
  const node = windowsBatchQuote(runtime.executable);
  const quotedSelector = windowsBatchQuote(selector);
  const repair = runtime.repairCommand ?? 'fnm install 24';
  return `@echo off
setlocal DisableDelayedExpansion
if not exist ${node} (
  >&2 echo FrontierMCP cannot find its configured Node runtime: ${windowsBatchText(runtime.executable)}
  >&2 echo Repair it with ${windowsBatchText(repair)}, then rerun FrontierMCP setup.
  exit /b 127
)
${node} ${quotedSelector} %*
exit /b %ERRORLEVEL%
`;
}

function launcherSelectorSource(configuration) {
  return `'use strict';
const { spawn, spawnSync } = require('node:child_process');
const { existsSync, readFileSync, realpathSync, statSync } = require('node:fs');
const path = require('node:path');
const configuration = ${JSON.stringify(configuration)};

const choice = chooseRuntime();
if (choice.message) process.stderr.write(\`FrontierMCP: \${choice.message}\\n\`);
const child = spawn(choice.command, choice.args.concat(process.argv.slice(2)), {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', error => {
  process.stderr.write(\`FrontierMCP could not start \${choice.runtime}: \${error.message}\\n\`);
  process.exitCode = 127;
});
child.on('exit', (code, signal) => {
  if (code !== null && code !== 0 && choice.runtime !== 'configured Node') {
    process.stderr.write(\`FrontierMCP: the \${choice.runtime} npm launcher exited \${code}; check that the pinned package is cached or the registry is reachable\\n\`);
  }
  process.exitCode = code ?? (signal ? 1 : 0);
});

function chooseRuntime() {
  const node = {
    runtime: 'configured Node',
    command: configuration.node,
    args: [configuration.entry],
  };
  const requested = process.env.FRONTIER_RUNTIME?.toLowerCase();
  if (requested !== undefined && !['node', 'bun', 'deno'].includes(requested)) {
    return fallback(node, \`FRONTIER_RUNTIME=\${requested} is invalid; expected node, bun, or deno; using configured Node\`);
  }
  if (requested === 'node') return node;

  const workspace = resolveLaunchWorkspace(process.cwd());
  if (workspace === undefined && requested === undefined) {
    return fallback(node, 'no launch workspace marker was found; using configured Node');
  }
  const markers = workspace === undefined ? { bun: false, deno: false } : findMarkers(process.cwd(), workspace);
  let selected = requested;
  if (selected === undefined) {
    if (markers.bun && markers.deno) {
      return fallback(node, 'both Bun and Deno markers were found; using configured Node unless FRONTIER_RUNTIME chooses one');
    }
    if (markers.bun) selected = 'bun';
    else if (markers.deno) selected = 'deno';
    else return node;
  }
  return alternative(selected, node);
}

function alternative(runtime, node) {
  if (configuration.packageVersion !== '0.3.1' || process.platform !== 'darwin' || process.arch !== 'arm64') {
    return fallback(node, \`\${runtimeName(runtime)} is not verified for frontier-mcp@\${configuration.packageVersion} on \${process.platform}/\${process.arch}; using configured Node\`);
  }
  const executable = configuration.alternatives[runtime];
  if (!executable || !existsSync(executable)) {
    return fallback(node, \`\${runtimeName(runtime)} was selected but no saved executable is available; using configured Node\`);
  }
  const probe = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 3000 });
  const output = \`\${probe.stdout ?? ''} \${probe.stderr ?? ''}\`;
  const version = runtime === 'bun'
    ? /(?:^|\\s)(\\d+\\.\\d+\\.\\d+)(?:\\s|$)/.exec(output)?.[1]
    : /(?:^|\\s)deno\\s+(\\d+\\.\\d+\\.\\d+)(?:\\s|$)/i.exec(output)?.[1];
  const expected = runtime === 'bun' ? '1.3.14' : '2.9.6';
  if (probe.status !== 0 || version !== expected) {
    return fallback(node, \`\${runtimeName(runtime)} \${version ?? 'with an unreadable version'} is not verified (expected \${expected}); using configured Node\`);
  }
  if (runtime === 'bun') {
    return {
      runtime: 'Bun',
      command: executable,
      args: ['x', '--bun', \`frontier-mcp@\${configuration.packageVersion}\`],
    };
  }
  return {
    runtime: 'Deno',
    command: executable,
    args: [
      'run',
      '--no-config',
      '--no-lock',
      '--node-modules-dir=none',
      '--no-prompt',
      '--allow-read',
      '--allow-write',
      '--allow-env',
      \`npm:frontier-mcp@\${configuration.packageVersion}\`,
    ],
  };
}

function resolveLaunchWorkspace(start) {
  let current;
  try {
    current = realpathSync(start);
  } catch {
    return undefined;
  }
  while (true) {
    if (isDirectory(path.join(current, '.scratch')) || existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function findMarkers(start, workspace) {
  let current = realpathSync(start);
  const found = { bun: false, deno: false };
  while (true) {
    found.bun ||= existsSync(path.join(current, 'bun.lock')) || existsSync(path.join(current, 'bun.lockb')) || hasBunPackageManager(current);
    found.deno ||= ['deno.json', 'deno.jsonc', 'deno.lock'].some(name => existsSync(path.join(current, name)));
    if (current === workspace) return found;
    const parent = path.dirname(current);
    if (parent === current || !isWithin(parent, workspace)) return found;
    current = parent;
  }
}

function hasBunPackageManager(directory) {
  try {
    const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
    return typeof manifest.packageManager === 'string' && manifest.packageManager.startsWith('bun@');
  } catch {
    return false;
  }
}

function isWithin(candidate, workspace) {
  const relative = path.relative(workspace, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function isDirectory(target) {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function runtimeName(runtime) {
  return runtime === 'bun' ? 'Bun' : 'Deno';
}

function fallback(node, message) {
  return { ...node, message };
}
`;
}

function windowsBatchQuote(value) {
  // Metacharacters are literal within quotes; carets here would change the path.
  // Percent expansion still occurs in batch files, even within quotes.
  if (/["\r\n]/.test(value)) throw new Error('Invalid Windows launcher path.');
  return `"${String(value).replace(/%/g, '%%')}"`;
}

function windowsBatchText(value) {
  return String(value)
    .replace(/\^/g, '^^')
    .replace(/%/g, '%%')
    .replace(/&/g, '^&')
    .replace(/\|/g, '^|')
    .replace(/</g, '^<')
    .replace(/>/g, '^>')
    .replace(/\(/g, '^(')
    .replace(/\)/g, '^)');
}

async function findOrInstall(runtime, version) {
  const root = path.join(dataRoot(), 'frontier-mcp', version);
  await mkdir(root, { recursive: true });
  const existing = await verifiedInstallation(root, runtime);
  if (existing !== undefined) return existing;

  // pnpm uses absolute directory junctions on Windows. Installing under one
  // parent and renaming that parent leaves those junctions aimed at the old
  // path, so create the unique immutable destination before pnpm runs.
  const destination = await mkdtemp(path.join(root, 'installed-'));
  try {
    await installPackage(destination, runtime, version);
    const entry = packageEntry(destination);
    await verifyLaunch({ command: runtime.executable, args: [entry] });
    return { directory: destination, entry, reused: false };
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}

async function verifiedInstallation(root, runtime) {
  const entries = await readdir(root, { withFileTypes: true });
  const candidates = entries
    .filter(candidate => candidate.isDirectory() && candidate.name.startsWith('installed-'))
    .map(candidate => path.join(root, candidate.name));
  return findVerifiedInstallation(candidates, runtime);
}

async function findVerifiedInstallation(candidates, runtime, index = 0) {
  const directory = candidates[index];
  if (directory === undefined) return undefined;
  const entry = packageEntry(directory);
  try {
    const manifest = JSON.parse(
      await readFile(path.join(directory, 'node_modules', PACKAGE, 'package.json'), 'utf8'),
    );
    const expectedVersion = path.basename(path.dirname(directory));
    if (manifest.name !== PACKAGE || manifest.version !== expectedVersion) {
      throw new Error('The installed package does not match its pinned directory.');
    }
    await stat(entry);
    await verifyLaunch({ command: runtime.executable, args: [entry] });
    return { directory, entry, reused: true };
  } catch {
    // An interrupted or manually altered installation stays untouched. A new
    // immutable installation will be staged beside it instead.
    return findVerifiedInstallation(candidates, runtime, index + 1);
  }
}

function packageEntry(directory) {
  return path.join(directory, 'node_modules', PACKAGE, 'dist', 'bin.js');
}

async function installPackage(directory, runtime, version) {
  const pnpm = await selectedPnpm(runtime);
  await writeFile(path.join(directory, 'package.json'), '{"private":true}\n', 'utf8');
  await run(
    pnpm.command,
    [
      ...pnpm.args,
      '--dir',
      directory,
      'add',
      '--prod',
      '--ignore-scripts',
      '--save-exact',
      `${PACKAGE}@${version}`,
    ],
    { cwd: directory, env: selectedRuntimeEnvironment(runtime), label: 'pnpm install' },
  );
}

async function selectedPnpm(runtime) {
  const nodeDirectory = path.dirname(runtime.executable);
  const moduleDirectories = [
    path.resolve(nodeDirectory, '..', 'lib', 'node_modules'),
    path.join(nodeDirectory, 'node_modules'),
  ];
  const candidates = moduleDirectories.flatMap(moduleDirectory => [
    {
      args: [path.join(moduleDirectory, 'pnpm', 'bin', 'pnpm.cjs')],
      script: path.join(moduleDirectory, 'pnpm', 'bin', 'pnpm.cjs'),
    },
    {
      args: [path.join(moduleDirectory, 'corepack', 'dist', 'corepack.js'), 'pnpm@10'],
      script: path.join(moduleDirectory, 'corepack', 'dist', 'corepack.js'),
    },
  ]);
  return firstWorkingPnpm(candidates, runtime);
}

async function firstWorkingPnpm(candidates, runtime, index = 0) {
  const candidate = candidates[index];
  if (candidate === undefined) {
    throw new Error(
      `No usable pnpm or Corepack installation accompanies ${runtime.executable}. Install pnpm with that Node's Corepack, then rerun setup. See https://pnpm.io/installation.`,
    );
  }
  try {
    await access(candidate.script);
    await run(runtime.executable, [...candidate.args, '--version'], {
      cwd: os.tmpdir(),
      env: selectedRuntimeEnvironment(runtime),
      capture: true,
    });
    return { command: runtime.executable, args: candidate.args };
  } catch {
    return firstWorkingPnpm(candidates, runtime, index + 1);
  }
}

function selectedRuntimeEnvironment(runtime) {
  const nodeDirectory = path.dirname(runtime.executable);
  return {
    ...process.env,
    COREPACK_ENABLE_AUTO_PIN: '0',
    PATH: `${nodeDirectory}${path.delimiter}${process.env.PATH ?? ''}`,
  };
}

function dataRoot() {
  const home = homeDirectory();
  if (process.platform === 'win32')
    return process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support');
  return process.env.XDG_DATA_HOME ?? path.join(home, '.local', 'share');
}

function homeDirectory(environment = process.env) {
  return environment.HOME ?? environment.USERPROFILE ?? os.homedir();
}

async function verifyLaunch(launch, options = {}) {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'frontier-setup-check-'));
  let verificationError;
  try {
    await protocolCheck(launch, fixture, undefined, options);
  } catch (error) {
    verificationError = error;
  }
  try {
    // Windows may release the launcher's working-directory handle just after
    // the process closes. This directory is disposable, so let Node's recursive
    // remover retry only its documented transient filesystem errors.
    await rm(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (cleanupError) {
    if (verificationError === undefined) throw cleanupError;
    verificationError.message += `\nPreflight cleanup also failed: ${cleanupError.message}`;
  }
  if (verificationError !== undefined) throw verificationError;
}

function protocolCheck(
  launch,
  cwd,
  environment = minimalLaunchEnvironment(launch.command),
  options = {},
) {
  return new Promise((resolve, reject) => {
    const batch = process.platform === 'win32' && launch.command.endsWith('.cmd');
    if (batch && launch.args.length !== 0)
      throw new Error('Setup batch launch takes no arguments.');
    const command = batch
      ? path.join(environment.SystemRoot ?? environment.SYSTEMROOT, 'System32', 'cmd.exe')
      : launch.command;
    // Match the batch launch used by MCP clients with cross-spawn. The setup
    // wrapper takes no arguments, so only its literal filename needs escaping.
    const args = batch
      ? ['/d', '/s', '/c', `"${launch.command.replace(/([()\][%!^"`<>&|;, *?])/g, '^$1')}"`]
      : launch.args;
    const child = spawn(command, args, {
      cwd,
      env: environment,
      windowsVerbatimArguments: batch,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    let stdout = '';
    let settled = false;
    let initialized = false;
    const timeout = setTimeout(
      () =>
        finish(new Error(`${options.label ?? 'MCP launch'} timed out waiting for the handshake.`)),
      options.timeout ?? REQUEST_TIMEOUT_MS,
    );

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
      let newline;
      while ((newline = stdout.indexOf('\n')) !== -1) {
        const line = stdout.slice(0, newline).trim();
        stdout = stdout.slice(newline + 1);
        if (line.length === 0) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          finish(new Error(`Server wrote non-protocol output to stdout: ${line.slice(0, 200)}`));
          return;
        }
        if (message.id === 1) {
          if (message.error !== undefined) {
            finish(new Error(`MCP initialization failed: ${JSON.stringify(message.error)}`));
            return;
          }
          initialized = true;
          send(child, { jsonrpc: '2.0', method: 'notifications/initialized' });
          send(child, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
        } else if (message.id === 2) {
          const names = (message.result?.tools ?? []).map(tool => tool.name);
          if (
            !initialized ||
            names.length !== TOOL_NAMES.length ||
            !TOOL_NAMES.every(name => names.includes(name))
          ) {
            finish(new Error('MCP tools/list did not return FrontierMCP’s eight tools.'));
            return;
          }
          finish();
        }
      }
    });
    child.on('error', error =>
      finish(new Error(`Could not launch ${launch.command}: ${error.message}`, { cause: error })),
    );
    child.stdin.on('error', error => {
      if (!settled)
        finish(
          new Error(`Could not write to ${launch.command}: ${error.message}`, { cause: error }),
        );
    });
    child.on('exit', code => {
      if (!settled) finish(new Error(`Server exited before verification (code ${code}).`));
    });
    send(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'frontier-setup', version: '1' },
      },
    });

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      let finishError = error;
      let completed = false;
      let forceClose;
      child.stdin.end();
      const shutdown = setTimeout(() => {
        finishError ??= new Error(
          `${options.label ?? 'MCP launch'} did not exit after its protocol input closed.`,
        );
        void forceProcessTree(child, environment, options.forceTimeout ?? 2000).then(() => {
          forceClose = setTimeout(() => complete(finishError), 250);
        });
      }, options.shutdownTimeout ?? 2000);
      child.once('close', () => {
        complete(finishError);
      });

      function complete(resultError) {
        if (completed) return;
        completed = true;
        clearTimeout(shutdown);
        clearTimeout(forceClose);
        const detail = stderr.trim();
        if (resultError !== undefined) {
          reject(
            new Error(
              detail ? `${resultError.message}\nServer stderr: ${detail}` : resultError.message,
            ),
          );
        } else resolve({ stderr: detail });
      }
    }
  });
}

function forceProcessTree(child, environment, timeout) {
  if (process.platform !== 'win32') {
    child.kill('SIGKILL');
    return Promise.resolve();
  }
  if (child.pid === undefined) return Promise.resolve();

  return new Promise(resolve => {
    const systemRoot = environment.SystemRoot ?? environment.SYSTEMROOT ?? 'C:\\Windows';
    const killer = spawn(
      path.join(systemRoot, 'System32', 'taskkill.exe'),
      ['/pid', String(child.pid), '/t', '/f'],
      { stdio: 'ignore', windowsHide: true },
    );
    let done = false;
    const timer = setTimeout(() => {
      killer.kill();
      complete();
    }, timeout);
    killer.on('error', complete);
    killer.on('close', complete);

    function complete() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    }
  });
}

function minimalLaunchEnvironment(command) {
  const environment = { PATH: path.dirname(command) };
  for (const name of ['HOME', 'USERPROFILE', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP']) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  return environment;
}

function send(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function cursorConfigPath() {
  return path.join(homeDirectory(), '.cursor', 'mcp.json');
}

async function prepareConfig(target, launch) {
  let source = '';
  let config = {};
  let hasExistingFile = false;
  try {
    source = await readFile(target, 'utf8');
    hasExistingFile = true;
    config = JSON.parse(source);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Refusing to replace invalid Cursor JSON at ${target}: ${error.message}`, {
        cause: error,
      });
    }
  }
  if (!isObject(config) || (config.mcpServers !== undefined && !isObject(config.mcpServers))) {
    throw new Error(`Refusing to replace invalid Cursor configuration at ${target}.`);
  }
  const servers = config.mcpServers ?? {};
  const existing = servers[SERVER];
  const desired = { command: launch.command, args: launch.args };
  const identical = JSON.stringify(existing) === JSON.stringify(desired);
  const next = { ...config, mcpServers: { ...servers, [SERVER]: desired } };
  return { existing, fingerprint: source, hasExistingFile, identical, next, desired };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function printPreview({ runtime, release, installation, target, preview, client }) {
  process.stdout.write(`Runtime: ${runtime.executable} (Node ${formatVersion(runtime.version)})\n`);
  process.stdout.write(
    `Package: ${PACKAGE}@${release.version} (requires ${release.engines.node})\n`,
  );
  process.stdout.write(
    `Installation: ${installation.directory}${installation.reused ? ' (reused after verification)' : ''}\n`,
  );
  process.stdout.write(
    `${client === 'cursor' ? 'Cursor user config' : 'Manual client entry'}: ${target}\n`,
  );
  process.stdout.write(
    `${JSON.stringify({ mcpServers: { [SERVER]: preview.desired } }, null, 2)}\n`,
  );
  if (client === 'cursor' && !preview.identical && preview.existing !== undefined) {
    process.stdout.write('An existing frontier entry needs --replace before --apply.\n');
  }
  if (client === 'cursor')
    process.stdout.write('Preview only. Add --apply to write this Cursor entry.\n');
}

async function applyConfig(target, preview, replace, afterPreparation) {
  const guard = `${target}.frontier-setup.lock`;
  await mkdir(path.dirname(target), { recursive: true });
  let handle;
  try {
    handle = await open(guard, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(
        `Another FrontierMCP setup is applying ${target}. Try again when it finishes.`,
        { cause: error },
      );
    throw error;
  }
  let temporary;
  try {
    if (preview.existing !== undefined && !preview.identical && !replace) {
      throw new Error(
        'Cursor already has a different frontier entry. Review the preview and rerun with --replace.',
      );
    }
    if (preview.identical) {
      await assertConfigUnchanged(target, preview.fingerprint);
      return;
    }
    if (preview.hasExistingFile) {
      const backup = `${target}.frontier-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      await copyFile(target, backup);
      process.stdout.write(`Backup: ${backup}\n`);
    }
    temporary = `${target}.frontier-setup-${process.pid}-${Date.now()}`;
    await writeFile(temporary, `${JSON.stringify(preview.next, null, 2)}\n`, 'utf8');
    if (afterPreparation !== undefined) await afterPreparation();
    await assertConfigUnchanged(target, preview.fingerprint);
    await rename(temporary, target);
  } finally {
    if (temporary !== undefined) await rm(temporary, { force: true });
    await handle.close();
    await rm(guard, { force: true });
  }
}

async function assertConfigUnchanged(target, fingerprint) {
  let current = '';
  try {
    current = await readFile(target, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (current !== fingerprint) {
    throw new Error(`Cursor configuration changed since preview; refusing to overwrite ${target}.`);
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: options.timeout,
    });
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
    child.on('error', error => reject(error));
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else
        reject(
          new Error(
            `${options.label ?? command} exited ${code}: ${stderr.trim() || stdout.trim()}`,
          ),
        );
    });
  });
}

// The check script imports these private helpers to force a fingerprint race
// and a broken protocol without adding command-line switches for test cases.
module.exports = {
  testing: {
    applyConfig,
    cursorConfigPath,
    discoverManagedRuntimes,
    durableLaunch,
    prepareConfig,
    protocolCheck,
    resolveAlternativeRuntimes,
    selectManagedRuntime,
    selectRuntime,
    stableRuntimePath,
    supportsRange,
    verifyLaunch,
    windowsLaunchWrapper,
  },
};
