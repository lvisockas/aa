import { deg, hexToRgb, normalize } from '../engine/math';
import type { ArmPose, Pose } from '../avatar/avatar';
import type { BaseConfig, Draw2DEnv, EyeSpec, FaceState, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';
import { solveArm } from './limbs';

/**
 * Ghosts: rubbery imaginary-friend ghosts in the spirit of hand-drawn 2000s TV
 * cartoons. A flat, outline-free gumdrop of saturated colour with a drippy hem,
 * huge white eyes with thick black rims, heavy brows that do all the acting,
 * and noodle arms that only sprout when there is something to point at.
 * The body bends toward whatever it is looking at; expressions are the star.
 */
export interface GhostConfig extends BaseConfig {
  shape: number;
  hem: number;
  color: string;
  eyes: number;
  pupils: number;
  brows: number;
  mouth: number;
  nose: number;
  cheeks: number;
  accessory: number;
}

type Pt = [number, number];
const INK = '#141414';
const RED = '#E4312B';
const TONGUE = '#F27E9C';
const LW = 0.0155;   // eye rims and mouth lines, in character units

const opt = (labels: string[]): Option[] => labels.map((label, value) => ({ value, label }));
const SHAPE_OPTS = opt(['Gumdrop', 'Tall', 'Stout', 'Bean', 'Peanut', 'Bell']);
const HEM_OPTS = opt(['Drippy', 'Scalloped', 'Flat', 'Tattered']);
const EYE_OPTS = opt(['Big', 'Apart', 'Small', 'Mismatched', 'Tall']);
const PUPIL_OPTS = opt(['Dots', 'Big', 'Pinpoint', 'Wanderer', 'Shiny']);
const BROW_OPTS = opt(['None', 'Thin', 'Heavy', 'Unibrow']);
const MOUTH_OPTS = opt(['Line', 'Grin', 'Buck tooth', 'Smirk', 'Tiny']);
const NOSE_OPTS = opt(['None', 'Tick', 'Hook', 'Dot']);
const CHEEK_OPTS = opt(['None', 'Blush', 'Freckles']);
const ACC_OPTS = opt(['None', 'Bandana mask', 'Cape', 'Party hat', 'Bow tie', 'Shades']);
const COLORS = ['#29A8E0', '#F47FB4', '#4FD1A5', '#A88BE6', '#F7953B', '#F5CB3A', '#7C8CF2'];

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'angry', label: 'Angry' },
  { value: 'shouting', label: 'Shouting' },
  { value: 'gasp', label: 'Gasp' },
  { value: 'smug', label: 'Smug' },
  { value: 'scheming', label: 'Scheming' },
  { value: 'worried', label: 'Worried' },
  { value: 'deadpan', label: 'Deadpan' },
  { value: 'giddy', label: 'Giddy' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'excited', label: 'Excited' },
];

/*
 * Face encoding (everything interpolates, kinds swap on a blink):
 *   eye kind: 0 open, 1 happy arc, 2 closed, 3 dizzy spiral, 4 squeeze chevron
 *   w/h: eye size, rot: brow tilt (+ inner end down), dy: brow raise,
 *   lid / lidAng: upper lid cover and tilt (+ inner end down), lidB: lower lids,
 *   l.dx: pupil bias sideways, r.dx: mouth skew (smirk),
 *   mouth: smile (+) / frown (-), above ~0.85 the grin shows teeth,
 *   cheeks: blush (+) or gritted teeth (-).
 */
const ghostFace = (_c: GhostConfig, expr: string): FaceTarget => {
  const e = (kind: number, o: Partial<EyeSpec> = {}): EyeSpec => ({ kind, w: 1, h: 1, rot: 0, lid: 0, lidAng: 0, dx: 0, dy: 0, ...o });
  const both = (o: Partial<EyeSpec>, kind = 0, rest: Partial<FaceTarget> = {}, pupil = 0, skew = 0): FaceTarget => ({
    l: e(kind, { ...o, dx: pupil }),
    r: e(kind, { ...o, dx: skew }),
    lidB: 0,
    mouth: 0.15,
    mouthOpen: 0,
    cheeks: 0,
    ...rest,
  });
  switch (expr) {
    case 'happy':
      return both({ dy: 0.5, lid: 0.02 }, 0, { mouth: 0.95, mouthOpen: 0.12, cheeks: 0.25, lidB: 0.06 });
    case 'angry':
      return both({ rot: 0.5, dy: -0.6, lid: 0.36, lidAng: 0.42, h: 0.92 }, 0, { mouth: -0.35, lidB: 0.08, cheeks: -0.85 });
    case 'shouting':
      return both({ rot: 0.55, dy: -0.4, lid: 0.28, lidAng: 0.45 }, 0, { mouth: -0.45, mouthOpen: 1 });
    case 'gasp':
      return both({ dy: 1.1, rot: -0.12, w: 1.06, h: 1.14 }, 0, { mouth: 0, mouthOpen: 1 });
    case 'smug':
      return both({ dy: 0.15, rot: 0.08, lid: 0.46, lidAng: -0.05 }, 0, { mouth: 1.2, lidB: 0.2 }, 0.45, 0.35);
    case 'scheming':
      return both({ rot: 0.42, dy: -0.35, lid: 0.5, lidAng: 0.32 }, 0, { mouth: 0.55, lidB: 0.22 }, -0.6, 0.9);
    case 'worried':
      return both({ rot: -0.5, dy: 0.65, lid: 0.14, lidAng: -0.3 }, 0, { mouth: -0.3, cheeks: -0.9 }, 0.15);
    case 'deadpan':
      return both({ lid: 0.55, dy: -0.05 }, 0, { mouth: -0.04 }, 0, -0.15);
    case 'giddy':
      return both({ dy: 0.65 }, 1, { mouth: 1.0, mouthOpen: 0.45, cheeks: 0.85 });
    case 'sleepy':
      return both({ dy: -0.1 }, 2, { mouth: 0.05, mouthOpen: 0.08 });
    case 'excited':
      return both({ dy: 0.9, w: 1.08, h: 1.12 }, 0, { mouth: 1.0, mouthOpen: 0.72, cheeks: 0.55 });
    case 'squeeze':
      return both({ dy: 0.3 }, 4, { mouth: 0.9, mouthOpen: 0.35, cheeks: 0.8 });
    case 'dizzy':
      return both({ dy: 0.3 }, 3, { mouth: -0.2, mouthOpen: 0.25 }, 0, 0.6);
    case 'listening':
      return both({ dy: 0.55, w: 1.03, h: 1.04 }, 0, { mouth: 0.3 });
    case 'pondering': {
      // one brow up, one down, mouth pushed to the side
      const f = both({ lid: 0.22 }, 0, { mouth: -0.15 }, 0.3, 0.7);
      f.l.rot = 0.3;
      f.l.dy = -0.2;
      f.l.lidAng = 0.3;
      f.l.lid = 0.3;
      f.r.rot = -0.25;
      f.r.dy = 0.9;
      f.r.lid = 0.06;
      return f;
    }
    case 'focused':
      return both({ rot: 0.22, dy: -0.15, lid: 0.3, lidAng: 0.15 }, 0, { mouth: -0.1, lidB: 0.1 }, 0, 0.55);
    default:
      return both({ lid: 0.06, dy: 0.3 });
  }
};

