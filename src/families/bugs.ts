import { deg, normalize } from '../engine/math';
import type { Pose } from '../avatar/avatar';
import type { BaseConfig, Draw2DEnv, EyeSpec, FaceState, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';

/**
 * Bugs: whimsical marker-and-gouache critters on white paper. Bodies are
 * blobs of saturated paint with streaky brush grain, pooled darker edges and
 * wobbly outlines; everything else is crisp black fine-liner: stick legs with
 * tiny feet, feelers, googly eyes, line mouths and rows of square teeth.
 * Built from interchangeable parts; the brain is the shared one: googly eyes
 * follow the cursor, legs tap and scuttle, wings buzz, feelers lag on springs.
 */
export interface BugsConfig extends BaseConfig {
  body: number;
  color: string;
  pattern: number;
  color2: string;
  accent: string;
  legs: number;
  legColor: number;
  arms: number;
  wings: number;
  antennae: number;
  eyes: number;
  mouth: number;
}

type Pt = [number, number];
const INK = '#1B1817';
const LW = 0.008;   // fine-liner weight in character units
const PAPER = '#FBFAF6';
const TAU = Math.PI * 2;

const opt = (labels: string[]): Option[] => labels.map((label, value) => ({ value, label }));
const BODY_OPTS = opt(['Round', 'Bean', 'Pear', 'Dome', 'Fuzzball', 'Caterpillar', 'Snout beetle', 'Worm']);
const PATTERN_OPTS = opt(['None', 'Dots', 'Stripes', 'Fur ticks', 'Two-tone', 'Spots']);
const LEG_OPTS = opt(['2', '4', '6', '8', 'Many']);
const LEG_COLOR_OPTS = opt(['Black', 'Red', 'Blue']);
const ARM_OPTS = opt(['None', 'Stick arms']);
const WING_OPTS = opt(['None', 'Painted', 'Striped', 'Hatched', 'See-through']);
const ANT_OPTS = opt(['None', 'Dot tips', 'Tufts', 'Paddles', 'Horns']);
const EYE_OPTS = opt(['Pair', 'Stalks', 'Cyclops', 'Three', 'Big pair']);
const MOUTH_OPTS = opt(['Smile', 'Teeth', 'Snout', 'Long beak', 'Fangs']);
const LEG_INKS = [INK, '#D9322B', '#2A62B8'];

// the sheet's paint box
const COLORS = ['#1FA394', '#F0862E', '#E5302C', '#F27AAE', '#7B4A2D', '#2B9FDC', '#D9A23C', '#F08B78', '#2A3990', '#2A2626', '#FFFFFF'];
const COLORS2 = ['#FFFFFF', '#E5302C', '#2A3990', '#F0862E', '#7B4A2D', '#F27AAE', '#2B9FDC', '#1FA394', '#D9A23C', '#2A2626'];
const ACCENTS = ['#F0862E', '#E5302C', '#F27AAE', '#D9A23C', '#C9B26A', '#2B9FDC', '#1FA394', '#7B4A2D', '#FFFFFF'];

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'grumpy', label: 'Grumpy' },
  { value: 'worried', label: 'Worried' },
  { value: 'silly', label: 'Silly' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'excited', label: 'Excited' },
];

// eye kinds: 0 googly, 1 happy arc, 2 closed, 3 squeeze chevron, 4 dizzy spiral.
// w = eye size, h = pupil size, lid = upper lid, rot = lid tilt (+ cross), dx/dy = pupil bias.
// lidB is reused as a "tongue out" flag.
const bugsFace = (_c: BugsConfig, expr: string): FaceTarget => {
  const e = (kind: number, w = 1, h = 1, lid = 0, rot = 0, dx = 0, dy = 0): EyeSpec => ({ kind, w, h, rot, lid, lidAng: 0, dx, dy });
  const make = (l: EyeSpec, r: EyeSpec, mouth = 0.35, mouthOpen = 0, cheeks = 0, tongue = 0): FaceTarget => ({ l, r, lidB: tongue, mouth, mouthOpen, cheeks });
  switch (expr) {
    case 'happy':
      return make(e(1), e(1), 0.9, 0.12, 0.6);
    case 'squeeze':
      return make(e(3), e(3), 0.6, 0.35, 0.7);
    case 'surprised':
      return make(e(0, 1.15, 0.7), e(0, 1.15, 0.7), 0, 0.55);
    case 'grumpy':
      return make(e(0, 1, 1, 0.42, 0.38), e(0, 1, 1, 0.42, 0.38), -0.55);
    case 'worried':
      return make(e(0, 1.05, 0.9, 0.22, -0.4), e(0, 1.05, 0.9, 0.22, -0.4), -0.4, 0.08);
    case 'silly':
      return make(e(0, 1.1, 1.15, 0, 0, 0.5, 0), e(0, 0.92, 1.15, 0, 0, -0.5, 0), 0.8, 0.3, 0.3, 1);
    case 'sleepy':
      return make(e(2), e(2), 0.1);
    case 'excited':
      return make(e(0, 1.2, 1.2), e(0, 1.2, 1.2), 1, 0.5, 0.8);
    case 'listening':
      return make(e(0, 1.1, 1.1), e(0, 1.1, 1.1), 0.3);
    case 'thinking':
      return make(e(0, 1, 0.95, 0.35, 0.1), e(0, 1.05, 0.95), -0.15);
    case 'focused':
      return make(e(0, 1, 1, 0.3, 0.15), e(0, 1, 1, 0.3, 0.15), 0.05);
    case 'dizzy':
      return make(e(4), e(4), -0.1, 0.2);
    default:
      return make(e(0), e(0), 0.4);
  }
};

const base = (o: Partial<BugsConfig>): BugsConfig => ({
  name: 'Bug',
  state: 'idle',
  expression: 'neutral',
  body: 0,
  color: '#1FA394',
  pattern: 0,
  color2: '#FFFFFF',
  accent: '#F0862E',
  legs: 2,
  legColor: 0,
  arms: 0,
  wings: 0,
  antennae: 1,
  eyes: 0,
  mouth: 0,
  ...o,
});

// ------------------------------------------------------------- utilities
const hash = (i: number, s: number) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const strHash = (s: string) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
  return h;
};
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth01 = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

const rgb = (hex: string): [number, number, number] => {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const css = (c: [number, number, number], a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
/** k < 0 darkens like denser pigment, k > 0 thins towards the paper */
const shade = (hex: string, k: number, a = 1) => {
  const [r, g, b] = rgb(hex);
  if (k < 0) {
    const m = 1 + k;
    return css([r * m, g * m, b * m], a);
  }
  return css([r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k], a);
};
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

const line = (ctx: CanvasRenderingContext2D, pts: Pt[], w = LW, col = INK, closed = false) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (closed) ctx.closePath();
  ctx.lineWidth = w;
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
};
const curve = (ctx: CanvasRenderingContext2D, a: Pt, c: Pt, b: Pt, w = LW, col = INK) => {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]);
  ctx.lineWidth = w;
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  ctx.stroke();
};
/** closed smooth path through the midpoints of pts */
const blobPath = (ctx: CanvasRenderingContext2D, pts: Pt[]) => {
  const n = pts.length;
  ctx.beginPath();
  if (n < 3) return;
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], m = mid(p, pts[(i + 1) % n]);
    ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  ctx.closePath();
};
const dot = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col = INK) => {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.0001, r), 0, TAU);
  ctx.fillStyle = col;
  ctx.fill();
};
const ell = (cx: number, cy: number, rx: number, ry: number, n = 28, rot = 0): Pt[] => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    return [cx + x * c - y * s, cy + x * s + y * c] as Pt;
  });
};
const bbox = (pts: Pt[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx: (x1 - x0) / 2, ry: (y1 - y0) / 2 };
};
const inside = (pts: Pt[], x: number, y: number) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
/** lowest (or highest) point of the outline above x */
const edgeY = (pts: Pt[], x: number, top: boolean): number | null => {
  let best: number | null = null;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (xi === xj || (x - xi) * (x - xj) > 0) continue;
    const y = yi + ((x - xi) / (xj - xi)) * (yj - yi);
    if (best === null || (top ? y > best : y < best)) best = y;
  }
  return best;
};
/** rightmost (or leftmost) point of the outline at height y */
const edgeX = (pts: Pt[], y: number, right: boolean): number | null => {
  let best: number | null = null;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi === yj || (y - yi) * (y - yj) > 0) continue;
    const x = xi + ((y - yi) / (yj - yi)) * (xj - xi);
    if (best === null || (right ? x > best : x < best)) best = x;
  }
  return best;
};
const area = (pts: Pt[]) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
};
/** outward unit normals of a closed outline */
const normals = (pts: Pt[]): Pt[] => {
  const sg = area(pts) > 0 ? 1 : -1;
  const n = pts.length;
  return pts.map((_, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [(dy / l) * sg, (-dx / l) * sg] as Pt;
  });
};
const dedupe = (pts: Pt[]): Pt[] => pts.filter((p, i) => {
  const q = pts[(i + 1) % pts.length];
  return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 1e-6;
});

/** hand-painted edge: low bumps + fine brush roughness along the normal, optional jiggle */
const wobble = (pts: Pt[], seed: number, amp: number, jig = 0, jigPh = 0): Pt[] => {
  const nm = normals(pts);
  const n = pts.length;
  const a = hash(seed, 1) * TAU, b = hash(seed, 2) * TAU, c = hash(seed, 3) * TAU;
  return pts.map(([x, y], i) => {
    const f = (i / n) * TAU;
    const d = amp * (0.55 * Math.sin(f * 3 + a) + 0.3 * Math.sin(f * 5 + b) + 0.15 * Math.sin(f * 11 + c)) + amp * 0.3 * (hash(i, seed) - 0.5) + jig * Math.sin(f * 3 + jigPh);
    return [x + nm[i][0] * d, y + nm[i][1] * d] as Pt;
  });
};

