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
await page.goto(pathToFileURL(path.join(root, 'dist/index.html')).href + `?q=low#${family}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
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
    // (clamped: a jiggle past the viewport edge fires pointerleave and drops the pointer)
    if (cursor && i % 10 === 0) await page.mouse.move(clamp(cursor.x + (i % 20 ? 1 : -1), 1, page.viewportSize().width - 2), cursor.y);
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

// 5) hold to squish, release to jump
const holdTarget = 0;
const hp = (await state()).avatars[holdTarget].screen;
await page.mouse.move(hp.x, hp.y + 25);
await page.mouse.down();
await settle(6);
await wait(700);
await settle(4);
await page.mouse.up();
let maxHop = 0;
for (let i = 0; i < 12; i++) {
  await settle(1);
  const hop = await page.evaluate((k) => window.__app.liveStages[0].avatars[k].pose.offset[1], holdTarget);
  maxHop = Math.max(maxHop, hop);
}
check('hold then release makes the avatar jump', maxHop > 0.02, `max hop ${maxHop.toFixed(3)}`);

// 6) family-specific settings through the inspector
if (family === 'dots') {
  await page.click('.ctl[data-key="shape"] button[data-v="3"]');
  await settle(1);
  const m = await page.evaluate(() => { const s = window.__app.liveStages[0]; const a = s.avatars[s.selected]; return { shape: a.config.shape, from: a.config._from?.shape, morph: a.pose.morph }; });
  check('shape change morphs from the old silhouette', m.shape === 3 && m.from !== undefined && m.morph < 1, JSON.stringify(m));
  await page.click('details[data-sec="acc"] > summary');
  await page.click('.ctl[data-key="hat"] button[data-v="3"]');
  const hat = await page.evaluate(() => { const s = window.__app.liveStages[0]; return s.avatars[s.selected].config.hat; });
  check('accessory chips update the avatar', hat === 3, `hat=${hat}`);
} else if (family === 'grok') {
  await page.click('.ctl[data-key="material"] button[data-v="clay"]');
  const mat = await page.evaluate(() => { const s = window.__app.liveStages[0]; return s.avatars[s.selected].config.material; });
  check('material chips update the avatar', mat === 'clay', mat);
  await page.click('.ctl[data-key="shape"] button[data-v="5"]');
  const sh = await page.evaluate(() => { const s = window.__app.liveStages[0]; return s.avatars[s.selected].config.shape; });
  check('silhouette picker morphs the bot', sh === 5, `shape=${sh}`);
} else if (family === 'rebel') {
  await page.click('.ctl[data-key="species"] button[data-v="1"]');
  await settle(1);
  const sp = await page.evaluate(() => {
    const s = window.__app.liveStages[0];
    const c = s.avatars[s.selected].config;
    return { species: c.species, body: c.bodyColor, dot: document.querySelector('.roster [aria-pressed="true"] i')?.style.background };
  });
  check('species switch applies its palette (panda)', sp.species === 1 && sp.body.toLowerCase() === '#f6f5f1', JSON.stringify(sp));
  await page.click('details[data-sec="gear"] > summary').catch(() => {});
  await page.click('.ctl[data-key="prop"] button[data-v="2"]');
  await page.click('.ctl[data-key="state"] button[data-v="publishing"]');
  await settle(12);
  const arm = await page.evaluate(() => { const s = window.__app.liveStages[0]; const a = s.avatars[s.selected]; return { state: a.config.state, rRaise: +a.pose.arms.rRaise.toFixed(2), rFwd: +a.pose.arms.rFwd.toFixed(2) }; });
  check('a megaphone is aimed (not raised) when publishing', arm.state === 'publishing' && arm.rFwd < 0.1 && arm.rRaise > 1.8, JSON.stringify(arm));
} else {
  await page.click('.ctl[data-key="species"] button[data-v="1"]');
  await settle(1);
  const sp = await page.evaluate(() => { const s = window.__app.liveStages[0]; const c = s.avatars[s.selected].config; return { species: c.species, ears: c.ears }; });
  check('species switch applies its defaults (bunny ears)', sp.species === 1 && sp.ears === 1, JSON.stringify(sp));
}

// 7) solo mode
await page.click('[data-tool="solo"]');
const mode = await page.evaluate(() => window.__app.liveStages[0].mode);
check('solo toggles focus mode', mode === 'solo', mode);
await page.click('[data-tool="solo"]');

// 8) edits persist across reloads
await page.fill('.ctl[data-key="name"] input', 'Persisto');
await wait(200);
await page.reload();
for (let i = 0; i < 240 && (await frames()) < 2; i++) await wait(250);
const names = await page.evaluate(() => window.__app.liveStages[0].avatars.map((a) => a.config.name));
check('customisations persist across reloads', names.includes('Persisto'), names.join(', '));
await page.evaluate(() => localStorage.clear());

await page.screenshot({ path: path.join(root, `shots/interact_${family}.png`) });
check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
