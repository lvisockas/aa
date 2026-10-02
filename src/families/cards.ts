import { clamp, deg, normalize } from '../engine/math';
import type { Pose } from '../avatar/avatar';
import type { BaseConfig, Draw2DEnv, EyeSpec, FaceState, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';

/**
 * Cards: character cards. The whole card is the character: a white rounded
 * card with a bold title, a colour-coded dot, a flat colour panel holding a
 * bald, white, thick-monoline person, and a one-line description underneath.
 * The person inside is alive: eyes follow the cursor, the head moves with
 * parallax inside the panel, and the hands act out each state (waving,
 * fists up, hand on chin, reading the paper, hand to the ear, dozing off).
 */
export interface CardsConfig extends BaseConfig {
  archetype: number;
  title: string;
  blurb: string;
  color: string;
  decor: number;
  gesture: number;
  hat: number;
  skin: string;
  eyes: number;
  brows: number;
  mouth: number;
}

type Pt = [number, number];
const INK = '#141414';
const PAPER = '#FFFFFF';
const CARD = '#FCFCFB';
const LW = 0.0105;          // monoline weight in character units
const DECO_LW = 0.0085;     // white background line art
const FONT = '"Nunito Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const opt = (labels: string[]): Option[] => labels.map((label, value) => ({ value, label }));
const GESTURES = ['wave', 'cheer', 'clasp', 'chin', 'read', 'hush', 'wand', 'relax'] as const;
const GESTURE_OPTS = opt(['Wave', 'Fists up', 'Clasped', 'Hand on chin', 'Newspaper', 'Hush', 'Wand', 'Relaxed']);
const HAT_OPTS = opt(['None', 'Cap', 'Fedora', 'Wizard hat', 'Bow', 'Headphones', 'Beanie']);
const DECOR_OPTS = opt(['None', 'Clouds', 'Birds', 'Sparkles', 'Jitters', 'Crowd', 'Armchair']);
const EYE_OPTS = opt(['Dots', 'Wide', 'Closed', 'Happy']);
const BROW_OPTS = opt(['None', 'Ticks', 'Arched']);
const MOUTH_OPTS = opt(['Smile', 'Flat', 'Oh', 'Grin', 'Wavy']);
const PANELS = ['#F45B5B', '#FF8AD8', '#FFC72C', '#12C98C', '#7E8CF7', '#A98BF5', '#FF8B3D', '#47B8F0'];
const SKINS = ['#FFFFFF', '#F7DEC8', '#E8B48C', '#C58B62', '#8A5A3C', '#5C3B28'];

interface Archetype {
  title: string;
  blurb: string;
  color: string;
  gesture: number;
  hat: number;
  decor: number;
  eyes: number;
  brows: number;
  mouth: number;
}
// gesture: 0 wave 1 cheer 2 clasp 3 chin 4 read 5 hush 6 wand 7 relax
const ARCHETYPES: Archetype[] = [
  { title: 'Greeter', blurb: 'Always the first to say hello and the last to leave the party.', color: '#F45B5B', gesture: 0, hat: 0, decor: 0, eyes: 0, brows: 0, mouth: 0 },
  { title: 'Live Wire', blurb: 'Runs on pure enthusiasm and slightly too much coffee.', color: '#FFC72C', gesture: 1, hat: 0, decor: 4, eyes: 3, brows: 0, mouth: 3 },
  { title: 'Daydreamer', blurb: 'Somewhere far away, humming a tune only they can hear.', color: '#12C98C', gesture: 7, hat: 5, decor: 2, eyes: 2, brows: 0, mouth: 0 },
  { title: 'Scholar', blurb: 'Has a footnote ready for anything you might say.', color: '#A98BF5', gesture: 3, hat: 2, decor: 1, eyes: 0, brows: 1, mouth: 1 },
  { title: 'Enchanter', blurb: 'Might fix it. Might turn it into a teapot.', color: '#FF8AD8', gesture: 6, hat: 3, decor: 3, eyes: 0, brows: 2, mouth: 0 },
  { title: 'Newcomer', blurb: 'Still reading the room, one headline at a time.', color: '#47B8F0', gesture: 4, hat: 0, decor: 0, eyes: 0, brows: 0, mouth: 1 },
  { title: 'Secret Keeper', blurb: 'Knows exactly what happened, and is not telling.', color: '#7E8CF7', gesture: 5, hat: 0, decor: 5, eyes: 0, brows: 1, mouth: 1 },
  { title: 'Fidget', blurb: 'Cannot sit still for more than a minute at a time.', color: '#FFC72C', gesture: 2, hat: 1, decor: 4, eyes: 1, brows: 1, mouth: 4 },
  { title: 'Homebody', blurb: 'Has already claimed the comfiest seat in the house.', color: '#12C98C', gesture: 7, hat: 6, decor: 6, eyes: 0, brows: 0, mouth: 0 },
  { title: 'Wildcard', blurb: 'Nobody knows what they will do next, least of all them.', color: '#FF8B3D', gesture: 0, hat: 4, decor: 3, eyes: 1, brows: 2, mouth: 3 },
];
const ARCH_OPTS = opt(ARCHETYPES.map((a) => a.title));

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'skeptical', label: 'Skeptical' },
  { value: 'worried', label: 'Worried' },
  { value: 'cross', label: 'Cross' },
  { value: 'serene', label: 'Serene' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'excited', label: 'Excited' },
  { value: 'wink', label: 'Wink' },
];

// eye kinds: 0 dot, 1 wide ring, 2 closed (calm arc), 3 happy arc.  rot = brow angle (+ = inner end down), dy = brow raise
const cardsFace = (c: CardsConfig, expr: string): FaceTarget => {
  const e = (kind: number, brow = 0, raise = 0, lid = 0): EyeSpec => ({ kind, w: 1, h: 1, rot: brow, lid, lidAng: 0, dx: 0, dy: raise });
  const k = c.eyes ?? 0;
  const open = k === 2 || k === 3 ? 0 : k;
  const make = (l: EyeSpec, r: EyeSpec, mouth = 0, mouthOpen = 0, cheeks = 0): FaceTarget => ({ l, r, lidB: 0, mouth, mouthOpen, cheeks });
  switch (expr) {
    case 'happy':
    case 'squeeze':
      return make(e(3, -0.15, 0.5), e(3, -0.15, 0.5), 0.9, 0.15, 0.6);
    case 'surprised':
      return make(e(1, -0.15, 1.2), e(1, -0.15, 1.2), 0, 0.5);
    case 'skeptical':
      return make(e(open, 0.35, -0.3, 0.35), e(open, -0.3, 1.0), -0.15);
    case 'worried':
      return make(e(open, -0.55, 0.6), e(open, -0.55, 0.6), -0.5, 0.05);
    case 'cross':
      return make(e(open, 0.6, -0.4, 0.2), e(open, 0.6, -0.4, 0.2), -0.4);
    case 'serene':
      return make(e(2, 0, 0.2), e(2, 0, 0.2), 0.35);
    case 'sleepy':
    case 'dizzy':
      return make(e(2, 0.05, -0.2), e(2, 0.05, -0.2), 0.05);
    case 'excited':
      return make(e(1, -0.2, 0.9), e(1, -0.2, 0.9), 1, 0.55, 0.8);
    case 'wink':
      return make(e(open, 0, 0.3), e(3, -0.1, 0.4), 0.7, 0, 0.3);
    case 'listening':
      return make(e(k, -0.1, 0.55), e(k, -0.1, 0.55), 0.3);
    case 'chatty':
      return make(e(open, -0.05, 0.35), e(open, -0.05, 0.35), 0.5);
    case 'focused':
      return make(e(open, 0.15, -0.1, 0.2), e(open, 0.15, -0.1, 0.2), 0.05);
    default:
      return make(e(k, 0, 0), e(k, 0, 0), 0.3);
  }
};

