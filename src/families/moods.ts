import { deg, normalize } from '../engine/math';
import type { Pose } from '../avatar/avatar';
import type { BaseConfig, Draw2DEnv, EyeSpec, FaceState, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';

/**
 * Moods: feelings drawn in wax crayon on flat colour dots, in the spirit of a
 * children's emotions poster. The dot is the whole character; the face is a
 * handful of crayon strokes (dot eyes, a hook nose, a big U smile) and the hair
 * is loopy scribble that escapes the circle.
 *
 * The crayon is the craft: every stroke is a pressure-varying ribbon (a faint
 * wide pass and a dense core), its centre line wobbles with seeded noise, and
 * all the ink goes onto an offscreen layer that a cached paper-tooth tile then
 * bites into ('destination-out') before it is laid over the dot. With "boil" on
 * the wobble and the grain re-roll 7 times a second, like hand-drawn animation.
 *
 * Face channels (the shared interpolated FaceState, read the Moods way):
 *   l/r.kind   eye shape (see EYE_*), swapped by the brain on a blink
 *   l/r.h      eye size;   l/r.dy  eye raise;   l/r.lid  brow amount;  l/r.rot brow angle
 *   mouth      curve (+ smile / - frown);  mouthOpen  how open;  lidB  mouth width 0..1
 *   l.lidAng   mouth wobble;  l.dx  mouth skew;  r.lidAng  floating hearts;  cheeks  blush
 */
export interface MoodsConfig extends BaseConfig {
  color: string;
  ink: string;
  shape: number;
  hair: number;
  chin: number;
  eyes: number;
  nose: number;
  mouth: number;
  cheeks: number;
  rough: number;
  boil: boolean;
}

type Pt = [number, number];

const opt = (labels: string[]): Option[] => labels.map((label, value) => ({ value, label }));
const SHAPE_OPTS = opt(['Circle', 'Hand-cut', 'Pebble', 'Egg']);
const HAIR_OPTS = opt(['None', 'Curl', 'Loops', 'Swoop', 'Ticks', 'Curly sides', 'Top knot', 'Mop', 'Side curls', 'Forelock', 'Heart']);
const CHIN_OPTS = opt(['None', 'Curly beard', 'Moustache']);
// eye kinds
const E_DOT = 0, E_DASH = 1, E_ARC = 2, E_CUP = 3, E_SQUEEZE = 4, E_RING = 5, E_HEART = 6, E_SPIRAL = 7, E_LASH = 8, E_VEE = 9;
const EYE_OPTS: Option[] = [
  { value: E_DOT, label: 'Dots' },
  { value: E_DASH, label: 'Dashes' },
  { value: E_CUP, label: 'Cups' },
  { value: E_ARC, label: 'Arcs' },
  { value: E_VEE, label: 'Vees' },
  { value: E_LASH, label: 'Lashes' },
  { value: E_SQUEEZE, label: 'Squeeze' },
];
const NOSE_OPTS = opt(['Hook', 'C', 'Beak', 'L', 'Curl', 'Dot', 'None']);
const MOUTH_OPTS = opt(['Big smile', 'Open D', 'Oh', 'Frown', 'Flat', 'Small smile', 'Wobbly']);
const CHEEK_OPTS = opt(['None', 'Blush', 'Freckles', 'Lines']);
// the poster's palette
const COLORS = ['#13B38B', '#F38BB4', '#FFD100', '#1B4EA2', '#EE2D42', '#F8C6CF', '#F47B36', '#2DB35D', '#1478C3'];
const INKS = ['#161514', '#3A2A22', '#22305E', '#5B1F2E', '#FFFFFF'];

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'laughing', label: 'Laughing' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'sad', label: 'Sad' },
  { value: 'grumpy', label: 'Grumpy' },
  { value: 'meh', label: 'Meh' },
  { value: 'shy', label: 'Shy' },
  { value: 'love', label: 'Love' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'wink', label: 'Wink' },
  { value: 'excited', label: 'Excited' },
  { value: 'pondering', label: 'Pondering' },
  { value: 'dizzy', label: 'Dizzy' },
];

// mouth presets per Mouth option: [curve, open, width, wobble]
const MOUTHS: Array<[number, number, number, number]> = [
  [0.95, 0, 0.92, 0],
  [1, 1, 0.66, 0],
  [0, 0.85, 0.16, 0],
  [-0.85, 0, 0.42, 0],
  [0, 0, 0.42, 0],
  [0.8, 0, 0.3, 0],
  [0.1, 0, 0.5, 1],
];

const isOpenEye = (k: number) => k === E_DOT || k === E_RING || k === E_HEART || k === E_VEE;

