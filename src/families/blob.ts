import { clamp, deg, normalize } from '../engine/math';
import type { Pose } from '../avatar/avatar';
import type { BaseConfig, Draw2DEnv, EyeSpec, FaceState, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';

/**
 * Blobs: flat jelly characters, one soft colour with no outline, tiny faces
 * sitting low on the body. Every body is a procedural closed curve (a
 * superellipse with a few low-frequency harmonics) that breathes, leans
 * towards the cursor, squishes into the ground and wobbles like jelly when
 * booped. Eyelids are a darker half-disc of the body colour, so the whole
 * family can look sleepy, bored or suspicious with one shape.
 */
export interface BlobConfig extends BaseConfig {
  shape: number;
  color: string;
  ink: string;
  eyes: number;
  spacing: number;
  lids: number;
  pupil: number;
  mouth: number;
  blush: number;
  shine: number;
  topper: number;
  feet: number;
}

type Pt = [number, number];

const opt = (labels: string[]): Option[] => labels.map((label, value) => ({ value, label }));
const SHAPE_OPTS = opt(['Pebble', 'Tall', 'Loaf', 'Bean', 'Gumdrop', 'Mound', 'Mochi', 'Drop']);
const EYE_OPTS = opt(['Small', 'Medium', 'Big', 'Mismatched']);
const SPACING_OPTS = opt(['Snug', 'Normal', 'Wide']);
const LID_OPTS = opt(['None', 'Lazy', 'Heavy']);
const PUPIL_OPTS = opt(['Dot', 'Big', 'Tiny']);
const MOUTH_OPTS = opt(['Dot', 'Smile', 'O', 'Flat', 'None']);
const BLUSH_OPTS = opt(['None', 'Rosy']);
const SHINE_OPTS = opt(['None', 'Shine']);
const TOPPER_OPTS = opt(['None', 'Sprout', 'Leaf', 'Antenna', 'Curl']);
const FEET_OPTS = opt(['None', 'Nubs', 'Toes']);

const MUSTARD = '#FCD055';
const COLORS = [MUSTARD, '#FFB88C', '#9EDDB9', '#A6D4F2', '#C8B5F0', '#FF8F7E', '#F3E2C0'];
const INKS = ['#5C0A1E', '#3B1F4A', '#1E2A4A', '#4A2A12', '#1A1A1A'];
const WHITE = '#FFFFFF';
const LEAF = '#7CC36E';
const LEAF_DARK = '#59A653';

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'content', label: 'Content' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'bored', label: 'Unimpressed' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'shy', label: 'Shy' },
  { value: 'suspicious', label: 'Suspicious' },
  { value: 'excited', label: 'Excited' },
  { value: 'sad', label: 'Sad' },
];