const base = (o: Partial<CardsConfig>): CardsConfig => {
  const a = ARCHETYPES[o.archetype ?? 0] ?? ARCHETYPES[0];
  return {
    name: 'Card',
    state: 'idle',
    expression: 'neutral',
    archetype: 0,
    title: a.title,
    blurb: a.blurb,
    color: a.color,
    decor: a.decor,
    gesture: a.gesture,
    hat: a.hat,
    skin: '#FFFFFF',
    eyes: a.eyes,
    brows: a.brows,
    mouth: a.mouth,
    ...o,
  };
};

// ------------------------------------------------------------- layout
const CARD_W = 0.8, CARD_H = 1.05, CARD_R = 0.045;
const PX0 = -0.355, PX1 = 0.355, PY0 = 0.44, PY1 = 0.925, PANEL_R = 0.014;
const HEAD: Pt = [0, 0.74];
const HRX = 0.074, HRY = 0.08;
const SHOULDER: Pt = [0.106, 0.568];
const ARM_W = 0.042;

// ------------------------------------------------------------- primitives
const path = (ctx: CanvasRenderingContext2D, pts: Pt[], closed = false) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (closed) ctx.closePath();
};
const line = (ctx: CanvasRenderingContext2D, pts: Pt[], closed = false, w = LW, col = INK) => {
  path(ctx, pts, closed);
  ctx.lineWidth = w;
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
};
const fill = (ctx: CanvasRenderingContext2D, pts: Pt[], col: string) => {
  path(ctx, pts, true);
  ctx.fillStyle = col;
  ctx.fill();
};
const shape = (ctx: CanvasRenderingContext2D, pts: Pt[], col: string, w = LW) => {
  fill(ctx, pts, col);
  line(ctx, pts, true, w);
};
const ell = (cx: number, cy: number, rx: number, ry: number, n = 28, a0 = 0, a1 = Math.PI * 2): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Pt;
  });
const dot = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col = INK) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.fill();
};
const rrect = (x0: number, y0: number, x1: number, y1: number, r: number): Pt[] => {
  const pts: Pt[] = [];
  const corners: Array<[number, number, number]> = [[x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI], [x1 - r, y0 + r, Math.PI * 1.5]];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= 6; i++) {
    const a = a0 + (i / 6) * (Math.PI / 2);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
};
const rot = ([x, y]: Pt, [cx, cy]: Pt, a: number): Pt => {
  const c = Math.cos(a), s = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
};
/** a thick outlined tube along a polyline (arms, fingers, wand) */
const tube = (ctx: CanvasRenderingContext2D, pts: Pt[], w: number, col: string) => {
  line(ctx, pts, false, w + LW * 2, INK);
  line(ctx, pts, false, w, col);
};

// ------------------------------------------------------------- text
const TS = 0.001;   // text is drawn in a 1000x scaled space so fonts get real pixel sizes
const measure = (ctx: CanvasRenderingContext2D, s: string, size: number): number => {
  const m = ctx.measureText?.(s);
  const w = m && typeof m.width === 'number' && Number.isFinite(m.width) ? m.width * TS : NaN;
  return Number.isFinite(w) && w > 0 ? w : s.length * size * 0.55;
};
const setFont = (ctx: CanvasRenderingContext2D, weight: number, size: number) => {
  ctx.font = `${weight} ${Math.max(1, Math.round(size / TS))}px ${FONT}`;
};
const text = (ctx: CanvasRenderingContext2D, s: string, x: number, y: number, col: string) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(TS, -TS);
  ctx.fillStyle = col;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, 0, 0);
  ctx.restore();
};
const ellipsize = (ctx: CanvasRenderingContext2D, s: string, size: number, maxW: number): string => {
  if (measure(ctx, s, size) <= maxW) return s;
  let t = s;
  while (t.length > 1 && measure(ctx, t.trimEnd() + '…', size) > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
};
const wrap = (ctx: CanvasRenderingContext2D, s: string, size: number, maxW: number): string[] => {
  const lines: string[] = [];
  let cur = '';
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const next = cur ? cur + ' ' + word : word;
    if (measure(ctx, next, size) <= maxW) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    // a single word longer than the line is broken by characters
    let w = word;
    while (measure(ctx, w, size) > maxW && w.length > 1) {
      let n = w.length - 1;
      while (n > 1 && measure(ctx, w.slice(0, n), size) > maxW) n--;
      lines.push(w.slice(0, n));
      w = w.slice(n);
    }
    cur = w;
  }
  if (cur) lines.push(cur);
  return lines;
};

const drawTitle = (ctx: CanvasRenderingContext2D, s: string) => {
  const maxW = 0.64;
  let size = 0.056;
  setFont(ctx, 800, size);
  const w = measure(ctx, s, size);
  if (w > maxW) {
    size = Math.max(size * 0.62, (size * maxW) / w);
    setFont(ctx, 800, size);
  }
  const fit = ellipsize(ctx, s, size, maxW);
  // keep the cap height's top where a full-size title would sit
  text(ctx, fit, PX0, PY1 + 0.04 + (0.056 - size) * 0.36, INK);
};

const drawBlurb = (ctx: CanvasRenderingContext2D, s: string) => {
  const maxW = 0.69, top = PY0 - 0.065, bottom = 0.045;
  let lines: string[] = [];
  let size = 0.036;
  for (size of [0.036, 0.032, 0.028]) {
    setFont(ctx, 600, size);
    lines = wrap(ctx, s, size, maxW);
    if (top - (lines.length - 1) * size * 1.38 >= bottom) break;
  }
  const lh = size * 1.38;
  const max = Math.max(1, Math.floor((top - bottom) / lh) + 1);
  if (lines.length > max) {
    lines = lines.slice(0, max);
    lines[max - 1] = ellipsize(ctx, lines[max - 1] + '…', size, maxW);
  }
  lines.forEach((l, i) => text(ctx, l, PX0, top - i * lh, '#262626'));
};

// ------------------------------------------------------------- hand rig
type Glyph = 'none' | 'open' | 'fist' | 'point' | 'chin' | 'grip' | 'clasp' | 'palm';
type ArmKey = [number, number, number, number, number, Glyph];   // elbow x,y · hand x,y · hand turn · glyph
interface Gesture {
  r: ArmKey;
  l: ArmKey;
  tilt?: number;
  paper?: number;
  wand?: number;
  wave?: number;
  pump?: number;
  rub?: number;
  gest?: number;
  /** hands near the face follow the head's parallax */
  hf?: number;
}
const REST_R: ArmKey = [0.172, 0.405, 0.2, 0.3, 0, 'none'];
const mirror = (a: ArmKey): ArmKey => [-a[0], a[1], -a[2], a[3], a[4], a[5]];
const REST_L = mirror(REST_R);
const RIG: Record<string, Gesture> = {
  relax: { r: REST_R, l: REST_L },
  wave: { r: [0.232, 0.585, 0.262, 0.728, 0.15, 'open'], l: REST_L, wave: 1, tilt: 0.04 },
  cheer: { r: [0.232, 0.62, 0.272, 0.75, 0, 'fist'], l: [-0.232, 0.62, -0.272, 0.75, 0, 'fist'], pump: 1 },
  clasp: { r: [0.15, 0.4, 0.036, 0.54, 0, 'clasp'], l: [-0.15, 0.4, -0.036, 0.54, 0, 'none'], rub: 1 },
  chin: { r: [0.14, 0.42, 0.056, 0.598, -0.25, 'chin'], l: REST_L, tilt: 0.08, hf: 1 },
  read: { r: [0.225, 0.44, 0.19, 0.555, 0.5, 'grip'], l: [-0.225, 0.44, -0.19, 0.555, 0.5, 'grip'], paper: 1 },
  hush: { r: [0.14, 0.42, 0.03, 0.618, -0.5, 'point'], l: REST_L, tilt: -0.04, hf: 1 },
  wand: { r: [0.238, 0.51, 0.252, 0.645, -0.3, 'grip'], l: REST_L, wand: 1 },
  ear: { r: [0.235, 0.53, 0.142, 0.672, -0.55, 'palm'], l: REST_L, tilt: -0.09, hf: 1 },
  explain: { r: [0.215, 0.47, 0.262, 0.628, 0.6, 'palm'], l: REST_L, gest: 1 },
  hug: { r: [0.19, 0.44, -0.07, 0.535, 0.1, 'fist'], l: [-0.19, 0.44, 0.075, 0.515, 0.1, 'fist'] },
};
const STATE_GESTURE: Record<string, string> = { listening: 'ear', thinking: 'chin', working: 'read', speaking: 'explain', done: 'cheer', sleeping: 'relax', greeting: 'wave' };
const NP = 19;