const moodsFace = (c: MoodsConfig, expr: string): FaceTarget => {
  const def = c.eyes ?? 0;
  const [mc, mo, mw, mwob] = MOUTHS[c.mouth] ?? MOUTHS[0];
  const e = (kind: number, h = 1, dy = 0, lid = 0, rot = 0): EyeSpec => ({ kind, w: 1, h, rot, lid, lidAng: 0, dx: 0, dy });
  const make = (l: EyeSpec, r: EyeSpec, curve: number, open: number, width: number, o: { wobble?: number; skew?: number; hearts?: number; cheeks?: number } = {}): FaceTarget => {
    l.lidAng = o.wobble ?? 0;
    l.dx = o.skew ?? 0;
    r.lidAng = o.hearts ?? 0;
    return { l, r, lidB: width, mouth: curve, mouthOpen: open, cheeks: o.cheeks ?? 0 };
  };
  // closed-eye styles stay as they are in moods that keep the default eyes
  const soft = def === E_DASH ? E_CUP : def;
  switch (expr) {
    case 'happy':
      return make(e(soft, 1, 0.3), e(soft, 1, 0.3), 0.95, c.mouth === 1 ? 1 : 0, Math.max(mw, 0.62), { cheeks: 0.35 });
    case 'laughing':
      return make(e(E_ARC, 1, 0.4), e(E_ARC, 1, 0.4), 1, 1, 0.68, { cheeks: 0.6 });
    case 'squeeze':
      return make(e(E_SQUEEZE, 1, 0.1), e(E_SQUEEZE, 1, 0.1), 1, 0.7, 0.5, { cheeks: 0.7 });
    case 'excited':
      return make(e(E_DOT, 1.45, 0.55), e(E_DOT, 1.45, 0.55), 1, 1, 0.72, { cheeks: 0.5 });
    case 'surprised':
      return make(e(E_DOT, 1.25, 0.6, 0.85, -0.25), e(E_DOT, 1.25, 0.6, 0.85, -0.25), 0, 0.9, 0.17);
    case 'sad':
      return make(e(E_DOT, 1, -0.25, 1, -0.45), e(E_DOT, 1, -0.25, 1, -0.45), -0.9, 0, 0.4);
    case 'grumpy':
      return make(e(E_DASH, 1, -0.1, 1, 0.5), e(E_DASH, 1, -0.1, 1, 0.5), -0.6, 0, 0.32, { wobble: 0.45 });
    case 'meh':
      return make(e(E_DASH, 1, 0), e(E_DASH, 1, 0), 0, 0, 0.45, { skew: 0.4 });
    case 'shy':
      return make(e(E_LASH, 1, -0.2), e(E_LASH, 1, -0.2), 0.8, 0, 0.26, { cheeks: 1 });
    case 'love':
      return make(e(E_HEART, 1.1, 0.3), e(E_HEART, 1.1, 0.3), 0.9, 0, 0.5, { hearts: 1, cheeks: 0.8 });
    case 'sleepy':
      return make(e(E_CUP, 0.9, -0.3), e(E_CUP, 0.9, -0.3), 0, 0.35, 0.12);
    case 'wink':
      return make(e(def === E_DASH || def === E_CUP ? E_DOT : def, 1, 0.2), e(E_ARC, 1, 0.25), 0.9, 0, 0.55, { skew: 0.5, cheeks: 0.3 });
    case 'pondering':
      return make(e(def, 1, 0.45, 0.7, -0.15), e(def, 1, 0.55, 0.7, 0.25), 0.05, 0, 0.24, { skew: -0.7 });
    case 'focused':
      return make(e(def, 0.85, -0.1, 0.6, 0.25), e(def, 0.85, -0.1, 0.6, 0.25), 0.25, 0, 0.26, { skew: 0.6 });
    case 'dizzy':
      return make(e(E_SPIRAL, 1, 0.1), e(E_SPIRAL, 1, 0.1), -0.1, 0.15, 0.45, { wobble: 1 });
    case 'listening':
      return make(e(def, 1.05, 0.4, 0.4, -0.15), e(def, 1.05, 0.4, 0.4, -0.15), mc + 0.1, mo, mw, { wobble: mwob });
    default:
      return make(e(def), e(def), mc, mo, mw, { wobble: mwob });
  }
};

const base = (o: Partial<MoodsConfig>): MoodsConfig => ({
  name: 'Mood',
  state: 'idle',
  expression: 'neutral',
  color: COLORS[0],
  ink: INKS[0],
  shape: 0,
  hair: 0,
  chin: 0,
  eyes: 0,
  nose: 0,
  mouth: 0,
  cheeks: 0,
  rough: 0.5,
  boil: true,
  ...o,
});

// ------------------------------------------------------------- noise & geometry
const h1 = (i: number, s: number) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/** smooth 1D value noise in 0..1 */
const n1 = (x: number, s: number) => {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return h1(i, s) * (1 - u) + h1(i + 1, s) * u;
};
const strHash = (s: string) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
  return h;
};

/** Catmull-Rom spline through the points */
const spl = (pts: Pt[], k = 8): Pt[] => {
  if (pts.length < 3) return pts;
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
};
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 16): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Pt;
  });
/** evenly spaced points along a polyline */
const resample = (pts: Pt[], step: number): Pt[] => {
  if (pts.length < 2) return pts;
  const out: Pt[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (seg < 1e-9) continue;
    let d = step - carry;
    while (d <= seg) {
      const f = d / seg;
      out.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]);
      d += step;
    }
    carry = seg - (d - step);
  }
  const last = pts[pts.length - 1], prev = out[out.length - 1];
  if (Math.hypot(last[0] - prev[0], last[1] - prev[1]) > step * 0.3) out.push(last);
  return out;
};
const heartPts = (x: number, y: number, s: number): Pt[] => {
  const pts: Pt[] = [];
  for (let i = 0; i <= 28; i++) {
    const t = Math.PI * 0.5 + (i / 28) * Math.PI * 2;   // start at the top dip
    const hx = 16 * Math.pow(Math.sin(t), 3);
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([x + (hx / 17) * s, y + (hy / 17) * s]);
  }
  return pts;
};
const starPts = (x: number, y: number, r: number, rot: number): Pt[] =>
  Array.from({ length: 11 }, (_, i) => {
    const a = rot + Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    return [x + Math.cos(a) * rr, y + Math.sin(a) * rr] as Pt;
  });

// ------------------------------------------------------------- the crayon
interface Crayon {
  ctx: CanvasRenderingContext2D;
  col: string;
  rough: number;
  /** boil frame (0 when boiling is off) */
  boil: number;
  w: number;
  /** deferred paint per pass (0 halo, 1 core) when drawing onto the grain layer */
  queue: Array<Array<(ctx: CanvasRenderingContext2D) => void>> | null;
}
const paint = (C: Crayon, pass: number, fn: (ctx: CanvasRenderingContext2D) => void) => {
  if (C.queue) C.queue[pass].push(fn);
  else fn(C.ctx);
};
/** a filled polygon in crayon colour, on one pass */
const fillPoly = (C: Crayon, pass: number, pts: Pt[], col: string, alpha: number) =>
  paint(C, pass, (ctx) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = col;
    ctx.fill();
  });
interface StrokeOpts {
  w?: number;
  a?: number;
  col?: string;
  /** draw only the first part of the stroke (hand-drawing reveal) */
  reveal?: number;
  /** pressure taper at the ends, 0..1 */
  taper?: number;
}

const ribbon = (ctx: CanvasRenderingContext2D, P: Pt[], N: Pt[], off: number[], hw: number[]) => {
  const n = P.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = P[i][0] + N[i][0] * (off[i] + hw[i]), y = P[i][1] + N[i][1] * (off[i] + hw[i]);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  // round end cap, then back along the other side, then the start cap
  const cap = (i: number, a0: number) => {
    const cx = P[i][0] + N[i][0] * off[i], cy = P[i][1] + N[i][1] * off[i];
    for (let k = 1; k < 6; k++) {
      const a = a0 - (k / 6) * Math.PI;
      ctx.lineTo(cx + Math.cos(a) * hw[i], cy + Math.sin(a) * hw[i]);
    }
  };
  cap(n - 1, Math.atan2(N[n - 1][1], N[n - 1][0]));
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(P[i][0] + N[i][0] * (off[i] - hw[i]), P[i][1] + N[i][1] * (off[i] - hw[i]));
  cap(0, Math.atan2(N[0][1], N[0][0]) + Math.PI);
  ctx.closePath();
};