// ------------------------------------------------------------- colour
const rgbOf = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hexOf = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
const mix = (a: string, b: string, t: number): string => {
  const x = rgbOf(a) ?? [0, 0, 0], y = rgbOf(b) ?? [0, 0, 0];
  return hexOf(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
};
/** the eyelid tone: same hue, deeper and a little less saturated (#FCD055 -> ~#E9B52B) */
const shade = (hex: string): string => {
  const [r, g, b] = (rgbOf(hex) ?? [252, 208, 85]).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  const L = Math.max(0.12, l - 0.13), S = s * 0.86;
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S, p = 2 * L - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return hexOf(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
};
interface Palette {
  body: string;
  dark: string;
  hi: string;
  blush: string;
  ink: string;
}
const palCache = new Map<string, Palette>();
const paletteOf = (c: BlobConfig): Palette => {
  const body = rgbOf(c.color) ? c.color : MUSTARD;
  const ink = rgbOf(c.ink) ? c.ink : INKS[0];
  const key = body + ink;
  let p = palCache.get(key);
  if (!p) {
    p = { body, dark: shade(body), hi: mix(body, WHITE, 0.62), blush: mix(body, '#FF6B86', 0.42), ink };
    if (palCache.size > 64) palCache.clear();
    palCache.set(key, p);
  }
  return p;
};

// ------------------------------------------------------------- shapes
/**
 * One body: a superellipse (nt above the middle, nb below) of half size rx, ry,
 * narrowed towards the top by `taper`, widened at the base by `sag`, its top
 * pushed sideways by `lean`, then made organic by radial harmonics [k, amp, phase].
 * `face` is the eye-line centre in normalised body coords (-1..1).
 */
interface ShapeDef {
  rx: number;
  ry: number;
  nt: number;
  nb: number;
  taper: number;
  tp: number;
  sag: number;
  lean: number;
  harm: Array<[number, number, number]>;
  face: Pt;
}
const SHAPES: ShapeDef[] = [
  // pebble: lumpy, a little lopsided, face off to one side
  { rx: 0.37, ry: 0.32, nt: 2.3, nb: 2.5, taper: 0.14, tp: 1.6, sag: 0.05, lean: 0.05, harm: [[2, 0.03, 0.7], [3, 0.03, 2.1]], face: [0.14, -0.12] },
  // tall: a rounded square, face low
  { rx: 0.34, ry: 0.39, nt: 3.6, nb: 3.0, taper: 0.06, tp: 2, sag: 0.03, lean: 0, harm: [[3, 0.012, 1.1], [2, 0.014, 0.4]], face: [0, -0.3] },
  // loaf: wide and squarish
  { rx: 0.45, ry: 0.29, nt: 3.2, nb: 3.0, taper: 0.07, tp: 2, sag: 0.03, lean: 0.02, harm: [[2, 0.018, 0.2], [3, 0.014, 1.4]], face: [0, -0.05] },
  // bean: a tilted lump, taller on one side
  { rx: 0.44, ry: 0.3, nt: 2.2, nb: 2.3, taper: 0.0, tp: 2, sag: 0.02, lean: 0, harm: [[1, 0.03, 0.9], [2, 0.085, -0.9], [3, 0.02, 1.0]], face: [-0.18, -0.02] },
  // gumdrop: a hill with a flat base, the peak off-centre
  { rx: 0.41, ry: 0.36, nt: 2.3, nb: 3.4, taper: 0.3, tp: 1.5, sag: 0.06, lean: 0.09, harm: [[3, 0.016, 0.2], [2, 0.012, 1.4]], face: [-0.06, -0.14] },
  // mound: a low flattened heap, face up near the crown
  { rx: 0.47, ry: 0.28, nt: 2.0, nb: 3.0, taper: 0.26, tp: 1.4, sag: 0.08, lean: 0.06, harm: [[2, 0.018, 1.2], [3, 0.022, 0.3]], face: [-0.08, 0.2] },
  // mochi: round and soft, the base spreading out
  { rx: 0.4, ry: 0.32, nt: 2.1, nb: 2.7, taper: 0.06, tp: 2, sag: 0.16, lean: 0, harm: [[2, 0.012, 0.0]], face: [0, -0.12] },
  // drop: tapering to a soft point that curls over
  { rx: 0.37, ry: 0.4, nt: 2.1, nb: 2.4, taper: 0.64, tp: 2.4, sag: 0.06, lean: 0.12, harm: [[3, 0.012, 1.4]], face: [0, -0.32] },
];
const shapeOf = (c: BlobConfig) => SHAPES[c.shape] ?? SHAPES[0];

const EYE_R: Array<[number, number]> = [[0.058, 0.058], [0.078, 0.078], [0.102, 0.102], [0.066, 0.096]];
const GAP = [0.006, 0.026, 0.075];
const BASE_LID = [0, 0.33, 0.54];
const PUPIL_K = [0.32, 0.47, 0.18];
const FEET_LIFT = 0.028;

// ------------------------------------------------------------- expressions
// eye kinds: 0 open, 1 closed (lid + lash line), 2 happy arc, 3 dizzy swirl, 4 squeeze chevrons
const blobFace = (c: BlobConfig, expr: string): FaceTarget => {
  const L = BASE_LID[c.lids] ?? 0;
  const e = (kind: number, lid = L, o: Partial<EyeSpec> = {}): EyeSpec => ({ kind, w: 1, h: 1, rot: 0, lid, lidAng: 0, dx: 0, dy: 0, ...o });
  const make = (l: EyeSpec, r: EyeSpec, mouth = 0.15, mouthOpen = 0, cheeks = 0, lidB = 0): FaceTarget => ({ l, r, lidB, mouth, mouthOpen, cheeks });
  switch (expr) {
    case 'happy':
      return make(e(0, L * 0.4), e(0, L * 0.4), 0.85, 0.08, 0.45, 0.22);
    case 'content':
    case 'pet':
      return make(e(2), e(2), 0.7, 0, 0.55);
    case 'sleepy':
      return make(e(0, Math.max(L, 0.68), { dy: -0.4 }), e(0, Math.max(L, 0.64), { dy: -0.4 }), 0, 0, 0, 0.12);
    case 'bored':
      return make(e(0, Math.max(L, 0.56), { dx: 0.45 }), e(0, Math.max(L, 0.56), { dx: 0.45 }), -0.05);
    case 'surprised':
      return make(e(0, 0, { w: 1.28, h: 1.28 }), e(0, 0, { w: 1.28, h: 1.28 }), 0, 0.55);
    case 'shy':
      return make(e(0, Math.max(L * 0.6, 0.22), { dx: -0.8, dy: -0.45 }), e(0, Math.max(L * 0.6, 0.22), { dx: -0.8, dy: -0.45 }), 0.3, 0, 1);
    case 'suspicious':
      return make(e(0, 0.56, { lidAng: 0.22, dx: 0.75 }), e(0, 0.4, { lidAng: -0.1, dx: 0.75 }), -0.2);
    case 'excited':
      return make(e(0, 0, { w: 1.18, h: 1.18 }), e(0, 0, { w: 1.18, h: 1.18 }), 1, 0.45, 0.6);
    case 'sad':
      return make(e(0, Math.max(L, 0.3), { lidAng: -0.22, dy: -0.5 }), e(0, Math.max(L, 0.3), { lidAng: -0.22, dy: -0.5 }), -0.65);
    case 'squeeze':
      return make(e(4, 0), e(4, 0), 0.9, 0.35, 0.7);
    case 'dizzy':
      return make(e(3, 0), e(3, 0), -0.1, 0.22);
    case 'listening':
      return make(e(0, L * 0.3, { w: 1.08, h: 1.08 }), e(0, L * 0.3, { w: 1.08, h: 1.08 }), 0.25);
    case 'thinking':
      return make(e(0, 0.46, { lidAng: 0.2, dy: 0.7, dx: -0.3 }), e(0, 0.22, { dy: 0.7, dx: -0.3 }), -0.1);
    case 'working':
      return make(e(0, Math.max(L, 0.36), { lidAng: 0.12, dy: -0.6 }), e(0, Math.max(L, 0.36), { lidAng: 0.12, dy: -0.6 }), 0);
    default:
      return make(e(0), e(0), 0.15);
  }
};

const base = (o: Partial<BlobConfig>): BlobConfig => ({
  name: 'Blob',
  state: 'idle',
  expression: 'neutral',
  shape: 0,
  color: MUSTARD,
  ink: INKS[0],
  eyes: 1,
  spacing: 0,
  lids: 0,
  pupil: 0,
  mouth: 0,
  blush: 0,
  shine: 0,
  topper: 0,
  feet: 0,
  ...o,
});

// ------------------------------------------------------------- body geometry
const N = 96;
const TAU = Math.PI * 2;

interface Body {
  S: ShapeDef;
  /** global warp */
  sx: number;
  sy: number;
  shear: number;
  bulge: number;
  lift: number;
  H: number;
  pts: Pt[];
  centre: Pt;
  top: Pt;
}

const smax0 = (y: number, k = 0.07) => (y + Math.sqrt(y * y + k * k)) / 2;

/** normalised shape point (before harmonics) for unit-circle direction (cx, sy) */
const shapeNorm = (S: ShapeDef, c: number, s: number, lean: number): Pt => {
  const n = s >= 0 ? S.nt : S.nb;
  let X = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
  const Y = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
  const h = (Y + 1) / 2;
  X *= (1 - S.taper * Math.pow(h, S.tp)) * (1 + S.sag * (1 - h) * (1 - h));
  X += (S.lean + lean) * h * h;
  return [X, Y];
};

const warp = (B: Body, x: number, y: number): Pt => {
  const h = clamp(y / B.H, 0, 1.3);
  const x2 = x * B.sx * (1 + B.bulge * (1 - Math.min(1, h)) * (1 - Math.min(1, h))) + B.shear * h * h;
  return [x2, smax0(y * B.sy) + B.lift];
};

const buildBody = (c: BlobConfig, pose: Pose, face: FaceState, t: number): Body => {
  const S = shapeOf(c);
  const P = pose.props;
  const melt = P.melt ?? 0;
  const jig = P.jiggle ?? 0;
  const W = Math.min(1.6, (pose.wobble ?? 0) / 0.035);
  const wp = pose.wobblePhase ?? 0;
  const breathe = Math.sin(t * (1.7 - 0.7 * melt)) * (1 + 1.2 * melt);
  const jelly = W * 0.085 * Math.sin(wp) + jig * 0.035 * Math.sin(t * 13.8);
  const stretch = (face.l.h - 1) * 0.18 + (P.tilt ?? 0) * 0.035 * (1 + Math.sin(t * 2.2) * 0.4);
  const sq = Math.max(0, pose.squash ?? 0);
  const B: Body = {
    S,
    sx: (1 - 0.009 * breathe + jelly + 0.1 * melt) * (1 - stretch * 0.5) * (1 + 0.05 * pose.pet),
    sy: (1 + 0.016 * breathe - jelly - 0.17 * melt + stretch) * (1 - 0.07 * pose.pet),
    shear: 0,
    bulge: 0.12 * melt + sq * 0.6,
    lift: c.feet ? FEET_LIFT : 0,
    H: S.ry * 2,
    pts: [],
    centre: [0, 0],
    top: [0, 0],
  };
  // the top leans towards the cursor, ponders, sways when wobbled
  const lean =
    (pose.headYaw ?? 0) * 0.16 +
    (P.tilt ?? 0) * 0.07 +
    (P.ponder ?? 0) * 0.07 * Math.sin(t * 0.7) +
    jig * 0.02 * Math.sin(t * 6.9);
  B.shear = S.rx * (lean + W * 0.13 * Math.sin(wp * 0.62 + 1.1));

  // poke dent: direction of the poke from the body centre
  const q = pose.poke ?? [0, 0.5, 0];
  const pa = (pose.pokeAmp ?? 0) / 0.055;
  const pokeA = Math.atan2((q[1] ?? 0.5) - S.ry, q[0] ?? 0);
  const ex = pose.excite ?? 0;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const [X0, Y0] = shapeNorm(S, Math.cos(a), Math.sin(a), 0);
    let r = 1;
    for (const [k, amp, ph] of S.harm) r += amp * (1 + 0.18 * Math.sin(t * 0.43 + k * 1.7)) * Math.cos(k * a + ph + 0.22 * Math.sin(t * 0.31 + k));
    // slow living ripple, jelly wobble, a little shiver when hovered or working
    r += 0.006 * Math.sin(2 * a - t * 1.1) + 0.005 * Math.sin(3 * a + t * 0.8);
    r += W * (0.03 * Math.sin(3 * a + wp * 1.2) + 0.022 * Math.cos(2 * a - wp * 0.8));
    r += (jig * 0.012 + ex * 0.004) * Math.sin(4 * a + t * 11);
    let d = a - pokeA;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    r -= pa * 0.11 * Math.exp(-(d * d) / 0.3);
    B.pts.push(warp(B, X0 * r * S.rx, (Y0 * r + 1) * S.ry));
  }
  B.centre = warp(B, 0, S.ry);
  B.top = B.pts[N / 4];
  return B;
};

// ------------------------------------------------------------- drawing helpers
const bodyPath = (ctx: CanvasRenderingContext2D, pts: Pt[]) => {
  ctx.beginPath();
  const n = pts.length;
  const m0: Pt = [(pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2];
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  ctx.closePath();
};
const ellipse = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, col: string) => {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(1e-4, rx), Math.max(1e-4, ry), 0, 0, TAU);
  ctx.fillStyle = col;
  ctx.fill();
};
const stroke = (ctx: CanvasRenderingContext2D, pts: Pt[], col: string, w: number) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
};
const poly = (ctx: CanvasRenderingContext2D, pts: Pt[], col: string) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
};
/** a pointed leaf from `a` to `b`, `w` wide */
const leaf = (ctx: CanvasRenderingContext2D, a: Pt, b: Pt, w: number, col: string) => {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * w, ny = (dx / l) * w;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.quadraticCurveTo(mx + nx, my + ny, b[0], b[1]);
  ctx.quadraticCurveTo(mx - nx, my - ny, a[0], a[1]);
  ctx.fillStyle = col;
  ctx.fill();
};
const sparkle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) => {
  if (r <= 0.002) return;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 2;
    const rr = i % 2 ? r * 0.28 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
};

