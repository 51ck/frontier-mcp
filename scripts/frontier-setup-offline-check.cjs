#!/usr/bin/env node
'use strict';

// The setup cases that need no registry and no real client: the doctor and
// Claude Code apply against a stand-in `claude`. CI runs this on every OS;
// symlink and shell stand-in cases are POSIX-only.

const assert = require('node:assert/strict');
const { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { testing } = require('./frontier-setup.cjs');

const POSIX = process.platform !== 'win32';

main().catch(error => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});

async function main() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'frontier-setup-offline-'));
  try {
    windowsShimCheck();
    await doctorCheck(temporary);
    if (POSIX) await claudeApplyCheck(temporary);
    process.stdout.write(
      `Frontier setup offline check passed on ${process.platform}${POSIX ? '' : ' (POSIX-only cases skipped)'}.\n`,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function windowsShimCheck() {
  const desired = { type: 'stdio', command: "C:\\it's\\frontier.cmd", args: [] };
  for (const shim of ['C:\\npm\\claude.cmd', 'C:\\npm\\CLAUDE.BAT']) {
    assert.throws(
      () => testing.assertSpawnableClaude(shim, desired, 'win32'),
      error =>
        /--claude pointing at claude\.exe/.test(error.message) &&
        error.message.includes(
          `claude mcp add-json --scope user frontier '${JSON.stringify(desired).replace(/'/g, "''")}'`,
        ),
    );
  }
  testing.assertSpawnableClaude('C:\\bin\\claude.exe', desired, 'win32');
  testing.assertSpawnableClaude('/usr/bin/claude.cmd', desired, 'linux');
}

async function doctorCheck(temporary) {
  const home = path.join(temporary, 'doctor home');
  const bin = path.join(temporary, 'doctor bin');
  await mkdir(path.join(home, '.codex'), { recursive: true });
  await mkdir(bin, { recursive: true });
  await writeFile(path.join(bin, POSIX ? 'claude' : 'claude.exe'), '', 'utf8');
  const environment = { HOME: home, USERPROFILE: home, PATH: bin };
  const entry = { command: 'npx', args: ['-y', 'frontier-mcp@0.5.0'] };
  const declaring = JSON.stringify({ mcpServers: { frontier: entry } });
  let index = 0;
  async function repository(files) {
    const root = path.join(temporary, `repo ${index++}`);
    await mkdir(path.join(root, '.git'), { recursive: true });
    await Promise.all(
      Object.entries(files).map(async ([relative, contents]) => {
        const file = path.join(root, relative);
        await mkdir(path.dirname(file), { recursive: true });
        if (typeof contents === 'string') await writeFile(file, contents, 'utf8');
        else await symlink(contents.link, file);
      }),
    );
    return root;
  }
  const run = root => testing.doctor(root, environment, process.platform);

  // Only .agents/mcp.json, resolved from a nested directory.
  const agentsOnly = await repository({ '.agents/mcp.json': declaring });
  const nested = path.join(agentsOnly, 'packages', 'ui');
  await mkdir(nested, { recursive: true });
  let report = await testing.doctor(nested, environment, process.platform);
  assert.equal(report.failed, true, report.text);
  assert.match(report.text, new RegExp(`Repository: ${escape(agentsOnly)}`));
  assert.match(report.text, /declares frontier; Claude Code and Cursor do not read this path/);
  assert.match(report.text, /Claude Code \(installed\): no file checked here declares frontier/);
  assert.match(report.text, /Codex project scope: not verified/);
  assert.doesNotMatch(report.text, /read by none/);

  // A real .mcp.json copy beside .agents/mcp.json is fine for Claude Code.
  report = await run(await repository({ '.agents/mcp.json': declaring, '.mcp.json': declaring }));
  assert.equal(report.failed, false, report.text);
  assert.match(report.text, /Claude Code \(installed\): frontier declared in project scope/);

  // An unparseable .agents/mcp.json gets its own line.
  report = await run(await repository({ '.agents/mcp.json': '{', '.mcp.json': declaring }));
  assert.match(report.text, /\.agents[\\/]mcp\.json — invalid JSON/);
  assert.equal(report.failed, false, report.text);

  // Another key running frontier-mcp is named, and is not a frontier declaration.
  report = await run(
    await repository({ '.mcp.json': JSON.stringify({ mcpServers: { tracker: entry } }) }),
  );
  assert.match(report.text, /runs frontier-mcp under key "tracker", not "frontier"/);
  assert.equal(report.failed, true, report.text);

  // An invalid user config a client reads counts, even with no repo entry.
  await writeFile(path.join(home, '.claude.json'), '{', 'utf8');
  report = await run(await repository({}));
  assert.match(report.text, /\.claude\.json — invalid JSON/);
  assert.equal(report.failed, true, report.text);
  // Codex is reported, never judged.
  await writeFile(path.join(home, '.claude.json'), '{}', 'utf8');
  await writeFile(
    path.join(home, '.codex', 'config.toml'),
    '[mcp_servers.frontier]\ncommand = "npx"\n',
  );
  report = await run(await repository({ '.agents/mcp.json': declaring, '.mcp.json': declaring }));
  assert.match(
    report.text,
    /Codex \(not on PATH\): frontier declared in user scope \(user scope only; project scope not verified\)/,
  );

  // No repo-level declaration and nothing broken is not a failure.
  report = await run(await repository({}));
  assert.equal(report.failed, false, report.text);
  await rm(path.join(home, '.codex', 'config.toml'));

  if (!POSIX) return;
  // .cursor/mcp.json links to .agents/mcp.json; Claude Code gets nothing.
  report = await run(
    await repository({
      '.agents/mcp.json': declaring,
      '.cursor/mcp.json': { link: path.join('..', '.agents', 'mcp.json') },
    }),
  );
  assert.equal(report.failed, true, report.text);
  assert.deepEqual(report.failing, ['Claude Code']);
  assert.match(report.text, /reached through the symlink at .*\.cursor[\\/]mcp\.json/);

  // .mcp.json links to .agents/mcp.json: Claude Code reads it.
  const linked = await repository({
    '.agents/mcp.json': declaring,
    '.mcp.json': { link: path.join('.agents', 'mcp.json') },
  });
  report = await run(linked);
  assert.equal(report.failed, false, report.text);
  assert.match(report.text, /reached through the symlink at .*\.mcp\.json/);
  assert.match(report.text, /Pending approval/);

  // A dangling link is a broken symlink, not absent.
  report = await run(await repository({ '.mcp.json': { link: 'missing.json' } }));
  assert.match(report.text, /\.mcp\.json \(-> missing\.json\) — broken symlink/);
  assert.equal(report.failed, true, report.text);

  // Local scope is keyed by the project path.
  await writeFile(
    path.join(home, '.claude.json'),
    JSON.stringify({ projects: { [linked]: { mcpServers: { frontier: entry } } } }),
  );
  report = await run(linked);
  assert.match(report.text, /Claude Code \(installed\): frontier declared in project, local scope/);
  await rm(path.join(home, '.claude.json'));
}

// A stand-in `claude` that edits ~/.claude.json the way the real CLI's
// add-json and remove do for user scope, and logs every invocation.
async function claudeApplyCheck(temporary) {
  const home = path.join(temporary, 'apply home');
  const directory = path.join(temporary, 'fake claude');
  await mkdir(home, { recursive: true });
  await mkdir(directory, { recursive: true });
  const script = path.join(directory, 'claude.js');
  const log = path.join(directory, 'calls.log');
  await writeFile(
    script,
    `const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
const target = require('node:path').join(process.env.HOME, '.claude.json');
let config = {};
try { config = JSON.parse(fs.readFileSync(target, 'utf8')); } catch {}
config.mcpServers = config.mcpServers || {};
if (args[1] === 'add-json') {
  if (JSON.parse(args[5]).command === process.env.FRONTIER_FAKE_CLAUDE_REJECT) {
    process.stderr.write('rejected'); process.exit(1);
  }
  if (config.mcpServers[args[4]]) { process.stderr.write('exists'); process.exit(1); }
  config.mcpServers[args[4]] = JSON.parse(args[5]);
} else if (args[1] === 'remove') delete config.mcpServers[args[4]];
fs.writeFileSync(target, JSON.stringify(config));
`,
    'utf8',
  );
  const claude = path.join(directory, 'claude');
  await writeFile(claude, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`, 'utf8');
  await chmod(claude, 0o755);
  const target = path.join(home, '.claude.json');
  const previous = { type: 'stdio', command: 'npx', args: ['-y', 'frontier-mcp@0.4.0'] };
  await writeFile(
    target,
    JSON.stringify({ mcpServers: { other: { command: 'other' }, frontier: previous } }),
  );
  const launch = { command: '/opt/frontier/launch', args: [] };
  const saved = { HOME: process.env.HOME, reject: process.env.FRONTIER_FAKE_CLAUDE_REJECT };
  process.env.HOME = home;
  try {
    let preview = await testing.prepareClaudeCode(target, launch);
    await assert.rejects(testing.applyClaudeCode(claude, target, preview, false), /--replace/);

    process.env.FRONTIER_FAKE_CLAUDE_REJECT = launch.command;
    await assert.rejects(
      testing.applyClaudeCode(claude, target, preview, true),
      error =>
        /rejected/.test(error.message) &&
        /already been removed with `claude mcp remove`/.test(error.message) &&
        /the previous entry was re-registered/.test(error.message) &&
        /Backup of .*\.claude\.json\.frontier-backup-/.test(error.message),
    );
    let config = JSON.parse(await readFile(target, 'utf8'));
    assert.deepEqual(config.mcpServers.frontier, previous);
    assert.deepEqual(config.mcpServers.other, { command: 'other' });

    delete process.env.FRONTIER_FAKE_CLAUDE_REJECT;
    preview = await testing.prepareClaudeCode(target, launch);
    await testing.applyClaudeCode(claude, target, preview, true);
    config = JSON.parse(await readFile(target, 'utf8'));
    assert.deepEqual(config.mcpServers.frontier, { type: 'stdio', ...launch });
    const calls = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    assert.deepEqual(calls[calls.length - 2], ['mcp', 'remove', '--scope', 'user', 'frontier']);

    preview = await testing.prepareClaudeCode(target, launch);
    assert.equal(preview.identical, true);
    await testing.applyClaudeCode(claude, target, preview, false);
    assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, calls.length);
  } finally {
    if (saved.HOME === undefined) delete process.env.HOME;
    else process.env.HOME = saved.HOME;
    if (saved.reject === undefined) delete process.env.FRONTIER_FAKE_CLAUDE_REJECT;
    else process.env.FRONTIER_FAKE_CLAUDE_REJECT = saved.reject;
  }
}

function escape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