/** one wax-crayon stroke: a faint wide pass and a dense core, both wobbling and changing pressure */
const stroke = (C: Crayon, pts: Pt[], seed: number, o: StrokeOpts = {}) => {
  let P = resample(pts, 0.0035);
  if (o.reveal !== undefined) {
    if (o.reveal <= 0.01) return;
    if (o.reveal < 1) P = P.slice(0, Math.max(2, Math.ceil(P.length * o.reveal)));
  }
  const n = P.length;
  if (n < 2) return;
  const r = C.rough;
  const bs = seed * 7.13 + C.boil * 17.31;
  // normals and arc length
  const N: Pt[] = [], S: number[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    S.push(s);
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    N.push([-dy / l, dx / l]);
  }
  const L = s || 1e-6;
  const w = (o.w ?? 1) * C.w;
  const amp = 0.0008 + 0.0026 * r;
  const taper = o.taper ?? 1;
  const passes: Array<[number, number, number]> = [
    // [width, alpha, side offset]: a wide pass the paper tooth bites hard, and a dense core
    [1.3 + 0.3 * r, 0.75, 0.1],
    [0.9, 1, -0.05],
  ];
  passes.forEach(([wm, alpha, side], pi) => {
    const off: number[] = [], hw: number[] = [];
    for (let i = 0; i < n; i++) {
      const u = S[i];
      const wob = amp * ((n1(u * 38 + pi * 3.7, bs) - 0.5) * 2 + 0.5 * (n1(u * 9, bs + 5) - 0.5));
      off[i] = wob + side * w;
      // pressure: a slow swell along the stroke, lighter at both ends, ragged edge grain
      const swell = 0.82 + (0.14 + 0.26 * r) * (n1(u * 7, seed * 3.1 + 1) - 0.5) * 2;
      const ends = Math.min(1, 0.45 + 0.55 * Math.min(u, L - u) / Math.min(0.03, L * 0.3 + 1e-6));
      const press = swell * (1 - taper + taper * ends);
      const rag = 1 + (0.1 + 0.2 * r) * (h1(i, bs + pi * 11) - 0.5) * 2;
      hw[i] = Math.max(0.0006, w * wm * press * rag * 0.5);
    }
    const col = o.col ?? C.col, a = alpha * (o.a ?? 1);
    paint(C, pi, (ctx) => {
      ribbon(ctx, P, N, off, hw);
      ctx.globalAlpha = a;
      ctx.fillStyle = col;
      ctx.fill();
    });
  });
};

/** a crayon dot: a dense jagged blob with a bitten halo */
const blob = (C: Crayon, x: number, y: number, rad: number, seed: number, o: { a?: number; col?: string; sy?: number } = {}) => {
  const bs = seed * 5.7 + C.boil * 13.1;
  const sy = o.sy ?? 1;
  ([[1.3, 0.8], [1, 1]] as const).forEach(([rm, al], pass) => {
    const pts: Pt[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const rr = rad * rm * (0.86 + 0.28 * h1(i, bs + rm));
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * sy]);
    }
    fillPoly(C, pass, pts, o.col ?? C.col, al * (o.a ?? 1));
  });
};

/** paper tooth: a tileable 128px mask of the spots where the wax skips */
let grainTile: HTMLCanvasElement | null | undefined;
const grain = (): HTMLCanvasElement | null => {
  if (grainTile !== undefined) return grainTile;
  if (typeof document === 'undefined') return (grainTile = null);
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  if (!g) return (grainTile = null);
  const im = g.createImageData(S, S);
  // tileable value noise with cells of cx by cy pixels
  const vn = (x: number, y: number, cx: number, cy: number, s: number) => {
    const nx = S / cx, ny = S / cy;
    const fx = x / cx, fy = y / cy;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const ux = fx - ix, uy = fy - iy;
    const sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
    const v = (i: number, j: number) => h1(((i % nx) + nx) % nx + (((j % ny) + ny) % ny) * 131, s);
    return (v(ix, iy) * (1 - sx) + v(ix + 1, iy) * sx) * (1 - sy) + (v(ix, iy + 1) * (1 - sx) + v(ix + 1, iy + 1) * sx) * sy;
  };
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const v = 0.34 * vn(x, y, 4, 4, 1) + 0.26 * vn(x, y, 16, 2, 2) + 0.14 * vn(x, y, 32, 32, 4) + 0.26 * h1(x + y * S, 3);
      const a = Math.min(1, Math.max(0, (v - 0.47) / 0.17));
      im.data[(x + y * S) * 4 + 3] = Math.round(a * 255);
    }
  g.putImageData(im, 0, 0);
  return (grainTile = cv);
};

/**
 * All crayon goes onto an offscreen layer covering the character's box, gets
 * bitten by the paper grain, then is laid over the main canvas. Falls back to
 * drawing straight onto ctx (no grain) when there is no DOM.
 */
type Queue = Array<Array<(ctx: CanvasRenderingContext2D) => void>>;
const inkLayer = (ctx: CanvasRenderingContext2D, env: Draw2DEnv, rough: number, boil: number): { L: CanvasRenderingContext2D; queue: Queue | null; finish: () => void } => {
  const direct = { L: ctx, queue: null, finish: () => {} };
  if (typeof document === 'undefined' || typeof ctx.getTransform !== 'function') return direct;
  const m = ctx.getTransform();
  if (!m || !Number.isFinite(m.a)) return direct;
  const U0 = -0.72, U1 = 0.72, V0 = -0.2, V1 = 1.26;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [u, v] of [[U0, V0], [U1, V0], [U0, V1], [U1, V1]]) {
    const x = m.a * u + m.c * v + m.e, y = m.b * u + m.d * v + m.f;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const bx = Math.floor(x0), by = Math.floor(y0);
  const w = Math.min(4096, Math.ceil((x1 - bx) / 64) * 64), h = Math.min(4096, Math.ceil((y1 - by) / 64) * 64);
  if (!(w > 0 && h > 0)) return direct;
  const L = env.canvas('moods-ink', w, h);
  if (!L || typeof L.setTransform !== 'function' || !L.canvas) return direct;
  L.setTransform(m.a, m.b, m.c, m.d, m.e - bx, m.f - by);
  const queue: Queue = [[], []];
  const tile = grain();
  // ~1 grain pixel per device pixel at studio size; the tooth shifts when the line boils
  const gs = Math.max(env.px, 0.0012);
  const bite = (alpha: number, salt: number) => {
    if (!tile) return;
    L.save();
    L.globalCompositeOperation = 'destination-out';
    L.globalAlpha = Math.min(1, alpha);
    const p = L.createPattern(tile, 'repeat');
    if (p) {
      if (typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().translate(h1(boil, salt) * 0.3, h1(boil, salt + 1) * 0.3).rotate(salt * 37).scale(gs, gs));
      L.fillStyle = p;
      L.fillRect(U0, V0, U1 - U0, V1 - V0);
    }
    L.restore();
  };
  return {
    L,
    queue,
    finish: () => {
      // halo strokes are bitten by the paper twice (sparse speckle), the cores once (dense, broken)
      for (const f of queue[0]) f(L);
      L.globalAlpha = 1;
      bite(0.75 + 0.35 * rough, 1);
      for (const f of queue[1]) f(L);
      L.globalAlpha = 1;
      bite(0.45 + 0.45 * rough, 5);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(L.canvas, bx, by);
      ctx.restore();
    },
  };
};