interface Ctx {
  ctx: CanvasRenderingContext2D;
  c: BlobConfig;
  pose: Pose;
  face: FaceState;
  t: number;
  pal: Palette;
  B: Body;
  /** face centre (eye line) and foreshortening */
  fx: number;
  fy: number;
  fk: number;
  faceOn: boolean;
  eyes: Array<{ x: number; y: number; r: number; s: number; spec: EyeSpec }>;
}

// ------------------------------------------------------------- parts
const feet = ({ ctx, c, pose, t, pal, B }: Ctx) => {
  if (!c.feet) return;
  const jig = pose.props.jiggle ?? 0;
  for (const s of [-1, 1]) {
    const tap = jig * Math.max(0, Math.sin(t * 9 + (s > 0 ? Math.PI : 0))) * 0.022;
    const x = warp(B, s * B.S.rx * (c.feet === 2 ? 0.46 : 0.36), 0)[0];
    if (c.feet === 2) ellipse(ctx, x + s * 0.02, 0.028 + tap, 0.078, 0.03, pal.dark);
    else ellipse(ctx, x, 0.03 + tap, 0.05, 0.032, pal.dark);
  }
};

const topper = ({ ctx, c, pose, t, pal, B }: Ctx) => {
  if (!c.topper) return;
  const W = Math.min(1.6, (pose.wobble ?? 0) / 0.035);
  const sway = 0.012 * Math.sin(t * 1.9) + W * 0.035 * Math.sin((pose.wobblePhase ?? 0) * 0.8) + B.shear * 0.25 + Math.sin(pose.yaw) * 0.02;
  const [tx, ty0] = B.top;
  const ty = ty0 - 0.025;
  if (c.topper === 1) {
    // sprout: a curved stem and two leaves
    const tip: Pt = [tx + sway, ty + 0.1];
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + sway * 0.2, ty + 0.06, tip[0], tip[1]);
    ctx.strokeStyle = LEAF_DARK;
    ctx.lineWidth = 0.014;
    ctx.lineCap = 'round';
    ctx.stroke();
    leaf(ctx, tip, [tip[0] - 0.085, tip[1] + 0.035 + sway * 0.4], 0.028, LEAF);
    leaf(ctx, tip, [tip[0] + 0.075, tip[1] + 0.055 - sway * 0.4], 0.025, LEAF);
  } else if (c.topper === 2) {
    // one big leaf on a short stem
    const tip: Pt = [tx + sway * 0.6, ty + 0.055];
    stroke(ctx, [[tx, ty], tip], LEAF_DARK, 0.014);
    leaf(ctx, tip, [tip[0] + 0.1 + sway, tip[1] + 0.07], 0.04, LEAF);
    stroke(ctx, [tip, [tip[0] + 0.06 + sway * 0.6, tip[1] + 0.042]], LEAF_DARK, 0.007);
  } else if (c.topper === 3) {
    // antenna with a bobbing ball
    const tip: Pt = [tx + sway * 1.6, ty + 0.13 + 0.006 * Math.sin(t * 3.1)];
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx, ty + 0.07, tip[0], tip[1]);
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 0.013;
    ctx.lineCap = 'round';
    ctx.stroke();
    ellipse(ctx, tip[0], tip[1], 0.028, 0.028, pal.dark);
  } else if (c.topper === 4) {
    // a single curl of jelly
    const pts: Pt[] = [];
    for (let i = 0; i <= 22; i++) {
      const u = i / 22;
      const a = -Math.PI * 0.5 + u * Math.PI * 1.75;
      const r = 0.045 * (1 - 0.55 * u);
      pts.push([tx + sway * u + 0.02 + Math.cos(a) * r * 1.0 - 0.02 * (1 - u), ty + 0.03 + u * 0.06 + Math.sin(a) * r]);
    }
    pts.unshift([tx, ty]);
    stroke(ctx, pts, pal.body, 0.026);
  }
};

