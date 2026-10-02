// Interaction smoke test: gaze follows the pointer, clicks pick + boop the right avatar.
//   node scripts/interact.mjs [family]
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const family = process.argv[2] || 'dots';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(path.join(root, 'dist/index.html')).href + `?q=low#/${family}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = () => page.evaluate(() => window.__frames || 0);
for (let i = 0; i < 240 && (await frames()) < 3; i++) await wait(250);

const state = () =>
  page.evaluate(() => {
    const s = window.__app.liveStages[0];
    return {
      frames: window.__frames,
      selected: s.selected,
      title: document.querySelector('.insp-title h3')?.textContent,
      avatars: s.avatars.map((a, i) => ({ name: a.config.name, lookX: +a.pose.lookX.toFixed(3), yaw: +a.pose.yaw.toFixed(3), poke: +a.pose.pokeAmp.toFixed(4), squash: +a.pose.squash.toFixed(3), screen: s.screenOf(i) })),
    };
  });
let cursor = null;
const settle = async (n) => {
  const f0 = await frames();
  for (let i = 0; i < 400 && (await frames()) < f0 + n; i++) {
    await wait(100);
    // people never hold perfectly still: tiny jiggles keep the pointer "active"
    if (cursor && i % 10 === 0) await page.mouse.move(cursor.x + (i % 20 ? 1 : -1), cursor.y);
  }
};
const moveTo = async (x, y) => {
  cursor = { x, y };
  await page.mouse.move(x, y, { steps: 4 });
};

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const s0 = await state();
const stageBox = await page.evaluate(() => {
  const r = document.querySelector('.stage').getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
});
// 1) look left
await moveTo(stageBox.x + 5, stageBox.y + stageBox.h * 0.5);
await settle(40);
const left = await state();
// 2) look right (pointer over the inspector, far right)
await moveTo(899, stageBox.y + stageBox.h * 0.5);
await settle(40);
const right = await state();
const avgLook = (st) => st.avatars.reduce((a, b) => a + b.lookX + b.yaw, 0) / st.avatars.length;
check('gaze follows pointer to the left', avgLook(left) < -0.05, `avg=${avgLook(left).toFixed(3)}`);
check('gaze follows pointer to the right', avgLook(right) > 0.05, `avg=${avgLook(right).toFixed(3)}`);

// 3) click (boop) the third avatar: GPU pick must select it and dent it
const target = 2;
const pos = right.avatars[target].screen;
cursor = null;
await page.mouse.click(pos.x, pos.y + 25);
await settle(2);
const after = await state();
check('click picks and selects the avatar under the pointer', after.selected === target, `selected=${after.selected} (${after.title})`);
check('boop dents the surface / squashes', Math.abs(after.avatars[target].poke) > 0.001 || Math.abs(after.avatars[target].squash) > 0.01, `poke=${after.avatars[target].poke} squash=${after.avatars[target].squash}`);
check('inspector follows selection', after.title === after.avatars[target].name, after.title);

// 4) state switching from the state bar
await page.click('.statebar button:nth-child(3)');
await settle(2);
const st = await page.evaluate(() => window.__app.liveStages[0].avatars[window.__app.liveStages[0].selected].state);
check('state bar sets the selected avatar state', typeof st === 'string' && st !== 'idle', st);

await page.screenshot({ path: path.join(root, `shots/interact_${family}.png`) });
check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