// ------------------------------------------------------------- colour helpers
const hex = (c: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: string, b: string, t: number) => {
  const A = hex(a), B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
};
const lum = (c: string) => {
  const [r, g, b] = hex(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

// ------------------------------------------------------------- drawing
const CX = 0, CY = 0.5, R = 0.36;
const SHAPES: Array<[number, number]> = [[R, R], [R, R], [0.385, 0.34], [0.335, 0.375]];

interface P {
  C: Crayon;
  c: MoodsConfig;
  pose: Pose;
  face: FaceState;
  t: number;
  rx: number;
  ry: number;
  cy: number;
  fx: number;
  fy: number;
  /** hair map: normalised circle coords -> units, with a little parallax */
  hm: (u: number, v: number) => Pt;
}

/** the dot outline: a circle, a scissor-cut circle, a pebble or an egg, jiggling when poked */
const bodyPts = (c: MoodsConfig, pose: Pose, t: number, cy: number): Pt[] => {
  const [rx, ry] = SHAPES[c.shape] ?? SHAPES[0];
  const seed = strHash(c.color + c.name);
  const jig = 0.05 * pose.wobble * Math.sin(pose.wobblePhase) + 0.03 * pose.pokeAmp;
  const n = 72;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    let k = 1 + jig * Math.cos(2 * a) + 0.004 * Math.sin(t * 1.7 + a * 3) * 0;
    if (c.shape === 1) {
      // scissor cut: a few long, slightly flat cuts and a tiny wobble
      const cuts = 9, f = (a / (Math.PI * 2)) * cuts + h1(seed, 4);
      const fr = f - Math.floor(f);
      k *= 1 + 0.016 * (n1(a * 2.2, seed) - 0.5) * 2 - 0.012 * Math.sin(fr * Math.PI) + 0.004;
    }
    let x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    if (c.shape === 3) x *= 1 + 0.05 * -Math.sin(a);   // egg: fuller at the bottom
    return [CX + x, cy + y] as Pt;
  });
};

// ---- hair ----------------------------------------------------------------
/** a cursive row of 'e' loops along an arc of the head (angles in radians, radius in head radii) */
const loopRow = (hm: P['hm'], a0: number, a1: number, rad: number, n: number, H: number, back: number, lead = 0, tail = 0): Pt[] => {
  const pts: Pt[] = [];
  const dir = Math.sign(a1 - a0);
  const steps = n * 22;
  for (let i = 0; i <= steps; i++) {
    const t = Math.PI + (i / steps) * Math.PI * 2 * n;
    const s = i / steps;
    const a = a0 + (a1 - a0) * s - dir * back * Math.sin(t);
    const rr = rad + H * (1 + Math.cos(t)) * 0.5;
    pts.push(hm(Math.cos(a) * rr, Math.sin(a) * rr));
  }
  if (lead) pts.unshift(hm(Math.cos(a0 - dir * lead) * (rad - 0.05), Math.sin(a0 - dir * lead) * (rad - 0.05)));
  if (tail) {
    const a = a1 + dir * tail;
    pts.push(hm(Math.cos(a) * (rad + 0.08), Math.sin(a) * (rad + 0.08)));
  }
  return spl(pts, 2);
};
const hairStrokes = (p: P): Array<{ pts: Pt[]; w?: number; seed: number }> => {
  const { c, hm, t } = p;
  const S = (pts: Array<[number, number]>, k = 8) => spl(pts.map(([u, v]) => hm(u, v)), k);
  switch (c.hair) {
    case 1: // a single tall curl, like a cursive l
      return [{ seed: 101, pts: S([[-0.1, 0.78], [-0.06, 0.96], [0.04, 1.18], [0.12, 1.38], [0.06, 1.54], [-0.1, 1.52], [-0.14, 1.36], [-0.02, 1.2], [0.16, 1.1], [0.34, 1.1], [0.46, 1.2]]) }];
    case 2: // a row of loops across the top with a tail curling off the right
      return [{ seed: 102, pts: loopRow(hm, Math.PI * 0.94, Math.PI * 0.14, 0.93, 5, 0.42, 0.22, 0.08, 0.32) }];
    case 3: // a flat swoop over the brow with two whiskers
      return [
        { seed: 103, pts: S([[-0.9, 1.0], [-0.4, 1.06], [0.15, 1.1], [0.6, 1.2], [0.92, 1.38]]) },
        { seed: 104, pts: S([[-0.45, 0.62], [0.05, 0.64], [0.55, 0.6]], 6), w: 0.95 },
        { seed: 105, pts: S([[-0.82, 1.06], [-0.8, 1.2]], 4), w: 0.7 },
        { seed: 106, pts: S([[-0.68, 1.08], [-0.64, 1.2]], 4), w: 0.7 },
      ];
    case 4: // three ticks
      return [-0.22, -0.05, 0.12].map((x, i) => ({ seed: 110 + i, w: 0.95, pts: S([[x, 0.94 - i * 0.01], [x + 0.03, 1.08], [x + 0.08, 1.2 + i * 0.02]], 5) }));
    case 5: // curls off both sides
      return [
        { seed: 120, pts: loopRow(hm, Math.PI * 0.45, -Math.PI * 0.02, 0.94, 2, 0.4, 0.42, 0.06, 0.2) },
        { seed: 121, pts: loopRow(hm, Math.PI * 0.84, Math.PI * 1.1, 0.95, 1, 0.36, 0.42, 0.05, 0.15) },
      ];
    case 6: { // a swoop with a little 'm' knot on top
      const bob = 0.02 * Math.sin(t * 2.4);
      return [
        { seed: 130, pts: S([[-0.92, 0.94], [-0.4, 1.04], [0.3, 1.06], [0.88, 0.96]]) },
        { seed: 131, pts: S([[-0.2, 1.04], [-0.17, 1.24 + bob], [-0.06, 1.28 + bob], [-0.01, 1.08], [0.04, 1.28 + bob], [0.15, 1.26 + bob], [0.18, 1.05]], 6) },
      ];
    }
    case 7: // a scribbly mop of overlapping curls
      return [
        { seed: 140, pts: loopRow(hm, Math.PI * 0.9, Math.PI * 0.2, 1.0, 3, 0.48, 0.34, 0.1, 0.1) },
        { seed: 141, pts: loopRow(hm, Math.PI * 0.72, Math.PI * 0.42, 1.12, 1, 0.3, 0.3, 0, 0), w: 0.85 },
      ];
    case 8: // ringlets down one side and a short fringe
      return [
        { seed: 150, pts: loopRow(hm, Math.PI * 0.6, Math.PI * 1.28, 0.95, 3, 0.36, 0.34, 0.08, 0.12) },
        { seed: 151, pts: S([[-0.32, 0.8], [0.0, 0.86], [0.3, 0.82]], 6), w: 0.9 },
      ];
    case 9: // a curl hanging into the face
      return [{ seed: 160, pts: S([[0.06, 1.16], [0.04, 0.98], [-0.1, 0.86], [-0.2, 0.7], [-0.08, 0.56], [0.12, 0.6], [0.16, 0.76], [0.02, 0.86], [-0.06, 0.74]]) }];
    case 10: { // three wisps and a floating heart
      const b = 0.04 * Math.sin(t * 2.2);
      return [
        ...[-0.38, -0.26, -0.14].map((x, i) => ({ seed: 170 + i, w: 0.85, pts: S([[x, 0.66], [x - 0.02, 0.76 + i * 0.01], [x - 0.04, 0.86]], 4) })),
        { seed: 175, pts: heartPts(hm(0.62, 1.22 + b)[0], hm(0.62, 1.22 + b)[1], 0.05), w: 0.85 },
      ];
    }
    default:
      return [];
  }
};

