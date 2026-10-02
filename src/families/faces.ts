import { deg, normalize } from '../engine/math';
import type { Pose } from '../avatar/avatar';
import type { BaseConfig, Draw2DEnv, EyeSpec, FaceState, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';

/**
 * Faces: portrait avatars in the spirit of Notion's avatar system, thick
 * black monoline drawing on white, assembled from interchangeable parts
 * (face, hair, eyes, brows, nose, mouth, glasses, facial hair, details,
 * accessories). The parts here are original; the brain is the shared one:
 * eyes follow the cursor, the head turns with parallax, brows carry the mood.
 */
export interface FacesConfig extends BaseConfig {
  face: number;
  hair: number;
  eyes: number;
  brows: number;
  nose: number;
  mouth: number;
  glasses: number;
  facialHair: number;
  details: number;
  accessory: number;
  skin: string;
  backdrop: string;
}

type Pt = [number, number];
const INK = '#111111';
const LW = 0.016;   // monoline weight in character units

const opt = (labels: string[]): Option[] => labels.map((label, value) => ({ value, label }));
const FACE_OPTS = opt(['Oval', 'Round', 'Long', 'Square', 'Heart', 'Pear']);
const HAIR_OPTS = opt(['Bob', 'Bun', 'Curls', 'Spiky', 'Side part', 'Long waves', 'Shaved', 'Beanie']);
const EYE_OPTS = opt(['Dots', 'Ovals', 'Happy', 'Closed', 'Big']);
const BROW_OPTS = opt(['Thin', 'Bold', 'Arched', 'None']);
const NOSE_OPTS = opt(['Hook', 'Round', 'Line', 'Button', 'None']);
const MOUTH_OPTS = opt(['Smile', 'Grin', 'Flat', 'Smirk', 'Oh']);
const GLASSES_OPTS = opt(['None', 'Round', 'Square', 'Shades']);
const BEARD_OPTS = opt(['None', 'Moustache', 'Beard', 'Stubble']);
const DETAIL_OPTS = opt(['None', 'Freckles', 'Blush lines', 'Mole']);
const ACC_OPTS = opt(['None', 'Earring', 'Headphones', 'Pencil', 'Bow']);
const SKINS = ['#FFFFFF', '#F7E9DC', '#EBCBA8', '#C99372', '#8E5C3F', '#5A3A28'];
// white is 'no backdrop' on the white stage
const BACKDROPS = ['#FFFFFF', '#FFE3E3', '#FFF1C2', '#DDF4E4', '#DCEBFF', '#EADFFF', '#F1F1EF'];

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'skeptical', label: 'Skeptical' },
  { value: 'worried', label: 'Worried' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'excited', label: 'Excited' },
  { value: 'wink', label: 'Wink' },
];

// eye kinds: 0 dot, 1 oval, 2 happy arc, 3 closed, 4 big ring.  rot = brow angle (+ cross), dy = brow raise
const facesFace = (c: FacesConfig, expr: string): FaceTarget => {
  const e = (kind: number, brow = 0, raise = 0, lid = 0): EyeSpec => ({ kind, w: 1, h: 1, rot: brow, lid, lidAng: 0, dx: 0, dy: raise });
  const k = c.eyes;
  const open = k === 2 || k === 3 ? 0 : k;
  const make = (l: EyeSpec, r: EyeSpec, mouth = 0, mouthOpen = 0, cheeks = 0): FaceTarget => ({ l, r, lidB: 0, mouth, mouthOpen, cheeks });
  switch (expr) {
    case 'happy':
    case 'squeeze':
      return make(e(2, -0.15, 0.5), e(2, -0.15, 0.5), 0.9, 0.15, 0.6);
    case 'surprised':
      return make(e(4, -0.2, 1), e(4, -0.2, 1), 0, 0.6);
    case 'skeptical':
      return make(e(open, 0.25, -0.2, 0.3), e(open, -0.25, 0.9), -0.2);
    case 'worried':
      return make(e(open, -0.45, 0.5), e(open, -0.45, 0.5), -0.5, 0.1);
    case 'sleepy':
    case 'dizzy':
      return make(e(3, 0, -0.1), e(3, 0, -0.1), 0.1);
    case 'excited':
      return make(e(4, -0.2, 0.8), e(4, -0.2, 0.8), 1, 0.6, 0.8);
    case 'wink':
      return make(e(open, 0, 0.3), e(2, -0.1, 0.4), 0.7, 0, 0.3);
    case 'listening':
      return make(e(k, -0.05, 0.35), e(k, -0.05, 0.35), 0.3);
    default:
      return make(e(k, 0, 0), e(k, 0, 0), 0.45);
  }
};

