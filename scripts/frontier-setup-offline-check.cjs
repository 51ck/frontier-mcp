#!/usr/bin/env node
'use strict';

// The setup cases that need no registry and no real client: the doctor and
// Claude Code apply against a stand-in `claude`. CI runs this on every OS;
// symlink and shell stand-in cases are POSIX-only.

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} = require('node:fs/promises');
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
    if (POSIX) posixQuotingCheck();
    await doctorCheck(temporary);
    await claudeShadowCheck(temporary);
    if (POSIX) await claudeApplyCheck(temporary);
    process.stdout.write(
      `Frontier setup offline check passed on ${process.platform}${POSIX ? '' : ' (POSIX-only cases skipped)'}.\n`,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function windowsShimCheck() {
  const desired = {
    type: 'stdio',
    command: "C:\\Program Files\\it's\\frontier.cmd",
    args: ['--flag', 'a b'],
  };
  const expected =
    "claude mcp add --scope user frontier -- 'C:\\Program Files\\it''s\\frontier.cmd' '--flag' 'a b'";
  assert.equal(testing.manualClaudeCommand(desired, 'win32'), expected);
  assert.equal(
    testing.manualClaudeCommand({ command: 'C:\\Users\\O\u2019Brien\\f.cmd' }, 'win32'),
    "claude mcp add --scope user frontier -- 'C:\\Users\\O\u2019\u2019Brien\\f.cmd'",
  );
  for (const shim of ['C:\\npm\\claude.cmd', 'C:\\npm\\CLAUDE.BAT']) {
    assert.throws(
      () => testing.assertSpawnableClaude(shim, desired, 'win32'),
      error =>
        /--claude pointing at claude\.exe/.test(error.message) &&
        error.message.endsWith(`\n${expected}`),
    );
  }
  testing.assertSpawnableClaude('C:\\bin\\claude.exe', desired, 'win32');
  testing.assertSpawnableClaude('/usr/bin/claude.cmd', desired, 'linux');
}

// The printed POSIX command survives a real shell with a quote in the path.
function posixQuotingCheck() {
  const desired = { type: 'stdio', command: "/home/o'brien/frontier launch", args: ["it's"] };
  const command = testing.manualClaudeCommand(desired, 'linux');
  assert.match(command, /^claude mcp add-json --scope user frontier '/);
  const words = execFileSync('sh', ['-c', command.replace(/^claude/, "printf '%s\\n'")], {
    encoding: 'utf8',
  })
    .trimEnd()
    .split('\n');
  assert.deepEqual(words.slice(0, 5), ['mcp', 'add-json', '--scope', 'user', 'frontier']);
  assert.deepEqual(JSON.parse(words[5]), desired);
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
  assert.match(report.text, /\.claude\.json cannot be parsed; Claude Code reads it\./);
  assert.doesNotMatch(report.text, /expects frontier/);

  // A broken file of a client not on PATH never fails an installed one.
  await writeFile(path.join(home, '.claude.json'), '{}', 'utf8');
  await mkdir(path.join(home, '.cursor'), { recursive: true });
  await writeFile(path.join(home, '.cursor', 'mcp.json'), '{', 'utf8');
  report = await run(await repository({}));
  assert.match(report.text, /\.cursor[\\/]mcp\.json — invalid JSON/);
  assert.equal(report.failed, false, report.text);
  assert.doesNotMatch(report.text, /expects frontier|cannot be parsed/);
  await rm(path.join(home, '.cursor'), { recursive: true });

  // A null or empty frontier entry is not a declaration.
  const emptyEntries = await Promise.all(
    [null, {}].map(async value =>
      run(await repository({ '.mcp.json': JSON.stringify({ mcpServers: { frontier: value } }) })),
    ),
  );
  for (report of emptyEntries) {
    assert.match(report.text, /\.mcp\.json — frontier entry has no command/);
    assert.match(report.text, /\.mcp\.json: frontier entry has no command; Claude Code reads it/);
    assert.doesNotMatch(report.text, /— declares frontier/);
    assert.equal(report.failed, true, report.text);
  }
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

  // Codex also accepts an inline table under [mcp_servers] and dotted keys.
  const codexForms = {
    inlineAfterTripleQuoted:
      'mcp_servers = { a = { x = """a"b""" }, frontier = { command = "npx" } }\n',
    inlineAfterTripleLiteral:
      "mcp_servers = { a = { x = '''a'b''' }, frontier = { command = \"npx\" } }\n",
    inline: '[mcp_servers]\nother = { command = "x" }\nfrontier = { command = "npx" }\n',
    quotedInline: '[mcp_servers]\n\'frontier\' = { command = "npx" }\n',
    dotted: 'model = "o3"\nmcp_servers.frontier.command = "npx"\n',
    dottedSpaced: 'mcp_servers . "frontier" . command = "npx"\n',
    dottedUnderTable: '[mcp_servers]\nfrontier.command = "npx"\n',
    header: '# setup\n[mcp_servers.frontier] # added\ncommand = "npx"\n',
    topLevelInline: 'mcp_servers = { frontier = { command = "npx" } }\n',
    topLevelUrl:
      'mcp_servers = { other = { command = "x, }" }, "frontier" = { url = "http://x" } }\n',
    afterMultiLineString: 'notes = """\nx\n"""\n[mcp_servers.frontier]\ncommand = "npx"\n',
  };
  const codexNonForms = {
    otherTable: '[mcp_servers.frontier_old]\ncommand = "npx"\n',
    keyInOtherTable: '[profiles]\nmcp_servers.frontier.command = "npx"\n',
    keyInArrayTable: '[[profiles]]\nmcp_servers.frontier.command = "npx"\n',
    valueOnly: '[mcp_servers.other]\nargs = ["frontier"]\n',
    comment: '# [mcp_servers.frontier]\n# mcp_servers.frontier.command = "npx"\n',
    topLevelOther: 'mcp_servers = { other = { command = "npx" } }\n',
    basicMultiLine: 'notes = """\n[mcp_servers.frontier]\ncommand = "npx"\n"""\n',
    literalMultiLine: "notes = '''\nmcp_servers.frontier.command = \"npx\"\n'''\n",
    openArray: 'x = [\n  ["mcp_servers"]\n]\nfrontier.command = "npx"\n',
  };
  const codexNoCommand = {
    envOnly: '[mcp_servers.frontier.env]\nFOO = "x"\n',
    argsOnly: '[mcp_servers.frontier]\nargs = ["-y"]\n',
  };
  const codexRoot = await repository({});
  const codexReports = await Promise.all(
    Object.entries({ ...codexForms, ...codexNonForms, ...codexNoCommand }).map(
      async ([form, source]) => {
        const formHome = path.join(temporary, `codex home ${form}`);
        await mkdir(path.join(formHome, '.codex'), { recursive: true });
        await writeFile(path.join(formHome, '.codex', 'config.toml'), source);
        const formEnvironment = { ...environment, HOME: formHome, USERPROFILE: formHome };
        return [form, await testing.doctor(codexRoot, formEnvironment, process.platform)];
      },
    ),
  );
  for (const [form, { text }] of codexReports) {
    assert.match(
      text,
      form in codexForms
        ? /Codex \(not on PATH\): frontier declared in user scope/
        : /Codex \(not on PATH\): no file checked here declares frontier/,
      form,
    );
    if (form in codexNoCommand)
      assert.match(text, /config\.toml — frontier entry has no command/, form);
  }
  await rm(path.join(home, '.codex', 'config.toml'));

  // enabledMcpjsonServers naming frontier with no .mcp.json definition is named.
  const enabled = JSON.stringify({ enabledMcpjsonServers: ['other', 'frontier'] });
  const enabledRoot = await repository({
    '.claude/settings.json': enabled,
    '.claude/settings.local.json': enabled,
  });
  report = await run(enabledRoot);
  for (const name of ['settings.json', 'settings.local.json'])
    assert.match(
      report.text,
      new RegExp(
        `${escape(path.join(enabledRoot, '.claude', name))}: enabledMcpjsonServers names frontier, but no \\.mcp\\.json checked here defines it`,
      ),
    );
  report = await run(
    await repository({ '.claude/settings.json': enabled, '.mcp.json': declaring }),
  );
  assert.doesNotMatch(report.text, /enabledMcpjsonServers/);
  report = await run(
    await repository({
      '.claude/settings.json': JSON.stringify({ enabledMcpjsonServers: ['other'] }),
    }),
  );
  assert.doesNotMatch(report.text, /enabledMcpjsonServers/);
  const approved = await repository({});
  await mkdir(path.join(home, '.claude'), { recursive: true });
  await writeFile(path.join(home, '.claude', 'settings.json'), enabled);
  await writeFile(
    path.join(home, '.claude.json'),
    JSON.stringify({ projects: { [await claudeKey(approved)]: JSON.parse(enabled) } }),
  );
  report = await run(approved);
  assert.match(
    report.text,
    new RegExp(`${escape(path.join(home, '.claude', 'settings.json'))}: enabledMcpjsonServers`),
  );
  assert.match(report.text, /\.claude\.json projects\[.*\]: enabledMcpjsonServers names frontier/);
  await rm(path.join(home, '.claude'), { recursive: true });
  await writeFile(path.join(home, '.claude.json'), '{}', 'utf8');

  // A .mcp.json Claude Code reads from the launch directory, below the
  // repository root, defines frontier for the doctor as for the preview.
  const nestedRoot = await repository({
    'packages/ui/.mcp.json': declaring,
    'packages/ui/.claude/settings.local.json': enabled,
  });
  const nestedUi = path.join(nestedRoot, 'packages', 'ui');
  const nestedMcpJson = path.join(await realpath(nestedUi), '.mcp.json');
  report = await testing.doctor(nestedUi, environment, process.platform);
  assert.doesNotMatch(report.text, /enabledMcpjsonServers/);
  assert.match(
    report.text,
    new RegExp(`Claude Code project: ${escape(nestedMcpJson)} — declares frontier`),
  );
  assert.match(report.text, /Claude Code \(installed\): frontier declared in project scope/);
  assert.doesNotMatch(report.text, /packages[\\/]\.mcp\.json/);
  assert.equal(report.failed, false, report.text);
  const nestedPreview = await testing.prepareClaudeCode(
    path.join(home, '.claude.json'),
    { command: '/opt/frontier/launch', args: [] },
    nestedUi,
  );
  assert.deepEqual(nestedPreview.shadows, [{ scope: 'project', file: nestedMcpJson }]);
  report = await run(nestedRoot);
  assert.doesNotMatch(report.text, /packages[\\/]ui[\\/]\.mcp\.json/);

  // Local scope is keyed by the canonical git root of the launch directory:
  // the repository's real path from any directory inside it, a worktree's main
  // checkout, or the launch directory itself outside git.
  const localEntry = key =>
    writeFile(
      path.join(home, '.claude.json'),
      JSON.stringify({ projects: { [key]: { mcpServers: { frontier: entry } } } }),
    );
  const local = /Claude Code \(installed\): frontier declared in local scope/;
  const keyed = await repository({ '.scratch/x/issues/.keep': '' });
  const inside = path.join(keyed, 'packages', 'ui');
  await mkdir(inside, { recursive: true });
  await localEntry(await claudeKey(keyed));
  report = await testing.doctor(inside, environment, process.platform);
  assert.match(report.text, local);
  assert.match(report.text, /local: .*\.claude\.json projects\[/);
  const scratchBelowGit = path.join(keyed, 'svc');
  await mkdir(path.join(scratchBelowGit, '.scratch'), { recursive: true });
  report = await testing.doctor(scratchBelowGit, environment, process.platform);
  assert.match(report.text, local);
  await localEntry(inside);
  report = await testing.doctor(inside, environment, process.platform);
  assert.doesNotMatch(report.text, local);

  const mainCheckout = await repository({ '.git/worktrees/wt/commondir': '../..\n' });
  const worktree = path.join(temporary, 'worktree');
  await mkdir(path.join(worktree, 'inner'), { recursive: true });
  await writeFile(
    path.join(worktree, '.git'),
    `gitdir: ${path.join(mainCheckout, '.git', 'worktrees', 'wt')}\n`,
  );
  await localEntry(await claudeKey(mainCheckout));
  report = await testing.doctor(path.join(worktree, 'inner'), environment, process.platform);
  assert.match(report.text, new RegExp(`Repository: ${escape(worktree)}`));
  assert.match(report.text, local);

  const submodule = await repository({});
  await rm(path.join(submodule, '.git'), { recursive: true });
  await writeFile(path.join(submodule, '.git'), 'gitdir: ../.git/modules/sub\n');
  await localEntry(await claudeKey(submodule));
  report = await run(submodule);
  assert.match(report.text, local);

  // A worktree of a bare repository or of a submodule is keyed by its common
  // git directory itself, as measured with Claude Code 2.1.329.
  async function linkedWorktree(name, common) {
    const commonDir = path.join(temporary, name, common);
    await mkdir(path.join(commonDir, 'worktrees', 'wt'), { recursive: true });
    await writeFile(path.join(commonDir, 'worktrees', 'wt', 'commondir'), '../..\n');
    const tree = path.join(temporary, name, 'wt');
    await mkdir(tree, { recursive: true });
    await writeFile(
      path.join(tree, '.git'),
      `gitdir: ${path.join(commonDir, 'worktrees', 'wt')}\n`,
    );
    return { tree, commonDir };
  }
  const bare = await linkedWorktree('bare', 'b.git');
  await localEntry(await claudeKey(bare.commonDir));
  report = await run(bare.tree);
  assert.match(report.text, local);
  const moduleTree = await linkedWorktree(
    'module tree',
    path.join('sup', '.git', 'modules', 'mod'),
  );
  await localEntry(await claudeKey(moduleTree.commonDir));
  report = await run(moduleTree.tree);
  assert.match(report.text, local);

  const plain = path.join(temporary, 'plain', 'sub');
  await mkdir(plain, { recursive: true });
  await localEntry(await claudeKey(path.dirname(plain)));
  report = await testing.doctor(plain, environment, process.platform);
  assert.doesNotMatch(report.text, local);
  await localEntry(await claudeKey(plain));
  report = await testing.doctor(plain, environment, process.platform);
  assert.match(report.text, local);
  await writeFile(path.join(home, '.claude.json'), '{}', 'utf8');

  // An installed Codex with nothing declared is still never judged.
  const codex = path.join(bin, POSIX ? 'codex' : 'codex.exe');
  await writeFile(codex, '', 'utf8');
  report = await run(await repository({ '.mcp.json': declaring }));
  assert.match(report.text, /Codex \(installed\): no file checked here declares frontier/);
  assert.equal(report.failed, false, report.text);
  assert.deepEqual(report.failing, []);
  await rm(codex);

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

  // Through a symlinked launch path, local scope is still keyed by the real path.
  await writeFile(
    path.join(home, '.claude.json'),
    JSON.stringify({ projects: { [await realpath(linked)]: { mcpServers: { frontier: entry } } } }),
  );
  const alias = path.join(temporary, 'linked alias');
  await symlink(linked, alias);
  report = await run(alias);
  assert.match(report.text, /Claude Code \(installed\): frontier declared in project, local scope/);
  await rm(path.join(home, '.claude.json'));
}

// The key Claude Code 2.1 writes for a directory inside a git repository,
// measured on macOS; the Windows forward-slash form is read from its source.
async function claudeKey(directory) {
  const key = await realpath(directory);
  return process.platform === 'win32' ? key.split('\\').join('/') : key;
}

// The preview names a local-scope or .mcp.json frontier entry that outranks
// the user-scope entry setup registers.
async function claudeShadowCheck(temporary) {
  const home = path.join(temporary, 'shadow home');
  const root = path.join(temporary, 'shadow repo');
  const directory = path.join(root, 'packages', 'ui');
  await mkdir(home, { recursive: true });
  await mkdir(path.join(root, '.git'), { recursive: true });
  await mkdir(directory, { recursive: true });
  const target = path.join(home, '.claude.json');
  const launch = { command: '/opt/frontier/launch', args: [] };
  const old = { command: 'npx', args: ['-y', 'frontier-mcp@0.4.0'] };

  let preview = await testing.prepareClaudeCode(target, launch, directory);
  assert.deepEqual(preview.shadows, []);
  assert.equal(printed(preview), printed({ ...preview, shadows: [] }));
  assert.doesNotMatch(printed(preview), /Warning/);

  const key = await claudeKey(root);
  await writeFile(
    target,
    JSON.stringify({
      mcpServers: { frontier: old },
      projects: {
        [key]: { mcpServers: { frontier: old } },
        [await claudeKey(directory)]: { mcpServers: { other: old } },
      },
    }),
  );
  const mcpJson = path.join(root, '.mcp.json');
  await writeFile(mcpJson, JSON.stringify({ mcpServers: { frontier: old } }));
  await writeFile(path.join(directory, '.mcp.json'), JSON.stringify({ mcpServers: { x: old } }));
  preview = await testing.prepareClaudeCode(target, launch, directory);
  const realMcpJson = path.join(await realpath(root), '.mcp.json');
  assert.deepEqual(preview.shadows, [
    { scope: 'local', file: `${target} projects[${JSON.stringify(key)}]` },
    { scope: 'project', file: realMcpJson },
  ]);
  const output = printed(preview);
  assert.ok(
    output.includes(
      `Warning: ${target} projects[${JSON.stringify(key)}] has a local-scope frontier entry, which outranks user scope in ${directory}; Claude Code started there uses it, not this one.`,
    ),
    output,
  );
  assert.ok(
    output.includes(
      `Warning: ${realMcpJson} has a project-scope frontier entry, which outranks user scope in ${directory} once approved;`,
    ),
    output,
  );

  // Outside that repository nothing outranks user scope.
  const elsewhere = path.join(temporary, 'shadow elsewhere');
  await mkdir(elsewhere, { recursive: true });
  preview = await testing.prepareClaudeCode(target, launch, elsewhere);
  assert.deepEqual(preview.shadows, []);
}

function printed(preview) {
  const write = process.stdout.write;
  let text = '';
  process.stdout.write = chunk => {
    text += chunk;
    return true;
  };
  try {
    testing.printPreview({
      runtime: { executable: 'node', version: [24, 15, 0] },
      release: { version: '3.0.0', engines: { node: '>=20' } },
      installation: { directory: '/opt/frontier', reused: false },
      target: preview.directory,
      preview,
      client: 'claude-code',
      apply: false,
    });
  } finally {
    process.stdout.write = write;
  }
  return text;
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
  if ((process.env.FRONTIER_FAKE_CLAUDE_REJECT || '').split('\\n').includes(JSON.parse(args[5]).command)) {
    process.stderr.write('rejected'); process.exit(1);
  }
  if (config.mcpServers[args[4]]) { process.stderr.write('exists'); process.exit(1); }
  config.mcpServers[args[4]] = JSON.parse(args[5]);
} else if (args[1] === 'remove') {
  if (process.env.FRONTIER_FAKE_CLAUDE_REMOVE_FAIL) { process.stderr.write('remove failed'); process.exit(1); }
  delete config.mcpServers[args[4]];
}
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
  const readCalls = async () => {
    try {
      return (await readFile(log, 'utf8'))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  };
  const restoreTarget = () =>
    writeFile(
      target,
      JSON.stringify({ mcpServers: { other: { command: 'other' }, frontier: previous } }),
    );
  try {
    let preview = await testing.prepareClaudeCode(target, launch);
    await assert.rejects(testing.applyClaudeCode(claude, target, preview, false), /--replace/);

    // The apply path itself refuses a Windows shim before touching anything.
    await assert.rejects(
      testing.applyClaudeCode(path.join(directory, 'claude.cmd'), target, preview, true, 'win32'),
      /batch shim/,
    );
    assert.equal((await readCalls()).length, 0);

    // A failed remove changes nothing and propagates.
    process.env.FRONTIER_FAKE_CLAUDE_REMOVE_FAIL = '1';
    await assert.rejects(testing.applyClaudeCode(claude, target, preview, true), /remove failed/);
    delete process.env.FRONTIER_FAKE_CLAUDE_REMOVE_FAIL;
    assert.deepEqual(JSON.parse(await readFile(target, 'utf8')).mcpServers.frontier, previous);
    assert.deepEqual(
      (await readCalls()).map(call => call[1]),
      ['remove'],
    );

    // Restore itself fails: the error says so and names the backup.
    process.env.FRONTIER_FAKE_CLAUDE_REJECT = `${launch.command}\n${previous.command}`;
    await assert.rejects(
      testing.applyClaudeCode(claude, target, preview, true),
      error =>
        /re-registering the previous entry also failed \(.*rejected\)/.test(error.message) &&
        /Backup of .*\.claude\.json\.frontier-backup-/.test(error.message),
    );
    assert.equal(JSON.parse(await readFile(target, 'utf8')).mcpServers.frontier, undefined);

    // No file to back up: the error says no backup was made.
    await rm(target);
    await assert.rejects(
      testing.applyClaudeCode(
        claude,
        target,
        { desired: { type: 'stdio', ...launch }, existing: previous, identical: false },
        true,
      ),
      /No backup was made\./,
    );

    // Plain add with no previous entry issues no remove.
    delete process.env.FRONTIER_FAKE_CLAUDE_REJECT;
    await rm(target, { force: true });
    const before = (await readCalls()).length;
    preview = await testing.prepareClaudeCode(target, launch);
    await testing.applyClaudeCode(claude, target, preview, false);
    assert.deepEqual(
      (await readCalls()).slice(before).map(call => call[1]),
      ['add-json'],
    );
    assert.deepEqual(JSON.parse(await readFile(target, 'utf8')).mcpServers.frontier, {
      type: 'stdio',
      ...launch,
    });
    await restoreTarget();

    preview = await testing.prepareClaudeCode(target, launch);

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
    // Apply names every entry that still outranks it, a .mcp.json one with
    // its approval condition.
    assert.equal(
      testing.claudeShadowNotice(await testing.prepareClaudeCode(target, launch, temporary)),
      '',
    );
    const shadowedRoot = path.join(temporary, 'apply shadowed');
    const shadowed = path.join(shadowedRoot, 'packages', 'ui');
    await mkdir(path.join(shadowedRoot, '.git'), { recursive: true });
    await mkdir(shadowed, { recursive: true });
    const shadowJson = path.join(shadowedRoot, '.mcp.json');
    await writeFile(shadowJson, JSON.stringify({ mcpServers: { frontier: previous } }));
    const shadowKey = await claudeKey(shadowedRoot);
    config = JSON.parse(await readFile(target, 'utf8'));
    await writeFile(
      target,
      JSON.stringify({
        ...config,
        projects: { [shadowKey]: { mcpServers: { frontier: previous } } },
      }),
    );
    const localFile = `${target} projects[${JSON.stringify(shadowKey)}]`;
    preview = await testing.prepareClaudeCode(target, launch, shadowed);
    await testing.applyClaudeCode(claude, target, preview, false);
    assert.equal(
      testing.claudeShadowNotice(preview),
      `In ${shadowed} Claude Code still prefers the local-scope entry in ${localFile} and the .mcp.json entry in ${path.join(await realpath(shadowedRoot), '.mcp.json')} once approved over this user-scope entry.\n`,
    );
    await rm(shadowJson);
    preview = await testing.prepareClaudeCode(target, launch, shadowed);
    assert.equal(
      testing.claudeShadowNotice(preview),
      `In ${shadowed} Claude Code still prefers the local-scope entry in ${localFile} over this user-scope entry.\n`,
    );
  } finally {
    if (saved.HOME === undefined) delete process.env.HOME;
    else process.env.HOME = saved.HOME;
    delete process.env.FRONTIER_FAKE_CLAUDE_REMOVE_FAIL;
    if (saved.reject === undefined) delete process.env.FRONTIER_FAKE_CLAUDE_REJECT;
    else process.env.FRONTIER_FAKE_CLAUDE_REJECT = saved.reject;
  }
}

function escape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