const shine = ({ ctx, c, pal, B }: Ctx) => {
  if (!c.shine) return;
  const [cx, cy] = B.centre;
  const at = (a: number, k: number): Pt => {
    const p = B.pts[Math.round(((a / TAU) * N) % N)];
    return [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k];
  };
  const arc: Pt[] = [];
  for (let i = 0; i <= 8; i++) arc.push(at(Math.PI * (0.6 + i * 0.022), 0.8));
  stroke(ctx, arc, pal.hi, 0.03);
  const d = at(Math.PI * 0.85, 0.8);
  ellipse(ctx, d[0], d[1], 0.016, 0.016, pal.hi);
};

const blush = ({ ctx, c, face, pal, eyes, fk }: Ctx) => {
  const k = Math.max(c.blush ? 1 : 0, clamp((face.cheeks - 0.25) / 0.5, 0, 1));
  if (k <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = k;
  for (const e of eyes) {
    const r = Math.max(e.r, 0.07);
    ellipse(ctx, e.x + e.s * r * 0.95 * fk, e.y - e.r * 0.95 - 0.012, r * 0.55 * fk, r * 0.3, pal.blush);
  }
  ctx.restore();
};

const eye = (p: Ctx, x: number, y: number, r: number, s: number, spec: EyeSpec) => {
  const { ctx, pose, pal, c, fk } = p;
  const rw = r * spec.w * fk * (1 + 0.05 * pose.excite), rh = r * spec.h * (1 + 0.05 * pose.excite);
  const lw = Math.max(r * 0.2, 0.012);
  const k = spec.kind;
  if (k === 4) {
    // squeeze: > <
    stroke(ctx, [[x + s * rw * 0.55, y + rh * 0.5], [x - s * rw * 0.45, y], [x + s * rw * 0.55, y - rh * 0.5]], pal.ink, lw * 1.1);
    return;
  }
  if (k === 2) {
    // happy closed: a little rainbow
    const pts: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * (0.1 + 0.8 * (i / 12));
      pts.push([x + Math.cos(a) * rw * 0.78, y - rh * 0.3 + Math.sin(a) * rh * 0.62]);
    }
    stroke(ctx, pts, pal.ink, lw);
    return;
  }
  const lid = clamp(spec.lid + (1 - spec.lid) * pose.blink, 0, 1);
  if (k === 1 || lid > 0.9) {
    // closed: the darker lid as a lens with the lash line along its bottom
    const yb = y - rh * 0.12;
    const sagD = rh * 0.16;
    ctx.beginPath();
    ctx.moveTo(x - rw, yb);
    ctx.ellipse(x, yb, rw, rh * 0.55, 0, Math.PI, 0, true);
    ctx.quadraticCurveTo(x, yb - sagD * 2, x - rw, yb);
    ctx.fillStyle = pal.dark;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - rw * 1.02, yb);
    ctx.quadraticCurveTo(x, yb - sagD * 2, x + rw * 1.02, yb);
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = lw * 0.85;
    ctx.lineCap = 'round';
    ctx.stroke();
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(1e-4, rw), Math.max(1e-4, rh), 0, 0, TAU);
  ctx.fillStyle = WHITE;
  ctx.fill();
  ctx.clip();
  const lidY = (u: number) => y + rh - lid * 2 * rh - spec.lidAng * (-s * u) * 1.6;
  if (k === 3) {
    // dizzy: a turning spiral
    const pts: Pt[] = [];
    const rot = p.t * 7 * s;
    for (let i = 0; i <= 30; i++) {
      const u = i / 30;
      const a = rot + u * Math.PI * 4;
      pts.push([x + Math.cos(a) * rw * 0.75 * u, y + Math.sin(a) * rh * 0.75 * u]);
    }
    stroke(ctx, pts, pal.ink, lw * 0.6);
  } else {
    const pr = r * (PUPIL_K[c.pupil] ?? PUPIL_K[0]) * (1 + 0.1 * pose.excite);
    let ox = pose.lookX * 0.85 + spec.dx, oy = pose.lookY * 0.8 + spec.dy;
    const ol = Math.hypot(ox, oy);
    if (ol > 1) {
      ox /= ol;
      oy /= ol;
    }
    const m = Math.max(0, Math.min(rw, rh) - pr * 1.08);
    const px = x + ox * m;
    let py = y + oy * m;
    // the pupil tucks just under a lowered lid, the way a sleepy eye looks
    if (lid > 0.05) py = Math.max(y - rh + pr * 0.9, Math.min(py, lidY(px - x) - pr * 0.45));
    ellipse(ctx, px, py, pr, pr, pal.ink);
  }
  if (lid > 0.01) {
    const m = rw * 1.2;
    poly(ctx, [[x - m, lidY(-m)], [x + m, lidY(m)], [x + m, y + rh * 1.2], [x - m, y + rh * 1.2]], pal.dark);
  }
  const lidB = p.face.lidB;
  if (lidB > 0.02) {
    // cheeks pushing up from below (happy squint), in the body colour
    const R = rh * 1.4;
    ellipse(ctx, x, y - rh - R + lidB * 2 * rh, R * 1.1, R, pal.body);
  }
  ctx.restore();
};