const gestureOf = (c: CardsConfig, pose: Pose): string => {
  if (pose.pet > 0.3) return 'hug';
  return STATE_GESTURE[c.state] ?? GESTURES[c.gesture] ?? 'relax';
};
const rigVector = (g: Gesture, droop: number): number[] => [
  ...g.r.slice(0, 5) as number[],
  ...g.l.slice(0, 5) as number[],
  g.tilt ?? 0, g.paper ?? 0, g.wand ?? 0, g.wave ?? 0, g.pump ?? 0, g.rub ?? 0, g.gest ?? 0, g.hf ?? 0, droop,
];

/** per-avatar smoothed rig (keyed by the avatar's pose object), so gestures ease into each other */
const rigState = new WeakMap<Pose, { t: number; v: number[] }>();
const blendRig = (pose: Pose, target: number[], t: number): number[] => {
  let s = rigState.get(pose);
  if (!s || s.v.length !== NP) {
    s = { t, v: target.slice() };
    rigState.set(pose, s);
    return s.v;
  }
  const dt = clamp(t - s.t, 0, 0.1);
  s.t = t;
  const k = 1 - Math.exp(-dt * 9);
  for (let i = 0; i < NP; i++) s.v[i] += (target[i] - s.v[i]) * k;
  return s.v;
};

// ------------------------------------------------------------- hands
/** hand glyphs in a local frame: origin at the wrist, +x along the forearm, thumb on +y (right hand) */
const HLW = LW * 0.85;
const handGlyph = (ctx: CanvasRenderingContext2D, g: Glyph, skin: string) => {
  const fingers = (list: Array<[Pt, Pt]>, palm: Pt, pr: number, fw = 0.0092) => {
    // the palm first, then each finger outlined on its own so neighbours stay readable
    if (pr > 0.002) {
      dot(ctx, palm[0], palm[1], pr + HLW, INK);
      dot(ctx, palm[0], palm[1], pr, skin);
    }
    for (const [a, b] of list) {
      line(ctx, [a, b], false, fw + HLW * 2, INK);
      line(ctx, [a, b], false, fw, skin);
    }
    if (pr > 0.002) dot(ctx, palm[0], palm[1], pr * 0.8, skin);
  };
  if (g === 'open' || g === 'palm') {
    const spread = g === 'open' ? 0.3 : 0.16;
    const list: Array<[Pt, Pt]> = [];
    const lens = [0.03, 0.038, 0.037, 0.029];
    // little finger first so the index overlaps it, thumb last
    for (let i = 0; i < 4; i++) {
      const a = (1.5 - i) * -spread;
      const by = (1.5 - i) * -0.0125;
      list.push([[0.036, by], [0.036 + Math.cos(a) * lens[i], by + Math.sin(a) * lens[i]]]);
    }
    list.push([[0.018, 0.016], [0.018 + Math.cos(1.0) * 0.03, 0.016 + Math.sin(1.0) * 0.03]]);
    fingers(list, [0.026, 0], 0.027, 0.0105);
    return;
  }
  if (g === 'fist' || g === 'grip' || g === 'point' || g === 'chin') {
    const s = g === 'grip' ? 0.92 : 1.05;
    if (g === 'point') fingers([[[0.036, -0.012], [0.09, -0.012]]], [0, 0], 0, 0.0105);
    if (g === 'chin') fingers([[[0.04, -0.012], [0.066, 0.022]]], [0, 0], 0, 0.0105);
    const w = 0.05 * s, h = 0.026 * s;
    shape(ctx, rrect(0, -h, w, h, 0.016 * s), skin, HLW);
    // finger creases and the thumb wrapped across the front
    for (const y of [-0.0125, 0, 0.0125]) line(ctx, [[w - 0.013 * s, y * s], [w, y * s]], false, HLW * 0.75);
    line(ctx, [[0.01 * s, h], [0.024 * s, 0.008 * s], [0.036 * s, 0.006 * s]], false, HLW * 0.85);
  }
};
const drawHand = (ctx: CanvasRenderingContext2D, side: number, E: Pt, H: Pt, turn: number, g: Glyph, skin: string) => {
  if (g === 'none' || g === 'clasp') return;
  const a = Math.atan2(H[1] - E[1], H[0] - E[0]) + turn * side;
  ctx.save();
  ctx.translate(H[0], H[1]);
  ctx.rotate(a);
  // the left hand mirrors the right so thumbs face the body
  if (side < 0) ctx.scale(1, -1);
  handGlyph(ctx, g, skin);
  ctx.restore();
};
const drawClasp = (ctx: CanvasRenderingContext2D, x: number, y: number, a: number, skin: string) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  shape(ctx, rrect(-0.044, -0.028, 0.044, 0.026, 0.022), skin);
  // interlaced fingers and two thumbs on top
  for (let i = 0; i < 4; i++) {
    const fx = -0.024 + i * 0.016;
    line(ctx, i % 2 ? [[fx, 0.004], [fx, -0.02]] : [[fx, 0.018], [fx, -0.006]], false, LW * 0.7);
  }
  line(ctx, ell(-0.012, 0.026, 0.012, 0.009, 8, Math.PI, 0), false, LW * 0.8);
  line(ctx, ell(0.012, 0.026, 0.012, 0.009, 8, Math.PI, 0), false, LW * 0.8);
  ctx.restore();
};

// ------------------------------------------------------------- props
const drawPaper = (ctx: CanvasRenderingContext2D, cx: number, amt: number, t: number) => {
  const W = 0.185, top = 0.705, bot = 0.425;
  const dy = -(1 - amt) * 0.34;
  ctx.save();
  ctx.translate(cx, dy);
  ctx.translate(0, 0.56);
  ctx.rotate(Math.sin(t * 0.9) * 0.02);
  ctx.translate(0, -0.56);
  const left: Pt[] = [[-W, bot - 0.012], [-W, top + 0.012], [0, top - 0.012], [0, bot]];
  const right: Pt[] = left.map(([x, y]) => [-x, y] as Pt).reverse();
  shape(ctx, left, PAPER);
  shape(ctx, right, PAPER);
  // left page: headline and columns
  const yAt = (x: number, y: number) => y + (Math.abs(x) / W) * 0.012;   // follow the page's perspective
  line(ctx, [[-W + 0.025, yAt(W - 0.025, top - 0.035)], [-0.03, yAt(0.03, top - 0.035)]], false, LW * 2.2);
  line(ctx, [[-W + 0.025, yAt(W - 0.025, top - 0.07)], [-0.06, yAt(0.06, top - 0.07)]], false, LW * 2.2);
  for (let i = 0; i < 5; i++) {
    const y = top - 0.11 - i * 0.03;
    line(ctx, [[-W + 0.025, yAt(W, y)], [-W + 0.08, yAt(W, y)]], false, LW * 0.6);
    line(ctx, [[-W + 0.1, yAt(W, y)], [-0.025, yAt(0.03, y)]], false, LW * 0.6);
  }
  // right page: a photo and copy
  shape(ctx, [[0.03, top - 0.03], [W - 0.025, top - 0.022], [W - 0.025, top - 0.11], [0.03, top - 0.115]], PAPER, LW * 0.8);
  line(ctx, [[0.03, top - 0.115], [W - 0.025, top - 0.022]], false, LW * 0.6);
  line(ctx, [[0.03, top - 0.03], [W - 0.025, top - 0.11]], false, LW * 0.6);
  for (let i = 0; i < 4; i++) {
    const y = top - 0.15 - i * 0.03;
    line(ctx, [[0.03, yAt(0.03, y)], [W - 0.025 - (i % 2) * 0.03, yAt(W, y)]], false, LW * 0.6);
  }
  // now and then a page turns
  const ph = ((t + 3) % 7) / 0.8;
  if (ph < 1 && amt > 0.9) {
    const fx = W * Math.cos(ph * Math.PI);
    const lift = 0.025 * Math.sin(ph * Math.PI);
    shape(ctx, [[0, bot], [0, top - 0.012], [fx, top + 0.012 + lift], [fx, bot - 0.012 + lift]], PAPER);
  }
  ctx.restore();
};