const base = (o: Partial<GhostConfig>): GhostConfig => ({
  name: 'Ghost',
  state: 'idle',
  expression: 'neutral',
  shape: 0,
  hem: 0,
  color: '#29A8E0',
  eyes: 0,
  pupils: 0,
  brows: 2,
  mouth: 0,
  nose: 1,
  cheeks: 0,
  accessory: 0,
  ...o,
});

// ------------------------------------------------------------- geometry
interface ShapeDef {
  H: number;
  /** half width at relative height v (0 hem .. 1 top) */
  hw: (v: number) => number;
  /** dome height relative to its radius */
  dome: number;
  /** built-in bend of the top (bean) */
  bend: number;
}
const SHAPES: ShapeDef[] = [
  { H: 0.9, hw: (v) => 0.235 + 0.018 * (1 - v), dome: 1.0, bend: 0 },
  { H: 0.98, hw: (v) => 0.198 + 0.014 * (1 - v), dome: 1.05, bend: 0 },
  { H: 0.78, hw: (v) => 0.27 + 0.022 * (1 - v), dome: 0.82, bend: 0 },
  { H: 0.88, hw: (v) => 0.215 + 0.03 * (1 - v) * (1 - v), dome: 1.0, bend: 0.1 },
  { H: 0.94, hw: (v) => 0.232 - 0.045 * Math.exp(-(((v - 0.45) / 0.13) ** 2)) + 0.012 * (1 - v), dome: 1.0, bend: 0 },
  { H: 0.88, hw: (v) => 0.168 + 0.11 * (1 - v) ** 2.2, dome: 1.05, bend: 0 },
];

const EYE_SIZES: Array<{ rx: number; ry: number; gap: number; lr?: number }> = [
  { rx: 0.08, ry: 0.094, gap: -0.008 },
  { rx: 0.064, ry: 0.08, gap: 0.036 },
  { rx: 0.052, ry: 0.062, gap: -0.004 },
  { rx: 0.074, ry: 0.088, gap: -0.008, lr: 0.78 },
  { rx: 0.058, ry: 0.104, gap: -0.004 },
];

interface G {
  ctx: CanvasRenderingContext2D;
  c: GhostConfig;
  pose: Pose;
  face: FaceState;
  t: number;
  px: number;
  H: number;
  L: number;
  hw: (y: number) => number;
  /** horizontal bend of the body at height y */
  bx: (y: number) => number;
  /** tilt of the body axis at height y (radians, ccw) */
  ang: (y: number) => number;
  outline: Pt[];
  /** face anchor in body space (before bend) */
  fx: number;
  eyeY: number;
  eyeRx: [number, number];
  eyeRy: [number, number];
  eyeX: [number, number];
  /** colour under the eyes (body or bandana) */
  under: string;
  shade: string;
  mask: number;
}

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const shadeHex = (col: string, k: number): string => {
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(col)) return 'rgba(0,0,0,0.22)';
  const [r, g, b] = hexToRgb(col);
  const f = (v: number) => Math.round(Math.max(0, Math.min(1, k < 0 ? v * (1 + k) : v + (1 - v) * k)) * 255);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
};

const path = (ctx: CanvasRenderingContext2D, pts: Pt[], closed = true) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (closed) ctx.closePath();
};
const fill = (ctx: CanvasRenderingContext2D, pts: Pt[], col: string) => {
  path(ctx, pts);
  ctx.fillStyle = col;
  ctx.fill();
};
const stroke = (ctx: CanvasRenderingContext2D, pts: Pt[], w: number, col = INK, closed = false) => {
  path(ctx, pts, closed);
  ctx.lineWidth = w;
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
};
const ell = (cx: number, cy: number, rx: number, ry: number, n = 28, a0 = 0, a1 = Math.PI * 2): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Pt;
  });
const disc = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) => {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(r, 0.0001), 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.fill();
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** the hem line from right to left, y values near the feet */
const hemLine = (hem: number, x0: number, x1: number, t: number, slump: number): Pt[] => {
  const n = 44;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = x1 + (x0 - x1) * u;
    let y = 0.03;
    if (hem === 0) {
      // drippy: uneven drips with a little ragged wobble, like a hand-inked hem
      y = 0.056 + 0.005 * Math.sin(u * 37 + 1.3);
      for (let k = 0; k < 7; k++) {
        const c = (k + 0.5 + (hash(k) - 0.5) * 0.6) / 7;
        const d = (0.016 + 0.038 * hash(k + 9)) * (1 + 0.18 * Math.sin(t * 2.1 + k * 1.7));
        const wdt = 0.022 + 0.02 * hash(k + 3);
        y -= d * Math.exp(-(((u - c) / wdt) ** 2) * 0.9);
      }
    } else if (hem === 1) {
      const k = 4;
      const f = (u * k + 0.02 * Math.sin(t * 2.4)) % 1;
      y = 0.055 - 0.05 * Math.sqrt(Math.max(0, Math.sin(Math.PI * f)));
    } else if (hem === 2) {
      y = 0.012 + 0.004 * Math.sin(u * 23 + t * 1.5) + 0.003 * Math.sin(u * 51);
    } else {
      // tattered: irregular zig-zag points
      const k = 7;
      const f = u * k;
      const j = Math.floor(f);
      const fr = f - j;
      const deep = 0.035 + 0.035 * hash(j + 21);
      const tri = 1 - Math.abs(fr * 2 - 1);
      y = 0.07 - deep * Math.pow(tri, 1.6) + 0.006 * Math.sin(t * 2.6 + j);
    }
    pts.push([x, Math.max(0, y * (1 - 0.4 * slump))]);
  }
  return pts;
};