/** closed outline from a half-width profile w(u), u: 0 bottom .. 1 top */
const profile = (cx: number, y0: number, h: number, w: (u: number) => number, skew: (u: number) => number = () => 0, n = 30): Pt[] => {
  const right: Pt[] = [], left: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const u = (1 - Math.cos((Math.PI * i) / n)) / 2;
    const ww = Math.max(0, w(u)), x = cx + skew(u), y = y0 + u * h;
    right.push([x + ww, y]);
    left.push([x - ww, y]);
  }
  return dedupe([...right, ...left.reverse()]);
};
const rotate = (pts: Pt[], cx: number, cy: number, a: number): Pt[] => {
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c] as Pt);
};
/** Catmull-Rom resampling of a spine */
const spline = (cp: Pt[], per = 6): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < cp.length - 1; i++) {
    const p0 = cp[Math.max(0, i - 1)], p1 = cp[i], p2 = cp[i + 1], p3 = cp[Math.min(cp.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(cp[cp.length - 1]);
  return out;
};
const spineNormals = (sp: Pt[]): Pt[] => sp.map((_, i) => {
  const a = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)];
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  return [-dy / l, dx / l] as Pt;
});
/** outline of a round-capped tube around a spine */
const tube = (sp: Pt[], r: number, capN = 9): Pt[] => {
  const nm = spineNormals(sp);
  const left = sp.map((p, i) => [p[0] + nm[i][0] * r, p[1] + nm[i][1] * r] as Pt);
  const right = sp.map((p, i) => [p[0] - nm[i][0] * r, p[1] - nm[i][1] * r] as Pt);
  const cap = (p: Pt, n: Pt): Pt[] => {
    const a0 = Math.atan2(n[1], n[0]);
    return Array.from({ length: capN - 1 }, (_, k) => {
      const a = a0 - (Math.PI * (k + 1)) / capN;
      return [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r] as Pt;
    });
  };
  const last = sp.length - 1;
  const neg = (n: Pt): Pt => [-n[0], -n[1]];
  return [...left, ...cap(sp[last], nm[last]), ...right.reverse(), ...cap(sp[0], neg(nm[0]))];
};