const base = (o: Partial<FacesConfig>): FacesConfig => ({
  name: 'Face',
  state: 'idle',
  expression: 'neutral',
  face: 0,
  hair: 0,
  eyes: 0,
  brows: 0,
  nose: 0,
  mouth: 0,
  glasses: 0,
  facialHair: 0,
  details: 0,
  accessory: 0,
  skin: '#FFFFFF',
  backdrop: '#FFFFFF',
  ...o,
});

// ------------------------------------------------------------- drawing
const H = { x: 0, y: 0.62 };   // head centre
const FACE_R: Array<[number, number]> = [[0.23, 0.29], [0.26, 0.27], [0.205, 0.31], [0.24, 0.28], [0.245, 0.29], [0.235, 0.28]];

/** head outline as a closed polyline, shaped per face type */
const headPts = (face: number, cx: number): Pt[] => {
  const [rx, ry] = FACE_R[face] ?? FACE_R[0];
  const n = 56;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    let c = Math.cos(a), s = Math.sin(a);
    if (face === 3) {
      // squarish: a superellipse
      const p = 3.4;
      c = Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
      s = Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
    }
    let x = c * rx;
    const y = s * ry;
    if (face === 4) x *= 1 - 0.38 * Math.pow(Math.max(0, -s), 1.6);   // heart: narrow pointed chin
    if (face === 5) x *= 1 + 0.12 * -s;                                  // pear: fuller cheeks
    return [cx + x, H.y + y] as Pt;
  });
};

interface P {
  ctx: CanvasRenderingContext2D;
  c: FacesConfig;
  pose: Pose;
  face: FaceState;
  t: number;
  fx: number;
  fy: number;
}

const line = (ctx: CanvasRenderingContext2D, pts: Pt[], closed = false, w = LW) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (closed) ctx.closePath();
  ctx.lineWidth = w;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
};
const fill = (ctx: CanvasRenderingContext2D, pts: Pt[], col: string) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
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

/** hair drawn behind the head (long styles) */
const backHair = ({ ctx, c, fx }: P) => {
  const [rx, ry] = FACE_R[c.face] ?? FACE_R[0];
  if (c.hair === 5) {
    const pts: Pt[] = [];
    const top = ell(H.x - fx * 0.2, H.y + 0.02, rx + 0.07, ry + 0.06, 30, -0.15, Math.PI + 0.15);
    pts.push(...top);
    // waves down the left side, along the bottom, and back up the right
    for (let i = 0; i <= 8; i++) pts.push([-(rx + 0.08) - 0.018 * Math.sin(i * 1.6) - fx * 0.2, H.y - 0.02 - i * 0.05]);
    pts.push([-(rx - 0.02), H.y - 0.42], [rx - 0.02, H.y - 0.42]);
    for (let i = 8; i >= 0; i--) pts.push([rx + 0.08 + 0.018 * Math.sin(i * 1.6 + 1) - fx * 0.2, H.y - 0.02 - i * 0.05]);
    shape(ctx, pts, INK);
  }
};

/** shoulders and shirt: open at the bottom like a bust */
const body = ({ ctx, c, fx }: P) => {
  const sx = fx * 0.15;
  const pts: Pt[] = [[-0.4 + sx, -0.02], [-0.39 + sx, 0.08], [-0.33 + sx, 0.17], [-0.2 + sx, 0.23], [-0.08 + sx, 0.26], [0.08 + sx, 0.26], [0.2 + sx, 0.23], [0.33 + sx, 0.17], [0.39 + sx, 0.08], [0.4 + sx, -0.02]];
  fill(ctx, pts, '#FFFFFF');
  line(ctx, pts);
  // neck
  const neck: Pt[] = [[-0.065 + sx * 1.5, 0.38], [-0.07 + sx * 1.5, 0.24], [0.07 + sx * 1.5, 0.24], [0.065 + sx * 1.5, 0.38]];
  fill(ctx, neck, c.skin);
  line(ctx, [neck[0], neck[1]]);
  line(ctx, [neck[3], neck[2]]);
  // collar
  line(ctx, [[-0.1 + sx, 0.255], [sx, 0.15], [0.1 + sx, 0.255]]);
};

