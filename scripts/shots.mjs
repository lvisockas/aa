// Headless screenshots for visual verification (software GL via SwiftShader).
//   node scripts/shots.mjs [query#hash] [out.png] [width] [height] [frames]
// Software GL executes frames long after the main thread queues them, so we
// poll with timers (rAF-based waiting starves) and force a GPU sync first.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [query = '', out = 'shots/shot.png', w = '1200', h = '800', frames = '1'] = process.argv.slice(2);
await mkdir(path.dirname(path.resolve(root, out)), { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => {
  if (!/fonts\.g|ERR_CERT/.test(m.text())) logs.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const [q, hash = ''] = query.split('#');
const page_ = process.env.PAGE || 'index.html';
const url = pathToFileURL(path.join(root, 'dist', page_)).href + `?stop=${frames}${q ? '&' + q : ''}${hash ? '#' + hash : ''}`;
const t0 = Date.now();
await page.goto(url);
let st = { f: 0, err: null };
for (let i = 0; i < 1200; i++) {
  await new Promise((r) => setTimeout(r, 250));
  st = await page.evaluate(() => ({ f: window.__frames || 0, err: window.__err || null }));
  if (st.f >= +frames || st.err) break;
}
const tq = (Date.now() - t0) / 1000;
await page.evaluate(() => {
  const c = document.getElementById('gl');
  if (!c) return;
  const o = document.createElement('canvas');
  o.width = o.height = 2;
  o.getContext('2d').drawImage(c, 0, 0, 2, 2);
});
const tg = (Date.now() - t0) / 1000;
await page.screenshot({ path: path.resolve(root, out), timeout: 600000 });
console.log(`shot ${out}: queued ${tq.toFixed(1)}s, gpu done ${tg.toFixed(1)}s, total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (st.err) console.log('ERROR:', st.err);
for (const l of logs.slice(0, 30)) console.log(l.slice(0, 400));
await browser.close();