const buildGeo = (ctx: CanvasRenderingContext2D, c: GhostConfig, pose: Pose, face: FaceState, env: Draw2DEnv): G => {
  const S = SHAPES[c.shape] ?? SHAPES[0];
  const t = env.t;
  const slump = pose.props.slump ?? 0;
  const poke = clamp(pose.pokeAmp, 0, 0.08);
  const stretch = 1 + clamp(-pose.headPitch, -0.4, 0.4) * 0.05 - slump * 0.05 - poke * 1.6 + 0.008 * Math.sin(t * 1.9);
  const H = S.H * stretch;
  const widen = 1 + poke * 1.2 + slump * 0.04;
  const hw = (y: number) => S.hw(clamp(y / H, 0, 1)) * widen;
  // lean the top toward the gaze, wobble like jelly when poked, droop when asleep
  const L = clamp(S.bend + pose.headYaw * 0.15 + pose.wobble * Math.sin(pose.wobblePhase) * 1.6 + slump * 0.07, -0.17, 0.2);
  const bx = (y: number) => L * (clamp(y, 0, H * 1.2) / H) ** 2;
  const ang = (y: number) => -Math.atan((2 * L * clamp(y, 0, H)) / (H * H));
  const rTop = hw(H);
  const domeRy = rTop * S.dome;
  const sideTop = H - domeRy;
  const outline: Pt[] = [];
  const hem = hemLine(c.hem, -hw(0), hw(0), t, slump);
  // right side going up
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const y = hem[0][1] + ((sideTop - hem[0][1]) * i) / n;
    outline.push([hw(y), y]);
  }
  for (let i = 1; i < 30; i++) {
    const a = (i / 30) * Math.PI;
    outline.push([Math.cos(a) * rTop, sideTop + Math.sin(a) * domeRy]);
  }
  for (let i = n; i >= 0; i--) {
    const y = hem[hem.length - 1][1] + ((sideTop - hem[hem.length - 1][1]) * i) / n;
    outline.push([-hw(y), y]);
  }
  outline.push(...hem.slice(1, -1).reverse());
  const warped = outline.map(([x, y]) => [x + bx(y), y] as Pt);

  const E = EYE_SIZES[c.eyes] ?? EYE_SIZES[0];
  const lr = E.lr ?? 1;
  const eyeRx: [number, number] = [E.rx * face.l.w, E.rx * lr * face.r.w];
  const eyeRy: [number, number] = [E.ry * face.l.h, E.ry * lr * face.r.h];
  const eyeY = sideTop + domeRy * 0.12 - (E.ry - 0.088) * 0.6 - (c.shape === 2 ? 0.02 : 0);
  // the face slides across the body a little as the head turns
  const span = eyeRx[0] + eyeRx[1] + E.gap;
  const room = Math.max(0, hw(eyeY) - span / 2 - eyeRx[0] * 0.3 - 0.012);
  const fx = clamp(pose.headYaw * 0.07 + (c.shape === 3 ? 0.03 : 0), -room, room);
  const eyeX: [number, number] = [fx - E.gap / 2 - eyeRx[0], fx + E.gap / 2 + eyeRx[1]];
  if (c.eyes === 3) eyeX[1] += 0.004;
  const mask = Math.max(c.accessory === 1 ? 1 : 0, pose.props.mask ?? 0);
  return {
    ctx, c, pose, face, t, px: env.px, H, L, hw, bx, ang, outline: warped, fx, eyeY, eyeRx, eyeRy, eyeX,
    under: mask > 0.5 ? RED : c.color,
    shade: shadeHex(c.color, -0.28),
    mask,
  };
};

/** run `fn` in face space: origin at the eye line, rotated with the body bend */
const faceSpace = (g: G, fn: () => void) => {
  const { ctx } = g;
  ctx.save();
  ctx.translate(g.bx(g.eyeY), g.eyeY);
  ctx.rotate(g.ang(g.eyeY) * 0.8);
  ctx.translate(0, -g.eyeY);
  fn();
  ctx.restore();
};

// ------------------------------------------------------------- parts
const capeBack = (g: G) => {
  const { ctx, c, t, H } = g;
  if (c.accessory !== 2) return;
  const y0 = H * 0.5;
  const sw = 0.025 * Math.sin(t * 2.3);
  const w0 = g.hw(y0) + 0.01;
  const pts: Pt[] = [
    [-w0 + g.bx(y0), y0], [w0 + g.bx(y0), y0],
    [w0 + 0.09 + sw, 0.16], [w0 + 0.05 + sw * 1.3, 0.12], [w0 + 0.02 + sw, 0.15], [-w0 - 0.02 + sw, 0.15], [-w0 - 0.05 + sw * 1.3, 0.11], [-w0 - 0.09 + sw, 0.17],
  ];
  fill(ctx, pts, shadeHex(RED, -0.25));
};

const body = (g: G) => {
  fill(g.ctx, g.outline, g.c.color);
};

const bandana = (g: G) => {
  if (g.mask < 0.02) return;
  const { ctx, t } = g;
  const a = clamp(g.mask * 1.6 - 0.3, 0, 1);
  const ry = Math.max(g.eyeRy[0], g.eyeRy[1]);
  ctx.save();
  ctx.globalAlpha = a;
  path(ctx, g.outline);
  ctx.clip();
  faceSpace(g, () => {
    const y0 = g.eyeY - ry * 0.85, y1 = g.eyeY + ry * 1.05;
    const w = 0.6;
    const band: Pt[] = [];
    for (let i = 0; i <= 12; i++) band.push([-w + (2 * w * i) / 12, y1 + 0.012 * Math.sin(i * 0.9)]);
    for (let i = 12; i >= 0; i--) band.push([-w + (2 * w * i) / 12, y0 - 0.008 * Math.sin(i * 1.1)]);
    fill(ctx, band, RED);
  });
  ctx.restore();
  // the knot and its tails flap off the far side of the head
  ctx.save();
  ctx.globalAlpha = a;
  faceSpace(g, () => {
    const side = g.L > 0.02 ? -1 : 1;
    const kx = side * (g.hw(g.eyeY) - 0.01), ky = g.eyeY + ry * 0.4;
    for (let k = 0; k < 2; k++) {
      const fl = Math.sin(t * 5 + k * 1.4) * 0.025;
      const len = 0.15 - k * 0.03;
      const dirA = 0.6 + k * 0.55;
      const tx = kx + side * Math.cos(dirA) * len, ty = ky + Math.sin(dirA) * len + fl;
      const pts: Pt[] = [[kx, ky + 0.025], [(kx + tx) / 2 + side * 0.01, (ky + ty) / 2 + 0.04 + fl], [tx + side * 0.02, ty + 0.025], [tx, ty - 0.02], [(kx + tx) / 2, (ky + ty) / 2 - 0.01 + fl], [kx, ky - 0.02]];
      fill(ctx, pts, RED);
    }
    disc(ctx, kx, ky, 0.03, RED);
  });
  ctx.restore();
};

const cheeks = (g: G) => {
  const { ctx, c, face } = g;
  const blush = Math.min(1, Math.max(0, face.cheeks) + (c.cheeks === 1 ? 0.55 : 0));
  faceSpace(g, () => {
    const y = g.eyeY - Math.max(g.eyeRy[0], g.eyeRy[1]) - 0.035;
    for (const i of [0, 1]) {
      const s = i ? 1 : -1;
      const x = g.eyeX[i] + s * g.eyeRx[i] * 0.55;
      if (blush > 0.04) {
        ctx.save();
        ctx.globalAlpha = 0.5 * blush;
        fill(ctx, ell(x, y, 0.042, 0.022, 20), '#FF6F9A');
        ctx.restore();
      }
      if (c.cheeks === 2) for (const [dx, dy] of [[-0.018, 0.004], [0, -0.008], [0.018, 0.005]]) disc(ctx, x + dx, y + dy, 0.0055, g.shade);
    }
  });
};