const ears = ({ ctx, c, fx }: P) => {
  const [rx] = FACE_R[c.face] ?? FACE_R[0];
  for (const s of [-1, 1]) {
    const x = s * (rx - 0.005) - fx * 0.25;
    shape(ctx, ell(x, H.y - 0.01, 0.045, 0.062, 20), c.skin);
    line(ctx, ell(x - s * 0.005, H.y - 0.01, 0.02, 0.032, 10, s > 0 ? -1.2 : Math.PI - 1.2 + 0.0, s > 0 ? 1.2 : Math.PI + 1.2), false, LW * 0.7);
  }
};

const eyes = ({ ctx, pose, face, fx, fy }: P) => {
  ([[-1, face.l], [1, face.r]] as Array<[number, EyeSpec]>).forEach(([s, spec]) => {
    const x = s * 0.095 + fx, y = H.y + 0.01 + fy;
    const lx = pose.lookX * 0.014, ly = pose.lookY * 0.012;
    const open = 1 - pose.blink;
    const k = spec.kind;
    if (k === 3 || open < 0.25) {
      line(ctx, ell(x, y + 0.008, 0.028, 0.018, 10, Math.PI * 1.1, Math.PI * 1.9));
    } else if (k === 2) {
      line(ctx, ell(x, y - 0.012, 0.03, 0.026, 10, Math.PI * 0.12, Math.PI * 0.88));
    } else if (k === 4) {
      shape(ctx, ell(x, y, 0.042, 0.042 * open * (1 - 0.4 * spec.lid), 24), '#FFFFFF', LW * 0.85);
      dot(ctx, x + lx * 1.4, y + ly * 1.2 * open, 0.019 * Math.min(1, open + 0.2));
    } else if (k === 1) {
      fill(ctx, ell(x + lx, y + ly, 0.019, 0.031 * open * (1 - 0.4 * spec.lid), 18), INK);
    } else {
      fill(ctx, ell(x + lx, y + ly, 0.022, 0.022 * open * (1 - 0.4 * spec.lid), 16), INK);
    }
  });
};

const brows = ({ ctx, c, face, fx, fy }: P) => {
  if (c.brows === 3) return;
  ([[-1, face.l], [1, face.r]] as Array<[number, EyeSpec]>).forEach(([s, spec]) => {
    const x = s * 0.095 + fx, y = H.y + 0.085 + fy + 0.028 * spec.dy;
    // positive angle lowers the inner end
    const a = spec.rot;
    const half = 0.04;
    const inner: Pt = [x - s * half, y - Math.sin(a) * half];
    const outer: Pt = [x + s * half, y + Math.sin(a) * half];
    if (c.brows === 2) {
      line(ctx, [inner, [x, y + 0.016 + Math.sin(a) * 0.0], outer], false, LW);
    } else {
      line(ctx, [inner, outer], false, c.brows === 1 ? LW * 2.1 : LW);
    }
  });
};

const nose = ({ ctx, c, fx, fy }: P) => {
  const x = fx * 1.15, y = H.y - 0.06 + fy;
  if (c.nose === 0) line(ctx, [[x + 0.012, y + 0.05], [x - 0.022, y - 0.022], [x + 0.016, y - 0.03]]);
  else if (c.nose === 1) line(ctx, ell(x, y - 0.012, 0.024, 0.02, 12, Math.PI * 1.05, Math.PI * 1.95));
  else if (c.nose === 2) line(ctx, [[x, y + 0.04], [x, y - 0.02]]);
  else if (c.nose === 3) line(ctx, ell(x, y - 0.01, 0.016, 0.016, 14), true, LW * 0.85);
};

const mouth = ({ ctx, c, pose, face, fx, fy }: P) => {
  const x = fx * 1.05, y = H.y - 0.155 + fy;
  const open = Math.max(face.mouthOpen, pose.talk * (0.35 + 0.35 * Math.sin(pose.phase * 16)));
  const sm = face.mouth;
  if (open > 0.12 || c.mouth === 1) {
    // an open D: flat-ish top, round bottom, filled ink with a tongue line
    const w = 0.055, d = 0.025 + 0.05 * Math.max(open, c.mouth === 1 ? 0.45 : 0);
    const pts: Pt[] = [[x - w, y + 0.006 * sm]];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI;
      pts.push([x + Math.cos(a) * w, y + Math.sin(a) * d]);
    }
    shape(ctx, pts, INK);
    if (d > 0.04) line(ctx, ell(x, y - d * 0.75, w * 0.45, d * 0.25, 8, Math.PI * 0.15, Math.PI * 0.85), false, LW * 0.6);
    return;
  }
  if (c.mouth === 4) {
    shape(ctx, ell(x, y, 0.018, 0.022, 14), '#FFFFFF', LW);
    return;
  }
  if (c.mouth === 2) {
    line(ctx, [[x - 0.04, y + 0.004 * sm], [x + 0.04, y + 0.004 * sm]]);
    return;
  }
  const w = 0.055;
  const pts: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const u = i / 5 - 1;
    const skew = c.mouth === 3 ? 0.4 * (u + 1) : 0;   // smirk lifts one corner
    pts.push([x + u * w, y - sm * 0.03 * (1 - u * u) + skew * 0.02]);
  }
  line(ctx, pts);
};