const star = (cx: number, cy: number, r: number, a0: number, points = 5, inner = 0.45): Pt[] =>
  Array.from({ length: points * 2 }, (_, i) => {
    const a = a0 + (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as Pt;
  });
const sparkle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col = PAPER, w = DECO_LW) => {
  // a four-point twinkle drawn as two crossing strokes with pinched ends
  line(ctx, [[x - r, y], [x + r, y]], false, w, col);
  line(ctx, [[x, y - r], [x, y + r]], false, w, col);
};

const drawWand = (ctx: CanvasRenderingContext2D, H: Pt, amt: number, t: number) => {
  if (amt < 0.05) return;
  const a = Math.PI * 0.36 + Math.sin(t * 2.6) * 0.12;
  const L = 0.15 * amt;
  const tip: Pt = [H[0] + Math.cos(a) * L, H[1] + Math.sin(a) * L];
  tube(ctx, [[H[0] - Math.cos(a) * 0.02, H[1] - Math.sin(a) * 0.02], tip], 0.008, INK);
  shape(ctx, star(tip[0], tip[1], 0.028 * amt, t * 0.8), PAPER);
  for (let i = 0; i < 4; i++) {
    const tw = 0.5 + 0.5 * Math.sin(t * 4 + i * 1.7);
    const ang = i * 1.6 + 0.4;
    sparkle(ctx, tip[0] + Math.cos(ang) * 0.06, tip[1] + Math.sin(ang) * 0.055, 0.012 * tw * amt);
  }
};

// ------------------------------------------------------------- decor (white line art behind the person)
const cloud = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => {
  const pts: Pt[] = [
    ...ell(x - 0.6 * s, y + 0.24 * s, 0.24 * s, 0.24 * s, 10, Math.PI * 1.5, Math.PI * 0.45),
    ...ell(x - 0.05 * s, y + 0.38 * s, 0.38 * s, 0.38 * s, 12, Math.PI * 0.92, Math.PI * 0.12),
    ...ell(x + 0.55 * s, y + 0.25 * s, 0.25 * s, 0.25 * s, 10, Math.PI * 0.72, -Math.PI * 0.5),
  ];
  line(ctx, pts, true, DECO_LW, PAPER);
};
const bird = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, flap: number) => {
  const f = 0.35 + 0.65 * flap;
  line(ctx, [[x - s, y + 0.45 * s * f], [x - 0.5 * s, y + 0.5 * s * f], [x, y]], false, DECO_LW, PAPER);
  line(ctx, [[x, y], [x + 0.5 * s, y + 0.5 * s * f], [x + s, y + 0.45 * s * f]], false, DECO_LW, PAPER);
};
const wrapX = (x: number) => PX0 - 0.15 + ((((x - PX0 + 0.15) % 1.01) + 1.01) % 1.01);

const birds = (ctx: CanvasRenderingContext2D, t: number, n = 3) => {
  const spots: Array<[number, number, number]> = [[-0.25, 0.83, 0.032], [0.2, 0.86, 0.026], [0.27, 0.7, 0.03], [-0.22, 0.6, 0.024]];
  for (let i = 0; i < n; i++) {
    const [x, y, s] = spots[i];
    bird(ctx, wrapX(x + t * 0.02 * (1 + i * 0.3)), y + 0.006 * Math.sin(t * 1.3 + i), s, 0.5 + 0.5 * Math.sin(t * 7 + i * 2));
  }
};

const decorBack = (ctx: CanvasRenderingContext2D, c: CardsConfig, t: number) => {
  switch (c.decor) {
    case 1:
      cloud(ctx, wrapX(0.24 + t * 0.012), 0.5, 0.11);
      cloud(ctx, wrapX(-0.25 + t * 0.008), 0.8, 0.085);
      cloud(ctx, wrapX(0.62 + t * 0.01), 0.84, 0.07);
      break;
    case 2:
      birds(ctx, t);
      break;
    case 3:
      const spots: Pt[] = [[-0.29, 0.85], [-0.21, 0.73], [-0.3, 0.56], [0.2, 0.87], [0.3, 0.76], [0.22, 0.62], [0.31, 0.5], [-0.14, 0.88], [-0.25, 0.47]];
      spots.forEach(([x, y], i) => {
        const tw = 0.55 + 0.45 * Math.sin(t * 3 + i * 2.1);
        if (i % 3 === 2) dot(ctx, x, y, 0.007 * tw, PAPER);
        else sparkle(ctx, x, y, 0.022 * tw);
      });
      break;
    case 5: {
      // a crowd of outlined silhouettes behind
      const spots: Array<[number, number, number]> = [[-0.3, 0.62, 1.15], [-0.17, 0.76, 0.95], [0.18, 0.78, 0.95], [0.31, 0.6, 1.2], [-0.33, 0.88, 0.9], [0.33, 0.9, 0.85]];
      spots.forEach(([x, y, s], i) => {
        const yy = y + 0.006 * Math.sin(t * 1.4 + i * 1.9);
        const head = ell(x, yy, 0.05 * s, 0.056 * s, 22);
        line(ctx, head, true, DECO_LW, PAPER);
        line(ctx, [...ell(x, yy - 0.17 * s, 0.11 * s, 0.11 * s, 16, Math.PI * 0.95, Math.PI * 0.05)], false, DECO_LW, PAPER);
      });
      break;
    }
    case 6: {
      // armchair back
      const back: Pt[] = [[-0.24, 0.44], [-0.25, 0.66], ...ell(-0.17, 0.7, 0.085, 0.09, 10, Math.PI, Math.PI * 0.35), ...ell(0, 0.72, 0.1, 0.05, 8, Math.PI * 0.9, Math.PI * 0.1), ...ell(0.17, 0.7, 0.085, 0.09, 10, Math.PI * 0.65, 0), [0.25, 0.66], [0.24, 0.44]];
      line(ctx, back, false, DECO_LW, PAPER);
      break;
    }
  }
};
const decorFront = (ctx: CanvasRenderingContext2D, c: CardsConfig, t: number) => {
  if (c.decor === 6) {
    // armrests in front of the body
    for (const s of [-1, 1]) {
      const arm: Pt[] = [[s * 0.33, 0.43], ...ell(s * 0.27, 0.5, 0.075, 0.05, 10, s > 0 ? 0 : Math.PI, s > 0 ? Math.PI : 0), [s * 0.17, 0.43]];
      fill(ctx, arm, c.color);
      line(ctx, arm, false, DECO_LW, PAPER);
    }
  }
  void t;
};

/** short jitter ticks around the head */
const jitter = (ctx: CanvasRenderingContext2D, hx: number, hy: number, t: number, amt: number, col = INK) => {
  if (amt < 0.05) return;
  const set = Math.floor(t * 7) % 2;
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const a = (0.25 + i * 0.32 + set * 0.08) * Math.PI * 0.5;
    const r0 = 0.11 + 0.01 * set, r1 = r0 + 0.028 * amt;
    const ca = Math.cos(a) * s, sa = Math.sin(a);
    line(ctx, [[hx + ca * r0, hy + sa * r0 * 1.05], [hx + ca * r1, hy + sa * r1 * 1.05]], false, LW, col);
  }
};