const hair = (p: P) => {
  for (const s of hairStrokes(p)) stroke(p.C, s.pts, s.seed, { w: s.w });
};

const chin = (p: P) => {
  const { c, hm, C } = p;
  if (c.chin === 1) stroke(C, loopRow(hm, Math.PI * 1.2, Math.PI * 1.8, 0.88, 4, 0.34, 0.26, 0.04, 0.04), 180);
};

// ---- face ----------------------------------------------------------------
const eyePos = (p: P, s: number, spec: EyeSpec): Pt => [CX + s * 0.31 * p.rx + p.fx, p.cy + 0.065 + 0.03 * spec.dy + p.fy];

const eye = (p: P, s: number, spec: EyeSpec) => {
  const { C, pose } = p;
  const [x0, y0] = eyePos(p, s, spec);
  const sz = spec.h;
  const k = isOpenEye(spec.kind) && pose.blink > 0.45 ? E_DASH : spec.kind;
  const lx = isOpenEye(k) ? pose.lookX * 0.012 : 0, ly = isOpenEye(k) ? pose.lookY * 0.01 : 0;
  const x = x0 + lx, y = y0 + ly;
  const seed = 200 + (s > 0 ? 20 : 0);
  const q = (pts: Array<[number, number]>, kk = 5) => spl(pts.map(([u, v]) => [x + u * sz * s, y + v * sz] as Pt), kk);
  switch (k) {
    case E_DOT: {
      const squish = 1 - 0.6 * Math.min(1, pose.blink * 2);
      blob(C, x, y, 0.021 * sz, seed, { sy: squish });
      break;
    }
    case E_DASH:
      stroke(C, q([[-0.026, 0.002], [0, -0.001], [0.026, 0.003]]), seed);
      break;
    case E_ARC:
      stroke(C, q([[-0.028, -0.012], [-0.014, 0.008], [0.002, 0.014], [0.016, 0.006], [0.028, -0.012]]), seed);
      break;
    case E_CUP:
      stroke(C, q([[-0.026, 0.012], [-0.016, -0.008], [0, -0.014], [0.016, -0.008], [0.026, 0.012]]), seed);
      break;
    case E_SQUEEZE:
      stroke(C, q([[-0.024, 0.02], [0.022, 0.002], [-0.024, -0.018]], 3), seed);
      break;
    case E_RING:
      stroke(C, arc(x, y, 0.024 * sz, 0.026 * sz, Math.PI * 0.6, Math.PI * 2.75, 18), seed, { w: 0.85 });
      break;
    case E_HEART: {
      const pts = heartPts(x, y + 0.002, 0.03 * sz);
      fillPoly(C, 1, pts, C.col, 0.9);
      stroke(C, pts, seed, { w: 0.8 });
      break;
    }
    case E_SPIRAL: {
      const spin = p.t * 4 * s;
      const pts: Pt[] = [];
      for (let i = 0; i <= 30; i++) {
        const a = spin + (i / 30) * Math.PI * 4.2, r = 0.004 + (i / 30) * 0.026 * sz;
        pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
      }
      stroke(C, pts, seed, { w: 0.75 });
      break;
    }
    case E_LASH:
      stroke(C, q([[-0.026, 0.01], [-0.012, -0.008], [0.006, -0.012], [0.026, 0.004]]), seed);
      stroke(C, q([[0.026, 0.004], [0.038, 0.012]], 2), seed + 3, { w: 0.7 });
      stroke(C, q([[0.018, -0.004], [0.03, -0.012]], 2), seed + 4, { w: 0.7 });
      break;
    case E_VEE:
      stroke(C, q([[-0.016, 0.016], [-0.004, -0.012], [0.004, -0.008], [0.014, 0.02]], 4), seed);
      break;
  }
  // brows carry sad / grumpy / surprised
  if (spec.lid > 0.05) {
    const bx = x0 - s * 0.004, by = y0 + 0.058 + 0.02 * Math.max(0, -spec.rot);
    const a = spec.rot, hl = 0.03;
    stroke(C, [[bx - s * hl, by - Math.sin(a) * hl], [bx, by + 0.004], [bx + s * hl, by + Math.sin(a) * hl]], seed + 9, { a: Math.min(1, spec.lid), w: 0.85 });
  }
};