const facialHair = ({ ctx, c, fx, fy }: P) => {
  const x = fx * 1.05, y = H.y + fy;
  if (c.facialHair === 1) {
    const m: Pt[] = [[x, y - 0.105], [x - 0.03, y - 0.1], [x - 0.065, y - 0.13], [x - 0.04, y - 0.125], [x, y - 0.118], [x + 0.04, y - 0.125], [x + 0.065, y - 0.13], [x + 0.03, y - 0.1]];
    shape(ctx, m, INK, LW * 0.6);
  } else if (c.facialHair === 2) {
    const [rx, ry] = FACE_R[c.face] ?? FACE_R[0];
    const outer = ell(H.x + fx * 0.3, H.y, rx, ry, 24, Math.PI * 1.13, Math.PI * 1.87);
    // the beard hugs the jaw below the cheeks and leaves the mouth clear
    const inner: Pt[] = [[x + 0.115, y - 0.1], [x + 0.085, y - 0.125], [x + 0.075, y - 0.17], [x + 0.04, y - 0.198], [x, y - 0.203], [x - 0.04, y - 0.198], [x - 0.075, y - 0.17], [x - 0.085, y - 0.125], [x - 0.115, y - 0.1]];
    shape(ctx, [...outer, ...inner], INK);
  } else if (c.facialHair === 3) {
    for (let i = 0; i < 26; i++) {
      const a = Math.PI * (1.1 + 0.8 * ((i * 0.618) % 1));
      const r = 0.15 + 0.08 * (((i * 0.382) % 1) - 0.5);
      dot(ctx, x + Math.cos(a) * r * 1.1, y - 0.04 + Math.sin(a) * r * 0.85, 0.005);
    }
  }
};

const details = ({ ctx, c, face, fx, fy }: P) => {
  const y = H.y - 0.06 + fy;
  const cheeks = Math.min(1, face.cheeks);
  if (c.details === 1) {
    for (const s of [-1, 1]) for (const [dx, dy] of [[0, 0], [0.022, 0.012], [0.03, -0.012], [0.008, -0.02]]) dot(ctx, s * (0.1 + dx) + fx, y + dy, 0.006);
  }
  if (c.details === 2 || cheeks > 0.4) {
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const x0 = s * (0.115 + i * 0.022) + fx;
      line(ctx, [[x0 - 0.008, y - 0.016], [x0 + 0.008, y + 0.008]], false, LW * 0.7);
    }
  }
  if (c.details === 3) dot(ctx, 0.07 + fx, H.y - 0.13 + fy, 0.007);
};