const mouth = ({ ctx, c, pose, face, pal, fk }: Ctx, x: number, y: number) => {
  const open = Math.max(face.mouthOpen, pose.talk * 0.85);
  const sm = face.mouth;
  const lw = 0.013;
  const arc = (w: number, depth: number) => {
    const pts: Pt[] = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 5 - 1;
      pts.push([x + u * w * fk, y + depth * (u * u - 1) * 0.5 + depth * 0.25]);
    }
    stroke(ctx, pts, pal.ink, lw);
  };
  if (open > 0.12) {
    if (sm > 0.5 && open > 0.25) {
      // a D-shaped grin with a tongue
      const w = 0.036 * fk, d = 0.016 + open * 0.04;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x - w, y + 0.006);
      ctx.lineTo(x + w, y + 0.006);
      ctx.ellipse(x, y + 0.006, w, d, 0, 0, Math.PI, true);
      ctx.closePath();
      ctx.fillStyle = pal.ink;
      ctx.fill();
      ctx.clip();
      ellipse(ctx, x, y + 0.006 - d, w * 0.6, d * 0.5, '#F2899A');
      ctx.restore();
    } else {
      ellipse(ctx, x, y, (0.014 + 0.012 * open) * fk, 0.011 + 0.03 * open, pal.ink);
    }
    return;
  }
  const style = c.mouth;
  if (sm < -0.35 && style !== 4) {
    arc(0.026, sm * 0.026);
    return;
  }
  switch (style) {
    case 1:
      arc(0.03, 0.026 * Math.max(0.45, sm));
      break;
    case 2:
      ctx.beginPath();
      ctx.ellipse(x, y, 0.014 * fk, 0.017, 0, 0, TAU);
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = lw * 0.85;
      ctx.stroke();
      break;
    case 3:
      if (sm > 0.55) arc(0.026, 0.02 * sm);
      else stroke(ctx, [[x - 0.024 * fk, y], [x + 0.024 * fk, y]], pal.ink, lw);
      break;
    case 4:
      if (sm > 0.6) arc(0.024, 0.02 * sm);
      break;
    default:
      if (sm > 0.55) arc(0.022, 0.022 * sm);
      else ellipse(ctx, x, y, 0.0145 * fk, 0.012, pal.ink);
  }
};