/** eyes, lids, pupils and brows */
const eyes = (g: G) => {
  const { ctx, c, pose, face, t } = g;
  const shades = c.accessory === 5;
  faceSpace(g, () => {
    // draw the far eye first so the near one overlaps it where they touch
    const order = g.fx + pose.lookX * 0.01 > 0 ? [0, 1] : [1, 0];
    for (const i of order) {
      const s = i ? 1 : -1;
      const spec = i ? face.r : face.l;
      const cx = g.eyeX[i], cy = g.eyeY;
      const rx = g.eyeRx[i], ry = g.eyeRy[i];
      const lw = Math.max(LW * (0.75 + 0.25 * (rx / 0.074)), g.px * 1.5);
      if (shades) continue;
      if (spec.kind === 1) {
        stroke(ctx, ell(cx, cy - ry * 0.35, rx * 0.78, ry * 0.62, 16, 0.15, Math.PI - 0.15), lw * 1.15);
        continue;
      }
      if (spec.kind === 2) {
        stroke(ctx, ell(cx, cy - ry * 0.05, rx * 0.8, ry * 0.4, 16, Math.PI + 0.2, Math.PI * 2 - 0.2), lw * 1.15);
        continue;
      }
      if (spec.kind === 4) {
        const k = -s;   // the chevron points toward the middle
        stroke(ctx, [[cx - k * rx * 0.6, cy + ry * 0.45], [cx + k * rx * 0.55, cy - ry * 0.05], [cx - k * rx * 0.6, cy - ry * 0.5]], lw * 1.2);
        continue;
      }
      const blink = pose.blink;
      const lid = Math.max(spec.lid, blink * 1.05);
      const lidB = Math.min(face.lidB, 0.5);
      if (lid > 0.93 || lid + lidB > 0.98) {
        // closed: a line where the lids meet
        const yy = cy - ry * 0.25;
        stroke(ctx, ell(cx, yy + ry * 0.25, rx * 0.95, ry * 0.3, 16, Math.PI + 0.1, Math.PI * 2 - 0.1), lw * 1.1);
        continue;
      }
      const oval = ell(cx, cy, rx, ry, 36);
      fill(ctx, oval, '#FFFFFF');
      ctx.save();
      path(ctx, oval);
      ctx.clip();
      if (spec.kind === 3) {
        const sp: Pt[] = [];
        for (let k = 0; k <= 40; k++) {
          const a = k * 0.42 + t * 6 * s;
          const r = (k / 40) * Math.min(rx, ry) * 0.75;
          sp.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        stroke(ctx, sp, lw * 0.6);
      } else {
        // pupils: follow the gaze, with a style quirk
        const pr0 = [0.019, 0.03, 0.012, 0.018, 0.024][c.pupils] ?? 0.019;
        const pr = pr0 * Math.min(1.15, 1 / Math.pow(Math.max(spec.w * spec.h, 0.5), 1.4)) * (0.8 + 0.2 * (rx / 0.074));
        let lx = clamp(pose.lookX * 0.75 + face.l.dx, -1, 1);
        let ly = clamp(pose.lookY * 0.7, -1, 1);
        if (c.pupils === 3) {
          lx = clamp(lx + 0.35 * Math.sin(t * 0.9 + i * 2.1) * (i ? 1 : 0.4), -1, 1);
          ly = clamp(ly + 0.3 * Math.sin(t * 0.7 + i * 1.3 + 0.5) * (i ? 1 : 0.5), -1, 1);
        }
        // pushed down under heavy lids so they stay visible
        const top = 1 - 2 * lid;
        ly = Math.min(ly, top - 0.25);
        const px = cx + lx * (rx - pr * 1.4), py = cy + ly * (ry - pr * 1.4);
        disc(ctx, px, py, pr, INK);
        if (c.pupils === 4) disc(ctx, px - pr * 0.35, py + pr * 0.35, pr * 0.35, '#FFFFFF');
      }
      // upper lid: everything above a tilted line is painted over with the colour beneath
      const k = Math.tan(clamp(spec.lidAng, -0.9, 0.9)) * (ry / rx) * 0.9;
      const ly0 = cy + ry - 2 * ry * lid;
      const lidY = (x: number) => ly0 + s * k * (x - cx);
      if (lid > 0.01) {
        fill(ctx, [[cx - rx * 1.5, lidY(cx - rx * 1.5)], [cx + rx * 1.5, lidY(cx + rx * 1.5)], [cx + rx * 1.5, cy + ry * 2], [cx - rx * 1.5, cy + ry * 2]], g.under);
        stroke(ctx, [[cx - rx * 1.5, lidY(cx - rx * 1.5)], [cx + rx * 1.5, lidY(cx + rx * 1.5)]], lw * 2);
      }
      if (lidB > 0.01) {
        const by = cy - ry + 2 * ry * lidB;
        const lower: Pt[] = ell(cx, by - ry * 0.25, rx * 1.3, ry * 0.25, 14, 0, Math.PI);
        fill(ctx, [...lower, [cx - rx * 1.5, cy - ry * 2], [cx + rx * 1.5, cy - ry * 2]], g.under);
        stroke(ctx, lower, lw * 1.1);
      }
      ctx.restore();
      stroke(ctx, oval, lw, INK, true);
    }
  });
};

const brows = (g: G) => {
  const { ctx, c, face } = g;
  if (c.brows === 0) return;
  // heavy brows thicken as they start acting
  const act = Math.min(1, Math.max(Math.abs(face.l.rot), Math.abs(face.r.rot)) * 2.5 + Math.max(face.l.lid, face.r.lid) * 1.5);
  const w = c.brows === 1 ? 0.012 : 0.017 + 0.009 * act;
  faceSpace(g, () => {
    const ends: Pt[][] = [];
    for (const i of [0, 1]) {
      const s = i ? 1 : -1;
      const spec = i ? face.r : face.l;
      if (spec.kind !== 0 && spec.kind !== 3 && c.accessory !== 5) {
        // closed / arc eyes keep relaxed brows
      }
      const cx = g.eyeX[i], ry = g.eyeRy[i], rx = g.eyeRx[i];
      const lid = spec.kind === 0 ? spec.lid : 0;
      const top = g.eyeY + ry - 2 * ry * lid;
      const gap = 0.008 + 0.01 * (1 - Math.min(1, lid * 2.6));
      const y = top + gap + spec.dy * 0.022 + (c.accessory === 5 ? 0.012 : 0);
      const a = clamp(spec.rot, -0.8, 0.8);
      const half = rx * (c.brows === 3 ? 0.95 : 0.8);
      const inner: Pt = [cx - s * half * (c.brows === 3 ? 1 : 0.9), y - Math.sin(a) * half * 0.9];
      const outer: Pt = [cx + s * half * 0.95, y + Math.sin(a) * half * 0.9];
      const mid: Pt = [cx, y + 0.007 - Math.sin(a) * 0.003];
      ends.push(i ? [inner, mid, outer] : [outer, mid, inner]);
    }
    if (c.brows === 3) {
      const [l, r] = ends;
      stroke(ctx, [l[0], l[1], [(l[2][0] + r[0][0]) / 2, (l[2][1] + r[0][1]) / 2 + 0.004], r[1], r[2]], w);
    } else for (const pts of ends) stroke(ctx, pts, w);
  });
};

const shadesAcc = (g: G) => {
  const { ctx } = g;
  if (g.c.accessory !== 5) return;
  faceSpace(g, () => {
    for (const i of [0, 1]) {
      const cx = g.eyeX[i], rx = g.eyeRx[i] * 1.1, ry = g.eyeRy[i] * 0.72;
      const cy = g.eyeY + 0.005;
      const pts: Pt[] = [];
      for (let k = 0; k <= 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const sq = Math.sin(a) > 0 ? 0.55 : 1;
        pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry * sq]);
      }
      fill(ctx, pts, INK);
      stroke(ctx, [[cx - rx * 0.55, cy + ry * 0.2], [cx - rx * 0.15, cy + ry * 0.35]], 0.009, '#FFFFFF');
    }
    stroke(ctx, [[g.eyeX[0] + g.eyeRx[0] * 0.9, g.eyeY + 0.03], [g.eyeX[1] - g.eyeRx[1] * 0.9, g.eyeY + 0.03]], 0.014);
  });
};