const frontHair = ({ ctx, c, t, fx }: P) => {
  const [rx, ry] = FACE_R[c.face] ?? FACE_R[0];
  const hx = H.x + fx * 0.45;
  const top = H.y + ry;
  switch (c.hair) {
    case 0: {
      // bob: a cap down to the jaw with straight bangs
      const outer = ell(hx, H.y + 0.01, rx + 0.05, ry + 0.045, 30, -0.35, Math.PI + 0.35);
      const pts: Pt[] = [...outer, [-(rx + 0.04) + hx, H.y - 0.17], [-(rx - 0.035) + hx, H.y - 0.17], [-(rx - 0.03) + hx, H.y + 0.11], [rx - 0.03 + hx, H.y + 0.11], [rx - 0.035 + hx, H.y - 0.17], [rx + 0.04 + hx, H.y - 0.17]];
      shape(ctx, pts, INK);
      break;
    }
    case 1: {
      // bun: hair hugging the top of the head, and a round bun
      const cap = ell(hx, H.y, rx + 0.02, ry + 0.02, 26, 0.25, Math.PI - 0.25);
      shape(ctx, [...cap, [-(rx - 0.04) + hx, H.y + 0.12], [hx, H.y + 0.17], [rx - 0.04 + hx, H.y + 0.12]], INK);
      shape(ctx, ell(hx + fx * 0.2, top + 0.075, 0.085, 0.075, 22), INK);
      break;
    }
    case 2: {
      // curls: a cloud of ink circles framing the face
      ctx.fillStyle = INK;
      for (let i = 0; i <= 13; i++) {
        const a = -0.25 + (i / 13) * (Math.PI + 0.5);
        const r = 0.07 + 0.012 * Math.sin(i * 2.3);
        dot(ctx, hx + Math.cos(a) * (rx + 0.04), H.y + 0.02 + Math.sin(a) * (ry + 0.03), r);
      }
      for (let i = 0; i <= 5; i++) dot(ctx, hx - 0.16 + i * 0.064, H.y + 0.19 - 0.012 * Math.sin(i * 1.7), 0.045);
      break;
    }
    case 3: {
      // spiky crown
      const pts: Pt[] = [];
      const n = 13;
      for (let i = 0; i <= n; i++) {
        const a = 0.12 + (i / n) * (Math.PI - 0.24);
        const tip = i % 2 === 1;
        pts.push([hx + Math.cos(a) * rx * (tip ? 1.32 : 1.0), H.y + 0.04 + Math.sin(a) * ry * (tip ? 1.42 : 0.96)]);
      }
      pts.push([-(rx - 0.02) + hx, H.y + 0.13], [rx - 0.02 + hx, H.y + 0.13]);
      shape(ctx, [...pts.slice(0, n + 1), pts[n + 2], pts[n + 1]], INK);
      break;
    }
    case 4: {
      // side part: a swoop across the forehead
      const cap = ell(hx, H.y + 0.01, rx + 0.035, ry + 0.035, 26, -0.05, Math.PI + 0.1);
      const swoop: Pt[] = [[-(rx - 0.02) + hx, H.y + 0.1], [-0.08 + hx, H.y + 0.14], [0.05 + hx, H.y + 0.2], [rx - 0.01 + hx, H.y + 0.13]];
      shape(ctx, [...cap, ...swoop.reverse()], INK);
      line(ctx, [[-0.06 + hx, top + 0.01], [0.02 + hx, H.y + 0.205]], false, LW * 0.6);
      break;
    }
    case 5: {
      // long waves: the front frame with a centre parting
      const left: Pt[] = [[hx, top + 0.03], ...ell(hx, H.y + 0.02, rx + 0.07, ry + 0.06, 14, Math.PI / 2, Math.PI + 0.2), [-(rx - 0.03) + hx, H.y - 0.05], [-0.04 + hx, H.y + 0.18]];
      const right: Pt[] = [[hx, top + 0.03], ...ell(hx, H.y + 0.02, rx + 0.07, ry + 0.06, 14, Math.PI / 2, -0.2), [rx - 0.03 + hx, H.y - 0.05], [0.04 + hx, H.y + 0.18]];
      shape(ctx, left, INK);
      shape(ctx, right, INK);
      break;
    }
    case 6: {
      // shaved: a hairline and a few stubble dots
      line(ctx, ell(hx, H.y, rx - 0.005, ry - 0.005, 18, 0.35, Math.PI - 0.35), false, LW * 0.6);
      for (let i = 0; i < 18; i++) {
        const a = 0.45 + ((i * 0.618) % 1) * (Math.PI - 0.9);
        dot(ctx, hx + Math.cos(a) * rx * 0.85, H.y + Math.sin(a) * ry * (0.85 + 0.08 * ((i * 0.37) % 1)), 0.004);
      }
      break;
    }
    case 7: {
      // beanie with ribbing and a pompom
      const cap = ell(hx, H.y + 0.05, rx + 0.03, ry + 0.02, 24, 0, Math.PI);
      shape(ctx, [...cap, [-(rx + 0.03) + hx, H.y + 0.12], [rx + 0.03 + hx, H.y + 0.12]], '#FFFFFF');
      shape(ctx, [[-(rx + 0.04) + hx, H.y + 0.06], [-(rx + 0.04) + hx, H.y + 0.13], [rx + 0.04 + hx, H.y + 0.13], [rx + 0.04 + hx, H.y + 0.06]], '#FFFFFF');
      for (let i = -4; i <= 4; i++) line(ctx, [[hx + i * 0.05, H.y + 0.065], [hx + i * 0.05, H.y + 0.125]], false, LW * 0.6);
      shape(ctx, ell(hx, top + 0.11 + 0.01 * Math.sin(t * 3), 0.05, 0.045, 18), INK);
      break;
    }
  }
};