const nose = (p: P) => {
  const { C, c } = p;
  const x = CX + p.fx * 1.25, y = p.cy - 0.005 + p.fy * 1.1;
  const NS = 1.35;
  const q = (pts: Array<[number, number]>, k = 5) => spl(pts.map(([u, v]) => [x + u * NS, y + v * NS] as Pt), k);
  switch (c.nose) {
    case 0: stroke(C, q([[-0.016, 0.05], [0.018, 0.052], [0.004, 0.012], [-0.012, -0.02], [0.016, -0.022]], 3), 300); break;
    case 1: stroke(C, arc(x + 0.008, y + 0.004, 0.032, 0.04, Math.PI * 0.35, Math.PI * 1.65, 12), 301); break;
    case 2: stroke(C, q([[0.018, 0.036], [-0.022, 0.006], [0.018, -0.02]], 3), 302); break;
    case 3: stroke(C, q([[-0.008, 0.054], [-0.014, 0.0], [-0.012, -0.022], [0.022, -0.02]], 3), 303); break;
    case 4: stroke(C, q([[0.002, 0.056], [0.014, 0.02], [0.006, -0.012], [-0.012, -0.02], [-0.02, -0.008]], 5), 304); break;
    case 5: blob(C, x, y, 0.015, 305); break;
  }
};

const mouth = (p: P) => {
  const { C, face, pose, t } = p;
  const W = 0.03 + 0.2 * Math.max(0, face.lidB);
  const cv = Math.max(-1.2, Math.min(1.2, face.mouth));
  const o = Math.max(face.mouthOpen, Math.min(1, pose.talk * 0.85));
  const cp = Math.max(0, cv);
  const depth = cv * W * (0.62 + 0.25 * Math.max(0, face.lidB));
  const T = depth * (1 - o) - o * (1 - cp) * W * 0.8;
  const B = depth * (1 - 0.4 * o) + o * W * (0.6 + 0.4 * cp) + o * 0.012;
  const ax = CX + p.fx * 0.95, ay = p.cy - 0.11 + p.fy * 0.9;
  // open mouths hang from just under the nose; lines sit centred on the anchor
  const lo = Math.max(0, T, B), hi = Math.max(0, -T, -B);
  const centred = ay + (lo - hi) * 0.5, hung = ay + 0.035 + Math.min(0, T);
  const yc = centred - Math.min(1, o * 1.5) * Math.max(0, centred - hung);
  const wob = Math.max(0, face.l.lidAng), skew = face.l.dx;
  const n = 16;
  const edge = (D: number, wv: number) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const u = -1 + (2 * i) / n;
      const f = Math.pow(Math.max(0, 1 - u * u), 0.62);
      const wave = wv * Math.min(0.009, W * 0.12) * Math.sin(u * Math.PI * 2.5 + 0.6 + t * 0);
      return [ax + u * W, yc - D * f + skew * u * W * 0.22 + wave] as Pt;
    });
  if (o < 0.08) {
    const line = edge((T + B) * 0.5, wob);
    stroke(C, line, 400);
    // dimple ticks at the corners of a big smile
    if (cv > 0.6 && W > 0.14) {
      for (const s of [-1, 1]) {
        const [ex, ey] = line[s < 0 ? 0 : n];
        stroke(C, [[ex - s * 0.012, ey + 0.016], [ex + s * 0.012, ey - 0.008]], 410 + s, { w: 0.75 });
      }
    }
    return;
  }
  const top = edge(T, wob * 0.6), bot = edge(B, wob);
  // one continuous crayon loop: along the top, back along the bottom, overshooting the start a touch
  const loop = [...top, ...bot.reverse(), top[0], top[1], top[2]];
  stroke(C, loop, 401, { taper: 0.6 });
};

const cheeks = (p: P) => {
  const { C, c, face, rx } = p;
  const amt = Math.max(c.cheeks === 1 ? 1 : 0, Math.min(1, face.cheeks));
  const y = p.cy + 0.002 + p.fy * 0.85;
  for (const s of [-1, 1]) {
    const x = CX + s * 0.64 * rx + p.fx * 0.85;
    if (amt > 0.05) {
      // a little crayon scribble in a blush tone
      const tone = lum(c.color) > 0.75 || /^#?(e|f)[0-9a-f]{2}[0-4]/i.test(c.color) ? mix(c.color, '#C81E3C', 0.55) : mix(c.color, '#FF4F7B', 0.62);
      const pts: Pt[] = [];
      for (let i = 0; i <= 6; i++) pts.push([x - 0.035 + i * 0.012, y + (i % 2 ? 0.016 : -0.016)]);
      stroke(C, spl(pts, 3), 500 + s, { w: 0.65, col: tone, a: 0.9 * amt, taper: 0.4 });
    }
    if (c.cheeks === 2) for (const [dx, dy] of [[-0.016, 0.008], [0.008, 0.012], [0.0, -0.01]]) blob(C, x + s * dx, y + dy, 0.006, 510 + dx * 100 + s);
    if (c.cheeks === 3) for (let i = 0; i < 3; i++) stroke(C, [[x - 0.03 + i * 0.022, y - 0.014], [x - 0.018 + i * 0.022, y + 0.016]], 520 + i + s * 5, { w: 0.6 });
  }
};

const moustache = (p: P) => {
  if (p.c.chin !== 2) return;
  const x = CX + p.fx * 1.1, y = p.cy - 0.05 + p.fy;
  for (const s of [-1, 1]) {
    const q: Pt[] = spl(([[0.0, 0.0], [0.032, -0.008], [0.06, 0.002], [0.066, 0.022], [0.05, 0.026], [0.046, 0.012]] as Pt[]).map(([u, v]) => [x + s * u, y + v] as Pt), 4);
    stroke(p.C, q, 600 + s, { w: 0.9 });
  }
};