// ------------------------------------------------------------- the person
interface P {
  ctx: CanvasRenderingContext2D;
  c: CardsConfig;
  pose: Pose;
  face: FaceState;
  t: number;
  /** turn offset of the features within the head */
  ft: number;
  fy: number;
  lookX: number;
  lookY: number;
  sleeping: number;
}

const torso = (ctx: CanvasRenderingContext2D, c: CardsConfig, bx: number) => {
  const pts: Pt[] = [
    [-0.19 + bx, 0.38], [-0.186 + bx, 0.5], [-0.172 + bx, 0.555], ...ell(-0.1 + bx, 0.555, 0.072, 0.052, 8, Math.PI, Math.PI / 2),
    [-0.045 + bx, 0.609], ...ell(bx, 0.618, 0.045, 0.03, 10, Math.PI, Math.PI * 2), [0.045 + bx, 0.609],
    ...ell(0.1 + bx, 0.555, 0.072, 0.052, 8, Math.PI / 2, 0), [0.172 + bx, 0.555], [0.186 + bx, 0.5], [0.19 + bx, 0.38],
  ];
  fill(ctx, pts, PAPER);
  line(ctx, pts);
  // neck
  const neck: Pt[] = [[-0.025 + bx, 0.67], [-0.026 + bx, 0.584], [0.026 + bx, 0.584], [0.025 + bx, 0.67]];
  fill(ctx, neck, c.skin);
  line(ctx, [neck[0], [neck[1][0], 0.61]]);
  line(ctx, [neck[3], [neck[2][0], 0.61]]);
  // the neckline sits over the neck
  line(ctx, ell(bx, 0.618, 0.045, 0.03, 10, Math.PI, Math.PI * 2));
};

/** the upper arm sits behind the torso, so the sleeve grows out of the shirt */
const upperArm = (ctx: CanvasRenderingContext2D, S: Pt, E: Pt) => {
  line(ctx, [S, E], false, ARM_W + LW * 2, INK);
  line(ctx, [S, E], false, ARM_W, PAPER);
};
/** the forearm is drawn in front, starting a little up the upper arm with a butt end so the elbow joins seamlessly */
const foreArm = (ctx: CanvasRenderingContext2D, S: Pt, E: Pt, H: Pt, skin: string) => {
  const dx = E[0] - S[0], dy = E[1] - S[1], l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  for (const [w, col, back] of [[ARM_W + LW * 2, INK, 0.03], [ARM_W, PAPER, 0.04]] as Array<[number, string, number]>) {
    path(ctx, [[E[0] - ux * back, E[1] - uy * back], E, H]);
    ctx.lineWidth = w;
    ctx.strokeStyle = col;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    ctx.stroke();
    dot(ctx, H[0], H[1], w / 2, col);
  }
  if (skin.toUpperCase() !== PAPER) {
    // bare forearm below a short sleeve
    const M: Pt = [E[0] + (H[0] - E[0]) * 0.18, E[1] + (H[1] - E[1]) * 0.18];
    line(ctx, [M, H], false, ARM_W * 0.86, skin);
    const fx = H[0] - E[0], fy = H[1] - E[1], fl = Math.hypot(fx, fy) || 1;
    const nx = -fy / fl, ny = fx / fl, w = ARM_W * 0.5;
    line(ctx, [[M[0] + nx * w, M[1] + ny * w], [M[0] - nx * w, M[1] - ny * w]], false, LW * 0.8);
  }
};

const eyes = ({ ctx, pose, face, ft, fy, lookX, lookY }: P) => {
  ([[-1, face.l], [1, face.r]] as Array<[number, EyeSpec]>).forEach(([s, spec]) => {
    const x = s * 0.03 + ft, y = 0.008 + fy;
    const lx = lookX * 0.009, ly = lookY * 0.007;
    const open = 1 - pose.blink;
    const k = spec.kind;
    if (k === 2) {
      // calm closed eyes: a lowered lid line with a lash flick
      line(ctx, ell(x, y + 0.004, 0.013, 0.008, 8, Math.PI * 1.1, Math.PI * 1.9));
    } else if (k === 3) {
      line(ctx, ell(x, y - 0.006, 0.012, 0.012, 8, Math.PI * 0.15, Math.PI * 0.85));
    } else if (open < 0.3) {
      line(ctx, [[x - 0.011, y], [x + 0.011, y]]);
    } else if (k === 1) {
      const ry = 0.016 * open * (1 - 0.45 * spec.lid);
      shape(ctx, ell(x, y, 0.015, ry, 20), PAPER, LW * 0.85);
      dot(ctx, x + lx * 0.7, y + ly * 0.6 * open, 0.0068 * Math.min(1, open + 0.2));
    } else {
      const r = 0.0085;
      fill(ctx, ell(x + lx, y + ly, r, r * open * (1 - 0.45 * spec.lid), 14), INK);
    }
  });
};

const brows = ({ ctx, c, face, ft, fy }: P) => {
  ([[-1, face.l], [1, face.r]] as Array<[number, EyeSpec]>).forEach(([s, spec]) => {
    // expressive brows appear on demand even with the 'None' part
    const strength = Math.max(Math.abs(spec.rot) * 2.2, Math.abs(spec.dy) - 0.3);
    if (c.brows === 0 && strength < 0.5) return;
    const x = s * 0.032 + ft, y = 0.036 + fy + 0.012 * spec.dy;
    const half = 0.013;
    const a = spec.rot;
    const inner: Pt = [x - s * half, y - Math.sin(a) * half * 1.4];
    const outer: Pt = [x + s * half, y + Math.sin(a) * half * 1.4];
    if (c.brows === 2) line(ctx, [inner, [x, y + 0.007], outer], false, LW * 0.9);
    else line(ctx, [inner, outer], false, LW * 0.9);
  });
};

const nose = ({ ctx, ft, fy }: P) => {
  const x = ft * 1.25, y = -0.012 + fy;
  line(ctx, [[x + 0.004, y + 0.012], [x - 0.006, y - 0.006], [x + 0.005, y - 0.009]], false, LW * 0.85);
};

const mouth = ({ ctx, c, pose, face, ft, fy }: P) => {
  const x = ft * 1.1, y = -0.042 + fy;
  const open = Math.max(face.mouthOpen, pose.talk * (0.35 + 0.35 * Math.sin(pose.phase * 16)));
  const sm = face.mouth + pose.excite * 0.15;
  if (open > 0.12 || (c.mouth === 3 && sm > 0)) {
    // an open D with a little tongue line
    const w = 0.017, d = 0.008 + 0.02 * Math.max(open, c.mouth === 3 ? 0.5 : 0);
    const pts: Pt[] = [[x - w, y + 0.003 * sm]];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI;
      pts.push([x + Math.cos(a) * w, y + Math.sin(a) * d]);
    }
    shape(ctx, pts, INK, LW * 0.9);
    return;
  }
  if (c.mouth === 2 || (open > 0.06 && c.mouth !== 4)) {
    shape(ctx, ell(x, y - 0.002, 0.0065, 0.0085, 12), PAPER, LW * 0.85);
    return;
  }
  if (c.mouth === 4) {
    const pts: Pt[] = [];
    for (let i = 0; i <= 8; i++) pts.push([x - 0.014 + i * 0.0035, y + (i % 2 ? 0.003 : -0.003)]);
    line(ctx, pts, false, LW * 0.8);
    return;
  }
  if (c.mouth === 1 && Math.abs(sm) < 0.6) {
    line(ctx, [[x - 0.01, y + 0.002 * sm], [x + 0.01, y + 0.002 * sm]], false, LW * 0.9);
    return;
  }
  const w = 0.014;
  const pts: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 4 - 1;
    pts.push([x + u * w, y - sm * 0.009 * (1 - u * u)]);
  }
  line(ctx, pts, false, LW * 0.9);
};