const glasses = ({ ctx, c, fx, fy }: P) => {
  if (!c.glasses) return;
  const y = H.y + 0.01 + fy;
  const lens = (s: number): Pt[] => {
    const x = s * 0.095 + fx;
    if (c.glasses === 1) return ell(x, y, 0.058, 0.058, 26);
    const hw = 0.065, hh = 0.045, r = 0.018;
    const pts: Pt[] = [];
    for (const [cx, cy, a0] of [[hw - r, hh - r, 0], [-hw + r, hh - r, Math.PI / 2], [-hw + r, -hh + r, Math.PI], [hw - r, -hh + r, Math.PI * 1.5]] as Array<[number, number, number]>)
      for (let i = 0; i <= 4; i++) {
        const a = a0 + (i / 4) * (Math.PI / 2);
        pts.push([x + cx + Math.cos(a) * r, y + cy + Math.sin(a) * r]);
      }
    return pts;
  };
  for (const s of [-1, 1]) {
    const pts = lens(s);
    if (c.glasses === 3) {
      shape(ctx, pts, INK);
      line(ctx, [[s * 0.095 + fx - 0.03, y + 0.022], [s * 0.095 + fx - 0.01, y + 0.03]], false, LW * 0.6);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = LW * 0.6;
      ctx.beginPath();
      ctx.moveTo(s * 0.095 + fx - 0.035, y + 0.018);
      ctx.lineTo(s * 0.095 + fx - 0.012, y + 0.03);
      ctx.stroke();
    } else line(ctx, pts, true);
  }
  line(ctx, [[-0.095 + fx + (c.glasses === 1 ? 0.058 : 0.065), y + 0.008], [0.095 + fx - (c.glasses === 1 ? 0.058 : 0.065), y + 0.008]]);
};

const accessory = ({ ctx, c, t, fx }: P) => {
  const [rx, ry] = FACE_R[c.face] ?? FACE_R[0];
  if (c.accessory === 1) {
    line(ctx, ell(-(rx + 0.005) - fx * 0.25, H.y - 0.09, 0.016, 0.016, 12), true, LW * 0.8);
  } else if (c.accessory === 2) {
    line(ctx, ell(H.x + fx * 0.3, H.y + 0.02, rx + 0.05, ry + 0.07, 26, 0.15, Math.PI - 0.15), false, LW * 2);
    for (const s of [-1, 1]) {
      const x = s * (rx + 0.03) - fx * 0.2;
      const cup: Pt[] = [[x - 0.035, H.y - 0.07], [x - 0.035, H.y + 0.06], [x + 0.035, H.y + 0.06], [x + 0.035, H.y - 0.07]];
      shape(ctx, cup, INK);
    }
  } else if (c.accessory === 3) {
    // a pencil tucked behind the ear
    // a pencil tucked behind the ear, its sharpened end sticking out past the hair
    const x = rx - fx * 0.25;
    const a: Pt = [x - 0.1, H.y + 0.16], b: Pt = [x + 0.17, H.y - 0.02];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    const ux = dx / l, uy = dy / l, w = 0.017;
    const ox = -uy * w, oy = ux * w;
    const cone: Pt = [b[0] + ux * 0.05, b[1] + uy * 0.05];
    shape(ctx, [[a[0] + ox, a[1] + oy], [b[0] + ox, b[1] + oy], [b[0] - ox, b[1] - oy], [a[0] - ox, a[1] - oy]], '#FFFFFF');
    shape(ctx, [[b[0] + ox, b[1] + oy], cone, [b[0] - ox, b[1] - oy]], '#FFFFFF');
    shape(ctx, [[cone[0] - ux * 0.018 + ox * 0.36, cone[1] - uy * 0.018 + oy * 0.36], cone, [cone[0] - ux * 0.018 - ox * 0.36, cone[1] - uy * 0.018 - oy * 0.36]], INK, LW * 0.5);
    line(ctx, [[a[0] + ux * 0.03 + ox, a[1] + uy * 0.03 + oy], [a[0] + ux * 0.03 - ox, a[1] + uy * 0.03 - oy]], false, LW * 0.8);
  } else if (c.accessory === 4) {
    const x = -0.12 + fx * 0.5, y = H.y + ry + 0.01;
    const wob = 0.008 * Math.sin(t * 3);
    shape(ctx, [[x, y], [x - 0.07, y + 0.045 + wob], [x - 0.07, y - 0.04 - wob]], INK);
    shape(ctx, [[x, y], [x + 0.07, y + 0.045 - wob], [x + 0.07, y - 0.04 + wob]], INK);
    shape(ctx, ell(x, y, 0.02, 0.02, 12), INK);
  }
};