// ---- props: the state's crayon doodles around the dot ---------------------
const props = (p: P) => {
  const { C, pose, t, face, rx, ry, cy } = p;
  const pr = pose.props;
  const right = CX + rx, top = cy + ry;
  // listening: sound arcs at the ears
  const ears = pr.ears ?? 0;
  if (ears > 0.05) {
    for (const s of [-1, 1])
      for (let i = 0; i < 2; i++) {
        const ph = (t * 1.4 + i * 0.5) % 1;
        const r = 0.05 + i * 0.045;
        stroke(C, arc(CX + s * (rx - 0.02), cy + 0.02, r, r * 1.2, s > 0 ? -0.7 : Math.PI - 0.7, s > 0 ? 0.7 : Math.PI + 0.7, 8), 700 + i + s * 3, { a: ears * (0.5 + 0.5 * Math.sin(ph * Math.PI)), w: 0.8 });
      }
  }
  // thinking: rising thought rings and a question mark drawn in, over and over
  const th = pose.props.think ?? 0;
  if (th > 0.05) {
    const cyc = (t % 3.2) / 3.2;
    const rv = Math.min(1, cyc * 2.2);
    for (let i = 0; i < 3; i++) {
      const r = 0.009 + i * 0.006;
      const x = right - 0.1 + i * 0.045, y = top - 0.02 + i * 0.045 + 0.006 * Math.sin(t * 2 + i);
      stroke(C, arc(x, y, r, r, 0.3, Math.PI * 2.4, 10), 720 + i, { a: th * Math.min(1, Math.max(0, cyc * 6 - i)), w: 0.7 });
    }
    const qx = right + 0.08, qy = top + 0.12, QS = 1.3;
    const qm = spl(([[-0.032, 0.034], [-0.024, 0.06], [0.004, 0.072], [0.03, 0.06], [0.034, 0.036], [0.016, 0.018], [0.0, 0.004], [-0.002, -0.022]] as Pt[]).map(([u, v]) => [qx + u * QS, qy + v * QS] as Pt), 6);
    stroke(C, qm, 730, { reveal: rv, a: th });
    if (rv >= 1) blob(C, qx - 0.003, qy - 0.06, 0.011, 731, { a: th });
  }
  // working: a scribble being filled in and quick motion dashes
  const sc = pr.scribble ?? 0;
  if (sc > 0.05) {
    const cyc = (t % 2.4) / 2.4;
    const pts: Pt[] = [];
    const ox = right + 0.03, oy = cy - 0.3;
    for (let i = 0; i <= 70; i++) {
      const a = i * 0.62;
      pts.push([ox + Math.cos(a) * 0.06 + i * 0.0022 - 0.08, oy + Math.sin(a * 1.13) * 0.045 + 0.01 * Math.sin(i * 0.21)]);
    }
    stroke(C, spl(pts, 2), 740, { reveal: Math.min(1, cyc * 1.4), a: sc, w: 0.7 });
    for (let i = 0; i < 3; i++) {
      const y = cy + 0.12 - i * 0.1, j = 0.012 * Math.sin(t * 9 + i * 2);
      stroke(C, [[-rx - 0.05 + j, y], [-rx - 0.12 + j, y + 0.01]], 750 + i, { a: sc * (0.6 + 0.4 * Math.sin(t * 6 + i)), w: 0.75 });
    }
  }
  // speaking: little voice arcs by the mouth
  const vo = pr.voice ?? 0;
  if (vo > 0.05) {
    const lv = 0.8 + Math.min(1, pose.talk * 1.4) * 0.2;
    for (let i = 0; i < 3; i++) {
      const r = 0.06 + i * 0.04;
      stroke(C, arc(right - 0.05, cy - 0.1, r * lv, r * 1.2 * lv, -0.6, 0.6, 10), 760 + i, { a: vo * (1 - i * 0.2), w: 0.8 });
    }
  }
  // done: stars and sparkles twinkling round the top
  const st = pr.stars ?? 0;
  if (st > 0.05) {
    const spots: Array<[number, number, number]> = [[-0.44, 0.92, 0.05], [0.45, 0.98, 0.045], [-0.3, 1.06, 0.03], [0.3, 1.1, 0.032], [0.5, 0.7, 0.03]];
    spots.forEach(([x, y, r], i) => {
      const tw = 0.75 + 0.25 * Math.sin(t * 5 + i * 1.7);
      if (i % 2 === 0) stroke(C, starPts(x, y, r * tw * st, 0.2 * Math.sin(t + i)), 770 + i, { w: 0.75 });
      else {
        const L2 = r * tw * st;
        stroke(C, [[x - L2, y], [x + L2, y]], 780 + i, { w: 0.75 });
        stroke(C, [[x, y - L2], [x, y + L2]], 790 + i, { w: 0.75 });
      }
    });
  }
  // sleeping: zzz drifting up
  const zz = pr.zzz ?? 0;
  if (zz > 0.05) {
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.32 + i / 3) % 1;
      const s = 0.022 + ph * 0.035;
      const x = right - 0.06 + ph * 0.18 + 0.02 * Math.sin(ph * 6), y = top - 0.06 + ph * 0.3;
      const a = zz * Math.min(1, ph * 5) * Math.min(1, (1 - ph) * 3);
      stroke(C, [[x - s, y + s], [x + s, y + s], [x - s, y - s], [x + s, y - s]], 800 + i, { a, w: 0.75 });
    }
  }
  // love: hearts popping up
  const hearts = Math.max(0, face.r.lidAng);
  if (hearts > 0.05) {
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.45 + i / 3) % 1;
      const x = (i - 1) * 0.3 + 0.03 * Math.sin(ph * 7 + i), y = top - 0.02 + ph * 0.26;
      const s = 0.02 + 0.02 * Math.min(1, ph * 4);
      const pts = heartPts(x, y, s);
      const a = hearts * Math.min(1, ph * 6) * Math.min(1, (1 - ph) * 3);
      fillPoly(C, 1, pts, '#E8384F', 0.7 * a);
      stroke(C, pts, 820 + i, { a, w: 0.75 });
    }
  }
};

const draw = (ctx: CanvasRenderingContext2D, c: MoodsConfig, pose: Pose, face: FaceState, env: Draw2DEnv) => {
  const t = env.t;
  const [rx0, ry0] = SHAPES[c.shape] ?? SHAPES[0];
  const breathe = 1 + 0.008 * Math.sin(t * 2.1) + 0.02 * pose.excite;
  const rx = rx0 * breathe, ry = ry0 * breathe;
  const cy = CY;
  // features slide across the dot towards where it looks
  const fx = Math.max(-0.1, Math.min(0.1, pose.headYaw * 0.16 + pose.lookX * 0.035 + pose.yaw * 0.03));
  const fy = Math.max(-0.08, Math.min(0.08, -pose.headPitch * 0.12 + pose.lookY * 0.03));

  // 1. the flat colour dot
  const outline = bodyPts(c, pose, t, cy).map(([x, y]) => [CX + (x - CX) * breathe, cy + (y - cy) * breathe] as Pt);
  ctx.beginPath();
  outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = c.color;
  ctx.fill();

  // 2. the crayon, on its own grainy layer
  const rough = Math.max(0, Math.min(1, Number(c.rough ?? 0.5)));
  const boil = c.boil === false ? 0 : Math.floor(t * 7);
  const { L, queue, finish } = inkLayer(ctx, env, rough, boil);
  const C: Crayon = { ctx: L, col: c.ink || INKS[0], rough, boil, w: 0.023, queue };
  const hm = (u: number, v: number): Pt => [CX + u * rx + fx * 0.45, cy + v * ry + fy * 0.3];
  const p: P = { C, c, pose, face, t, rx, ry, cy, fx, fy, hm };
  L.save();
  L.lineCap = 'round';
  L.lineJoin = 'round';
  hair(p);
  chin(p);
  cheeks(p);
  eye(p, -1, face.l);
  eye(p, 1, face.r);
  nose(p);
  moustache(p);
  mouth(p);
  props(p);
  L.restore();
  finish();
};

