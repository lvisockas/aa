// Runs the interaction smoke test for every family, two at a time (software GL is CPU-bound).
//   node scripts/interact-all.mjs [parallel]
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const families = ['dots', 'grok', 'muse', 'rebel', 'poly', 'doodle', 'clawd', 'faces'];
const parallel = Math.max(1, +(process.argv[2] || 2));
const t0 = Date.now();
const results = new Map();
const run = (fam) =>
  new Promise((resolve) => {
    const out = [];
    const p = spawn(process.execPath, [path.join(root, 'scripts/interact.mjs'), fam], { cwd: root });
    p.stdout.on('data', (d) => out.push(d.toString()));
    p.stderr.on('data', (d) => out.push(d.toString()));
    p.on('close', (code) => {
      results.set(fam, code);
      console.log(`\n== ${fam} (${((Date.now() - t0) / 1000).toFixed(0)}s) exit ${code}\n${out.join('')}`);
      resolve();
    });
  });
const queue = [...families];
await Promise.all(Array.from({ length: parallel }, async () => { while (queue.length) await run(queue.shift()); }));
const failed = families.filter((f) => results.get(f) !== 0);
console.log(`\n${failed.length ? 'FAILED: ' + failed.join(', ') : 'all families passed'} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
process.exit(failed.length ? 1 : 0);
