// Frame-cost benchmark in software GL: ms per frame per family at a fixed size and quality.
//   node scripts/bench.mjs [width] [height] [frames] [quality]
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [w = '480', h = '300', frames = '6', q = 'low'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const sync = () => {
  const c = document.getElementById('gl');
  const o = document.createElement('canvas');
  o.width = o.height = 2;
  o.getContext('2d').drawImage(c, 0, 0, 2, 2);
};
for (const fam of ['dots', 'grok', 'muse', 'rebel', 'poly', 'bomber', 'crew']) {
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  // one frame to compile and warm up, timed separately
  await page.goto(pathToFileURL(path.join(root, 'dist/debug.html')).href + `?family=${fam}&only=0&q=${q}&t=1&stop=1`);
  const t0 = Date.now();
  await page.waitForFunction(() => (window.__frames || 0) >= 1, null, { timeout: 600000, polling: 100 });
  await page.evaluate(sync);
  const warm = Date.now() - t0;
  await page.goto(pathToFileURL(path.join(root, 'dist/debug.html')).href + `?family=${fam}&only=0&q=${q}&t=1&stop=${frames}`);
  const t1 = Date.now();
  await page.waitForFunction((n) => (window.__frames || 0) >= n, +frames, { timeout: 600000, polling: 100 });
  await page.evaluate(sync);
  const per = (Date.now() - t1) / +frames;
  console.log(`${fam.padEnd(6)} first frame (compile + render) ${(warm / 1000).toFixed(1)}s   steady ${per.toFixed(0)} ms/frame`);
  await page.close();
}
await browser.close();