/** thinking dots and working scribbles, drawn in the same ink */
const props = ({ ctx, c, pose, t }: P) => {
  const [rx, ry] = FACE_R[c.face] ?? FACE_R[0];
  const bits = pose.props.bits ?? 0;
  if (bits > 0.05) {
    for (let i = 0; i < 3; i++) {
      const r = (0.014 + 0.008 * i) * bits;
      line(ctx, ell(rx + 0.06 + i * 0.06, H.y + ry + 0.03 + i * 0.06 + 0.01 * Math.sin(t * 3 + i), r, r, 14), true, LW * 0.8);
    }
  }
  const scribble = pose.props.scribble ?? 0;
  if (scribble > 0.05) {
    // a little page being written on, in the corner
    const x0 = rx + 0.1, y0 = H.y - 0.3;
    shape(ctx, [[x0, y0], [x0 + 0.16, y0], [x0 + 0.16, y0 + 0.2], [x0, y0 + 0.2]], '#FFFFFF', LW * 0.8);
    const n = Math.floor((t * 2.2) % 5) + 1;
    for (let i = 0; i < n; i++) line(ctx, [[x0 + 0.025, y0 + 0.165 - i * 0.032], [x0 + 0.135 - ((i * 37) % 4) * 0.015, y0 + 0.165 - i * 0.032]], false, LW * 0.6);
  }
};

const draw = (ctx: CanvasRenderingContext2D, c: FacesConfig, pose: Pose, face: FaceState, env: Draw2DEnv) => {
  const p: P = { ctx, c, pose, face, t: env.t, fx: pose.headYaw * 0.07 + pose.yaw * 0.02, fy: -pose.headPitch * 0.05 };
  if (c.backdrop && c.backdrop.toUpperCase() !== '#FFFFFF') {
    ctx.beginPath();
    ctx.arc(0, 0.5, 0.5, 0, Math.PI * 2);
    ctx.fillStyle = c.backdrop;
    ctx.fill();
  }
  backHair(p);
  body(p);
  ears(p);
  shape(ctx, headPts(c.face, H.x + p.fx * 0.25), c.skin);
  details(p);
  eyes(p);
  brows(p);
  nose(p);
  facialHair(p);
  mouth(p);
  frontHair(p);
  glasses(p);
  accessory(p);
  props(p);
};

