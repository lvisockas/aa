// Contact sheet for a 2D family, drawn with Canvas2D only (no WebGL, so it takes seconds).
//   node scripts/sheet.mjs <family> [out.png] [mode] [cell]
// modes: roster (characters x states, default) · expr (each character x expressions)
//        opts:<key> (lead character with every option of one control)
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [fam, out = `shots/sheet_${fam}.png`, mode = 'roster', cell = '260'] = process.argv.slice(2);
if (!fam) throw new Error('usage: node scripts/sheet.mjs <family> [out.png] [mode] [cell]');
const tmp = path.join(root, 'shots', `.sheet-${fam}-${process.pid}`);
await mkdir(tmp, { recursive: true });
const entry = path.join(tmp, 'entry.ts');
await writeFile(entry, `
import { ${fam} as F } from '${path.join(root, 'src/families', fam)}';
import { Avatar } from '${path.join(root, 'src/avatar/avatar')}';
const S = ${+cell}, MODE = ${JSON.stringify(mode)};
const roster = F.roster();
type Cell = { cfg: any; state: string; expr?: string; label: string };
const rows: Cell[][] = [];
if (MODE === 'roster') for (const c of roster) rows.push(Object.keys(F.states).map((s) => ({ cfg: c, state: s, label: c.name + ' · ' + s })));
else if (MODE === 'expr') for (const c of roster) rows.push(F.expressions.map((e) => ({ cfg: c, state: 'idle', expr: String(e.value), label: c.name + ' · ' + e.label })));
else if (MODE.startsWith('opts:')) {
  const key = MODE.slice(5);
  const ctl = F.schema.flatMap((s) => s.controls).find((c) => c.key === key) as any;
  const vals = ctl.options ? ctl.options.map((o: any) => [o.value, o.label]) : (ctl.colors || []).map((c: string) => [c, c]);
  const row: Cell[] = vals.map(([v, l]: any) => ({ cfg: { ...roster[0], [key]: v }, state: 'idle', label: key + ': ' + l }));
  for (let i = 0; i < row.length; i += 6) rows.push(row.slice(i, i + 6));
}
const cols = Math.max(...rows.map((r) => r.length));
const cv = document.createElement('canvas');
cv.width = cols * S; cv.height = rows.length * S;
document.body.appendChild(cv);
const ctx = cv.getContext('2d')!;
ctx.fillStyle = (F as any).backgroundSolid || F.background;
ctx.fillRect(0, 0, cv.width, cv.height);
const offs = new Map<string, HTMLCanvasElement>();
rows.forEach((row, ri) => row.forEach((cell, ci) => {
  const a = new Avatar(F, { ...cell.cfg }, () => {}, 1 + ri * 7 + ci);
  a.setState(cell.state, 0);
  if (cell.expr) a.config.expression = cell.expr;
  const T = 1.6 + ci * 0.37;
  const pointer: [number, number, number] = [(ci % 3 - 1) * 0.8, 1.0, 2];
  for (let i = 0; i < Math.round(T * 30); i++) a.update(1 / 30, { t: i / 30, pointer, pointerIdle: 0, camera: [0, 1, 6], neighbors: [a], reducedMotion: false });
  const f = a.build();
  const ppu = S / 1.3;
  ctx.save();
  ctx.beginPath(); ctx.rect(ci * S, ri * S, S, S); ctx.clip();
  ctx.setTransform(ppu, 0, 0, -ppu, ci * S + S / 2, ri * S + S * 0.92);
  ctx.translate(0, a.pose.offset[1]);
  ctx.translate(0, 0.45); ctx.rotate(a.pose.roll); ctx.translate(0, -0.45);
  ctx.scale(f.squash[0], f.squash[1]);
  const canvas = (id: string, w: number, h: number) => {
    let c = offs.get(id);
    if (!c) { c = document.createElement('canvas'); offs.set(id, c); }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const x = c.getContext('2d')!; x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, w, h); return x;
  };
  F.draw2d!(ctx, a.config, a.pose, a.face, { t: T, px: 1 / ppu, size: [S, S], canvas, squash: [f.squash[0], f.squash[1]], roll: a.pose.roll });
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.font = '11px sans-serif';
  ctx.fillText(cell.label, ci * S + 6, ri * S + 14);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.strokeRect(ci * S + 0.5, ri * S + 0.5, S - 1, S - 1);
}));
(window as any).__done = true;
`);
await build({ entryPoints: [entry], bundle: true, outfile: path.join(tmp, 'sheet.js'), format: 'iife', logLevel: 'error' });
await writeFile(path.join(tmp, 'sheet.html'), '<!doctype html><body style="margin:0"><script src="sheet.js"></script>');
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(pathToFileURL(path.join(tmp, 'sheet.html')).href);
await page.waitForFunction(() => window.__done || document.title === 'x', null, { timeout: 30000 }).catch(() => {});
if (errs.length) console.error('page errors:\n' + errs.join('\n'));
await mkdir(path.dirname(path.resolve(root, out)), { recursive: true });
await page.locator('canvas').first().screenshot({ path: path.resolve(root, out) });
await browser.close();
await rm(tmp, { recursive: true, force: true });
console.log('sheet', out);
