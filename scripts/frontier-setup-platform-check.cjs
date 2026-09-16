#!/usr/bin/env node
'use strict';

// Run against a real fnm installation provisioned before this check. Unlike the
// shell fixtures, this exercises each host OS's actual executable and launcher.
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { mkdir, mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { testing } = require('./frontier-setup.cjs');
const execute = promisify(execFile);
const setup = path.join(__dirname, 'frontier-setup.cjs');

main().catch(error => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});

async function main() {
  const {
    FRONTIER_NODE16: node16,
    FRONTIER_NODE24: node24,
    FRONTIER_FNM: fnm,
    FNM_DIR,
  } = process.env;
  assert.ok(node16 && node24 && fnm && FNM_DIR, 'Supply real fnm and installed Node 16/24 paths');
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'frontier-real-manager-'));
  try {
    const home = path.join(temporary, 'home with spaces');
    const project = path.join(temporary, 'project Node 16');
    await mkdir(project, { recursive: true });
    const pins = { '.nvmrc': '16.20.2\n', 'package.json': '{"engines":{"node":"16.20.2"}}\n' };
    await Promise.all(
      Object.entries(pins).map(([name, contents]) => writeFile(path.join(project, name), contents)),
    );
    const environment = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      XDG_DATA_HOME: path.join(home, 'data'),
      LOCALAPPDATA: path.join(home, 'local'),
      APPDATA: path.join(home, 'roaming'),
      PATH: [path.dirname(node16), path.dirname(fnm)].join(path.delimiter),
      FNM_DIR,
    };
    delete environment.FNM_MULTISHELL_PATH;
    for (const variable of [
      'NVM_DIR',
      'NVM_HOME',
      'VOLTA_HOME',
      'ASDF_DIR',
      'ASDF_DATA_DIR',
      'MISE_DATA_DIR',
    ]) {
      environment[variable] = path.join(home, 'absent', variable);
    }
    const options = { env: environment, cwd: project, timeout: 180000 };
    const before = await execute(fnm, ['list'], options);
    assert.match((await execute(node16, ['--version'], options)).stdout, /v16\.20\.2/);
    const selected = await testing.selectRuntime(undefined, '^24.15.0', {
      currentExecutable: node16,
      environment,
      platform: process.platform,
    });
    assert.equal(selected.manager, 'fnm');
    assert.equal(selected.executable, await testing.stableRuntimePath(node24));
    const args = [setup, '--version', process.env.FRONTIER_SETUP_RELEASE ?? '0.4.0', '--apply'];
    const applied = await execute(node16, args, options);
    const target = path.join(home, '.cursor', 'mcp.json');
    const config = await readFile(target, 'utf8');
    const launch = JSON.parse(config).mcpServers.frontier;
    assert.equal(path.isAbsolute(launch.command), true);
    assert.deepEqual(launch.args, []);
    await testing.protocolCheck(launch, project, { ...environment, PATH: path.dirname(node16) });
    await execute(node16, args, options);
    assert.equal(await readFile(target, 'utf8'), config);
    assert.equal((await execute(fnm, ['list'], options)).stdout, before.stdout);
    await Promise.all(
      Object.entries(pins).map(async ([name, contents]) => {
        assert.equal(await readFile(path.join(project, name), 'utf8'), contents);
      }),
    );
    process.stdout.write(
      `Real fnm setup passed on ${process.platform}/${process.arch}.\n${applied.stdout}`,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