const nose = (g: G) => {
  const { ctx, c, pose } = g;
  if (!c.nose) return;
  faceSpace(g, () => {
    const ry = Math.max(g.eyeRy[0], g.eyeRy[1]);
    const x = g.fx + pose.lookX * 0.03 + 0.012, y = g.eyeY - ry - 0.03;
    if (c.nose === 1) stroke(ctx, [[x - 0.011, y - 0.006], [x, y + 0.008], [x + 0.011, y - 0.006]], 0.008);
    else if (c.nose === 2) stroke(ctx, ell(x + 0.004, y, 0.012, 0.012, 10, Math.PI * 0.45, Math.PI * 1.55), 0.008);
    else disc(ctx, x, y, 0.0075, INK);
  });
};

const mouth = (g: G) => {
  const { ctx, c, pose, face, t } = g;
  const shout = pose.props.shout ?? 0;
  let open = Math.max(face.mouthOpen, pose.talk * (0.32 + 0.22 * Math.sin(pose.phase * 17)));
  open *= 1 - 0.12 * shout * (0.5 + 0.5 * Math.sin(t * 23));
  const sm = face.mouth + (c.mouth === 1 ? 0.25 : 0);
  const skew = clamp(face.r.dx + (c.mouth === 3 ? 0.55 : 0), -1, 1);
  const tiny = c.mouth === 4 ? 0.6 : 1;
  const teeth = Math.max(clamp((sm - 0.85) / 0.3, 0, 1), Math.max(0, -face.cheeks), c.mouth === 1 ? clamp(sm * 0.9, 0, 1) : 0);
  faceSpace(g, () => {
    const ry = Math.max(g.eyeRy[0], g.eyeRy[1]);
    const x0 = g.fx + pose.lookX * 0.025 + skew * 0.035;
    const y0 = g.eyeY - ry - 0.072 - (c.nose ? 0.006 : 0);
    const w = (0.04 + 0.045 * Math.min(1, Math.abs(sm)) + Math.min(1, open) * (0.03 + 0.02 * Math.min(1, Math.abs(sm) * 2)) + teeth * 0.012 + Math.max(0, -face.cheeks) * 0.02) * tiny;
    const lw = Math.max(LW * 0.95, g.px * 1.5);
    const N = 16;
    const topY = (u: number) => y0 - sm * 0.028 * (1 - u * u) * tiny + skew * 0.02 * u;
    if (open > 0.08) {
      // open mouth: black inside, tongue, teeth rows
      const gaspy = 1 - Math.min(1, Math.abs(sm) * 1.6);
      const Hm = (0.03 + open * (0.13 + 0.07 * gaspy + 0.05 * shout)) * tiny;
      const ex = sm < -0.1 ? 0.35 : 0.6;
      const top: Pt[] = [], bot: Pt[] = [];
      const wo = w + 0.045 * gaspy * open;
      for (let i = 0; i <= N; i++) {
        const u = i / N * 2 - 1;
        // a gasp arches its top lip into a tall rounded O
        const ty = topY(u) + 0.03 * gaspy * open * Math.sqrt(Math.max(0, 1 - u * u));
        top.push([x0 + u * wo, ty]);
        bot.push([x0 + u * wo * (1 - 0.06 * gaspy), ty - (Hm + 0.03 * gaspy * open) * Math.pow(Math.max(0, 1 - u * u), ex - 0.15 * gaspy)]);
      }
      const shape: Pt[] = [...top, ...bot.reverse()];
      fill(ctx, shape, INK);
      ctx.save();
      path(ctx, shape);
      ctx.clip();
      const yb = topY(0) - Hm;
      fill(ctx, ell(x0 + skew * 0.01, yb + Hm * 0.12, w * 0.62, Hm * 0.32 + 0.01, 20), TONGUE);
      const topTeeth = open > 0.3 && (sm < -0.1 || teeth > 0.1 || shout > 0.3 || gaspy < 0.6);
      const botTeeth = open > 0.5 && (sm < -0.15 || gaspy > 0.6);
      const tt = Math.min(0.024, Hm * 0.2);
      if (topTeeth) {
        fill(ctx, [...top.map(([x, y]) => [x, y + 0.01] as Pt), ...top.slice().reverse().map(([x, y]) => [x, y - tt] as Pt)], '#FFFFFF');
        for (let k = -2; k <= 2; k++) {
          const u = k / 3;
          stroke(ctx, [[x0 + u * w, topY(u)], [x0 + u * w, topY(u) - tt]], lw * 0.5);
        }
      }
      if (botTeeth) {
        const by = yb + 0.004;
        const bw = w * (gaspy > 0.6 ? 0.55 : 0.85);
        fill(ctx, [[x0 - bw, by + tt * 0.2], [x0 + bw, by + tt * 0.2], [x0 + bw, by + tt * 1.1], [x0 - bw, by + tt * 1.1]], '#FFFFFF');
        for (let k = -2; k <= 2; k++) stroke(ctx, [[x0 + (k / 3) * bw, by], [x0 + (k / 3) * bw, by + tt * 1.1]], lw * 0.5);
      }
      ctx.restore();
      stroke(ctx, shape, lw, INK, true);
      if (shout > 0.1) {
        // shout lines either side
        ctx.save();
        ctx.globalAlpha = Math.min(1, shout);
        for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
          const a = (k - 1) * 0.5 + (s > 0 ? 0 : Math.PI);
          const j = 0.008 * Math.sin(t * 31 + k * 2 + s);
          const r0 = w + 0.05 + j, r1 = w + 0.1 + j;
          const cy = y0 - Hm * 0.4;
          stroke(ctx, [[x0 + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.8], [x0 + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.8]], 0.011);
        }
        ctx.restore();
      }
      return;
    }
    if (teeth > 0.12) {
      // a toothy grin (smile) or gritted teeth (frown)
      const depth = (sm > 0 ? 0.022 + 0.04 * teeth * Math.min(1, sm) : 0.03 + 0.016 * teeth) * tiny;
      const top: Pt[] = [], bot: Pt[] = [], mid: Pt[] = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N * 2 - 1;
        const ty = topY(u) + (sm > 0 ? sm * 0.012 * (1 - u * u) : 0);
        const d = sm > 0 ? depth * Math.pow(1 - u * u, 0.7) : depth * Math.pow(1 - u * u, 0.25);
        top.push([x0 + u * w, ty]);
        bot.push([x0 + u * w, ty - d]);
        mid.push([x0 + u * w * 0.97, ty - d * (sm > 0 ? 0.42 : 0.5)]);
      }
      const shape: Pt[] = [...top, ...bot.slice().reverse()];
      fill(ctx, shape, '#FFFFFF');
      ctx.save();
      path(ctx, shape);
      ctx.clip();
      stroke(ctx, mid, lw * 0.7);
      for (let k = -2; k <= 2; k++) {
        const u = k / 3;
        const i = Math.round(((u + 1) / 2) * N);
        stroke(ctx, [top[i], bot[i]], lw * 0.55);
      }
      ctx.restore();
      stroke(ctx, shape, lw, INK, true);
      return;
    }
    // a single ink line, with little corner ticks when it bends
    const pts: Pt[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N * 2 - 1;
      pts.push([x0 + u * w, topY(u)]);
    }
    stroke(ctx, pts, lw);
    if (Math.abs(sm) > 0.3 || Math.abs(skew) > 0.3) {
      for (const s of [-1, 1]) {
        const e = s < 0 ? pts[0] : pts[N];
        const lift = 0.016 * Math.sign(sm || 1) * (s * skew > 0.2 ? 1.3 : 1);
        stroke(ctx, [[e[0] - s * 0.006, e[1] + lift], [e[0] + s * 0.004, e[1] - lift * 0.4]], lw * 0.75);
      }
    }
    if (c.mouth === 2) {
      // buck tooth peeking out
      const tx = x0 + 0.004, ty = topY(0.05);
      fill(ctx, [[tx - 0.014, ty], [tx + 0.014, ty], [tx + 0.013, ty - 0.026], [tx - 0.013, ty - 0.026]], '#FFFFFF');
      stroke(ctx, [[tx - 0.014, ty], [tx - 0.013, ty - 0.026], [tx + 0.013, ty - 0.026], [tx + 0.014, ty]], lw * 0.7);
      stroke(ctx, [[tx, ty - 0.004], [tx, ty - 0.024]], lw * 0.4);
    }
  });
};