/** thought dots, motion lines, sound arcs, sparkles and a sleep bubble, in the same flat shapes */
const props = (p: Ctx) => {
  const { ctx, pose, t, pal, B } = p;
  const P = pose.props;
  const rx = B.S.rx * B.sx;
  const top = B.top[1];
  const bits = P.bits ?? 0;
  if (bits > 0.03) {
    for (let i = 0; i < 3; i++) {
      const pulse = 0.85 + 0.15 * Math.sin(t * 3 - i * 0.9);
      const r = (0.02 + 0.012 * i) * bits * pulse;
      const x = Math.min(0.5 - r, rx * 0.5 + 0.06 + i * 0.075);
      const y = Math.min(1.07 - r, top * 0.9 + 0.05 + i * 0.075 + 0.008 * Math.sin(t * 2 + i));
      ellipse(ctx, x, y, r, r, pal.dark);
    }
  }
  const jig = P.jiggle ?? 0;
  if (jig > 0.05) {
    // effort ticks either side
    for (const s of [-1, 1])
      for (let i = 0; i < 2; i++) {
        const on = Math.sin(t * 7 + i * 2.1 + (s > 0 ? 1.3 : 0)) > -0.2;
        if (!on) continue;
        const x = s * (rx + 0.035 + i * 0.012), y = top * (0.62 - i * 0.2);
        const l = 0.045 * jig;
        stroke(ctx, [[x, y], [x + s * l * 0.85, y + l * 0.5 - i * 0.02]], pal.dark, 0.014);
      }
  }
  const voice = (P.voice ?? 0) * Math.min(1, pose.talk * 1.5 + 0.15);
  if (voice > 0.05 && p.faceOn) {
    for (let i = 0; i < 2; i++) {
      const r = 0.04 + i * 0.035;
      const x0 = Math.max(p.fx + 0.06, rx * 0.72);
      const pts: Pt[] = [];
      for (let j = 0; j <= 8; j++) {
        const a = -0.55 + (j / 8) * 1.1;
        pts.push([x0 + Math.cos(a) * r, p.fy - 0.03 + Math.sin(a) * r]);
      }
      ctx.save();
      ctx.globalAlpha = clamp(voice * (1.2 - i * 0.4), 0, 1);
      stroke(ctx, pts, pal.dark, 0.014);
      ctx.restore();
    }
  }
  const sp = P.sparkle ?? 0;
  if (sp > 0.05) {
    const spots: Array<[number, number, number]> = [[-rx * 0.95, top * 0.9, 0], [rx * 0.98, top * 0.72, 1.7], [rx * 0.28, top + 0.09, 3.1], [-rx * 0.55, top + 0.06, 4.4]];
    for (const [x, y, ph] of spots) {
      const k = 0.25 + 0.75 * Math.max(0, Math.sin(t * 3.2 + ph));
      sparkle(ctx, clamp(x, -0.5, 0.5), Math.min(1.05, y), 0.05 * k * sp, pal.dark);
    }
  }
  const snore = P.snore ?? 0;
  if (snore > 0.05 && p.faceOn) {
    const k = 0.5 + 0.5 * Math.sin(t * 1.1);
    const r = (0.012 + 0.03 * k) * snore;
    const x = p.fx + 0.05 + r * 0.7, y = p.fy - 0.06 + r * 0.4;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 0.007;
    ctx.stroke();
    ellipse(ctx, x - r * 0.35, y + r * 0.35, r * 0.18, r * 0.18, WHITE);
  }
};

