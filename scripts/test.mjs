// Bundles tests/*.test.ts with esbuild (so they can import the TS sources and
// GLSL text modules) and runs them with the built-in node test runner.
import * as esbuild from 'esbuild';
import { readdir, rm, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'node_modules/.cache/tests');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const files = (await readdir(path.join(root, 'tests'))).filter((f) => f.endsWith('.test.ts'));
await esbuild.build({
  entryPoints: files.map((f) => path.join(root, 'tests', f)),
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: out,
  outExtension: { '.js': '.mjs' },
  loader: { '.glsl': 'text' },
  logLevel: 'warning',
});
const child = spawn(process.execPath, ['--test', ...files.map((f) => path.join(out, f.replace(/\.ts$/, '.mjs')))], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