const cheeks = ({ ctx, c, face, pose, ft, fy }: P) => {
  const amt = Math.max(face.cheeks, pose.pet);
  if (amt < 0.4) return;
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
    const x0 = s * (0.045 + i * 0.008) + ft, y0 = -0.024 + fy;
    line(ctx, [[x0 - 0.003, y0 - 0.005], [x0 + 0.003, y0 + 0.005]], false, LW * 0.6);
  }
  void c;
};

const headphones = (ctx: CanvasRenderingContext2D, ft: number) => {
  line(ctx, ell(-ft * 0.3, 0.004, HRX + 0.012, HRY + 0.018, 22, 0.12, Math.PI - 0.12), false, LW * 2.4);
  line(ctx, ell(-ft * 0.3, 0.004, HRX + 0.012, HRY + 0.018, 22, 0.14, Math.PI - 0.14), false, LW * 0.7, PAPER);
  for (const s of [-1, 1]) {
    const x = s * (HRX + 0.004) - ft * 0.4;
    shape(ctx, rrect(x - 0.016, -0.032, x + 0.016, 0.03, 0.014), PAPER);
    line(ctx, [[x - s * 0.006, -0.018], [x - s * 0.006, 0.016]], false, LW * 0.7);
  }
};

const hat = (ctx: CanvasRenderingContext2D, c: CardsConfig, ft: number, t: number) => {
  const hx = ft * 0.5;
  switch (c.hat) {
    case 1: {
      // a cap worn a little sideways, bill to the left
      const dome = ell(hx, 0.042, 0.069, 0.06, 20, -0.06, Math.PI + 0.06);
      shape(ctx, dome, PAPER);
      shape(ctx, [[-0.045 + hx, 0.052], [-0.1 + hx, 0.054], [-0.132 + hx, 0.046], [-0.136 + hx, 0.036], [-0.118 + hx, 0.03], [-0.04 + hx, 0.034]], PAPER);
      line(ctx, [[hx + 0.006, 0.102], [hx + 0.024, 0.04]], false, LW * 0.7);
      line(ctx, ell(hx, 0.042, 0.069, 0.012, 12, Math.PI, Math.PI * 2), false, LW * 0.7);
      dot(ctx, hx + 0.004, 0.104, 0.008);
      break;
    }
    case 2: {
      // fedora: dented crown, black band, wide curved brim
      const crown: Pt[] = [[-0.058, 0.05], [-0.056, 0.1], [-0.045, 0.118], [-0.022, 0.124], [0, 0.115], [0.022, 0.124], [0.045, 0.118], [0.056, 0.1], [0.058, 0.05]].map(([x, y]) => [x + hx, y] as Pt);
      shape(ctx, crown, PAPER);
      fill(ctx, [[-0.058 + hx, 0.05], [-0.0575 + hx, 0.074], [0.0575 + hx, 0.074], [0.058 + hx, 0.05]], INK);
      const brim: Pt[] = [...ell(hx, 0.048, 0.118, 0.022, 20, Math.PI, Math.PI * 2), [0.12 + hx, 0.058], ...ell(hx, 0.058, 0.07, 0.013, 12, 0, Math.PI), [-0.12 + hx, 0.058]];
      shape(ctx, brim, PAPER);
      break;
    }
    case 3: {
      // wizard hat: a soft cone with a bent tip, a wide brim and a star
      const sway = Math.sin(t * 1.6) * 0.01;
      const cone: Pt[] = [[-0.062, 0.05], [-0.036, 0.11], [-0.006 + sway, 0.152], [0.034 + sway * 2, 0.176], [0.062 + sway * 2.4, 0.166], [0.026 + sway, 0.134], [0.064, 0.05]].map(([x, y]) => [x + hx, y] as Pt);
      shape(ctx, cone, PAPER);
      line(ctx, [[-0.054 + hx, 0.07], [0.058 + hx, 0.07]], false, LW * 0.8);
      shape(ctx, [...ell(hx, 0.05, 0.128, 0.024, 24, Math.PI, Math.PI * 2), ...ell(hx, 0.054, 0.128, 0.014, 16, 0, Math.PI)], PAPER);
      shape(ctx, star(0.003 + hx, 0.1, 0.015, 0.2), INK, LW * 0.5);
      break;
    }
    case 4: {
      // a big outlined bow on the side of the head
      const x = 0.035 + hx, y = HRY - 0.005;
      const wob = Math.sin(t * 3) * 0.004;
      shape(ctx, [[x, y], [x - 0.05, y + 0.032 + wob], [x - 0.054, y - 0.026 - wob]], PAPER);
      shape(ctx, [[x, y], [x + 0.05, y + 0.036 - wob], [x + 0.05, y - 0.024 + wob]], PAPER);
      shape(ctx, ell(x, y, 0.013, 0.015, 12), PAPER);
      line(ctx, [[x - 0.04, y + 0.012], [x - 0.02, y + 0.004]], false, LW * 0.6);
      line(ctx, [[x + 0.04, y + 0.014], [x + 0.02, y + 0.005]], false, LW * 0.6);
      break;
    }
    case 5:
      headphones(ctx, ft);
      break;
    case 6: {
      // beanie with a rolled cuff and a pompom
      shape(ctx, ell(hx, 0.058, HRX + 0.004, 0.062, 20, 0, Math.PI), PAPER);
      shape(ctx, rrect(-HRX - 0.008 + hx, 0.03, HRX + 0.008 + hx, 0.068, 0.012), PAPER);
      for (let i = -3; i <= 3; i++) line(ctx, [[hx + i * 0.02, 0.038], [hx + i * 0.02, 0.06]], false, LW * 0.55);
      shape(ctx, ell(hx, 0.134 + 0.003 * Math.sin(t * 3), 0.02, 0.018, 14), PAPER);
      break;
    }
  }
};

const head = (p: P, hx: number, hy: number, tilt: number) => {
  const { ctx, c, ft, t } = p;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(tilt);
  // ears sit behind the head
  for (const s of [-1, 1]) shape(ctx, ell(s * (HRX - 0.004) - ft * 0.5, -0.006, 0.014, 0.02, 14), c.skin);
  shape(ctx, ell(0, 0, HRX, HRY, 40), c.skin);
  cheeks(p);
  eyes(p);
  brows(p);
  nose(p);
  mouth(p);
  if (p.sleeping > 0.5 && c.hat !== 5) headphones(ctx, ft);
  hat(ctx, c, ft, t);
  ctx.restore();
};