const draw = (ctx: CanvasRenderingContext2D, c: BlobConfig, pose: Pose, face: FaceState, env: Draw2DEnv) => {
  const t = env.t;
  const pal = paletteOf(c);
  const B = buildBody(c, pose, face, t);
  const S = B.S;

  // face anchor follows the body warp; turning slides it around the jelly
  const yawA = (pose.yaw ?? 0) + (pose.headYaw ?? 0) * 0.55;
  const cyw = Math.cos(yawA);
  const [ax, ay] = shapeNorm(S, S.face[0], S.face[1], 0);
  const [wx, wy] = warp(B, ax * S.rx, (ay + 1) * S.ry);
  const fk = 0.62 + 0.38 * Math.max(0, cyw);
  const p: Ctx = {
    ctx,
    c,
    pose,
    face,
    t,
    pal,
    B,
    fx: wx + Math.sin(yawA) * S.rx * 0.45 * B.sx,
    fy: wy - (pose.headPitch ?? 0) * 0.05 + pose.lookY * 0.008,
    fk,
    faceOn: cyw > 0.08,
    eyes: [],
  };
  const [rl, rr] = EYE_R[c.eyes] ?? EYE_R[1];
  const gap = (GAP[c.spacing] ?? GAP[0]) * fk;
  const ra = (rl + rr) / 2;
  p.eyes = [
    { x: p.fx - (gap / 2 + rl * face.l.w * fk), y: p.fy + (rl - ra) * 0.8, r: rl, s: -1, spec: face.l },
    { x: p.fx + (gap / 2 + rr * face.r.w * fk), y: p.fy + (rr - ra) * 0.8, r: rr, s: 1, spec: face.r },
  ];

  feet(p);
  topper(p);
  bodyPath(ctx, B.pts);
  ctx.fillStyle = pal.body;
  ctx.fill();
  // everything on the body is clipped to it, so a turning face slides round the edge
  ctx.save();
  bodyPath(ctx, B.pts);
  ctx.clip();
  shine(p);
  if (p.faceOn) {
    blush(p);
    for (const e of p.eyes) eye(p, e.x, e.y, e.r, e.s, e.spec);
    const my = p.fy - Math.max(rl * face.l.h, rr * face.r.h) * 0.62 - ra * 0.55 - 0.012;
    mouth(p, p.fx + (rr - rl) * 0.35 * fk, my);
  }
  ctx.restore();
  props(p);
};