export const moods: FamilyDef<MoodsConfig> = {
  id: 'moods',
  name: 'Moods',
  maker: 'Crayon emotions',
  tagline: 'Crayon faces on colour dots · loopy hair · one line per feeling',
  subtitle: 'Wax-crayon faces on flat colour dots, like a kids’ feelings poster',
  shader: '',
  anchors: 0,
  background: '#F7F1E3',
  backgroundSolid: '#F7F1E3',
  dark: false,
  traits: ['Grainy wax-crayon line', 'Loopy hair that escapes the dot', 'A face for every feeling'],
  look: {
    dark: false, groundShadow: 0, exposure: 1, groundY: 0,
    lights: { key: normalize([-0.5, 0.8, 0.6]), keyI: 1, rim: normalize([0.5, 0.4, -0.7]), rimI: 0.5, fill: normalize([0.8, 0.1, 0.55]), fillI: 0.3, sky: [0.8, 0.8, 0.8], ground: [0.5, 0.5, 0.5], warm: [1, 1, 1], env: 1 },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Bobbing, breathing, blinking', bob: [0.008, 0.45], squash: [0.012, 0.45] },
    listening: { label: 'Listening', hint: 'Brows up, ears full of squiggles', expr: 'listening', gaze: 'user', lean: 0.05, props: { ears: 1 } },
    thinking: { label: 'Thinking', hint: 'Thought rings and a question mark', expr: 'pondering', gaze: 'up', sway: [0.03, 0.3], props: { think: 1 } },
    working: { label: 'Working', hint: 'Scribbling away', expr: 'focused', gaze: 'down', bob: [0.012, 2.2], squash: [0.02, 2.2], props: { scribble: 1 } },
    speaking: { label: 'Speaking', hint: 'Mouth and voice lines move', expr: 'happy', talk: 1, gaze: 'user', props: { voice: 1 } },
    done: { label: 'Done', hint: 'Crayon stars all round', expr: 'laughing', enter: 'celebrate', bob: [0.012, 1.2], props: { stars: 1 } },
    sleeping: { label: 'Sleeping', hint: 'Zzz in crayon', expr: 'sleepy', gaze: 'closed', sink: 0.01, bob: [0.005, 0.25], props: { zzz: 1 } },
    smitten: { label: 'Smitten', hint: 'Heart eyes, hearts popping', expr: 'love', gaze: 'user', sway: [0.04, 0.5], bob: [0.01, 0.9] },
  },
  personality: { body: [2.0, 0.55, 0.6], eyes: [6.5, 0.85, 0.0], squash: [240, 11], reach: [0.2, 0.14], eyeShare: 0.55, hopGravity: 12 },
  expressions: EXPRESSIONS,
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
      id: 'dot',
      title: 'Dot & hair',
      controls: [
        { type: 'swatches', key: 'color', label: 'Colour', colors: COLORS, custom: true },
        { type: 'chips', key: 'shape', label: 'Shape', options: SHAPE_OPTS },
        { type: 'chips', key: 'hair', label: 'Hair', options: HAIR_OPTS },
        { type: 'chips', key: 'chin', label: 'Chin', options: CHIN_OPTS },
      ],
    },
    {
      id: 'face',
      title: 'Face',
      controls: [
        { type: 'chips', key: 'eyes', label: 'Eyes', options: EYE_OPTS },
        { type: 'chips', key: 'nose', label: 'Nose', options: NOSE_OPTS },
        { type: 'chips', key: 'mouth', label: 'Mouth', options: MOUTH_OPTS },
        { type: 'chips', key: 'cheeks', label: 'Cheeks', options: CHEEK_OPTS },
        { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS },
      ],
    },
    {
      id: 'crayon',
      title: 'Crayon',
      controls: [
        { type: 'swatches', key: 'ink', label: 'Crayon', colors: INKS, custom: true },
        { type: 'slider', key: 'rough', label: 'Roughness', min: 0, max: 1, step: 0.01 },
        { type: 'toggle', key: 'boil', label: 'Line boil' },
      ],
    },
  ],
  roster: () => [
    base({ name: 'Pip', color: COLORS[0], hair: 1, eyes: E_DOT, nose: 4, mouth: 0 }),
    base({ name: 'Lulu', color: COLORS[1], hair: 2, eyes: E_CUP, nose: 2, mouth: 5, cheeks: 1, expression: 'happy' }),
    base({ name: 'Bert', color: COLORS[2], hair: 3, eyes: E_DASH, nose: 0, mouth: 4, expression: 'meh', shape: 1 }),
    base({ name: 'Bo', color: COLORS[3], hair: 4, eyes: E_DOT, nose: 2, mouth: 1, expression: 'laughing' }),
    base({ name: 'Clementine', color: COLORS[6], hair: 6, chin: 1, eyes: E_DOT, nose: 3, mouth: 0, expression: 'happy', shape: 2 }),
  ],
  randomize: (c, rnd) => {
    const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
    return {
      ...c,
      color: pick(COLORS),
      shape: rnd() < 0.6 ? 0 : pick([1, 1, 2, 3]),
      hair: pick([0, 1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      chin: rnd() < 0.15 ? 1 : rnd() < 0.1 ? 2 : 0,
      eyes: pick([E_DOT, E_DOT, E_DOT, E_DASH, E_CUP, E_ARC, E_VEE, E_LASH]),
      nose: pick([0, 0, 1, 2, 3, 4, 5, 6]),
      mouth: pick([0, 0, 1, 2, 4, 5, 5, 6]),
      cheeks: rnd() < 0.55 ? 0 : pick([1, 1, 2, 3]),
      ink: rnd() < 0.85 ? INKS[0] : pick(INKS.slice(1, 4)),
    };
  },
  compose: (n, aspect, compact) =>
    groupPhoto(n, aspect, { gap: compact ? 1.0 : 1.1, charW: 1.05, charH: 1.05, riser: 0, depth: 0, fov: deg(18), margin: 0.1, turn: 0, lift: 0.08 }),
  solo: (aspect) => soloCamera(aspect, 1.05, 1.05, deg(18), 0.08),
  headLocal: () => [0, 0.55, 0.1],
  bounds: () => ({ c: [0, 0.5, 0], r: 0.6, occ: [] }),
  face: moodsFace,
  pack: (_c, _pose, f) => {
    f.data.fill(0);   // drawn in 2D by draw2d
  },
  draw2d: draw,
};