// ------------------------------------------------------------- state effects
const thoughtBubbles = (ctx: CanvasRenderingContext2D, hx: number, hy: number, amt: number, t: number) => {
  if (amt < 0.05) return;
  for (let i = 0; i < 3; i++) {
    const r = (0.009 + 0.006 * i) * amt;
    line(ctx, ell(hx + 0.1 + i * 0.045, hy + 0.04 + i * 0.025 + 0.006 * Math.sin(t * 2.4 + i), r, r, 14), true, DECO_LW, PAPER);
  }
  // the big bubble with three dots
  const bx = hx + 0.245, by = hy + 0.1 + 0.006 * Math.sin(t * 2.4 + 3);
  cloud(ctx, bx, by - 0.03 * amt, 0.075 * amt);
  for (let i = 0; i < 3; i++) dot(ctx, bx - 0.022 + i * 0.022, by - 0.005, 0.0055 * amt * (0.6 + 0.4 * Math.max(0, Math.sin(t * 5 - i))), PAPER);
};
const soundWaves = (ctx: CanvasRenderingContext2D, x: number, y: number, amt: number, t: number) => {
  if (amt < 0.05) return;
  for (let i = 0; i < 3; i++) {
    const ph = (t * 1.2 + i / 3) % 1;
    const r = 0.03 + ph * 0.07;
    ctx.globalAlpha = amt * Math.sin(ph * Math.PI);
    line(ctx, ell(x, y, r, r * 1.1, 10, -0.6, 0.6), false, DECO_LW, PAPER);
  }
  ctx.globalAlpha = 1;
};
const speechTicks = (ctx: CanvasRenderingContext2D, x: number, y: number, amt: number, t: number, talk: number) => {
  if (amt < 0.05) return;
  const k = amt * (0.6 + 0.6 * Math.min(1, talk * 2));
  for (let i = 0; i < 3; i++) {
    const a = (-0.45 + i * 0.45) + Math.sin(t * 6 + i) * 0.05;
    const r0 = 0.06, r1 = 0.06 + 0.035 * k;
    line(ctx, [[x - Math.cos(a) * r0, y + Math.sin(a) * r0], [x - Math.cos(a) * r1, y + Math.sin(a) * r1]], false, DECO_LW * 1.1, PAPER);
  }
};
const notes = (ctx: CanvasRenderingContext2D, x: number, y: number, amt: number, t: number) => {
  if (amt < 0.05) return;
  for (let i = 0; i < 2; i++) {
    const ph = (t * 0.35 + i * 0.5) % 1;
    const nx = x + 0.04 + ph * 0.12 + 0.012 * Math.sin(t * 2 + i * 3), ny = y + ph * 0.13;
    ctx.globalAlpha = amt * Math.sin(ph * Math.PI);
    ctx.save();
    ctx.translate(nx, ny);
    ctx.rotate(-0.3);
    fill(ctx, ell(0, 0, 0.011, 0.008, 12), PAPER);
    ctx.restore();
    line(ctx, [[nx + 0.009, ny + 0.002], [nx + 0.009, ny + 0.04]], false, DECO_LW, PAPER);
    line(ctx, [[nx + 0.009, ny + 0.04], [nx + 0.022, ny + 0.03]], false, DECO_LW, PAPER);
  }
  ctx.globalAlpha = 1;
};
const motionTicks = (ctx: CanvasRenderingContext2D, H: Pt, side: number, amt: number, t: number) => {
  if (amt < 0.05) return;
  const flick = 0.75 + 0.25 * Math.sin(t * 18);
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + side * (0.15 + i * 0.5);
    const r0 = 0.045, r1 = 0.045 + 0.025 * amt * flick;
    line(ctx, [[H[0] + Math.cos(a) * r0, H[1] + Math.sin(a) * r0], [H[0] + Math.cos(a) * r1, H[1] + Math.sin(a) * r1]], false, LW);
  }
};
const celebration = (ctx: CanvasRenderingContext2D, amt: number, t: number) => {
  if (amt < 0.05) return;
  const spots: Pt[] = [[-0.29, 0.86], [0.3, 0.84], [-0.25, 0.53], [0.28, 0.52], [-0.12, 0.89], [0.14, 0.9]];
  spots.forEach(([x, y], i) => {
    const tw = Math.max(0, Math.sin(t * 4 + i * 1.3));
    if (i % 2) shape(ctx, star(x, y, 0.02 * amt * (0.5 + 0.5 * tw), t + i, 4, 0.35), PAPER, LW * 0.7);
    else sparkle(ctx, x, y, 0.018 * amt * (0.4 + 0.6 * tw));
  });
};

// ------------------------------------------------------------- draw
const draw = (ctx: CanvasRenderingContext2D, c: CardsConfig, pose: Pose, face: FaceState, env: Draw2DEnv) => {
  const t = env.t;
  const st = c.state;
  const sleeping = st === 'sleeping' ? 1 : 0;

  // the card turns a touch towards the pointer: a cheap perspective skew
  ctx.save();
  ctx.transform(1, -pose.yaw * 0.14, 0, 1, 0, 0);

  // shadow, card, title, dot, description
  const lift = pose.excite * 0.006;
  fill(ctx, rrect(-CARD_W / 2 + 0.014 + lift, -0.018 - lift, CARD_W / 2 + 0.014 + lift, CARD_H - 0.018 - lift, CARD_R), 'rgba(0, 28, 26, 0.28)');
  fill(ctx, rrect(-CARD_W / 2, 0, CARD_W / 2, CARD_H, CARD_R), CARD);
  drawTitle(ctx, String(c.title ?? ''));
  dot(ctx, PX1 - 0.018, PY1 + 0.058, 0.0165, c.color);
  drawBlurb(ctx, String(c.blurb ?? ''));

  // the panel: everything else is clipped to it
  const panel = rrect(PX0, PY0, PX1, PY1, PANEL_R);
  ctx.save();
  fill(ctx, panel, c.color);
  path(ctx, panel, true);
  ctx.clip();

  // parallax: decor moves against the head, the body moves less than the head
  const fx = clamp(pose.headYaw * 0.032 + pose.yaw * 0.06, -0.04, 0.04);
  const fy = clamp(-pose.headPitch * 0.025, -0.02, 0.02);
  const bx = fx * 0.4;

  ctx.save();
  ctx.translate(-fx * 0.7, -fy * 0.5);
  decorBack(ctx, c, t);
  if (sleeping && c.decor !== 2) birds(ctx, t, 2);
  ctx.restore();

  // hand rig: blended between gestures
  const gid = gestureOf(c, pose);
  const g = RIG[gid] ?? RIG.relax;
  const v = blendRig(pose, rigVector(g, sleeping ? 1 : 0), t);
  const [rEx, rEy, rHx, rHy, rRot, lEx, lEy, lHx, lHy, lRot, tilt0, paper, wand, wave, pump, rub, gest, hf, droop] = v;
  const wob = pose.wobble * Math.sin(pose.wobblePhase) * 0.01;
  const breath = 0.004 * Math.sin(t * 1.7);
  const hx = HEAD[0] + fx + wob;
  const hy = HEAD[1] + fy * 0.6 + breath - droop * 0.012 + pose.pokeAmp * 0.01;
  const tilt = tilt0 + droop * 0.13 + pose.headRoll * 0.6 + wob * 3;
  const hand = (side: number, Ex: number, Ey: number, Hx: number, Hy: number): [Pt, Pt, Pt] => {
    const S: Pt = [side * SHOULDER[0] + bx, SHOULDER[1] + breath * 0.5];
    let E: Pt = [Ex + bx, Ey];
    let H: Pt = [Hx + bx + (fx - bx) * hf, Hy + (fy * 0.6) * hf];
    if (pump > 0.01) {
      const p = pump * 0.014 * Math.max(0, Math.sin(t * 9 + (side > 0 ? 0 : 1.3)));
      E = [E[0], E[1] + p * 0.6];
      H = [H[0] + side * p * 0.3, H[1] + p];
    }
    if (side > 0 && wave > 0.01) H = rot(H, E, wave * Math.sin(t * 8) * 0.38);
    if (side > 0 && gest > 0.01) H = rot(H, E, gest * (0.14 * Math.sin(t * 2.3) + 0.25 * pose.talk));
    if (side > 0 && wand > 0.01) H = [H[0], H[1] + 0.006 * Math.sin(t * 2.6)];
    return [S, E, H];
  };
  const [lS, lE, lH] = hand(-1, lEx, lEy, lHx, lHy);
  const [rS, rE, rH] = hand(1, rEx, rEy, rHx, rHy);

  upperArm(ctx, lS, lE);
  upperArm(ctx, rS, rE);
  torso(ctx, c, bx);
  foreArm(ctx, lS, lE, lH, c.skin);
  foreArm(ctx, rS, rE, rH, c.skin);
  decorFront(ctx, c, t);

  // gaze: working scans the page, everything else follows the brain
  let lookX = pose.lookX, lookY = pose.lookY;
  if (paper > 0.5) {
    lookX = Math.sin(t * 1.4) * 0.8;
    lookY = -0.5;
  }
  const p: P = { ctx, c, pose, face, t, ft: clamp(pose.headYaw * 0.024, -0.022, 0.022), fy: clamp(-pose.headPitch * 0.016, -0.012, 0.012), lookX, lookY, sleeping };
  head(p, hx, hy, tilt);

  if (paper > 0.02) drawPaper(ctx, bx, paper, t);
  drawHand(ctx, -1, lE, lH, lRot, g.l[5], c.skin);
  drawHand(ctx, 1, rE, rH, rRot, g.r[5], c.skin);
  if (g.r[5] === 'clasp') drawClasp(ctx, (lH[0] + rH[0]) / 2 + rub * 0.005 * Math.sin(t * 13), (lH[1] + rH[1]) / 2, rub * 0.08 * Math.sin(t * 6.5), c.skin);
  drawWand(ctx, rH, g.r[5] === 'grip' && wand > 0.05 ? wand : 0, t);

  // state effects and front decor
  const prop = (k: string) => pose.props[k] ?? 0;
  if (c.decor === 4) jitter(ctx, hx, hy, t, 1);
  if (pose.pokeAmp > 0.05 && c.decor !== 4) jitter(ctx, hx, hy, t, Math.min(1, pose.pokeAmp * 4));
  if (pump > 0.3) {
    motionTicks(ctx, rH, 1, pump, t);
    motionTicks(ctx, lH, -1, pump, t);
  }
  thoughtBubbles(ctx, hx, hy, prop('think'), t);
  soundWaves(ctx, hx + 0.13, hy, prop('ears'), t);
  speechTicks(ctx, hx - 0.03, hy - 0.04, prop('voice'), t, pose.talk);
  notes(ctx, hx + HRX, hy, prop('zz'), t);
  celebration(ctx, prop('spark'), t);
  ctx.restore();   // panel clip
  ctx.restore();   // card skew
};