export const blob: FamilyDef<BlobConfig> = {
  id: 'blob',
  name: 'Blobs',
  maker: 'Flat jelly',
  tagline: 'Flat jelly blobs · wobbly outlines · sleepy lids and tiny mouths',
  subtitle: 'Flat jelly blobs that breathe and wobble, with tiny faces, lazy lids and little mouths',
  shader: '',
  anchors: 0,
  background: '#FFFDF8',
  backgroundSolid: '#FFFDF8',
  dark: false,
  traits: ['One flat colour, no outlines', 'Wobbles like jelly when booped', 'Sleepy lids, tiny mouths'],
  look: {
    dark: false,
    groundShadow: 0,
    exposure: 1,
    groundY: 0,
    lights: { key: normalize([-0.5, 0.8, 0.6]), keyI: 1, rim: normalize([0.5, 0.4, -0.7]), rimI: 0.5, fill: normalize([0.8, 0.1, 0.55]), fillI: 0.3, sky: [0.8, 0.8, 0.8], ground: [0.5, 0.5, 0.5], warm: [1, 1, 1], env: 1 },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Breathing, wobbling gently', bob: [0.004, 0.35], squash: [0.016, 0.42] },
    listening: { label: 'Listening', hint: 'Leaning in, eyes on you', expr: 'listening', gaze: 'user', props: { tilt: 1 }, squash: [0.01, 0.5] },
    thinking: { label: 'Thinking', hint: 'Slow lean, thought dots', expr: 'thinking', gaze: 'up', sway: [0.025, 0.22], props: { bits: 1, ponder: 1 } },
    working: { label: 'Working', hint: 'Bouncy jiggle', expr: 'working', gaze: 'down', bob: [0.012, 2.2], squash: [0.05, 2.2], props: { jiggle: 1 } },
    speaking: { label: 'Speaking', hint: 'Mouth moves with the voice', expr: 'happy', talk: 1, gaze: 'user', bob: [0.006, 1.3], props: { voice: 1 } },
    done: { label: 'Done', hint: 'A jelly bounce and sparkles', expr: 'excited', enter: 'celebrate', squash: [0.035, 1.5], emote: ['sparkle', 3.2], props: { sparkle: 1 } },
    sleeping: { label: 'Sleeping', hint: 'Melting flat, dozing', expr: 'sleepy', gaze: 'closed', bob: [0.002, 0.25], props: { melt: 1, snore: 1 }, emote: ['zzz', 2.6] },
    bored: { label: 'Unimpressed', hint: 'Heavy lids, slumped', expr: 'bored', gaze: 'away', sway: [0.01, 0.15], props: { melt: 0.35 } },
  },
  // a soft, under-damped squash spring: the whole body jiggles back after a hop or a boop
  personality: { body: [2.0, 0.55, 0.6], eyes: [6.5, 0.85, 0.0], squash: [220, 8.5], reach: [0.2, 0.14], eyeShare: 0.6, hopGravity: 11 },
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
      title: 'Body',
      controls: [
        { type: 'chips', key: 'shape', label: 'Shape', options: SHAPE_OPTS },
        { type: 'swatches', key: 'color', label: 'Colour', colors: COLORS, custom: true },
        { type: 'chips', key: 'shine', label: 'Shine', options: SHINE_OPTS },
        { type: 'chips', key: 'topper', label: 'Topper', options: TOPPER_OPTS },
        { type: 'chips', key: 'feet', label: 'Feet', options: FEET_OPTS },
      ],
    },
    {
      id: 'eyes',
      title: 'Eyes',
      controls: [
        { type: 'chips', key: 'eyes', label: 'Eye size', options: EYE_OPTS },
        { type: 'chips', key: 'spacing', label: 'Spacing', options: SPACING_OPTS },
        { type: 'chips', key: 'lids', label: 'Lids', options: LID_OPTS },
        { type: 'chips', key: 'pupil', label: 'Pupils', options: PUPIL_OPTS },
      ],
    },
    {
      id: 'mood',
      title: 'Mood',
      controls: [
        { type: 'chips', key: 'mouth', label: 'Mouth', options: MOUTH_OPTS },
        { type: 'chips', key: 'blush', label: 'Blush', options: BLUSH_OPTS },
        { type: 'swatches', key: 'ink', label: 'Ink', colors: INKS, custom: true },
        { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS },
      ],
    },
  ],
  roster: () => [
    base({ name: 'Mabel', shape: 0, color: MUSTARD, eyes: 1, spacing: 0, lids: 1, pupil: 0, mouth: 0 }),
    base({ name: 'Pudding', shape: 6, color: '#FFB88C', eyes: 2, spacing: 0, lids: 0, pupil: 1, mouth: 1, blush: 1, shine: 1 }),
    base({ name: 'Moss', shape: 4, color: '#9EDDB9', eyes: 0, spacing: 1, lids: 2, pupil: 2, mouth: 3, topper: 1, feet: 1 }),
    base({ name: 'Dumpling', shape: 1, color: MUSTARD, eyes: 3, spacing: 0, lids: 0, pupil: 0, mouth: 2, topper: 3 }),
    base({ name: 'Lulu', shape: 3, color: '#C8B5F0', eyes: 1, spacing: 1, lids: 1, pupil: 0, mouth: 1, blush: 1, topper: 4, feet: 2, ink: INKS[1] }),
  ],
  randomize: (c, rnd) => {
    const pick = (n: number) => Math.floor(rnd() * n);
    return {
      ...c,
      shape: pick(SHAPE_OPTS.length),
      color: rnd() < 0.35 ? MUSTARD : COLORS[pick(COLORS.length)],
      ink: rnd() < 0.7 ? INKS[0] : INKS[pick(INKS.length)],
      eyes: pick(EYE_OPTS.length),
      spacing: rnd() < 0.6 ? 0 : 1 + pick(2),
      lids: pick(LID_OPTS.length),
      pupil: rnd() < 0.55 ? 0 : 1 + pick(2),
      mouth: pick(MOUTH_OPTS.length),
      blush: rnd() < 0.35 ? 1 : 0,
      shine: rnd() < 0.4 ? 1 : 0,
      topper: rnd() < 0.45 ? 1 + pick(4) : 0,
      feet: rnd() < 0.3 ? 1 + pick(2) : 0,
    };
  },
  compose: (n, aspect, compact) =>
    groupPhoto(n, aspect, { gap: compact ? 1.0 : 1.1, charW: 1.05, charH: 1.05, riser: 0, depth: 0, fov: deg(18), margin: 0.1, turn: 0, lift: 0.08 }),
  solo: (aspect) => soloCamera(aspect, 1.0, 0.86, deg(18), 0.08),
  headLocal: (c) => {
    const S = shapeOf(c);
    return [0, Math.min(0.8, S.ry * 1.5), 0.1];
  },
  bounds: () => ({ c: [0, 0.5, 0], r: 0.6, occ: [] }),
  face: blobFace,
  pack: (_c, _pose, f) => {
    f.data.fill(0);   // drawn in 2D by draw2d
  },
  draw2d: draw,
};