export const faces: FamilyDef<FacesConfig> = {
  id: 'faces',
  name: 'Faces',
  maker: 'Notion-style',
  tagline: 'Black monoline portraits · mix-and-match parts · brows that carry the mood',
  subtitle: 'Portraits in the spirit of Notion’s avatars: black ink on white, built from parts',
  shader: '',
  anchors: 0,
  background: '#FFFFFF',
  backgroundSolid: '#FFFFFF',
  dark: false,
  traits: ['Black monoline ink', 'Mix-and-match parts', 'Expressive brows'],
  look: {
    dark: false,
    groundShadow: 0,
    exposure: 1,
    groundY: 0,
    lights: {
      key: normalize([-0.5, 0.8, 0.6]),
      keyI: 1,
      rim: normalize([0.5, 0.4, -0.7]),
      rimI: 0.5,
      fill: normalize([0.8, 0.1, 0.55]),
      fillI: 0.3,
      sky: [0.8, 0.8, 0.8],
      ground: [0.5, 0.5, 0.5],
      warm: [1, 1, 1],
      env: 1,
    },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Breathing, blinking, glancing', bob: [0.006, 0.4] },
    listening: { label: 'Listening', hint: 'Brows up, eyes on you', expr: 'listening', gaze: 'user', lean: 0.05 },
    thinking: { label: 'Thinking', hint: 'Thought bubbles rising', expr: 'skeptical', gaze: 'up', sway: [0.03, 0.3], props: { bits: 1 } },
    writing: { label: 'Writing', hint: 'Filling a page', expr: 'neutral', gaze: 'down', bob: [0.008, 1.6], props: { scribble: 1 } },
    speaking: { label: 'Speaking', hint: 'Mouth moves with the voice', expr: 'happy', talk: 1, gaze: 'user' },
    done: { label: 'Done', hint: 'A little celebration', expr: 'excited', enter: 'celebrate', emote: ['check', 4] },
    sleeping: { label: 'Sleeping', hint: 'Dozing off', expr: 'sleepy', gaze: 'closed', sink: 0.008, emote: ['zzz', 2.6] },
  },
  personality: {
    body: [2.0, 0.55, 0.6],
    eyes: [6.5, 0.85, 0.0],
    squash: [240, 11],
    reach: [0.2, 0.14],
    eyeShare: 0.55,
    hopGravity: 12,
  },
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
      id: 'head',
      title: 'Head & hair',
      controls: [
        { type: 'chips', key: 'face', label: 'Face', options: FACE_OPTS },
        { type: 'chips', key: 'hair', label: 'Hair', options: HAIR_OPTS },
        { type: 'swatches', key: 'skin', label: 'Skin', colors: SKINS, custom: true },
        { type: 'swatches', key: 'backdrop', label: 'Backdrop', colors: BACKDROPS, custom: true },
      ],
    },
    {
      id: 'features',
      title: 'Features',
      controls: [
        { type: 'chips', key: 'eyes', label: 'Eyes', options: EYE_OPTS },
        { type: 'chips', key: 'brows', label: 'Brows', options: BROW_OPTS },
        { type: 'chips', key: 'nose', label: 'Nose', options: NOSE_OPTS },
        { type: 'chips', key: 'mouth', label: 'Mouth', options: MOUTH_OPTS },
        { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS },
      ],
    },
    {
      id: 'extras',
      title: 'Extras',
      controls: [
        { type: 'chips', key: 'glasses', label: 'Glasses', options: GLASSES_OPTS },
        { type: 'chips', key: 'facialHair', label: 'Facial hair', options: BEARD_OPTS },
        { type: 'chips', key: 'details', label: 'Details', options: DETAIL_OPTS },
        { type: 'chips', key: 'accessory', label: 'Accessory', options: ACC_OPTS },
      ],
    },
  ],
  roster: () => [
    base({ name: 'Ivy', face: 0, hair: 0, eyes: 0, brows: 0, nose: 0, mouth: 0, glasses: 1, backdrop: '#FFE3E3' }),
    base({ name: 'Theo', face: 3, hair: 2, eyes: 0, brows: 1, nose: 1, mouth: 0, glasses: 2, facialHair: 2, skin: '#C99372', backdrop: '#DCEBFF' }),
    base({ name: 'Juno', face: 4, hair: 1, eyes: 1, brows: 2, nose: 2, mouth: 1, details: 1, accessory: 1, skin: '#F7E9DC', backdrop: '#FFF1C2' }),
    base({ name: 'Max', face: 1, hair: 3, eyes: 4, brows: 1, nose: 3, mouth: 3, accessory: 2, skin: '#EBCBA8', backdrop: '#DDF4E4' }),
    base({ name: 'Ada', face: 5, hair: 5, eyes: 2, brows: 0, nose: 0, mouth: 0, details: 2, accessory: 3, skin: '#8E5C3F', backdrop: '#EADFFF' }),
  ],
  randomize: (c, rnd) => {
    const pick = (n: number) => Math.floor(rnd() * n);
    return {
      ...c,
      face: pick(FACE_OPTS.length),
      hair: pick(HAIR_OPTS.length),
      eyes: pick(3) === 0 ? 4 : pick(2),
      brows: pick(BROW_OPTS.length),
      nose: pick(NOSE_OPTS.length),
      mouth: pick(MOUTH_OPTS.length),
      glasses: rnd() < 0.4 ? 1 + pick(3) : 0,
      facialHair: rnd() < 0.3 ? 1 + pick(3) : 0,
      details: pick(DETAIL_OPTS.length),
      accessory: rnd() < 0.5 ? 1 + pick(4) : 0,
      skin: SKINS[pick(SKINS.length)],
      backdrop: BACKDROPS[pick(BACKDROPS.length)],
    };
  },
  compose: (n, aspect, compact) =>
    groupPhoto(n, aspect, { gap: compact ? 1.0 : 1.1, charW: 1.05, charH: 1.05, riser: 0, depth: 0, fov: deg(18), margin: 0.1, turn: 0, lift: 0.08 }),
  solo: (aspect) => soloCamera(aspect, 1.05, 1.05, deg(18), 0.08),
  headLocal: () => [0, 0.62, 0.1],
  bounds: () => ({ c: [0, 0.5, 0], r: 0.6, occ: [] }),
  face: facesFace,
  pack: (_c, _pose, f) => {
    f.data.fill(0);   // drawn in 2D by draw2d
  },
  draw2d: draw,
};