/** the cape knot / bow tie sitting on the front of the body */
const frontAcc = (g: G) => {
  const { ctx, c, t, H } = g;
  if (c.accessory === 2) {
    const y = H * 0.5;
    ctx.save();
    path(ctx, g.outline);
    ctx.clip();
    const band: Pt[] = [];
    for (let i = 0; i <= 12; i++) { const x = -0.4 + (0.8 * i) / 12; band.push([x + g.bx(y), y + 0.03 - 0.03 * (1 - (x / 0.3) ** 2)]); }
    for (let i = 12; i >= 0; i--) { const x = -0.4 + (0.8 * i) / 12; band.push([x + g.bx(y), y - 0.025 - 0.03 * (1 - (x / 0.3) ** 2)]); }
    fill(ctx, band, RED);
    ctx.restore();
    const kx = g.bx(y), ky = y - 0.03;
    for (const s of [-1, 1]) {
      const sw = 0.012 * Math.sin(t * 3 + s);
      fill(ctx, [[kx, ky], [kx + s * 0.07 + sw, ky - 0.1], [kx + s * 0.12 + sw, ky - 0.13], [kx + s * 0.1 + sw, ky - 0.05], [kx + s * 0.04, ky + 0.01]], RED);
    }
    disc(ctx, kx, ky, 0.03, RED);
    stroke(ctx, [[kx - 0.012, ky + 0.012], [kx + 0.008, ky - 0.012]], 0.006, shadeHex(RED, -0.4));
  } else if (c.accessory === 4) {
    const y = Math.max(g.eyeY - 0.26, H * 0.38);
    const kx = g.bx(y) + g.fx * 0.6, ky = y;
    const wob = 0.008 * Math.sin(t * 3);
    for (const s of [-1, 1]) {
      const bow: Pt[] = [[kx, ky], [kx + s * 0.075, ky + 0.045 + wob * s], [kx + s * 0.085, ky], [kx + s * 0.075, ky - 0.045 - wob * s]];
      fill(ctx, bow, RED);
      stroke(ctx, bow, 0.011, INK, true);
    }
    fill(ctx, ell(kx, ky, 0.022, 0.026, 14), RED);
    stroke(ctx, ell(kx, ky, 0.022, 0.026, 14), 0.011, INK, true);
  }
};

const partyHat = (g: G) => {
  const { ctx, c, t, H } = g;
  if (c.accessory !== 3) return;
  const topX = g.bx(H) + g.fx * 0.3;
  ctx.save();
  ctx.translate(topX + 0.05, H - 0.035);
  ctx.rotate(g.ang(H) - 0.25);
  const h = 0.18, w = 0.075;
  const cone: Pt[] = [[-w, 0], [0, h], [w, 0]];
  fill(ctx, cone, '#FFD43B');
  ctx.save();
  path(ctx, cone);
  ctx.clip();
  for (let k = 0; k < 4; k++) {
    const y = 0.03 + k * 0.06;
    fill(ctx, [[-0.2, y], [0.2, y + 0.04], [0.2, y + 0.065], [-0.2, y + 0.025]], '#F2557A');
  }
  ctx.restore();
  stroke(ctx, cone, 0.011, INK, true);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + t * 2;
    stroke(ctx, [[0, h + 0.012], [Math.cos(a) * 0.03, h + 0.012 + Math.sin(a) * 0.03]], 0.012, k % 2 ? '#29A8E0' : '#F2557A');
  }
  ctx.restore();
};

const keyboard = (g: G) => {
  const { ctx, pose, t } = g;
  const k = pose.props.keys ?? 0;
  if (k < 0.05) return;
  const y = 0.17 + (1 - k) * -0.1;
  const x = g.bx(y);
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 1.5);
  const w = 0.22, d = 0.08;
  const kb: Pt[] = [[x - w, y - 0.01], [x + w, y - 0.01], [x + w - 0.035, y + d], [x - w + 0.035, y + d]];
  fill(ctx, kb, '#FFFFFF');
  stroke(ctx, kb, 0.011, INK, true);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) {
    const kx = x - w + 0.065 + i * 0.062 + r * 0.01, ky = y + 0.017 + r * 0.03;
    const lit = Math.floor(t * 9 + i * 3 + r * 5) % 7 === 0;
    fill(ctx, [[kx - 0.018, ky - 0.007], [kx + 0.018, ky - 0.007], [kx + 0.016, ky + 0.009], [kx - 0.016, ky + 0.009]], lit ? INK : '#C9D2DA');
  }
  ctx.restore();
};