// ------------------------------------------------------------- paint texture
/** streaky gouache grain: long dry-brush drags, light and dark, plus paper pores (tileable, built once) */
let grainTile: HTMLCanvasElement | null | undefined;
const grain = (): HTMLCanvasElement | null => {
  if (grainTile !== undefined) return grainTile;
  if (typeof document === 'undefined') return (grainTile = null);
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  if (!g) return (grainTile = null);
  g.lineCap = 'round';
  const drag = (i: number, light: boolean, wMax: number, aMax: number, s: number) => {
    const y = hash(i, s) * N, x0 = hash(i, s + 1) * N, len = 50 + hash(i, s + 2) * 210;
    const w = 0.5 + Math.pow(hash(i, s + 3), 2) * wMax;
    const a = aMax * (0.3 + 0.7 * hash(i, s + 4));
    const slope = (hash(i, s + 5) - 0.5) * 0.06, bow = (hash(i, s + 6) - 0.5) * 6;
    // the brush skips: split each drag into pieces with varying pressure
    const pieces = 3 + Math.floor(hash(i, s + 7) * 4);
    for (let k = 0; k < pieces; k++) {
      const u0 = k / pieces, u1 = (k + 0.8) / pieces;
      const aa = a * (0.4 + 0.6 * hash(i * 13 + k, s + 8));
      g.strokeStyle = light ? `rgba(255,255,255,${aa})` : `rgba(0,0,0,${aa})`;
      g.lineWidth = w * (0.6 + 0.6 * hash(i * 7 + k, s + 9));
      for (const ox of [-N, 0, N])
        for (const oy of [-N, 0, N]) {
          const xa = x0 + u0 * len + ox, xb = x0 + u1 * len + ox;
          if (xb < -8 || xa > N + 8) continue;
          const ya = y + oy + slope * u0 * len + bow * Math.sin(u0 * Math.PI), yb = y + oy + slope * u1 * len + bow * Math.sin(u1 * Math.PI);
          if (Math.max(ya, yb) < -8 || Math.min(ya, yb) > N + 8) continue;
          g.beginPath();
          g.moveTo(xa, ya);
          g.lineTo(xb, yb);
          g.stroke();
        }
    }
  };
  for (let i = 0; i < 70; i++) drag(i, hash(i, 40) < 0.5, 22, 0.075, 10);    // broad brush loads
  for (let i = 0; i < 120; i++) drag(i + 200, hash(i, 42) < 0.5, 7, 0.07, 30);  // tonal bands
  for (let i = 0; i < 150; i++) drag(i + 500, hash(i, 41) < 0.65, 1.6, 0.085, 20);   // bristle streaks
  // a few paper pores where the brush ran dry
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(255,255,255,${0.08 + hash(i, 61) * 0.18})`;
    g.fillRect(hash(i, 62) * N, hash(i, 63) * N, 1 + hash(i, 64) * 3, 1);
  }
  return (grainTile = cv);
};
const patterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern | null>();
const grainPattern = (ctx: CanvasRenderingContext2D): CanvasPattern | null => {
  if (!patterns.has(ctx)) {
    const src = grain();
    let p: CanvasPattern | null = null;
    try {
      p = src ? ctx.createPattern(src, 'repeat') ?? null : null;
    } catch {
      p = null;
    }
    patterns.set(ctx, p);
  }
  return patterns.get(ctx) ?? null;
};

/**
 * One blob of paint: semi-opaque fill, brushed tonal bands along the stroke
 * direction, streaky grain, and pigment pooled darker at the edge.
 */
const paint = (ctx: CanvasRenderingContext2D, pts: Pt[], col: string, seed: number, ang: number, alpha = 0.93) => {
  if (pts.length < 3) return;
  const L = lum(col);
  const bb = bbox(pts);
  const R = Math.max(bb.rx, bb.ry) + 0.02;
  blobPath(ctx, pts);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = col;
  ctx.fill();
  ctx.save();
  blobPath(ctx, pts);
  ctx.clip();
  // broad brush passes: each a slightly different load of paint
  const dx = Math.cos(ang), dy = Math.sin(ang);
  ctx.lineCap = 'round';
  const passes = 3 + Math.round(R * 14);
  for (let k = 0; k < passes; k++) {
    const o = (hash(seed + k, 4) - 0.5) * 2 * R;
    const dark = hash(seed + k, 5) < 0.5;
    ctx.globalAlpha = (dark ? 0.16 : 0.2) * (0.4 + 0.6 * hash(seed + k, 6)) * (L > 0.9 ? 0.3 : 1);
    ctx.strokeStyle = dark ? shade(col, L < 0.25 ? 0.18 : -0.22) : shade(col, 0.3);
    ctx.lineWidth = R * (0.18 + 0.3 * hash(seed + k, 7));
    const ox = bb.cx - dy * o, oy = bb.cy + dx * o;
    const bow = (hash(seed + k, 8) - 0.5) * R * 0.5;
    ctx.beginPath();
    ctx.moveTo(ox - dx * R * 1.3, oy - dy * R * 1.3);
    ctx.quadraticCurveTo(ox - dy * bow, oy + dx * bow, ox + dx * R * 1.3, oy + dy * R * 1.3);
    ctx.stroke();
  }
  // wet blooms: pigment collects in soft patches
  for (let k = 0; k < 3; k++) {
    const bx = bb.cx + (hash(seed + k, 11) - 0.5) * bb.rx * 1.4, by = bb.cy + (hash(seed + k, 12) - 0.5) * bb.ry * 1.4;
    const br = R * (0.3 + 0.35 * hash(seed + k, 13));
    const gr = ctx.createRadialGradient ? ctx.createRadialGradient(bx, by, 0, bx, by, br) : null;
    if (!gr) break;
    const dark = k !== 1;
    gr.addColorStop(0, dark ? shade(col, L < 0.25 ? 0.12 : -0.2, 0.32) : shade(col, 0.35, 0.3));
    gr.addColorStop(1, dark ? shade(col, -0.2, 0) : shade(col, 0.35, 0));
    ctx.globalAlpha = L > 0.9 ? 0.3 : 1;
    ctx.fillStyle = gr;
    ctx.fillRect(bx - br, by - br, br * 2, br * 2);
  }
  const pat = grainPattern(ctx);
  if (pat) {
    if (typeof DOMMatrix !== 'undefined' && pat.setTransform) {
      const k = 0.48 / 256;
      pat.setTransform(new DOMMatrix().translate(bb.cx + hash(seed, 9) * 0.3, bb.cy + hash(seed, 10) * 0.3).rotate((ang * 180) / Math.PI).scale(k, k));
    }
    ctx.globalAlpha = L > 0.9 ? 0.25 : L < 0.25 ? 0.75 : 1;
    ctx.fillStyle = pat;
    ctx.fillRect(bb.x0 - 0.05, bb.y0 - 0.05, bb.rx * 2 + 0.1, bb.ry * 2 + 0.1);
  }
  // pigment pooled at the edge where the brush lifted
  const rim = L < 0.25 ? shade(col, -0.5) : shade(col, -0.3);
  blobPath(ctx, pts);
  ctx.strokeStyle = rim;
  ctx.globalAlpha = 0.16 * (L > 0.9 ? 0.3 : 1);
  ctx.lineWidth = 0.075;
  ctx.stroke();
  ctx.globalAlpha = 0.5 * (L > 0.9 ? 0.3 : 1);
  ctx.lineWidth = 0.022;
  ctx.stroke();
  ctx.globalAlpha = 0.45 * (L > 0.9 ? 0.3 : 1);
  ctx.lineWidth = 0.007;
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
};

// ------------------------------------------------------------- springs for feelers
interface Sim { t: number; px: number; py: number; vx: number; vy: number }
const sims = new WeakMap<object, Sim>();
/** lag of a spring-mass following the head: feelers trail behind every hop and turn */
const lagOf = (c: object, t: number, hx: number, hy: number): Pt => {
  let s = sims.get(c);
  if (!s || t < s.t || t - s.t > 0.25) {
    s = { t, px: hx, py: hy, vx: 0, vy: 0 };
    sims.set(c, s);
  }
  const dt = t - s.t;
  s.t = t;
  const n = Math.min(12, Math.ceil(dt / (1 / 120)));
  const h = n ? dt / n : 0;
  for (let i = 0; i < n; i++) {
    s.vx += (170 * (hx - s.px) - 7 * s.vx) * h;
    s.vy += (170 * (hy - s.py) - 7 * s.vy) * h;
    s.px += s.vx * h;
    s.py += s.vy * h;
  }
  return [clamp((s.px - hx) * 1.6, -0.08, 0.08), clamp((s.py - hy) * 1.6, -0.08, 0.08)];
};

// ------------------------------------------------------------- body geometry
interface Geo {
  main: Pt[];
  head: Pt[] | null;
  /** long axis horizontal (stripes run vertically, two-tone splits front/back) */
  wide: boolean;
  face: Pt;
  fs: number;
  crown: Pt;
  spread: number;
  legSpan: [number, number];
  legMany: number;
  legLong: boolean;
  wing: Pt;
  /** wings on the back (pointing up) rather than out at the sides */
  wingBack: boolean;
  wingLen: number;
  /** side wings mirror about this x */
  wingAxis: number;
  armY: number;
  spine: Pt[] | null;
  spineR: number;
  fuzz: boolean;
  brush: number;
}

interface Ctx {
  ctx: CanvasRenderingContext2D;
  c: BugsConfig;
  pose: Pose;
  face: FaceState;
  t: number;
  seed: number;
  fx: number;
  fy: number;
  pr: (k: string) => number;
  lag: Pt;
}

const geometry = (c: BugsConfig, t: number, drop: number, jx: number, und: number, jig: number, jigPh: number): Geo => {
  const seed = strHash(c.name) + c.body * 17;
  const W = (pts: Pt[], s = 0, amp = 0.0075) => wobble(pts, seed + s, amp, jig, jigPh);
  const y = (v: number) => v - drop;
  const circ = (u: number, uc: number, rc: number, R: number) => R * Math.sqrt(Math.max(0, 1 - ((u - uc) / rc) ** 2));
  const g: Geo = {
    main: [], head: null, wide: false, face: [jx, y(0.53)], fs: 1, crown: [jx, y(0.75)], spread: 0.085,
    legSpan: [-0.13 + jx, 0.13 + jx], legMany: 10, legLong: false, wing: [0.2 + jx, y(0.6)], wingBack: false, wingLen: 0.2, wingAxis: jx,
    armY: y(0.43), spine: null, spineR: 0, fuzz: false, brush: -0.35 + (hash(seed, 31) - 0.5) * 0.5,
  };
  switch (c.body) {
    case 1: {
      // bean: a tall kidney leaning into its step
      const pts = profile(jx, y(0.24), 0.54, (u) => circ(u, 0.5, 0.5, 0.205) * (1 - 0.2 * Math.sin(Math.PI * u) ** 4), (u) => 0.04 * Math.sin(Math.PI * u));
      g.main = W(rotate(pts, jx, y(0.5), -0.16));
      g.face = [jx + 0.04, y(0.62)];
      g.fs = 0.95;
      g.crown = [jx + 0.06, y(0.78)];
      g.wing = [0.18 + jx, y(0.62)];
      g.legSpan = [-0.1 + jx, 0.12 + jx];
      g.armY = y(0.45);
      break;
    }
    case 2: {
      // pear: a small head on a round bottom
      const pts = profile(jx, y(0.22), 0.6, (u) => Math.pow(circ(u, 0.3, 0.3, 0.24) ** 4 + circ(u, 0.72, 0.28, 0.19) ** 4, 0.25));
      g.main = W(pts);
      g.face = [jx, y(0.66)];
      g.fs = 0.95;
      g.crown = [jx, y(0.82)];
      g.wing = [0.17 + jx, y(0.46)];
      g.legSpan = [-0.12 + jx, 0.12 + jx];
      g.armY = y(0.4);
      g.spread = 0.07;
      break;
    }
    case 3: {
      // dome: a jellyfish cap on long dangly legs
      const pts = profile(jx, y(0.42), 0.36, (u) => 0.285 * Math.sqrt(Math.max(0, 1 - u * u)) * (0.9 + 0.1 * smooth01(0, 0.15, u)));
      g.main = W(pts);
      g.face = [jx, y(0.55)];
      g.fs = 0.95;
      g.crown = [jx, y(0.77)];
      g.wing = [0.22 + jx, y(0.6)];
      g.legSpan = [-0.2 + jx, 0.2 + jx];
      g.legLong = true;
      g.armY = y(0.47);
      g.brush = -0.08;
      break;
    }
    case 4: {
      // fuzzball: a sooty pompom
      g.main = W(profile(jx, y(0.2), 0.44, (u) => circ(u, 0.5, 0.5, 0.22), undefined, 34), 0, 0.006);
      g.face = [jx, y(0.45)];
      g.fs = 1;
      g.crown = [jx, y(0.66)];
      g.wing = [0.18 + jx, y(0.5)];
      g.legSpan = [-0.07 + jx, 0.07 + jx];
      g.armY = y(0.38);
      g.fuzz = true;
      g.legMany = 6;
      break;
    }
    case 5: {
      // caterpillar: a segmented tube, the head raised at the front
      const cp: Pt[] = [];
      for (let i = 0; i <= 6; i++) {
        const x = -0.41 + i * 0.095;
        cp.push([x + jx, y(0.235 + 0.012 * (i / 6) + und * Math.sin(x * 11 - t * 5))]);
      }
      const sp = spline(cp, 4);
      g.spine = sp;
      g.spineR = 0.1;
      g.main = W(tube(sp, 0.1), 0, 0.006);
      const hx = 0.29 + jx, hy = y(0.42 + und * 0.6 * Math.sin(0.4 * 11 - t * 5));
      g.head = W(ell(hx, hy, 0.15, 0.142, 30), 5, 0.006);
      g.wide = true;
      g.face = [hx + 0.015, hy];
      g.fs = 0.85;
      g.crown = [hx, hy + 0.14];
      g.spread = 0.06;
      g.legSpan = [-0.4 + jx, 0.16 + jx];
      g.legMany = 9;
      g.wing = [-0.1 + jx, y(0.31)];
      g.wingBack = true;
      g.wingLen = 0.17;
      g.armY = hy - 0.05;
      g.brush = 0.05;
      break;
    }
    case 6: {
      // snout beetle: a long body with a round head in front
      g.main = W(ell(-0.09 + jx, y(0.4), 0.25, 0.165, 34, 0.12));
      const hx = 0.17 + jx, hy = y(0.535);
      g.head = W(ell(hx, hy, 0.135, 0.13, 28), 5, 0.006);
      g.wide = true;
      g.face = [hx + 0.01, hy + 0.01];
      g.fs = 0.85;
      g.crown = [hx - 0.01, hy + 0.13];
      g.spread = 0.055;
      g.legSpan = [-0.27 + jx, 0.06 + jx];
      g.wing = [-0.13 + jx, y(0.5)];
      g.wingBack = true;
      g.armY = y(0.36);
      g.brush = 0.12;
      break;
    }
    case 7: {
      // worm: rises from the ground in an L
      const cp: Pt[] = [[0.34, 0.13], [0.2, 0.13], [0.06, 0.13], [-0.05, 0.15], [-0.12, 0.25], [-0.13, 0.38], [-0.12, 0.52], [-0.11, 0.64], [-0.1, 0.72]];
      const sp = spline(cp.map(([x, yy]) => [x + jx + und * Math.sin(yy * 9 - t * 4) * Math.max(0, yy - 0.2), y(yy)] as Pt), 4);
      g.spine = sp;
      g.spineR = 0.085;
      g.main = W(tube(sp, 0.085), 0, 0.006);
      const top = sp[sp.length - 1];
      g.face = [top[0] + 0.005, top[1] - 0.02];
      g.fs = 0.85;
      g.crown = [top[0], top[1] + 0.08];
      g.spread = 0.04;
      g.legSpan = [0.0 + jx, 0.34 + jx];
      g.legMany = 8;
      g.wing = [top[0] + 0.07, top[1] - 0.17];
      g.wingAxis = top[0];
      g.wingLen = 0.16;
      g.armY = y(0.42);
      g.brush = Math.PI / 2 - 0.1;
      break;
    }
    default: {
      // round: a plump ball
      g.main = W(profile(jx, y(0.25), 0.5, (u) => circ(u, 0.5, 0.5, 0.27)));
      break;
    }
  }
  return g;
};

// ------------------------------------------------------------- parts
/** surface pattern, clipped to the main blob */
const pattern = (p: Ctx, g: Geo) => {
  const { ctx, c, seed } = p;
  const pt = c.pattern;
  if (!pt || pt === 3) return;
  const bb = bbox(g.main);
  ctx.save();
  blobPath(ctx, g.main);
  ctx.clip();
  if (pt === 1) {
    // gouache dots: a jittered grid of small opaque dabs
    const sp = 0.048;
    let i = 0;
    for (let yy = bb.y0 + 0.02; yy < bb.y1; yy += sp * 0.87)
      for (let xx = bb.x0 + ((Math.round((yy - bb.y0) / (sp * 0.87)) % 2) * sp) / 2; xx < bb.x1; xx += sp) {
        i++;
        const x = xx + (hash(i, seed + 3) - 0.5) * 0.016, y = yy + (hash(i, seed + 4) - 0.5) * 0.016;
        const r = 0.0095 + hash(i, seed + 5) * 0.004;
        if (!inside(g.main, x, y) || !inside(g.main, x + r * 2, y) || !inside(g.main, x - r * 2, y) || !inside(g.main, x, y + r * 2) || !inside(g.main, x, y - r * 2)) continue;
        // keep the face area clear
        if (Math.hypot(x - g.face[0], (y - g.face[1]) * 1.3) < 0.11 * g.fs) continue;
        ctx.globalAlpha = 0.92;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * (0.8 + 0.25 * hash(i, seed + 6)), hash(i, seed + 7) * 3, 0, TAU);
        ctx.fillStyle = c.color2;
        ctx.fill();
      }
    ctx.globalAlpha = 1;
  } else if (pt === 2) {
    // painted bands across the long axis
    const bands: Pt[][] = [];
    if (g.spine) {
      const sp = g.spine, nm = spineNormals(sp), r = g.spineR + 0.03;
      let acc = 0;
      const cum = sp.map((q, i) => (acc += i ? Math.hypot(q[0] - sp[i - 1][0], q[1] - sp[i - 1][1]) : 0));
      const total = acc;
      const at = (s: number): [Pt, Pt] => {
        let i = 1;
        while (i < cum.length - 1 && cum[i] < s) i++;
        const k = clamp((s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1), 0, 1);
        const q: Pt = [lerp(sp[i - 1][0], sp[i][0], k), lerp(sp[i - 1][1], sp[i][1], k)];
        const n: Pt = [lerp(nm[i - 1][0], nm[i][0], k), lerp(nm[i - 1][1], nm[i][1], k)];
        return [q, n];
      };
      // the worm keeps its upright neck plain, ringed lower down
      const s0 = c.body === 7 ? 0 : 0.02, s1 = c.body === 7 ? total * 0.62 : total;
      for (let s = s0 + 0.035; s < s1 - 0.02; s += 0.062) {
        const [qa, na] = at(s), [qb, nb] = at(s + 0.03);
        bands.push([[qa[0] + na[0] * r, qa[1] + na[1] * r], [qb[0] + nb[0] * r, qb[1] + nb[1] * r], [qb[0] - nb[0] * r, qb[1] - nb[1] * r], [qa[0] - na[0] * r, qa[1] - na[1] * r]]);
      }
    } else if (g.wide) {
      for (let x = bb.x0 + 0.04; x < bb.x1 - 0.02; x += 0.07)
        bands.push([[x, bb.y0 - 0.03], [x + 0.034, bb.y0 - 0.03], [x + 0.03, bb.y1 + 0.03], [x - 0.004, bb.y1 + 0.03]]);
    } else {
      // horizontal bands below the face
      for (let yy = g.face[1] - 0.105 * g.fs; yy > bb.y0 - 0.02; yy -= 0.056)
        bands.push([[bb.x0 - 0.03, yy], [bb.x1 + 0.03, yy + 0.004], [bb.x1 + 0.03, yy - 0.026], [bb.x0 - 0.03, yy - 0.03]]);
    }
    bands.forEach((b, i) => {
      // densify so the band edges wobble like a brush
      const pts: Pt[] = [];
      for (let k = 0; k < 4; k++) {
        const a = b[k], z = b[(k + 1) % 4];
        for (let j = 0; j < 6; j++) pts.push([lerp(a[0], z[0], j / 6), lerp(a[1], z[1], j / 6)]);
      }
      paint(ctx, wobble(pts, seed + 40 + i, 0.004), c.color2, seed + 40 + i, g.wide || g.spine ? Math.PI / 2 : 0, 0.92);
    });
  } else if (pt === 4) {
    // two-tone: back half (wide bodies) or bottom (tall bodies) in the second colour
    const cut: Pt[] = [];
    if (g.wide) {
      const sx = g.head ? g.head[0][0] - 0.2 : bb.cx;
      for (let k = 0; k <= 10; k++) {
        const yy = lerp(bb.y1 + 0.05, bb.y0 - 0.05, k / 10);
        cut.push([sx + 0.008 * Math.sin(k * 1.7 + seed), yy]);
      }
      cut.push([bb.x0 - 0.1, bb.y0 - 0.05], [bb.x0 - 0.1, bb.y1 + 0.05]);
    } else {
      const sy = c.body === 2 ? g.face[1] - 0.14 : g.face[1] - 0.1 * g.fs;
      for (let k = 0; k <= 10; k++) {
        const xx = lerp(bb.x0 - 0.05, bb.x1 + 0.05, k / 10);
        cut.push([xx, sy + 0.008 * Math.sin(k * 1.9 + seed) + (xx - bb.cx) * 0.06]);
      }
      cut.push([bb.x1 + 0.05, bb.y0 - 0.1], [bb.x0 - 0.05, bb.y0 - 0.1]);
    }
    ctx.beginPath();
    cut.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = 1;
    // cover what is under the cut with paper first so the second colour reads clean
    blobPath(ctx, g.main);
    ctx.fillStyle = PAPER;
    ctx.fill();
    paint(ctx, g.main, c.color2, seed + 60, g.brush + 0.3);
  } else if (pt === 5) {
    // spots: a few blotches of the second colour
    let placed = 0;
    for (let i = 0; i < 40 && placed < 6; i++) {
      const x = bb.x0 + hash(i, seed + 70) * bb.rx * 2, y = bb.y0 + hash(i, seed + 71) * bb.ry * 2;
      const r = 0.026 + hash(i, seed + 72) * 0.022;
      if (!inside(g.main, x, y) || !inside(g.main, x - r, y - r) || !inside(g.main, x + r, y + r) || !inside(g.main, x - r, y + r) || !inside(g.main, x + r, y - r)) continue;
      if (Math.hypot(x - g.face[0], y - g.face[1]) < 0.13 * g.fs + r) continue;
      placed++;
      const sc = lum(c.color2) > 0.9 ? shade(c.color, -0.45) : c.color2;
      paint(ctx, wobble(ell(x, y, r, r * 0.85, 16, hash(i, seed + 73) * 3), seed + i, 0.005), sc, seed + 80 + i, g.brush, 0.9);
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
};

/** ink ticks: fur along the top edge and a sprinkle lower down, or a whole pompom fringe */
const furTicks = (p: Ctx, g: Geo) => {
  const { ctx, c, seed } = p;
  const pts = g.main, nm = normals(pts), n = pts.length;
  const ink = INK;
  if (g.fuzz) {
    for (let i = 0; i < 96; i++) {
      const k = Math.floor((i / 96) * n), q = pts[k], m = nm[k];
      const len = 0.03 + hash(i, seed + 90) * 0.025, tw = (hash(i, seed + 91) - 0.5) * 0.6;
      const dx = m[0] * Math.cos(tw) - m[1] * Math.sin(tw), dy = m[0] * Math.sin(tw) + m[1] * Math.cos(tw);
      line(ctx, [[q[0] - dx * 0.012, q[1] - dy * 0.012], [q[0] + dx * len, q[1] + dy * len]], LW * 0.85, ink);
    }
  }
  if (c.pattern !== 3) return;
  const bb = bbox(pts);
  for (let i = 0; i < n; i += 2) {
    const q = pts[i], m = nm[i];
    if (q[1] < bb.cy + bb.ry * 0.25 || m[1] < 0.2) continue;
    const len = 0.018 + hash(i, seed + 92) * 0.014;
    line(ctx, [[q[0] - m[0] * 0.012, q[1] - m[1] * 0.012], [q[0] + m[0] * len, q[1] + m[1] * len]], LW * 0.8);
  }
  // rows of little u-shaped scallops on the belly, like feathery fluff
  const yTop = Math.min(g.face[1] - (c.mouth === 1 ? 0.16 : 0.125) * g.fs, bb.cy);
  const fcx = g.spine ? bb.cx : g.face[0];
  let row = 0;
  for (let y = yTop; y > bb.y0 + 0.04 && row < 3; y -= 0.036, row++)
    for (let x = fcx - 0.1 + (row % 2) * 0.02; x < fcx + 0.11 - row * 0.02; x += 0.04) {
      if (x < fcx - 0.1 + row * 0.02) continue;
      const xx = x + (hash(row * 31 + Math.round(x * 100), seed + 93) - 0.5) * 0.008;
      if (!inside(pts, xx - 0.02, y - 0.02) || !inside(pts, xx + 0.02, y - 0.02) || !inside(pts, xx, y + 0.012)) continue;
      const u: Pt[] = [];
      for (let k = 0; k <= 6; k++) {
        const a = Math.PI * (1 + k / 6);
        u.push([xx + Math.cos(a) * 0.009, y + Math.sin(a) * 0.011]);
      }
      line(ctx, u, LW * 0.8, lum(c.color) < 0.3 ? '#FFFFFF' : INK);
    }
};

const legCount = (c: BugsConfig, g: Geo) => (c.legs >= 4 ? g.legMany : [2, 4, 6, 8][c.legs] ?? 2);

const legs = (p: Ctx, g: Geo) => {
  const { ctx, c, t } = p;
  const n = legCount(c, g);
  const col = LEG_INKS[c.legColor] ?? INK;
  const scuttle = p.pr('scuttle'), tuck = p.pr('tuck'), poke = Math.min(1, Math.abs(p.pose.pokeAmp) * 3);
  const [s0, s1] = g.legSpan;
  const mid = (s0 + s1) / 2;
  const span = n <= 2 ? 0.5 : n <= 4 ? 0.8 : 1;
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const x = mid + (lerp(s0, s1, u) - mid) * span;
    const top = edgeY(g.main, x, false);
    if (top === null) continue;
    const side = g.wide && !g.spine ? (u < 0.5 ? -1 : 1) : x < mid - 0.001 ? -1 : 1;
    // step cycle: alternate legs lift; in idle a single leg taps now and then
    const ph = t * TAU * lerp(1.1, 6.5, scuttle) + i * Math.PI + i * 0.4;
    const tapCycle = (t * 0.55 + hash(i, 5)) % 1;
    const tap = (1 - scuttle) * (tapCycle < 0.14 ? Math.sin((tapCycle / 0.14) * Math.PI) : 0) * (1 - tuck);
    const lift = Math.max(0, Math.sin(ph)) * 0.032 * scuttle + tap * 0.018;
    const stride = Math.cos(ph) * 0.02 * scuttle;
    const splay = side * (0.012 + 0.04 * tuck + 0.02 * poke) * (n > 6 ? 0.5 : 1);
    const fx = x + stride + splay + (g.legLong ? Math.sin(t * 1.6 + i * 1.3) * 0.012 : 0);
    const fy = lift;
    const legTop = top + 0.006;
    // knee bows outward; tucked legs fold up under the body
    const kx = lerp(x, fx, 0.5) + side * (0.01 + 0.012 * tuck) + (g.legLong ? Math.sin(t * 1.6 + i * 1.3 + 0.8) * 0.018 : 0);
    const ky = lerp(legTop, fy, 0.5) + 0.01 * tuck;
    curve(ctx, [x, legTop], [kx, ky], [fx, fy], LW, col);
    // tiny foot
    const fl = (n > 8 ? 0.016 : 0.024) * (1 - 0.3 * tuck);
    line(ctx, [[fx, fy], [fx + side * fl, fy + 0.002 + lift * 0.3]], LW, col);
  }
};

const arms = (p: Ctx, g: Geo) => {
  const { ctx, c, pose, t } = p;
  if (!c.arms) return;
  const poly = c.body === 5 && g.head ? g.head : g.main;
  for (const s of [-1, 1]) {
    const x0 = edgeX(poly, g.armY, s > 0);
    if (x0 === null) continue;
    const a = pose.arms;
    let raise = s > 0 ? a.rRaise : a.lRaise;
    const bend = s > 0 ? a.rBend : a.lBend;
    if (s > 0) raise += a.wave * Math.sin(t * 11) * 0.35 + pose.talk * 0.25;
    else raise += a.wave * 0.4 * Math.sin(t * 11 + 1) * 0.3;
    const start: Pt = [x0 - s * 0.004, g.armY];
    const dir: Pt = [s * Math.sin(raise), -Math.cos(raise)];
    const elbow: Pt = [start[0] + dir[0] * 0.075, start[1] + dir[1] * 0.075];
    const b = -s * bend * 0.6;
    const d2: Pt = [dir[0] * Math.cos(b) - dir[1] * Math.sin(b), dir[0] * Math.sin(b) + dir[1] * Math.cos(b)];
    const hand: Pt = [elbow[0] + d2[0] * 0.065, elbow[1] + d2[1] * 0.065];
    line(ctx, [start, elbow, hand]);
    // three little fingers
    const ha = Math.atan2(d2[1], d2[0]);
    for (const k of [-0.7, 0, 0.7]) line(ctx, [hand, [hand[0] + Math.cos(ha + k) * 0.017, hand[1] + Math.sin(ha + k) * 0.017]], LW * 0.9);
  }
};

const wings = (p: Ctx, g: Geo) => {
  const { ctx, c, t, seed } = p;
  if (!c.wings) return;
  const buzz = p.pr('buzz'), tuck = p.pr('tuck');
  const f = lerp(1.3, 15, buzz), amp = lerp(0.07, 0.36, buzz) * (1 - tuck * 0.8);
  const L = g.wingLen;
  for (const s of [-1, 1]) {
    let bx: number, by: number, ang: number;
    if (g.wingBack) {
      // two wings on the back, fanned up and back
      bx = g.wing[0] + s * 0.035;
      by = g.wing[1];
      ang = (s < 0 ? -0.55 : -0.08) + Math.sin(t * TAU * f + (s < 0 ? 0 : 1.1)) * amp - tuck * 0.5;
    } else {
      bx = g.wingAxis + (g.wing[0] - g.wingAxis) * s + p.fx * 0.2;
      by = g.wing[1];
      ang = s * (1.05 + 0.75 * tuck) + Math.sin(t * TAU * f + (s > 0 ? 0 : 0.4)) * amp * s;
    }
    // ang measured from straight up, + clockwise towards +x
    const dir: Pt = [Math.sin(ang), Math.cos(ang)];
    const draw1 = (a: number, alpha: number) => {
      const d: Pt = [Math.sin(a), Math.cos(a)];
      const cx = bx + d[0] * L * 0.52, cy = by + d[1] * L * 0.52;
      const rot = Math.atan2(d[1], d[0]);
      const pts = wobble(ell(cx, cy, L * 0.55, L * 0.27, 26, rot), seed + (s > 0 ? 101 : 102), 0.004);
      ctx.globalAlpha = alpha;
      if (c.wings === 1) {
        paint(ctx, pts, c.accent, seed + (s > 0 ? 103 : 104), rot, 0.93 * alpha);
        // darker dabs of the same paint along the wing
        if (alpha > 0.5) {
          const px: Pt = [-d[1], d[0]];
          ctx.globalAlpha = 0.55;
          let j = 0;
          for (let a1 = 0.25; a1 < 0.95; a1 += 0.13)
            for (let b1 = -0.5; b1 <= 0.5; b1 += 0.25) {
              j++;
              const along = L * (a1 + (hash(j, seed) - 0.5) * 0.05), across = L * 0.27 * b1 * Math.sin(Math.PI * a1) * 1.6;
              const mx = bx + d[0] * along + px[0] * across, my = by + d[1] * along + px[1] * across;
              if (!inside(pts, mx, my)) continue;
              line(ctx, [[mx - d[0] * 0.006, my - d[1] * 0.006], [mx + d[0] * 0.006, my + d[1] * 0.006]], LW * 1.1, shade(c.accent, -0.3));
            }
          ctx.globalAlpha = 1;
        }
      } else {
        const fill = c.wings === 4 ? '#A9D8EE' : '#FFFFFF';
        blobPath(ctx, pts);
        ctx.fillStyle = fill;
        ctx.globalAlpha = (c.wings === 4 ? 0.6 : 0.95) * alpha;
        ctx.fill();
        ctx.save();
        blobPath(ctx, pts);
        ctx.clip();
        ctx.globalAlpha = alpha;
        const px: Pt = [-d[1], d[0]];
        if (c.wings === 2) {
          // stripes across the wing
          const col = LEG_INKS[c.legColor] === INK ? '#D9322B' : LEG_INKS[c.legColor];
          for (let k = -3; k <= 4; k++) {
            const m: Pt = [bx + d[0] * (L * 0.15 + (k + 3) * L * 0.12), by + d[1] * (L * 0.15 + (k + 3) * L * 0.12)];
            line(ctx, [[m[0] - px[0] * L * 0.4, m[1] - px[1] * L * 0.4], [m[0] + px[0] * L * 0.4, m[1] + px[1] * L * 0.4]], LW * 0.9, col);
          }
        } else if (c.wings === 3) {
          // cross-hatching
          for (const k of [-1, 1]) {
            const hd: Pt = [d[0] * Math.cos(k * 0.8) - d[1] * Math.sin(k * 0.8), d[0] * Math.sin(k * 0.8) + d[1] * Math.cos(k * 0.8)];
            const hp: Pt = [-hd[1], hd[0]];
            for (let j = -5; j <= 5; j++) {
              const m: Pt = [cx + hp[0] * j * L * 0.085, cy + hp[1] * j * L * 0.085];
              line(ctx, [[m[0] - hd[0] * L, m[1] - hd[1] * L], [m[0] + hd[0] * L, m[1] + hd[1] * L]], LW * 0.6);
            }
          }
        } else {
          // see-through: a vein and fine hatch
          line(ctx, [[bx, by], [bx + d[0] * L * 0.95, by + d[1] * L * 0.95]], LW * 0.7);
          for (let j = 1; j <= 6; j++) {
            const m: Pt = [bx + d[0] * L * j * 0.14, by + d[1] * L * j * 0.14];
            line(ctx, [m, [m[0] + (px[0] + d[0]) * L * 0.18, m[1] + (px[1] + d[1]) * L * 0.18]], LW * 0.55);
            line(ctx, [m, [m[0] + (-px[0] + d[0]) * L * 0.18, m[1] + (-px[1] + d[1]) * L * 0.18]], LW * 0.55);
          }
        }
        ctx.restore();
        ctx.globalAlpha = alpha;
        blobPath(ctx, pts);
        ctx.lineWidth = LW * 0.95;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    if (buzz > 0.35) draw1(ang - Math.sin(t * TAU * f) * amp * 2 * (g.wingBack ? 1 : s), 0.22 * buzz);
    draw1(ang, 1);
    // buzz arcs off the wingtip
    if (buzz > 0.3) {
      const tip: Pt = [bx + dir[0] * L * 1.1, by + dir[1] * L * 1.1];
      const ta = Math.atan2(dir[1], dir[0]);
      for (let k = 0; k < 2; k++) {
        const r = L * (0.25 + k * 0.17);
        ctx.globalAlpha = buzz * (0.7 - k * 0.25) * (0.6 + 0.4 * Math.sin(t * 30 + k));
        const pts: Pt[] = [];
        for (let j = 0; j <= 6; j++) {
          const a = ta - 0.6 + (j / 6) * 1.2;
          pts.push([tip[0] - dir[0] * L * 0.3 + Math.cos(a) * r, tip[1] - dir[1] * L * 0.3 + Math.sin(a) * r]);
        }
        line(ctx, pts, LW * 0.75);
      }
      ctx.globalAlpha = 1;
    }
  }
};

/** feeler tips, eye-stalk bases: where on the head the stems start */
const crownBase = (g: Geo, x: number): Pt => {
  const poly = g.head ?? g.main;
  const y = edgeY(poly, x, true);
  return [x, (y ?? g.crown[1]) - 0.008];
};

/** the stems and tips for feelers or eye stalks; returns tip points */
const stems = (p: Ctx, g: Geo, spread: number, len: number, lean: number, sideKick: number): Pt[] => {
  const { ctx, t, pose } = p;
  const perk = p.pr('perk'), twirl = p.pr('twirl'), tuck = p.pr('tuck');
  const tips: Pt[] = [];
  for (const s of [-1, 1]) {
    const bx = g.crown[0] + s * spread + p.fx * 0.6;
    const b = crownBase(g, bx);
    // angle from vertical: perks up when listening, droops asleep
    const a = s * (lean * (1 - 0.45 * perk) + 1.0 * tuck) + sideKick;
    const l = len * (1 + 0.14 * perk - 0.25 * tuck);
    const bob = Math.sin(t * 2.3 + s * 0.9) * 0.008 + pose.talk * 0.012 * Math.sin(pose.phase * 14);
    const tw: Pt = [Math.cos(t * 6 + (s > 0 ? 0 : Math.PI / 2)) * 0.035 * twirl, Math.sin(t * 6 + (s > 0 ? 0 : Math.PI / 2)) * 0.03 * twirl];
    const tip: Pt = [b[0] + Math.sin(a) * l + p.lag[0] * 1.1 + tw[0] + p.fx * 0.4, b[1] + Math.cos(a) * l + bob + p.lag[1] * 1.3 + tw[1] - (tuck > 0.5 ? 0 : 0) + p.fy * 0.5];
    const ctl: Pt = [b[0] + Math.sin(a * 0.55) * l * 0.55 + p.lag[0] * 0.35, b[1] + Math.cos(a * 0.55) * l * 0.55 + p.lag[1] * 0.35];
    curve(ctx, b, ctl, tip);
    tips.push(tip);
    void tuck;
  }
  return tips;
};

const antennae = (p: Ctx, g: Geo) => {
  const { ctx, c, seed } = p;
  const k = c.antennae;
  if (!k || k === 4) return;
  const spread = g.spread * (c.eyes === 1 ? 1.9 : 1);
  const tips = stems(p, g, spread, 0.19, 0.32, 0);
  tips.forEach((tip, i) => {
    const s = i ? 1 : -1;
    if (k === 1) dot(ctx, tip[0], tip[1], 0.014);
    else if (k === 2) {
      // a little brush tuft
      for (let j = 0; j < 6; j++) {
        const a = Math.PI / 2 - s * 0.15 + (j - 2.5) * 0.36;
        line(ctx, [tip, [tip[0] + Math.cos(a) * 0.036, tip[1] + Math.sin(a) * 0.036]], LW * 0.85);
      }
    } else if (k === 3) {
      // paddles: hatched ovals on the stems
      const b = crownBase(g, g.crown[0] + s * spread);
      const a = Math.atan2(tip[1] - b[1], tip[0] - b[0]);
      const cx = tip[0] + Math.cos(a) * 0.045, cy = tip[1] + Math.sin(a) * 0.045;
      const pts = wobble(ell(cx, cy, 0.05, 0.03, 20, a), seed + 110 + i, 0.002);
      blobPath(ctx, pts);
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
      for (let j = -1; j <= 1; j++) {
        const m: Pt = [cx + Math.cos(a) * j * 0.022, cy + Math.sin(a) * j * 0.022];
        line(ctx, [[m[0] - Math.sin(a) * 0.024, m[1] + Math.cos(a) * 0.024], [m[0] + Math.sin(a) * 0.024, m[1] - Math.cos(a) * 0.024]], LW * 0.7);
      }
      line(ctx, [tip, [cx + Math.cos(a) * 0.05, cy + Math.sin(a) * 0.05]], LW * 0.7);
      blobPath(ctx, pts);
      ctx.lineWidth = LW;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  });
};

/** painted horns, behind the body */
const horns = (p: Ctx, g: Geo) => {
  const { ctx, c, seed, t } = p;
  if (c.antennae !== 4) return;
  const perk = p.pr('perk'), tuck = p.pr('tuck');
  for (const s of [-1, 1]) {
    const bx = g.crown[0] + s * (g.spread + 0.035) + p.fx * 0.5;
    const b = crownBase(g, bx);
    const a = s * (0.42 - 0.15 * perk + 0.5 * tuck) + Math.sin(t * 2 + s) * 0.03 + p.lag[0] * 2;
    const L = 0.17 * (1 + 0.1 * perk);
    const d: Pt = [Math.sin(a), Math.cos(a)], n: Pt = [d[1], -d[0]];
    const pts: Pt[] = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8, w = 0.036 * (1 - u * 0.85);
      pts.push([b[0] - d[0] * 0.03 + d[0] * L * u + n[0] * w, b[1] - d[1] * 0.03 + d[1] * L * u + n[1] * w]);
    }
    for (let i = 8; i >= 0; i--) {
      const u = i / 8, w = 0.036 * (1 - u * 0.85);
      pts.push([b[0] - d[0] * 0.03 + d[0] * L * u - n[0] * w, b[1] - d[1] * 0.03 + d[1] * L * u - n[1] * w]);
    }
    paint(ctx, wobble(pts, seed + 120 + s, 0.003), c.accent, seed + 121 + s, a + Math.PI / 2);
  }
};

// ------------------------------------------------------------- face
const googly = (p: Ctx, x: number, y: number, R: number, spec: EyeSpec, s: number) => {
  const { ctx, pose } = p;
  const k = spec.kind;
  const open = 1 - pose.blink;
  const lw = LW * 0.6;
  if (k === 1) {
    // happy: a little upside-down U
    const pts: Pt[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (0.1 + 0.8 * (i / 10));
      pts.push([x + Math.cos(a) * R * 0.85, y - R * 0.35 + Math.sin(a) * R * 0.8]);
    }
    line(ctx, pts, LW * 1.15);
    return;
  }
  if (k === 2 || (k !== 3 && open < 0.2)) {
    const pts: Pt[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (1.12 + 0.76 * (i / 10));
      pts.push([x + Math.cos(a) * R * 0.85, y + R * 0.25 + Math.sin(a) * R * 0.55]);
    }
    line(ctx, pts, LW * 1.15);
    return;
  }
  if (k === 3) {
    line(ctx, [[x - s * R * 0.7, y + R * 0.55], [x + s * R * 0.55, y], [x - s * R * 0.7, y - R * 0.55]], LW * 1.15);
    return;
  }
  const ry = R * open;
  ctx.save();
  // upper lid: cut the eye along a tilted line
  const lid = spec.lid;
  const tilt = -spec.rot * s;
  if (lid > 0.02) {
    const ly = y + R - lid * 2 * R;
    ctx.beginPath();
    ctx.moveTo(x - R * 2, ly - tilt * R * 2 * -1);
    ctx.lineTo(x + R * 2, ly + tilt * R * 2 * -1);
    ctx.lineTo(x + R * 2, y - R * 2);
    ctx.lineTo(x - R * 2, y - R * 2);
    ctx.closePath();
    ctx.clip();
  }
  ctx.beginPath();
  ctx.ellipse(x, y, R, Math.max(0.001, ry), 0, 0, TAU);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  if (k === 4) {
    // dizzy spiral
    const pts: Pt[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * TAU * 1.7 + p.t * 6 * s, r = R * 0.7 * (i / 24);
      pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * open]);
    }
    line(ctx, pts, LW * 0.8);
  } else {
    const pr = Math.min(R * 0.72, R * 0.5 * spec.h * (1 + Math.abs(pose.pokeAmp) * 0.6));
    const ox = clamp(pose.lookX + spec.dx, -1.2, 1.2) * (R - pr) * 0.82, oy = clamp(pose.lookY + spec.dy, -1.2, 1.2) * (R - pr) * 0.75 * open;
    ctx.beginPath();
    ctx.ellipse(x + ox, y + oy, pr, pr * Math.min(1, open * 1.2), 0, 0, TAU);
    ctx.fillStyle = INK;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(x, y, R, Math.max(0.001, ry), 0, 0, TAU);
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
  if (lid > 0.02) {
    const ly = y + R - lid * 2 * R;
    const hw = Math.sqrt(Math.max(0, R * R - (ly - y) ** 2)) + 0.006;
    line(ctx, [[x - hw, ly + tilt * hw], [x + hw, ly - tilt * hw]], LW * 1.05);
  }
};

const eyes = (p: Ctx, g: Geo) => {
  const { c, face, fx, fy } = p;
  const s = g.fs;
  const [x0, y0] = g.face;
  const X = x0 + fx * s, Y = y0 + fy * s;
  const big = 1 + Math.abs(p.pose.pokeAmp) * 0.4;
  if (c.eyes === 1) {
    // on stalks: they bob on springs like feelers
    const tips = stems(p, g, g.spread * 0.9, 0.17, 0.3, 0);
    tips.forEach((tip, i) => googly(p, tip[0], tip[1] + 0.02, 0.045 * face.l.w * big, i ? face.r : face.l, i ? 1 : -1));
    return;
  }
  if (c.eyes === 2) {
    googly(p, X, Y + 0.008, 0.07 * s * face.l.w * big, face.l, -1);
    return;
  }
  if (c.eyes === 3) {
    const R = 0.035 * s * big;
    googly(p, X - 0.074 * s, Y - 0.004, R * face.l.w, face.l, -1);
    googly(p, X, Y + 0.035 * s, R * (face.l.w + face.r.w) / 2, face.l.w > face.r.w ? face.r : face.l, 1);
    googly(p, X + 0.074 * s, Y - 0.004, R * face.r.w, face.r, 1);
    return;
  }
  const R = (c.eyes === 4 ? 0.06 : 0.045) * s * big;
  const sp = c.eyes === 4 ? 0.06 * s : 0.058 * s;
  googly(p, X - sp, Y, R * face.l.w, face.l, -1);
  googly(p, X + sp, Y, R * face.r.w, face.r, 1);
};

const mouth = (p: Ctx, g: Geo) => {
  const { ctx, c, pose, face, fx, fy, seed, t } = p;
  const s = g.fs;
  const X = g.face[0] + fx * s * 1.1, Y = g.face[1] + fy * s - (c.eyes === 1 ? 0.045 : c.eyes === 2 ? 0.1 : 0.085) * s + (c.eyes === 1 ? 0.02 : 0);
  const open = clamp(Math.max(face.mouthOpen, pose.talk * (0.35 + 0.35 * Math.sin(pose.phase * 16))), 0, 1);
  const sm = face.mouth;
  const smileLine = (x: number, y: number, w: number) => {
    const pts: Pt[] = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 5 - 1;
      pts.push([x + u * w, y - sm * 0.022 * s * (1 - u * u) + Math.abs(u) * 0.003]);
    }
    line(ctx, pts, LW);
  };
  const dMouth = (x: number, y: number, w: number, d: number, fill = INK) => {
    const pts: Pt[] = [[x - w, y + 0.004 * sm]];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI;
      pts.push([x - Math.cos(a) * w * -1, y + Math.sin(a) * d]);
    }
    pts.push([x + w, y + 0.004 * sm]);
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = LW;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  const tongue = (x: number, y: number) => {
    if (face.lidB < 0.5) return;
    const pts = ell(x + 0.008, y - 0.022 * s, 0.018 * s, 0.022 * s, 16);
    blobPath(ctx, pts);
    ctx.fillStyle = '#F26D7D';
    ctx.fill();
    ctx.lineWidth = LW * 0.9;
    ctx.strokeStyle = INK;
    ctx.stroke();
  };
  switch (c.mouth) {
    case 1: {
      // a row of square teeth
      const w = 0.072 * s, h = (0.026 + 0.035 * open) * s;
      const y = Y - h * 0.3;
      const pts: Pt[] = [];
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * TAU;
        const cx = Math.cos(a), sy = Math.sin(a);
        pts.push([X + Math.sign(cx) * Math.pow(Math.abs(cx), 0.6) * w, y + Math.sign(sy) * Math.pow(Math.abs(sy), 0.6) * h + (sm * 0.012 * s) * cx * cx]);
      }
      blobPath(ctx, pts);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.save();
      blobPath(ctx, pts);
      ctx.clip();
      const tw = (w * 2) / 5;
      for (let i = 0; i < 5; i++) {
        const tx = X - w + i * tw + tw * 0.12;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(tx, y + h - 0.017 * s - 0.004, tw * 0.76, 0.03 * s);
        if (open > 0.05 || c.mouth === 1) ctx.fillRect(tx + tw * 0.04, y - h - 0.01 * s, tw * 0.72, 0.022 * s);
      }
      ctx.restore();
      blobPath(ctx, pts);
      ctx.lineWidth = LW;
      ctx.strokeStyle = INK;
      ctx.stroke();
      tongue(X, y - h);
      break;
    }
    case 2: {
      // a long painted snout with an inky nose tip
      const nx = X + 0.004, ny = Y + 0.035 * s;
      const a = -0.32 + Math.sin(t * 1.7) * 0.04 + pose.talk * 0.06 * Math.sin(pose.phase * 16);
      const L = 0.18 * s, d: Pt = [Math.cos(a), Math.sin(a)], n: Pt = [-d[1], d[0]];
      const pts: Pt[] = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8, w = 0.03 * s * (1 - 0.55 * u);
        pts.push([nx + d[0] * L * u + n[0] * w, ny + d[1] * L * u + n[1] * w]);
      }
      pts.push([nx + d[0] * (L + 0.008), ny + d[1] * (L + 0.008)]);
      for (let i = 8; i >= 0; i--) {
        const u = i / 8, w = 0.03 * s * (1 - 0.55 * u);
        pts.push([nx + d[0] * L * u - n[0] * w, ny + d[1] * L * u - n[1] * w]);
      }
      const pal = c.accent;
      paint(ctx, pts, pal, seed + 130, a);
      line(ctx, pts.slice(0, 10), LW);
      line(ctx, pts.slice(9), LW);
      dot(ctx, nx + d[0] * L, ny + d[1] * L, 0.017 * s);
      // mouth tucked under the snout
      const mx = X - 0.012 * s, my = Y - 0.012 * s;
      if (open > 0.12) dMouth(mx, my, 0.03 * s, (0.012 + 0.03 * open) * s);
      else smileLine(mx, my, 0.03 * s);
      tongue(mx, my);
      break;
    }
    case 3: {
      // a long thin beak, like a mosquito
      const bx = X + 0.035 * s, by = Y + 0.012 * s;
      const a = -0.1 + Math.sin(t * 2.1) * 0.03 + pose.talk * 0.1 * Math.sin(pose.phase * 16);
      const L = 0.21 * s, d: Pt = [Math.cos(a), Math.sin(a)], n: Pt = [-d[1], d[0]];
      const w0 = 0.02 * s;
      const pts: Pt[] = [[bx + n[0] * w0, by + n[1] * w0], [bx + d[0] * L * 0.6 + n[0] * w0 * 0.4, by + d[1] * L * 0.6 + n[1] * w0 * 0.4], [bx + d[0] * L, by + d[1] * L], [bx + d[0] * L * 0.6 - n[0] * w0 * 0.3, by + d[1] * L * 0.6 - n[1] * w0 * 0.3], [bx - n[0] * w0, by - n[1] * w0]];
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.lineWidth = LW * 0.6;
      ctx.strokeStyle = INK;
      ctx.lineJoin = 'round';
      ctx.stroke();
      const mx = X - 0.01 * s, my = Y - 0.018 * s;
      if (open > 0.12) dMouth(mx, my, 0.022 * s, (0.01 + 0.025 * open) * s);
      else smileLine(mx, my, 0.024 * s);
      break;
    }
    case 4: {
      // fangs under a smile
      const w = 0.045 * s;
      if (open > 0.12) dMouth(X, Y, w, (0.015 + 0.045 * open) * s);
      else smileLine(X, Y, w);
      for (const k of [-1, 1]) {
        const fxp = X + k * 0.02 * s, fyp = Y - sm * 0.022 * s * (1 - 0.2) + 0.002;
        const pts: Pt[] = [[fxp - 0.011 * s, fyp], [fxp, fyp - 0.03 * s], [fxp + 0.011 * s, fyp]];
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.lineWidth = LW * 0.85;
        ctx.strokeStyle = INK;
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      tongue(X, Y - 0.01);
      break;
    }
    default: {
      const w = 0.045 * s;
      if (open > 0.12) dMouth(X, Y, w, (0.015 + 0.045 * open) * s);
      else smileLine(X, Y, w);
      tongue(X, Y - 0.01);
    }
  }
};

const cheeks = (p: Ctx, g: Geo) => {
  const { ctx, face, fx, fy, seed } = p;
  if (face.cheeks < 0.25) return;
  const s = g.fs;
  for (const k of [-1, 1]) {
    const x = g.face[0] + fx * s + k * 0.085 * s, y = g.face[1] + fy * s - 0.045 * s;
    const pts = wobble(ell(x, y, 0.024 * s, 0.016 * s, 14), seed + 140 + k, 0.002);
    blobPath(ctx, pts);
    ctx.globalAlpha = 0.35 * Math.min(1, face.cheeks);
    ctx.fillStyle = '#F2546B';
    ctx.fill();
    ctx.globalAlpha = 1;
  }
};

// ------------------------------------------------------------- ink props
const props = (p: Ctx, g: Geo) => {
  const { ctx, t } = p;
  const q = p.pr('q');
  const top = Math.max(g.crown[1] + 0.12, 0.8);
  if (q > 0.05) {
    // a hand-lettered question mark
    const x = 0.3, y = Math.min(0.98, top + 0.04) + Math.sin(t * 2.2) * 0.012;
    const S = 0.9 * q;
    const r = Math.sin(t * 1.4) * 0.12;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r);
    ctx.scale(S, S);
    const pts: Pt[] = [];
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI * 0.95 - (i / 14) * Math.PI * 1.35;
      pts.push([Math.cos(a) * 0.033, 0.045 + Math.sin(a) * 0.033]);
    }
    pts.push([0.0, 0.0], [0.0, -0.014]);
    line(ctx, pts, LW * 1.3);
    dot(ctx, 0, -0.042, 0.009);
    ctx.restore();
  }
  const z = p.pr('zzz');
  if (z > 0.05) {
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.4 + k / 3) % 1;
      const x = g.crown[0] + 0.14 + ph * 0.14, y = Math.min(0.95, g.crown[1] - 0.05) + ph * 0.2;
      const S = 0.022 + ph * 0.026;
      ctx.globalAlpha = z * Math.sin(Math.PI * ph);
      line(ctx, [[x - S, y + S], [x + S, y + S], [x - S, y - S], [x + S, y - S]], LW * 1.1);
    }
    ctx.globalAlpha = 1;
  }
  const sp = p.pr('spark');
  if (sp > 0.05) {
    // ink sparkles popping around the critter
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.05 + (i / 5) * 0.9);
      const pulse = Math.max(0, Math.sin(t * 4.2 + i * 1.9));
      const x = Math.cos(a) * 0.45, y = 0.45 + Math.sin(a) * 0.48 - (i % 2) * 0.08;
      const r = 0.045 * (0.35 + 0.65 * pulse) * sp;
      if (r < 0.004) continue;
      line(ctx, [[x - r, y], [x + r, y]], LW);
      line(ctx, [[x, y - r], [x, y + r]], LW);
      line(ctx, [[x - r * 0.45, y - r * 0.45], [x + r * 0.45, y + r * 0.45]], LW * 0.7);
      line(ctx, [[x - r * 0.45, y + r * 0.45], [x + r * 0.45, y - r * 0.45]], LW * 0.7);
    }
  }
  const sc = p.pr('scuttle');
  if (sc > 0.1) {
    // dash marks trailing behind the busy feet
    const bb = bbox(g.main);
    for (let k = 0; k < 3; k++) {
      const fl = (Math.floor(t * 8 + k * 3) % 3) / 3;
      const y = bb.y0 + 0.02 + k * 0.05;
      const x = bb.x0 - 0.05 - fl * 0.025;
      ctx.globalAlpha = sc * (0.85 - fl * 0.4);
      line(ctx, [[x - 0.055 + k * 0.01, y], [x, y]], LW);
    }
    ctx.globalAlpha = 1;
  }
  const perk = p.pr('perk');
  if (perk > 0.1) {
    // little "I hear you" arcs by the head
    const bb = bbox(g.head ?? g.main);
    const x = bb.x1 + 0.03, y = g.face[1] + 0.03;
    for (let k = 0; k < 2; k++) {
      const r = 0.03 + k * 0.03;
      ctx.globalAlpha = perk * (0.55 + 0.45 * Math.sin(t * 5 - k * 1.2));
      const pts: Pt[] = [];
      for (let i = 0; i <= 8; i++) {
        const a = -0.7 + (i / 8) * 1.4;
        pts.push([x + Math.cos(a) * r - 0.02, y + Math.sin(a) * r]);
      }
      if (x + r < 0.54) line(ctx, pts, LW * 0.9);
    }
    ctx.globalAlpha = 1;
  }
};

// ------------------------------------------------------------- draw
const draw = (ctx: CanvasRenderingContext2D, c: BugsConfig, pose: Pose, face: FaceState, env: Draw2DEnv) => {
  const t = env.t;
  const pr = (k: string) => clamp(pose.props[k] ?? 0, 0, 1);
  const tuck = pr('tuck'), scuttle = pr('scuttle');
  const seed = strHash(c.name) + c.body * 17;
  // tucked legs lower the body, scuttling jiggles it side to side
  const legLen = c.body === 3 ? 0.32 : c.body === 5 ? 0.12 : c.body === 7 ? 0 : 0.22;
  const drop = tuck * legLen * 0.62;
  const jx = Math.sin(t * 31) * 0.005 * scuttle;
  const und = c.body === 5 ? 0.009 + 0.02 * scuttle : c.body === 7 ? 0.05 + 0.08 * scuttle : 0;
  const g = geometry(c, t, drop, jx, und, pose.wobble * 0.35, pose.wobblePhase);
  const fx = clamp(pose.headYaw * 0.06 + pose.yaw * 0.015, -0.05, 0.05);
  const fy = clamp(-pose.headPitch * 0.045, -0.03, 0.03);
  const lag = lagOf(c, t, fx * 1.5 + pose.roll * 0.35, pose.offset[1] - pose.squash * 0.25 + Math.abs(pose.pokeAmp) * 0.02);
  const p: Ctx = { ctx, c, pose, face, t, seed, fx, fy, pr, lag };

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  wings(p, g);
  horns(p, g);
  paint(ctx, g.main, c.color, seed, g.brush);
  pattern(p, g);
  if (g.head) paint(ctx, g.head, c.accent, seed + 7, g.brush + 0.5);
  // white paint needs the pen to hold its shape
  if (lum(c.color) > 0.9) {
    blobPath(ctx, g.main);
    ctx.lineWidth = LW;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  if (g.head && lum(c.accent) > 0.9) {
    blobPath(ctx, g.head);
    ctx.lineWidth = LW;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  furTicks(p, g);
  legs(p, g);
  arms(p, g);
  antennae(p, g);
  cheeks(p, g);
  eyes(p, g);
  mouth(p, g);
  props(p, g);
};

export const bugs: FamilyDef<BugsConfig> = {
  id: 'bugs',
  name: 'Bugs',
  maker: 'Marker critters',
  tagline: 'Marker-painted critters · stick legs · wings, feelers and spots',
  subtitle: 'Gouache-and-fine-liner critters: streaky paint blobs, googly eyes, a lot of little legs',
  shader: '',
  anchors: 0,
  background: PAPER,
  backgroundSolid: PAPER,
  dark: false,
  traits: ['Streaky gouache bodies', 'Fine-liner legs & feelers', 'Mix-and-match critter parts'],
  look: {
    dark: false,
    groundShadow: 0,
    exposure: 1,
    groundY: 0,
    lights: { key: normalize([-0.5, 0.8, 0.6]), keyI: 1, rim: normalize([0.5, 0.4, -0.7]), rimI: 0.5, fill: normalize([0.8, 0.1, 0.55]), fillI: 0.3, sky: [0.8, 0.8, 0.8], ground: [0.5, 0.5, 0.5], warm: [1, 1, 1], env: 1 },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Breathing, tapping a foot', bob: [0.006, 0.4] },
    listening: { label: 'Listening', hint: 'Feelers perk up, eyes on you', expr: 'listening', gaze: 'user', lean: 0.04, props: { perk: 1 } },
    thinking: { label: 'Thinking', hint: 'Feelers twirl, a question mark', expr: 'thinking', gaze: 'up', sway: [0.025, 0.3], props: { twirl: 1, q: 1 } },
    working: { label: 'Working', hint: 'Scuttling in place, wings buzzing', expr: 'focused', bob: [0.007, 3.2], props: { scuttle: 1, buzz: 1 } },
    speaking: { label: 'Speaking', hint: 'Mouth moves with the voice', expr: 'neutral', talk: 1, gaze: 'user' },
    done: { label: 'Done', hint: 'A hop and ink sparkles', expr: 'happy', enter: 'hop', arms: 'cheer', props: { spark: 1, buzz: 1 } },
    sleeping: { label: 'Sleeping', hint: 'Legs tucked, dozing', expr: 'sleepy', gaze: 'closed', bob: [0.004, 0.25], props: { tuck: 1, zzz: 1 } },
  },
  personality: { body: [2.0, 0.55, 0.6], eyes: [7, 0.8, 0.0], squash: [230, 10], reach: [0.2, 0.14], eyeShare: 0.6, hopGravity: 12 },
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
      id: 'body',
      title: 'Body & paint',
      controls: [
        { type: 'chips', key: 'body', label: 'Body', options: BODY_OPTS },
        { type: 'swatches', key: 'color', label: 'Paint', colors: COLORS, custom: true },
        { type: 'chips', key: 'pattern', label: 'Pattern', options: PATTERN_OPTS },
        { type: 'swatches', key: 'color2', label: 'Pattern colour', colors: COLORS2, custom: true },
        { type: 'swatches', key: 'accent', label: 'Accent (head, wings, horns)', colors: ACCENTS, custom: true },
      ],
    },
    {
      id: 'limbs',
      title: 'Legs, wings & feelers',
      controls: [
        { type: 'chips', key: 'legs', label: 'Legs', options: LEG_OPTS },
        { type: 'chips', key: 'legColor', label: 'Leg ink', options: LEG_COLOR_OPTS },
        { type: 'chips', key: 'arms', label: 'Arms', options: ARM_OPTS },
        { type: 'chips', key: 'wings', label: 'Wings', options: WING_OPTS },
        { type: 'chips', key: 'antennae', label: 'Feelers', options: ANT_OPTS },
      ],
    },
    {
      id: 'face',
      title: 'Face',
      controls: [
        { type: 'chips', key: 'eyes', label: 'Eyes', options: EYE_OPTS },
        { type: 'chips', key: 'mouth', label: 'Mouth', options: MOUTH_OPTS },
        { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS },
      ],
    },
  ],
  roster: () => [
    base({ name: 'Pip', body: 0, color: '#1FA394', pattern: 3, accent: '#F08B78', wings: 1, antennae: 3, eyes: 0, mouth: 0, legs: 2 }),
    base({ name: 'Juno', body: 3, color: '#F0862E', pattern: 3, legs: 2, wings: 0, antennae: 0, eyes: 0, mouth: 0, legColor: 0 }),
    base({ name: 'Noodle', body: 5, color: '#2B9FDC', pattern: 2, color2: '#FFFFFF', accent: '#E5302C', legs: 4, antennae: 1, eyes: 0, mouth: 0 }),
    base({ name: 'Snoot', body: 6, color: '#7B4A2D', pattern: 1, color2: '#FFFFFF', accent: '#C9B26A', legs: 2, wings: 4, antennae: 1, eyes: 0, mouth: 3 }),
    base({ name: 'Zuzu', body: 2, color: '#F27AAE', pattern: 4, color2: '#7B4A2D', accent: '#D9A23C', legs: 1, legColor: 1, wings: 3, antennae: 0, eyes: 1, mouth: 1, arms: 1 }),
  ],
  randomize: (c, rnd) => {
    const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
    const body = Math.floor(rnd() * BODY_OPTS.length);
    const color = pick(COLORS.slice(0, 10));
    let color2 = pick(COLORS2);
    if (color2 === color) color2 = '#FFFFFF';
    const accent = pick(ACCENTS.filter((a) => a !== color));
    const tube = body === 5 || body === 7;
    return {
      ...c,
      body,
      color,
      color2,
      accent,
      pattern: body === 4 ? pick([0, 0, 1, 5]) : tube ? pick([0, 2, 2, 1, 3]) : Math.floor(rnd() * PATTERN_OPTS.length),
      legs: body === 5 ? pick([3, 4, 4]) : body === 7 ? pick([4, 4, 0]) : body === 3 ? pick([1, 2]) : Math.floor(rnd() * 4),
      legColor: rnd() < 0.7 ? 0 : 1 + Math.floor(rnd() * 2),
      arms: rnd() < 0.3 ? 1 : 0,
      wings: tube && rnd() < 0.6 ? 0 : rnd() < 0.3 ? 0 : 1 + Math.floor(rnd() * 4),
      antennae: Math.floor(rnd() * ANT_OPTS.length),
      eyes: pick([0, 0, 0, 1, 2, 3, 4]),
      mouth: pick([0, 0, 1, 2, 3, 4]),
    };
  },
  compose: (n, aspect, compact) =>
    groupPhoto(n, aspect, { gap: compact ? 1.0 : 1.1, charW: 1.05, charH: 1.05, riser: 0, depth: 0, fov: deg(18), margin: 0.1, turn: 0, lift: 0.08 }),
  solo: (aspect) => soloCamera(aspect, 1.05, 1.05, deg(18), 0.08),
  headLocal: () => [0, 0.6, 0.1],
  bounds: () => ({ c: [0, 0.5, 0], r: 0.6, occ: [] }),
  face: bugsFace,
  pack: (_c, _pose, f) => {
    f.data.fill(0);   // drawn in 2D by draw2d
  },
  draw2d: draw,
};
