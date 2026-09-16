import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { runtimes, tarball } = parseArguments(process.argv.slice(2));
let temporaryDirectory;

try {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'frontier-package-runtime-'));
  const packageTarball =
    tarball === undefined ? await pack(temporaryDirectory) : await findTarball(tarball);
  const installation = join(temporaryDirectory, 'installation');
  await mkdir(installation, { recursive: true });
  await writeFile(join(installation, 'package.json'), '{"private":true}\n', 'utf8');
  await runPnpm(['add', '--save-prod', '--ignore-scripts', packageTarball], { cwd: installation });
  const entry = join(installation, 'node_modules', 'frontier-mcp', 'dist', 'bin.js');
  await Promise.all(
    runtimes.map(async runtime => {
      await run(
        process.execPath,
        [join(ROOT, 'scripts', 'runtime-check.mjs'), '--runtime', runtime, '--entry', entry],
        { cwd: ROOT },
      );
      console.log(`Installed package runtime check passed: ${runtime}`);
    }),
  );
} finally {
  if (temporaryDirectory !== undefined) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function parseArguments(args) {
  const selectedRuntimes = [];
  let selectedTarball;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === '--') {
      continue;
    } else if (argument === '--runtime' && value !== undefined) {
      selectedRuntimes.push(value);
      index += 1;
    } else if (argument === '--tarball' && value !== undefined) {
      selectedTarball = value;
      index += 1;
    } else {
      throw new Error(
        'Usage: package-runtime-check.mjs [--runtime executable] [--tarball package.tgz]',
      );
    }
  }

  return {
    runtimes:
      selectedRuntimes.length === 0
        ? [process.execPath]
        : selectedRuntimes.map(runtime => (isAbsolute(runtime) ? runtime : resolve(runtime))),
    tarball:
      selectedTarball === undefined
        ? undefined
        : isAbsolute(selectedTarball)
          ? selectedTarball
          : resolve(selectedTarball),
  };
}

async function pack(destination) {
  const output = join(destination, 'package');
  await runPnpm(['pack', '--pack-destination', output], { cwd: ROOT });
  return findTarball(output);
}

function runPnpm(args, options) {
  const executable = process.env.npm_execpath;
  if (executable === undefined) {
    throw new Error(
      'Run this check through pnpm so its cross-platform executable path is available.',
    );
  }
  // pnpm's JavaScript distribution needs Node (including on Windows), while
  // standalone pnpm supplies a native executable in the same environment field.
  return /\.(?:c?js|mjs)$/i.test(executable)
    ? run(process.execPath, [executable, ...args], options)
    : run(executable, args, options);
}

async function findTarball(path) {
  if ((await stat(path)).isFile()) return path;
  const tarballs = (await readdir(path)).filter(file => file.endsWith('.tgz'));
  if (tarballs.length !== 1 || tarballs[0] === undefined) {
    throw new Error(`Expected one package tarball, found: ${tarballs.join(', ') || '(none)'}`);
  }
  return join(path, tarballs[0]);
}