/** noodle arms with mitten hands, only out when the pose asks for them */
const arms = (g: G) => {
  const { ctx, c, pose, t, H } = g;
  const rest = { raise: 0.5, fwd: 0.2, bend: 0.3 };
  const A: ArmPose = { ...pose.arms };
  const rub = pose.props.rub ?? 0;
  if (rub > 0.05) {
    A.lBend += Math.sin(t * 11) * 0.22 * rub;
    A.rBend += Math.sin(t * 11 + Math.PI) * 0.22 * rub;
  }
  const W = 0.07;
  const ys = H * 0.42;
  const rig = { shoulder: [g.hw(ys) - 0.02, ys, 0] as [number, number, number], upper: 0.16, fore: 0.15 };
  for (const side of [-1, 1]) {
    const raise = side < 0 ? A.lRaise : A.rRaise, fwd = side < 0 ? A.lFwd : A.rFwd, bend = side < 0 ? A.lBend : A.rBend;
    // only reaching out or up counts: a hanging arm stays tucked away
    const vis = clamp((Math.max(0, raise - rest.raise - 0.1) * 1.2 + Math.max(0, fwd - rest.fwd - 0.1) * 0.9 + Math.max(0, bend - rest.bend - 0.25) * 0.5) * 3 - 0.15, 0, 1);
    if (vis < 0.02) continue;
    const [S3, E3, H3] = solveArm(side, A, pose.phase, rig);
    // forward reads as toward the middle of the body (a 3/4 view)
    const pr = (p: number[]): Pt => [p[0] - side * Math.max(0, p[2]) * 0.9 + g.bx(ys), p[1] - Math.max(0, p[2]) * 0.2];
    const S = pr(S3), E0 = pr(E3), Hd0 = pr(H3);
    // a deeply bent arm goes to the chin (thinking pose)
    const chin = clamp((bend - 1.3) / 0.5, 0, 1);
    if (chin > 0) {
      const cy = g.eyeY - Math.max(g.eyeRy[0], g.eyeRy[1]) - 0.13;
      const cx = g.bx(cy) + g.fx + side * 0.05;
      Hd0[0] += (cx - Hd0[0]) * chin;
      Hd0[1] += (cy - Hd0[1]) * chin;
    }
    // typing hands stay apart, resting on the keys
    const tap = clamp(A.tap, 0, 1);
    if (tap > 0) {
      const bxk = g.bx(0.2);
      Hd0[0] = bxk + side * Math.max(side * (Hd0[0] - bxk), 0.1 * tap);
      Hd0[1] -= 0.07 * tap;
    }
    const E: Pt = [S[0] + (E0[0] - S[0]) * vis, S[1] + (E0[1] - S[1]) * vis];
    const Hd: Pt = [S[0] + (Hd0[0] - S[0]) * vis, S[1] + (Hd0[1] - S[1]) * vis];
    const ctl: Pt = [2 * E[0] - (S[0] + Hd[0]) / 2, 2 * E[1] - (S[1] + Hd[1]) / 2];
    const w = W * Math.min(1, 0.4 + vis);
    const hr = w * 0.62;
    const dir = Math.atan2(Hd[1] - ctl[1], Hd[0] - ctl[0]);
    const arm = () => {
      ctx.beginPath();
      ctx.moveTo(S[0] - side * 0.03, S[1]);
      ctx.quadraticCurveTo(ctl[0], ctl[1], Hd[0], Hd[1]);
    };
    // where the arm crosses the body it needs an ink outline to read
    ctx.save();
    path(ctx, g.outline);
    ctx.clip();
    arm();
    ctx.lineCap = 'round';
    ctx.lineWidth = w + LW * 1.6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    disc(ctx, Hd[0] + Math.cos(dir) * hr * 0.4, Hd[1] + Math.sin(dir) * hr * 0.4, hr + LW * 0.8, INK);
    ctx.restore();
    // cover the shoulder end so it melts into the body
    arm();
    ctx.lineCap = 'round';
    ctx.lineWidth = w;
    ctx.strokeStyle = c.color;
    ctx.stroke();
    const hx = Hd[0] + Math.cos(dir) * hr * 0.4, hy = Hd[1] + Math.sin(dir) * hr * 0.4;
    disc(ctx, hx, hy, hr, c.color);
    // a thumb on the mitten
    const ta = dir + side * 1.3;
    disc(ctx, hx + Math.cos(ta) * hr * 0.85, hy + Math.sin(ta) * hr * 0.85, hr * 0.42, c.color);
    // pointing finger when the arm is high
    if (raise > 1.8 && vis > 0.6) {
      const fa = dir - side * 0.25;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(fa) * hr * 1.6, hy + Math.sin(fa) * hr * 1.6);
      ctx.lineWidth = hr * 0.75;
      ctx.lineCap = 'round';
      ctx.strokeStyle = c.color;
      ctx.stroke();
      stroke(ctx, ell(hx + Math.cos(fa) * hr * 1.0 - side * 0.006, hy + Math.sin(fa) * hr * 1.0, 0.007, 0.007, 8, 0, Math.PI * 1.2), 0.005, g.shade);
    }
  }
};

const thought = (g: G) => {
  const { ctx, pose, t, H } = g;
  const bits = pose.props.bits ?? 0;
  if (bits < 0.05) return;
  const x0 = g.bx(H) + g.hw(H) * 0.7 + 0.05;
  for (let i = 0; i < 3; i++) {
    const r = (0.016 + 0.011 * i) * bits;
    const x = x0 + i * 0.055, y = H - 0.02 + i * 0.07 + 0.01 * Math.sin(t * 3 + i);
    fill(ctx, ell(x, y, r, r, 16), '#FFFFFF');
    stroke(ctx, ell(x, y, r, r, 16), 0.009, INK, true);
  }
};

const sleepBubble = (g: G) => {
  const { ctx, pose, t } = g;
  const slump = pose.props.slump ?? 0;
  if (slump < 0.4) return;
  const ph = (t * 0.5) % 1;
  const r = 0.012 + 0.04 * Math.sin(ph * Math.PI);
  faceSpace(g, () => {
    const ry = Math.max(g.eyeRy[0], g.eyeRy[1]);
    const x = g.fx + 0.06 + r * 0.6, y = g.eyeY - ry - 0.07;
    ctx.save();
    ctx.globalAlpha = 0.85 * (slump - 0.4) / 0.6;
    fill(ctx, ell(x, y, r, r, 18), 'rgba(255,255,255,0.55)');
    stroke(ctx, ell(x, y, r, r, 18), 0.007, INK, true);
    stroke(ctx, ell(x, y, r * 0.6, r * 0.6, 8, 0.4, 1.3), 0.006, '#FFFFFF');
    ctx.restore();
  });
};