export const cards: FamilyDef<CardsConfig> = {
  id: 'cards',
  name: 'Cards',
  maker: 'Character cards',
  tagline: 'Character cards · white line-drawn people · colour-coded archetypes',
  subtitle: 'Character cards: a white card, a bold title, a colour panel and a line-drawn person who acts it out',
  shader: '',
  anchors: 0,
  background: 'radial-gradient(120% 95% at 50% 8%, #14736D 0%, #0E5E5A 55%, #0A4744 100%)',
  backgroundSolid: '#0E5E5A',
  dark: true,
  traits: ['The whole card is the character', 'Hands act out every state', 'Colour-coded archetypes'],
  look: {
    dark: true,
    groundShadow: 0,
    exposure: 1,
    groundY: 0,
    lights: { key: normalize([-0.5, 0.8, 0.6]), keyI: 1, rim: normalize([0.5, 0.4, -0.7]), rimI: 0.5, fill: normalize([0.8, 0.1, 0.55]), fillI: 0.3, sky: [0.8, 0.8, 0.8], ground: [0.5, 0.5, 0.5], warm: [1, 1, 1], env: 1 },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Breathing, blinking, striking their pose', bob: [0.006, 0.4] },
    greeting: { label: 'Greeting', hint: 'Waves hello', expr: 'happy', bob: [0.008, 0.9], enter: 'hop' },
    listening: { label: 'Listening', hint: 'Hand to the ear, eyes on you', expr: 'listening', gaze: 'user', lean: 0.05, props: { ears: 1 } },
    thinking: { label: 'Thinking', hint: 'Hand on chin, a thought bubble', expr: 'skeptical', gaze: 'up', sway: [0.02, 0.3], props: { think: 1 } },
    working: { label: 'Working', hint: 'Reading the paper', expr: 'focused', bob: [0.005, 1.2] },
    speaking: { label: 'Speaking', hint: 'Talking with their hands', expr: 'chatty', talk: 1, gaze: 'user', props: { voice: 1 } },
    done: { label: 'Done', hint: 'Fists up, sparkles', expr: 'excited', enter: 'celebrate', emote: ['check', 4], props: { spark: 1 } },
    sleeping: { label: 'Sleeping', hint: 'Headphones on, birds drifting by', expr: 'sleepy', gaze: 'closed', sink: 0.006, emote: ['zzz', 2.6], props: { zz: 1 } },
  },
  personality: { body: [2.0, 0.55, 0.6], eyes: [6.5, 0.85, 0.0], squash: [260, 13], reach: [0.2, 0.14], eyeShare: 0.6, hopGravity: 12 },
  expressions: EXPRESSIONS,
  onChange: (c, key, value) => {
    if (key !== 'archetype') return null;
    const a = ARCHETYPES[Number(value)];
    if (!a) return null;
    return { ...c, archetype: Number(value), title: a.title, blurb: a.blurb, color: a.color, gesture: a.gesture, hat: a.hat, decor: a.decor, eyes: a.eyes, brows: a.brows, mouth: a.mouth };
  },
  schema: [
    {
      id: 'identity',
      title: 'Identity',
      controls: [
        { type: 'text', key: 'name', label: 'Name' },
        { type: 'chips', key: 'state', label: 'State', options: [] },
      ],
    },
    {
      id: 'card',
      title: 'Card',
      controls: [
        { type: 'select', key: 'archetype', label: 'Archetype', options: ARCH_OPTS },
        { type: 'text', key: 'title', label: 'Title' },
        { type: 'text', key: 'blurb', label: 'Description' },
        { type: 'swatches', key: 'color', label: 'Panel colour', colors: PANELS, custom: true },
        { type: 'chips', key: 'decor', label: 'Background', options: DECOR_OPTS },
      ],
    },
    {
      id: 'person',
      title: 'Person',
      controls: [
        { type: 'chips', key: 'gesture', label: 'Pose', options: GESTURE_OPTS },
        { type: 'chips', key: 'hat', label: 'Headwear', options: HAT_OPTS },
        { type: 'swatches', key: 'skin', label: 'Skin', colors: SKINS, custom: true },
      ],
    },
    {
      id: 'face',
      title: 'Face',
      controls: [
        { type: 'chips', key: 'eyes', label: 'Eyes', options: EYE_OPTS },
        { type: 'chips', key: 'brows', label: 'Brows', options: BROW_OPTS },
        { type: 'chips', key: 'mouth', label: 'Mouth', options: MOUTH_OPTS },
        { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS },
      ],
    },
  ],
  roster: () => [
    base({ name: 'Pip', archetype: 0 }),
    base({ name: 'Juniper', archetype: 2, skin: '#F7DEC8' }),
    base({ name: 'Ozzie', archetype: 4 }),
    base({ name: 'Marlo', archetype: 3, skin: '#C58B62' }),
    base({ name: 'Bea', archetype: 1, skin: '#8A5A3C' }),
  ],
  randomize: (c, rnd) => {
    const pick = (n: number) => Math.floor(rnd() * n);
    const ai = pick(ARCHETYPES.length);
    const a = ARCHETYPES[ai];
    return {
      ...c,
      archetype: ai,
      title: a.title,
      blurb: a.blurb,
      color: rnd() < 0.6 ? a.color : PANELS[pick(PANELS.length)],
      gesture: rnd() < 0.7 ? a.gesture : pick(GESTURE_OPTS.length),
      hat: rnd() < 0.6 ? a.hat : rnd() < 0.4 ? 0 : 1 + pick(HAT_OPTS.length - 1),
      decor: rnd() < 0.6 ? a.decor : pick(DECOR_OPTS.length),
      skin: rnd() < 0.55 ? '#FFFFFF' : SKINS[1 + pick(SKINS.length - 1)],
      eyes: rnd() < 0.7 ? a.eyes : pick(EYE_OPTS.length),
      brows: pick(BROW_OPTS.length),
      mouth: rnd() < 0.6 ? a.mouth : pick(MOUTH_OPTS.length),
    };
  },
  compose: (n, aspect, compact) =>
    groupPhoto(n, aspect, { gap: compact ? 0.95 : 1.02, charW: 0.9, charH: 1.1, riser: 0, depth: 0, fov: deg(18), margin: 0.1, turn: 0, lift: 0.06 }),
  solo: (aspect) => soloCamera(aspect, 0.9, 0.98, deg(18), 0.05),
  headLocal: () => [0, 0.74, 0.05],
  bounds: () => ({ c: [0, 0.525, 0], r: 0.67, occ: [] }),
  face: cardsFace,
  pack: (_c, _pose, f) => {
    f.data.fill(0);   // drawn in 2D by draw2d
  },
  draw2d: draw,
};
