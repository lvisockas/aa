// Debug harness: renders one family full-window without the app chrome.
//   debug.html?family=dots&only=0&cfg={...}&q=high&t=1&stop=2
import { QUALITY, Renderer, type QualityName, type View } from './engine/renderer';
import { Avatar } from './avatar/avatar';
import { FAMILIES } from './app/app';
import type { FamilyId } from './engine/renderer';

const params = new URLSearchParams(location.search);
const fam = FAMILIES[(params.get('family') || 'grok') as FamilyId];
const canvas = document.createElement('canvas');
canvas.id = 'gl';
canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.style.cssText = `margin:0;background:${fam.background}`;
document.body.appendChild(canvas);
const r = new Renderer(canvas);
if (params.get('q')) r.quality = QUALITY[params.get('q') as QualityName];
const T = params.has('t') ? parseFloat(params.get('t')!) : -1;
let roster = fam.roster();
if (params.get('only')) roster = params.get('only')!.split(',').map((i) => roster[+i]);
if (params.get('cfg')) roster = roster.map((c) => ({ ...c, ...JSON.parse(params.get('cfg')!) }));
const avatars = roster.map((c, i) => new Avatar(fam, c, () => {}, i + 1));
const comp = fam.compose(avatars.length, innerWidth / innerHeight, false);
avatars.forEach((a, i) => (a.home = comp.placements[i]));
const w = window as unknown as { __frames: number; __err: string };
r.load(fam.id, fam.shader).then(() => {
  let last = performance.now() / 1000;
  const loop = () => {
    const now = performance.now() / 1000;
    const t = T >= 0 ? T : now;
    const dt = T >= 0 ? 1 / 60 : now - last;
    last = now;
    const cam = comp.camera;
    for (const a of avatars) a.update(dt, { t, pointer: null, pointerIdle: 99, camera: cam.pos, neighbors: avatars, reducedMotion: false });
    const view: View = { rect: { left: 0, top: 0, width: innerWidth, height: innerHeight }, family: fam.id, camera: cam, look: fam.look, chars: avatars.map((a) => a.build()), anchors: fam.anchors };
    r.render([view]);
    w.__frames = (w.__frames || 0) + 1;
    if (params.has('stop') && w.__frames >= +params.get('stop')!) return;
    requestAnimationFrame(loop);
  };
  loop();
}).catch((e) => { console.error(e); w.__err = String(e); });