const draw = (ctx: CanvasRenderingContext2D, c: GhostConfig, pose: Pose, face: FaceState, env: Draw2DEnv) => {
  const g = buildGeo(ctx, c, pose, face, env);
  capeBack(g);
  body(g);
  bandana(g);
  frontAcc(g);
  cheeks(g);
  eyes(g);
  brows(g);
  shadesAcc(g);
  nose(g);
  mouth(g);
  sleepBubble(g);
  keyboard(g);
  arms(g);
  partyHat(g);
  thought(g);
};

export const ghost: FamilyDef<GhostConfig> = {
  id: 'ghost',
  name: 'Ghosts',
  maker: 'Imaginary friends',
  tagline: 'Rubbery ghost friends · huge eyes · arms that sprout when they need them',
  subtitle: 'Flat-coloured imaginary friends with big rubbery expressions, in a 2000s TV-cartoon style',
  shader: '',
  anchors: 0,
  background: '#F2F4F6',
  backgroundSolid: '#F2F4F6',
  dark: false,
  traits: ['Flat colour, no outline', 'Brows do the acting', 'Noodle arms on demand'],
  look: {
    dark: false, groundShadow: 0, exposure: 1, groundY: 0,
    lights: { key: normalize([-0.5, 0.8, 0.6]), keyI: 1, rim: normalize([0.5, 0.4, -0.7]), rimI: 0.5, fill: normalize([0.8, 0.1, 0.55]), fillI: 0.3, sky: [0.8, 0.8, 0.8], ground: [0.5, 0.5, 0.5], warm: [1, 1, 1], env: 1 },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Wobbling, blinking, glancing about', bob: [0.008, 0.45], squash: [0.016, 0.45] },
    listening: { label: 'Listening', hint: 'Brows up, leaning in', expr: 'listening', gaze: 'user', lean: 0.06, bob: [0.005, 0.4] },
    thinking: { label: 'Thinking', hint: 'Hand on chin, one brow up', expr: 'pondering', gaze: 'up', arms: 'think', sway: [0.03, 0.3], props: { bits: 1 } },
    working: { label: 'Working', hint: 'Tongue out, typing away', expr: 'focused', gaze: 'down', arms: 'type', bob: [0.008, 1.8], props: { keys: 1 } },
    speaking: { label: 'Speaking', hint: 'Talking with its hands', expr: 'happy', talk: 1, gaze: 'user', arms: 'wave', bob: [0.006, 1.2] },
    shouting: { label: 'Shouting', hint: 'Huge mouth, fist in the air', expr: 'shouting', gaze: 'user', arms: 'rally', shake: 0.018, squash: [0.03, 2.2], props: { shout: 1 }, emote: ['bang', 2.2] },
    scheming: { label: 'Scheming', hint: 'Mask on, rubbing its hands', expr: 'scheming', gaze: 'away', arms: 'hug', sway: [0.025, 0.4], props: { mask: 1, rub: 1 } },
    done: { label: 'Done', hint: 'Arms up, big celebration', expr: 'excited', arms: 'cheer', enter: 'celebrate', emote: ['check', 4] },
    sleeping: { label: 'Sleeping', hint: 'Drooped over, blowing bubbles', expr: 'sleepy', gaze: 'closed', sink: 0.01, props: { slump: 1 }, emote: ['zzz', 2.6] },
  },
  personality: { body: [2.2, 0.45, 0.6], eyes: [7, 0.8, 0.0], squash: [190, 8], reach: [0.22, 0.14], eyeShare: 0.5, hopGravity: 11 },
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
        { type: 'chips', key: 'hem', label: 'Hem', options: HEM_OPTS },
        { type: 'swatches', key: 'color', label: 'Colour', colors: COLORS, custom: true },
      ],
    },
    {
      id: 'face',
      title: 'Face',
      controls: [
        { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS },
        { type: 'chips', key: 'eyes', label: 'Eyes', options: EYE_OPTS },
        { type: 'chips', key: 'pupils', label: 'Pupils', options: PUPIL_OPTS },
        { type: 'chips', key: 'brows', label: 'Brows', options: BROW_OPTS },
        { type: 'chips', key: 'mouth', label: 'Mouth', options: MOUTH_OPTS },
        { type: 'chips', key: 'nose', label: 'Nose', options: NOSE_OPTS },
        { type: 'chips', key: 'cheeks', label: 'Cheeks', options: CHEEK_OPTS },
      ],
    },
    {
      id: 'extras',
      title: 'Extras',
      controls: [{ type: 'chips', key: 'accessory', label: 'Accessory', options: ACC_OPTS }],
    },
  ],
  roster: () => [
    base({ name: 'Wisp', shape: 0, hem: 0, color: '#29A8E0', eyes: 0, pupils: 0, brows: 2, mouth: 0, nose: 1, expression: 'neutral' }),
    base({ name: 'Marsh', shape: 2, hem: 1, color: '#F47FB4', eyes: 2, pupils: 4, brows: 1, mouth: 1, nose: 3, cheeks: 1, accessory: 4, expression: 'happy' }),
    base({ name: 'Sprout', shape: 1, hem: 2, color: '#4FD1A5', eyes: 1, pupils: 2, brows: 1, mouth: 2, nose: 0, cheeks: 2, accessory: 3, expression: 'neutral' }),
    base({ name: 'Mumbles', shape: 3, hem: 3, color: '#A88BE6', eyes: 3, pupils: 3, brows: 3, mouth: 3, nose: 2, accessory: 1, expression: 'scheming' }),
    base({ name: 'Clementine', shape: 4, hem: 0, color: '#F7953B', eyes: 4, pupils: 1, brows: 2, mouth: 0, nose: 1, accessory: 2, expression: 'smug' }),
  ],
  randomize: (c, rnd) => {
    const pick = (n: number) => Math.floor(rnd() * n);
    return {
      ...c,
      shape: pick(SHAPE_OPTS.length),
      hem: rnd() < 0.5 ? 0 : pick(HEM_OPTS.length),
      color: COLORS[pick(COLORS.length)],
      eyes: rnd() < 0.4 ? 0 : pick(EYE_OPTS.length),
      pupils: pick(PUPIL_OPTS.length),
      brows: rnd() < 0.5 ? 2 : pick(BROW_OPTS.length),
      mouth: pick(MOUTH_OPTS.length),
      nose: pick(NOSE_OPTS.length),
      cheeks: rnd() < 0.6 ? 0 : 1 + pick(2),
      accessory: rnd() < 0.5 ? 0 : 1 + pick(ACC_OPTS.length - 1),
    };
  },
  compose: (n, aspect, compact) =>
    groupPhoto(n, aspect, { gap: compact ? 1.0 : 1.1, charW: 1.05, charH: 1.05, riser: 0, depth: 0, fov: deg(18), margin: 0.1, turn: 0, lift: 0.08 }),
  solo: (aspect) => soloCamera(aspect, 1.05, 1.05, deg(18), 0.08),
  headLocal: () => [0, 0.72, 0.1],
  bounds: () => ({ c: [0, 0.5, 0], r: 0.6, occ: [] }),
  face: ghostFace,
  pack: (_c, _pose, f) => {
    f.data.fill(0);   // drawn in 2D by draw2d
  },
  draw2d: draw,
};
