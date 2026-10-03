// ---------------------------------------------------------------------------
// Clay family: plasticine characters in the spirit of British stop-motion.
// Blobby hand-rolled forms (egg body, ball head, sausage arms, mitten hands),
// white clay eyeballs with black clay pupils, heavy half-dome lids, rolled
// worm brows and a carved mouth that swaps between replacement shapes.
// The pose is sampled "on twos" (12 or 8 fps) and the surface boils between
// frames, as if the animator touched the puppet before every exposure.
// ---------------------------------------------------------------------------
import shader from '../shaders/clay.glsl';
import { clamp, deg, hexToLinear, normalize, quatEuler, type Quat, type Vec3 } from '../engine/math';
import type { Avatar, Pose } from '../avatar/avatar';
import type { CharFrame } from '../engine/renderer';
import type { BaseConfig, EyeSpec, FaceState, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';
import { solveArm, type ArmRig } from './limbs';

export interface ClayConfig extends BaseConfig {
  species: number;
  bodyColor: string;
  secondColor: string;
  accentColor: string;
  accessory: number;
  accessoryColor: string;
  eyeStyle: number;
  eyeSize: number;
  brows: boolean;
  mouth: number;
  thumbprints: number;
  stopMotion: boolean;
  fps: number;
}

const SPECIES_OPTS: Option[] = [
  { value: 0, label: 'Plasticine pal' },
  { value: 1, label: 'Penguin' },
  { value: 2, label: 'Dog' },
  { value: 3, label: 'Woolly' },
  { value: 4, label: 'Bird' },
  { value: 5, label: 'Blob' },
];

/** Species palettes: body, second (belly / muzzle / face), accent (beak, feet, nose, ears). */
const SPECIES_COLORS: Record<number, Pick<ClayConfig, 'bodyColor' | 'secondColor' | 'accentColor'>> = {
  0: { bodyColor: '#C8643C', secondColor: '#E39A72', accentColor: '#8A3B22' },
  1: { bodyColor: '#2B2E36', secondColor: '#F2EDE2', accentColor: '#F08A24' },
  2: { bodyColor: '#D49A5E', secondColor: '#F3DDB8', accentColor: '#5A3524' },
  3: { bodyColor: '#F1ECE2', secondColor: '#D9A07F', accentColor: '#B97A5C' },
  4: { bodyColor: '#F2C53D', secondColor: '#FBE7A2', accentColor: '#EE7A2A' },
  5: { bodyColor: '#B79AD9', secondColor: '#D9C8EE', accentColor: '#F07FA6' },
};

export const CLAY_COLORS = ['#C8643C', '#E2B13C', '#5DA35A', '#3F7FC1', '#B79AD9', '#E2708F', '#2B2E36', '#F1ECE2', '#D49A5E'];
const ACCESSORY_COLORS = ['#C93A35', '#2F6DB5', '#3C8C4E', '#E8B53A', '#E784A6', '#2B2E36', '#F4EFE6'];

const ACCESSORIES: Option[] = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Scarf' },
  { value: 2, label: 'Bow tie' },
  { value: 3, label: 'Knitted hat' },
  { value: 4, label: 'Clay specs' },
  { value: 5, label: 'Tie' },
];

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'grin', label: 'Toothy grin' },
  { value: 'laugh', label: 'Laughing' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'curious', label: 'Curious' },
  { value: 'thinking', label: 'Pondering' },
  { value: 'focused', label: 'Focused' },
  { value: 'determined', label: 'Determined' },
  { value: 'worried', label: 'Worried' },
  { value: 'sad', label: 'Droopy' },
  { value: 'angry', label: 'Grumpy' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'wink', label: 'Wink' },
  { value: 'skeptical', label: 'Skeptical' },
  { value: 'starstruck', label: 'Starstruck' },
  { value: 'dizzy', label: 'Dizzy' },
];

// EyeSpec fields reused as:
//   lid = upper lid cover (0 open .. 1 shut), h = lower lid cover, lidAng = lid slant (+ angry),
//   rot = brow angle (+ knit / angry), dy = brow raise, dx = pupil scale, w = eyeball scale,
//   kind = 0 normal, 3 dizzy (pupils roll)
// FaceTarget: mouth = smile, mouthOpen = open, cheeks = grin (wide, toothy), lidB unused.
const DIZZY = 3;
const e = (lid: number, h: number, rot = 0, dy = 0, o: Partial<EyeSpec> = {}): EyeSpec => ({
  kind: 0, w: 1, h, rot, lid, lidAng: 0, dx: 1, dy, ...o,
});
const face = (l: EyeSpec, r: EyeSpec, mouth: number, open = 0, grin = 0): FaceTarget => ({
  l, r, lidB: 0, mouth, mouthOpen: open, cheeks: grin,
});
const sym = (eye: EyeSpec, mouth: number, open = 0, grin = 0) => face(eye, { ...eye }, mouth, open, grin);

const clayFace = (c: ClayConfig, expr: string): FaceTarget => {
  const sleepyEyes = c.eyeStyle === 3;
  const rest = sleepyEyes ? 0.5 : 0.26;
  // resting mouth style: 0 smile groove, 1 toothy grin, 2 little 'o', 3 flat
  const m = c.mouth;
  const restMouth = (): [number, number, number] =>
    m === 1 ? [0.8, 0.32, 1] : m === 2 ? [0.1, 0.3, 0] : m === 3 ? [0.0, 0, 0] : [0.45, 0, 0];
  switch (expr) {
    case 'happy':
      return sym(e(rest + 0.02, 0.42, -0.05, 0.3), 0.9, 0.18, 0.4);
    case 'grin':
      return sym(e(rest, 0.28, -0.05, 0.35), 0.95, 0.42, 1);
    case 'laugh':
      return sym(e(0.62, 0.6, -0.1, 0.45), 1, 0.85, 0.9);
    case 'squeeze':
      return sym(e(0.75, 0.7, 0.1, 0.25), 0.9, 0.55, 0.85);
    case 'surprised':
      return sym(e(0.02, 0, -0.15, 0.95, { w: 1.12, dx: 0.72 }), 0, 0.8, 0);
    case 'curious':
      return face(e(0.12, 0.02, -0.25, 0.75, { dx: 1.05 }), e(rest + 0.06, 0.06, 0.18, 0.1, { dx: 1.05 }), 0.15, 0.18, 0);
    case 'listening':
      return sym(e(Math.max(0.12, rest - 0.08), 0.04, -0.1, 0.4, { dx: 1.08 }), 0.35, 0.05, 0);
    case 'thinking':
      return face(e(0.42, 0.08, 0.38, -0.12), e(0.18, 0.02, -0.25, 0.6), -0.15, 0.04, 0);
    case 'focused':
      return sym(e(0.46, 0.16, 0.32, -0.15, { lidAng: 0.12 }), 0.05, 0, 0);
    case 'determined':
      return sym(e(0.44, 0.12, 0.5, -0.22, { lidAng: 0.3 }), 0.45, 0.28, 0.75);
    case 'worried':
      return sym(e(0.22, 0.04, -0.5, 0.55, { lidAng: -0.3, dx: 0.85 }), -0.4, 0.2, 0.45);
    case 'sad':
      return sym(e(0.48, 0.06, -0.55, 0.35, { lidAng: -0.45 }), -0.75, 0.04, 0);
    case 'angry':
      return sym(e(0.5, 0.12, 0.7, -0.32, { lidAng: 0.55 }), -0.5, 0.04, 0);
    case 'sleepy':
      return sym(e(0.78, 0.12, 0.0, -0.12), 0.12, 0, 0);
    case 'wink':
      return face(e(rest, 0.2, -0.05, 0.35), e(0.62, 0.62, 0.15, 0.1), 0.85, 0.22, 0.5);
    case 'skeptical':
      return face(e(0.55, 0.1, 0.32, -0.15), e(0.14, 0.02, -0.28, 0.7), -0.2, 0, 0);
    case 'starstruck':
      return sym(e(0.0, 0.05, -0.15, 0.75, { w: 1.14, dx: 1.45 }), 1, 0.55, 1);
    case 'dizzy':
      return sym(e(0.3, 0.08, -0.2, 0.3, { kind: DIZZY, dx: 0.9 }), -0.2, 0.3, 0.2);
    case 'talk':
    default: {
      const [s, o, g] = restMouth();
      return sym(e(rest, 0.06, 0, 0), s, o, g);
    }
  }
};

const base = (o: Partial<ClayConfig>): ClayConfig => ({
  name: 'Clay',
  state: 'idle',
  expression: 'neutral',
  species: 0,
  ...SPECIES_COLORS[0],
  accessory: 0,
  accessoryColor: '#C93A35',
  eyeStyle: 0,
  eyeSize: 1,
  brows: true,
  mouth: 0,
  thumbprints: 0.6,
  stopMotion: true,
  fps: 12,
  ...o,
});

const withSpecies = (sp: number, o: Partial<ClayConfig>) => base({ species: sp, ...SPECIES_COLORS[sp], ...o });

/** Proportions per species (local units, ~1 = character height). */
interface Build {
  body: Vec3;      // ellipsoid radii
  by: number;      // body centre height
  pear: number;    // widening towards the bottom
  hr: number;      // head radius
  hy: number;      // head centre height
  hz: number;      // head forward offset
  k: number;       // head-body blend (large = one lump)
  feet: number;    // 0 none, 1 stubby
  rig: ArmRig;
  arm: [number, number, number]; // shoulder, elbow, hand radii
  thumb: number;   // mitten thumb
}
const BUILDS: Build[] = [
  // plasticine pal: pear body, head pressed on as nearly the same lump
  { body: [0.215, 0.26, 0.185], by: 0.32, pear: 0.42, hr: 0.19, hy: 0.665, hz: 0.0, k: 0.026, feet: 1,
    rig: { shoulder: [0.165, 0.475, 0], upper: 0.13, fore: 0.12 }, arm: [0.043, 0.04, 0.055], thumb: 1 },
  // penguin: one tall egg, flippers
  { body: [0.235, 0.29, 0.21], by: 0.33, pear: 0.3, hr: 0.18, hy: 0.64, hz: 0.0, k: 0.03, feet: 1,
    rig: { shoulder: [0.2, 0.47, 0], upper: 0.12, fore: 0.11 }, arm: [0.055, 0.045, 0.028], thumb: 0 },
  // dog: rounder body, separate head ball with a snout
  { body: [0.21, 0.23, 0.2], by: 0.29, pear: 0.25, hr: 0.205, hy: 0.635, hz: 0.02, k: 0.007, feet: 1,
    rig: { shoulder: [0.16, 0.43, 0], upper: 0.12, fore: 0.11 }, arm: [0.044, 0.04, 0.054], thumb: 1 },
  // woolly: plump wool ball, small dark face
  { body: [0.27, 0.245, 0.25], by: 0.31, pear: 0.1, hr: 0.165, hy: 0.6, hz: 0.07, k: 0.006, feet: 1,
    rig: { shoulder: [0.215, 0.42, 0], upper: 0.11, fore: 0.1 }, arm: [0.04, 0.037, 0.048], thumb: 1 },
  // bird: round body, round head, short wings
  { body: [0.225, 0.25, 0.21], by: 0.3, pear: 0.2, hr: 0.175, hy: 0.63, hz: 0.01, k: 0.014, feet: 1,
    rig: { shoulder: [0.19, 0.44, 0], upper: 0.11, fore: 0.1 }, arm: [0.05, 0.04, 0.026], thumb: 0 },
  // blob: a single squidgy lump, no feet
  { body: [0.27, 0.29, 0.24], by: 0.29, pear: 0.35, hr: 0.2, hy: 0.55, hz: 0.0, k: 0.04, feet: 0,
    rig: { shoulder: [0.215, 0.36, 0], upper: 0.12, fore: 0.11 }, arm: [0.042, 0.038, 0.05], thumb: 1 },
];
const buildOf = (c: ClayConfig) => BUILDS[clamp(Math.round(c.species), 0, 5)];

// ------------------------------------------------------------ stop motion
interface Held {
  step: number;
  pose: Pose;
  face: FaceState;
  rot: Quat;
  pos: Vec3;
  squash: Vec3;
  blink: number;
}
const HOLD = new WeakMap<CharFrame, Held>();
const copyPose = (p: Pose): Pose => ({
  ...p,
  offset: [...p.offset] as Vec3,
  poke: [...p.poke] as Vec3,
  arms: { ...p.arms },
  props: { ...p.props },
});
const copyFace = (f: FaceState): FaceState => ({ ...f, l: { ...f.l }, r: { ...f.r } });
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Samples the pose "on twos": the animator only moves the puppet once per
 * exposure, so between steps the frame shows the held pose and transform.
 * Blinks shorter than a step still register (the max over the step is kept).
 */
const stepPose = (c: ClayConfig, pose: Pose, f: CharFrame, faceNow: FaceState): { pose: Pose; face: FaceState; step: number } => {
  const fps = c.fps === 8 ? 8 : 12;
  const step = Math.floor(pose.phase * fps);
  if (!c.stopMotion) {
    HOLD.delete(f);
    return { pose, face: faceNow, step };
  }
  let h = HOLD.get(f);
  if (!h || h.step !== step) {
    const blink = Math.max(pose.blink, h ? h.blink : 0);
    h = { step, pose: copyPose(pose), face: copyFace(faceNow), rot: [...f.rot] as Quat, pos: [...f.pos] as Vec3, squash: [...f.squash] as Vec3, blink: 0 };
    h.pose.blink = blink;
    HOLD.set(f, h);
  } else {
    h.blink = Math.max(h.blink, pose.blink);
    f.rot = [...h.rot] as Quat;
    f.pos = [...h.pos] as Vec3;
    f.squash = [...h.squash] as Vec3;
  }
  return { pose: h.pose, face: h.face, step };
};

/** "Squish into a ball and pop back" cycle for the morphing state: [ball amount, pop stretch]. */
const squishCycle = (phase: number): [number, number] => {
  const u = (phase / 2.6) % 1;
  const ss = (a: number, b: number, x: number) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const ball = ss(0.05, 0.3, u) * (1 - ss(0.58, 0.66, u));
  const pop = Math.sin(clamp((u - 0.6) / 0.22, 0, 1) * Math.PI) * Math.exp(-Math.max(0, u - 0.6) * 6);
  return [ball, pop];
};

// ------------------------------------------------------------ face anchors
interface EyeAnchor {
  c: Vec3;   // eyeball centre (mirrored to +x)
  r: number; // eyeball radius
  ba: Vec3;  // brow inner end
  bb: Vec3;  // brow outer end
}
interface Anchors {
  l: EyeAnchor;
  r: EyeAnchor;
  browR: number;
  nose: Vec3;
  noseR: number;
  mouth: Vec3;
  neckY: number;
  neckRx: number;
  neckRz: number;
  neckZ: number;
  snout: Vec3;
  snoutS: number;
  hatCut: number;
}

/** Point and normal on the front of the head ellipsoid at head-space (x, y). */
const facePt = (B: Build, x: number, y: number): [Vec3, Vec3] => {
  const rx = B.hr, ry = B.hr * 0.96, rz = B.hr * 0.94;
  const u = x / rx, v = (y - B.hy) / ry;
  const z = rz * Math.sqrt(Math.max(1 - u * u - v * v, 0.02));
  return [[x, y, B.hz + z], normalize([x / (rx * rx), (y - B.hy) / (ry * ry), z / (rz * rz)])];
};
/** body + head as the shader blends them (no head turn, no boil) */
const coreSDF = (B: Build, p: Vec3): number => {
  const ell = (q: Vec3, r: Vec3) => {
    const k0 = Math.hypot(q[0] / r[0], q[1] / r[1], q[2] / r[2]);
    const k1 = Math.hypot(q[0] / (r[0] * r[0]), q[1] / (r[1] * r[1]), q[2] / (r[2] * r[2]));
    return (k0 * (k0 - 1)) / Math.max(k1, 1e-6);
  };
  const py = p[1] - B.by;
  const s = 1 + B.pear * 0.5 * clamp(-py / B.body[1], -1, 1);
  const db = ell([p[0] / s, py, p[2] / s], B.body) * Math.min(s, 1);
  const dh = ell([p[0], p[1] - B.hy, p[2] - B.hz], [B.hr, B.hr * 0.96, B.hr * 0.94]);
  const k = B.k;
  const h = 1 - Math.min(Math.abs(db - dh) / (4 * k), 1);
  return Math.min(db, dh) - h * h * k;
};
/** distance from p along dir to the outer surface of the body + head */
const surfaceAlong = (B: Build, p: Vec3, dir: Vec3): number => {
  let lo = 0, hi = 0.6;
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) / 2;
    if (coreSDF(B, [p[0] + dir[0] * m, p[1] + dir[1] * m, p[2] + dir[2] * m]) < 0) lo = m;
    else hi = m;
  }
  return lo;
};
const along = (p: Vec3, n: Vec3, s: number): Vec3 => [p[0] + n[0] * s, p[1] + n[1] * s, p[2] + n[2] * s];

const faceAnchors = (c: ClayConfig, B: Build, fc: FaceState, lift = 0): Anchors => {
  const style = c.eyeStyle;
  const sizeK = style === 1 ? 1.22 : style === 2 ? 0.48 : 1;
  const base = B.hr * 0.29 * c.eyeSize * sizeK;
  const ey = B.hy + B.hr * (style === 1 ? 0.2 : 0.13);
  const ex = style === 2 ? B.hr * 0.38 : B.hr * 0.29 * c.eyeSize * sizeK * 1.03;
  const browR = 0.016 * (B.hr / 0.19);
  // a knitted hat sits just above the eyes; brows tuck under its brim
  const eyeTop = ey + base * Math.max(fc.l.w, fc.r.w) * 0.75;
  const hatCut = clamp(eyeTop + 0.05 - B.hy, B.hr * 0.2, B.hr * 0.66);
  const browCap = c.accessory === 3 ? B.hy + hatCut - browR * 0.6 : 9;
  const eye = (s: EyeSpec): EyeAnchor => {
    const r = base * s.w;
    const [p, n] = facePt(B, ex, ey);
    const cc = along(p, n, -r * 0.3);
    // brows: rolled worms above the eyes, slanted and raised by the expression
    const by = ey + Math.max(r, base) * 1.12 + 0.02 + (s.dy + lift) * 0.03 * (B.hr / 0.19);
    const half = Math.max(base, 0.04) * 0.64;
    const knit = Math.max(0, s.rot) * 0.01;
    const bx = ex + base * 0.12;
    const xi = bx - half - knit, xo = bx + half - knit * 0.5;
    const yi = Math.min(by - s.rot * half * 0.6, browCap), yo = Math.min(by + s.rot * half * 0.6, browCap);
    const [pi, ni] = facePt(B, xi, yi);
    const [po, no] = facePt(B, xo, yo);
    return { c: cc, r, ba: along(pi, ni, browR * 0.6), bb: along(po, no, browR * 0.5) };
  };
  const sp = c.species;
  let nose: Vec3 = [0, 0, 0];
  let noseR = 0;
  let mouth: Vec3;
  let snout: Vec3 = [0, 0, 0];
  let snoutS = 0;
  if (sp === 2) {
    snoutS = B.hr / 0.205;
    const [p, n] = facePt(B, 0, ey - base * 1.65);
    snout = along(p, n, -0.012);
    nose = [0, snout[1] + 0.03 * snoutS, snout[2] + 0.07 * snoutS];
    noseR = 0.03 * snoutS;
    const dy = -0.042 * snoutS;
    mouth = [0, snout[1] + dy, snout[2] + 0.078 * snoutS * Math.sqrt(Math.max(1 - (dy / (0.064 * snoutS)) ** 2, 0.05)) - 0.004];
  } else {
    const [pn, nn] = facePt(B, 0, ey - base * (sp === 1 || sp === 4 ? 0.95 : 1.0));
    if (sp === 0) {
      nose = along(pn, nn, 0.012);
      noseR = B.hr * 0.2;
    } else if (sp === 1 || sp === 4) {
      nose = along(pn, nn, -0.004);
      noseR = 0.042 * (B.hr / 0.18);
    } else if (sp === 3) {
      nose = along(pn, nn, 0.0);
      noseR = B.hr * 0.11;
    }
    const my = ey - base * (sp === 0 ? 1.95 : 1.6) - (style === 2 ? B.hr * 0.12 : 0);
    const [pm] = facePt(B, 0, my);
    mouth = pm;
  }
  // collar line where the head sits on the body: found on the blended SDF itself
  const neckY = B.hy - B.hr * 0.82;
  const neckRx = surfaceAlong(B, [0, neckY, 0], [1, 0, 0]) * 0.94;
  const neckRz = surfaceAlong(B, [0, neckY, 0], [0, 0, 1]) * 0.94;
  const ra = eye(fc.l), rb = eye(fc.r);
  return {
    l: ra,
    r: rb,
    browR,
    nose,
    noseR,
    mouth,
    neckY,
    neckRx,
    neckRz,
    neckZ: surfaceAlong(B, [0, neckY, 0], [0, 0, 1]),
    hatCut,
    snout,
    snoutS,
  };
};

/** claymation replacement mouths: [smile, open, grin] */
const PHONEMES: Array<[number, number, number]> = [
  [0.3, 0.0, 0.0],   // closed (M, B, P)
  [0.0, 0.75, 0.0],  // O
  [0.75, 0.5, 1.0],  // wide toothy (A, E)
  [0.35, 0.3, 0.6],  // half (I, S)
  [0.05, 0.42, 0.0], // small o (U, W)
];

export const clay: FamilyDef<ClayConfig> = {
  id: 'clay',
  name: 'Clay',
  maker: 'Stop-motion',
  tagline: 'Hand-pressed plasticine · thumbprints & boil · animated on twos',
  subtitle: 'Stop-motion · plasticine pals, one exposure at a time',
  shader,
  anchors: 0,
  background: 'radial-gradient(120% 100% at 30% 0%, #FBF4E8 0%, #EFE3D0 55%, #E2D2BA 100%)',
  backgroundSolid: '#EFE3D0',
  dark: false,
  traits: ['Hand-pressed plasticine', 'Thumbprints and surface boil', 'Animated on twos'],
  look: {
    dark: false,
    groundShadow: 0.42,
    exposure: 1.0,
    groundY: 0,
    lights: {
      key: normalize([-0.5, 0.75, 0.62]),
      keyI: 1.25,
      rim: normalize([0.6, 0.5, -0.65]),
      rimI: 0.75,
      fill: normalize([0.8, 0.15, 0.55]),
      fillI: 0.3,
      sky: [0.46, 0.45, 0.45],
      ground: [0.24, 0.2, 0.17],
      warm: [1.0, 0.91, 0.78],
      env: 0.55,
    },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Breathing, a little boil between frames', bob: [0.006, 0.45], sway: [0.02, 0.3] },
    listening: { label: 'Listening', hint: 'Brows up, head cocked, all ears', expr: 'listening', gaze: 'user', lean: 0.07, props: { tilt: 1 }, sway: [0.012, 0.25] },
    thinking: { label: 'Thinking', hint: 'Hand to chin, brow knitted', expr: 'thinking', arms: 'think', gaze: 'up', sway: [0.015, 0.3], props: { tilt: -0.6 } },
    working: { label: 'Working', hint: 'Tapping at a little clay keyboard', expr: 'focused', arms: 'type', gaze: 'down', props: { keyboard: 1 }, bob: [0.006, 2.2] },
    speaking: { label: 'Speaking', hint: 'Replacement mouths, swapped every frame', expr: 'talk', talk: 1, gaze: 'user', sway: [0.02, 0.6], bob: [0.006, 1.2] },
    waving: { label: 'Waving', hint: 'A cheery hello', expr: 'happy', arms: 'wave', gaze: 'user', sway: [0.025, 0.5] },
    done: { label: 'Done', hint: 'Arms up, a toothy grin and a jump', expr: 'grin', arms: 'cheer', enter: 'celebrate', bob: [0.045, 1.6], squash: [0.04, 1.6], emote: ['check', 3.4] },
    morphing: { label: 'Squish', hint: 'Squashes into a ball and pops back', expr: 'surprised', props: { ball: 1 }, emote: ['sparkle', 2.6] },
    sleeping: { label: 'Sleeping', hint: 'Lids down, slow breaths', expr: 'sleepy', gaze: 'closed', squash: [0.03, 0.22], sink: 0.01, emote: ['zzz', 2.6] },
  },
  personality: {
    body: [1.6, 0.6, 0.6],
    eyes: [4.5, 0.75, 0.0],
    squash: [220, 9],
    reach: [0.3, 0.16],
    eyeShare: 0.6,
    hopGravity: 13,
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
      id: 'character',
      title: 'Character',
      controls: [
        { type: 'chips', key: 'species', label: 'Figure', options: SPECIES_OPTS },
        { type: 'swatches', key: 'bodyColor', label: 'Clay colour', colors: CLAY_COLORS, custom: true },
        { type: 'swatches', key: 'secondColor', label: 'Belly & muzzle', colors: ['#F2EDE2', '#E39A72', '#F3DDB8', '#FBE7A2', '#D9C8EE', '#3B3636'], custom: true },
        { type: 'chips', key: 'accessory', label: 'Accessory', options: ACCESSORIES },
        { type: 'swatches', key: 'accessoryColor', label: 'Accessory colour', colors: ACCESSORY_COLORS, custom: true, when: (c) => c.accessory > 0 },
      ],
    },
    {
      id: 'face',
      title: 'Face',
      controls: [
        { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS },
        {
          type: 'chips',
          key: 'eyeStyle',
          label: 'Eyes',
          options: [
            { value: 0, label: 'Round' },
            { value: 1, label: 'Googly' },
            { value: 2, label: 'Beady' },
            { value: 3, label: 'Heavy lids' },
          ],
        },
        { type: 'slider', key: 'eyeSize', label: 'Eye size', min: 0.75, max: 1.3, step: 0.01 },
        { type: 'toggle', key: 'brows', label: 'Worm brows' },
        {
          type: 'chips',
          key: 'mouth',
          label: 'Mouth',
          options: [
            { value: 0, label: 'Smile groove' },
            { value: 1, label: 'Toothy grin' },
            { value: 2, label: "Little 'o'" },
            { value: 3, label: 'Flat' },
          ],
        },
      ],
    },
    {
      id: 'clay',
      title: 'Clay & animation',
      controls: [
        { type: 'slider', key: 'thumbprints', label: 'Thumbprints', min: 0, max: 1, step: 0.01 },
        { type: 'toggle', key: 'stopMotion', label: 'Stop-motion (on twos)' },
        {
          type: 'chips',
          key: 'fps',
          label: 'Frame rate',
          options: [
            { value: 12, label: '12 fps' },
            { value: 8, label: '8 fps' },
          ],
          when: (c) => c.stopMotion,
        },
      ],
    },
  ],
  roster: () => [
    withSpecies(0, { name: 'Terry', accessory: 5, accessoryColor: '#2F6DB5', mouth: 1, expression: 'grin' }),
    withSpecies(1, { name: 'Pip', accessory: 2, accessoryColor: '#C93A35', eyeStyle: 0 }),
    withSpecies(2, { name: 'Biscuit', accessory: 4, accessoryColor: '#2B2E36', expression: 'happy' }),
    withSpecies(5, { name: 'Mabel', accessory: 3, accessoryColor: '#E784A6', eyeStyle: 1, mouth: 2, expression: 'curious' }),
    withSpecies(4, { name: 'Sunny', accessory: 1, accessoryColor: '#3C8C4E', eyeStyle: 3 }),
  ],
  onChange: (c, key, value) => (key === 'species' ? { ...c, ...SPECIES_COLORS[Number(value)], species: Number(value) } : null),
  randomize: (c, rnd) => {
    const sp = Math.floor(rnd() * 6);
    const pal = SPECIES_COLORS[sp];
    return {
      ...c,
      species: sp,
      ...pal,
      bodyColor: rnd() < 0.6 ? pal.bodyColor : CLAY_COLORS[Math.floor(rnd() * CLAY_COLORS.length)],
      accessory: Math.floor(rnd() * 6),
      accessoryColor: ACCESSORY_COLORS[Math.floor(rnd() * ACCESSORY_COLORS.length)],
      eyeStyle: rnd() < 0.55 ? 0 : 1 + Math.floor(rnd() * 3),
      eyeSize: 0.85 + rnd() * 0.35,
      brows: rnd() < 0.8,
      mouth: Math.floor(rnd() * 4),
      thumbprints: 0.3 + rnd() * 0.6,
      expression: ['neutral', 'happy', 'grin', 'curious', 'skeptical', 'worried'][Math.floor(rnd() * 6)],
    };
  },
  compose: (n, aspect, compact) =>
    groupPhoto(n, aspect, {
      gap: compact ? 0.78 : 0.84,
      charW: 0.9,
      charH: 1.06,
      riser: 0.42,
      depth: 0.7,
      fov: deg(22),
      margin: compact ? 0.06 : 0.12,
      turn: 0.08,
      lift: 0.3,
    }),
  solo: (aspect) => soloCamera(aspect, 0.95, 1.05, deg(22), 0.3),
  headLocal: (c) => {
    const b = buildOf(c);
    return [0, b.hy, b.hz + b.hr];
  },
  bounds: (c) => {
    const b = buildOf(c);
    const top = b.hy + b.hr + (c.accessory === 3 ? 0.13 : 0.04) + (c.species === 4 || c.species === 5 ? 0.06 : 0);
    return {
      c: [0, 0.47, 0.04],
      r: Math.max(0.55, top - 0.47 + 0.03),
      occ: [
        [0, b.by, 0, Math.max(b.body[0], b.body[2]) * 0.95],
        [0, b.hy, b.hz, b.hr * 0.95],
      ],
    };
  },
  face: clayFace,
  pack: (c: ClayConfig, livePose: Pose, f: CharFrame, liveFace: FaceTarget) => {
    const held = stepPose(c, livePose, f, liveFace);
    const pose = held.pose;
    const fc = held.face;
    const step = held.step;
    const d = f.data;
    d.fill(0);
    const set = (k: number, a: number, b: number, cc: number, dd: number) => {
      d[k * 4] = a;
      d[k * 4 + 1] = b;
      d[k * 4 + 2] = cc;
      d[k * 4 + 3] = dd;
    };
    const lin = hexToLinear;
    const B = buildOf(c);
    const sp = clamp(Math.round(c.species), 0, 5);
    const bc = lin(c.bodyColor), sc = lin(c.secondColor), ac = lin(c.accentColor), xc = lin(c.accessoryColor);
    set(0, bc[0], bc[1], bc[2], sp);
    set(1, sc[0], sc[1], sc[2], c.thumbprints);
    set(2, ac[0], ac[1], ac[2], c.accessory);
    set(3, xc[0], xc[1], xc[2], c.eyeStyle);

    // squish-into-a-ball cycle (morphing state)
    const ballAmt = pose.props.ball ?? 0;
    const [ballC, pop] = squishCycle(pose.phase);
    const ball = ballAmt * ballC;
    if (ballAmt > 0.01) {
      const s = 1 + 0.16 * pop * ballAmt;
      f.squash = [f.squash[0] / Math.sqrt(s), f.squash[1] * s, f.squash[2] / Math.sqrt(s)];
    }

    const tilt = (pose.props.tilt ?? 0) * 0.2;
    const hq = quatEuler(pose.headYaw, pose.headPitch, pose.headRoll + tilt);
    set(4, hq[0], hq[1], hq[2], hq[3]);
    set(5, B.body[0], B.body[1], B.body[2], B.by);
    set(6, B.hr, B.hy, B.hz, B.k);

    // eyes: look per eye (dizzy pupils roll in opposite directions)
    const dizzy = fc.l.kind === DIZZY ? 1 : 0;
    const roll = pose.phase * 7;
    const lx = pose.lookX * (1 - dizzy) + dizzy * Math.cos(roll) * 0.8;
    const ly = pose.lookY * (1 - dizzy) + dizzy * Math.sin(roll) * 0.7;
    const rx = pose.lookX * (1 - dizzy) + dizzy * Math.cos(-roll + 1.0) * 0.8;
    const ry = pose.lookY * (1 - dizzy) + dizzy * Math.sin(-roll + 1.0) * 0.7;
    set(7, lx, ly, rx, ry);
    const blink = pose.blink;
    const excite = pose.excite;
    const lidPack = (k: number, eye: EyeSpec) => {
      const up = eye.lid * (1 - 0.35 * excite);
      const lidU = up + (1 - up) * blink;
      const lidL = eye.h * (1 - blink * 0.5);
      // plane heights in eyeball radii: upper lid edge, lower lid edge
      const yU = 1.15 - 1.15 * lidU - 0.06 * blink;
      const shut = clamp((lidU - 0.82) / 0.18, 0, 1);
      const yL = -1.15 + 1.15 * lidL + (yU - 0.03 + 1.15 - 1.15 * lidL) * shut;
      set(k, yU, eye.lidAng, Math.min(yL, yU - 0.04), 0);
    };
    lidPack(8, fc.l);
    lidPack(9, fc.r);

    // mouth: expression, or replacement phoneme shapes while talking (one per step)
    let smile = fc.mouth, open = fc.mouthOpen, grin = fc.cheeks;
    if (pose.talk > 0.12) {
      const ph = PHONEMES[Math.floor(hash(Math.floor(step / 2) + 3) * PHONEMES.length)];
      const k = clamp((pose.talk - 0.12) * 2.5, 0, 1);
      smile += (ph[0] - smile) * k;
      open += (ph[1] - open) * k;
      grin += (ph[2] - grin) * k;
    }
    const beak = sp === 1 || sp === 4 ? 1 : 0;
    set(11, smile, open, grin, c.brows ? 1 : 0);

    // ---- face anchors on the head ellipsoid (head space)
    const F = faceAnchors(c, B, fc, 0.15 * excite);
    const putEye = (k: number, ey: EyeAnchor) => set(k, ey.c[0], ey.c[1], ey.c[2], ey.r);
    putEye(22, F.l);
    putEye(23, F.r);
    set(24, F.l.ba[0], F.l.ba[1], F.l.ba[2], F.browR);
    set(25, F.l.bb[0], F.l.bb[1], F.l.bb[2], 0);
    set(26, F.r.ba[0], F.r.ba[1], F.r.ba[2], F.browR);
    set(27, F.r.bb[0], F.r.bb[1], F.r.bb[2], 0);
    set(28, F.nose[0], F.nose[1], F.nose[2], F.noseR);
    set(29, F.mouth[0], F.mouth[1], F.mouth[2], B.hr / 0.19);
    set(30, F.neckY, F.neckRx, F.neckRz, F.neckZ);
    set(31, F.snout[0], F.snout[1], F.snout[2], F.snoutS);
    d[8 * 4 + 3] = F.hatCut;

    // ---- arms (mitten hands pulled to the chin when thinking, onto the keys when typing)
    const rig = B.rig;
    const [lS, lE, lH] = solveArm(-1, pose.arms, pose.phase, rig);
    const [rS, rE, rH] = solveArm(1, pose.arms, pose.phase, rig);
    const chin: Vec3 = [0.03, F.mouth[1] - 0.05 * B.hr / 0.19, F.mouth[2] + 0.03];
    const think = clamp((pose.arms.rBend - 1.3) / 0.6, 0, 1) * clamp((pose.arms.rFwd - 0.6) / 0.6, 0, 1);
    if (think > 0) {
      // the hand rests under the chin (the head turns, the hand stays roughly put)
      for (let i = 0; i < 3; i++) {
        rH[i] += (chin[i] - rH[i]) * think;
        rE[i] += ((rS[i] + chin[i]) * 0.5 + (i === 2 ? 0.07 : i === 1 ? -0.05 : 0.04) - rE[i]) * think * 0.8;
      }
    }
    const kb = pose.props.keyboard ?? 0;
    const typing = clamp(pose.arms.tap, 0, 1);
    const kbC: Vec3 = [0, Math.min(lH[1], rH[1]) - 0.06, Math.max(lH[2], rH[2]) + 0.02];
    if (typing > 0) {
      const tapL = 0.018 * Math.max(0, Math.sin(pose.phase * 14 + Math.PI));
      const tapR = 0.018 * Math.max(0, Math.sin(pose.phase * 14));
      lH[0] *= 1 - 0.38 * typing;
      rH[0] *= 1 - 0.38 * typing;
      lH[1] += (-0.035 + tapL) * typing;
      rH[1] += (-0.035 + tapR) * typing;
    }
    // resting mittens hang a little clear of the belly (a hairline gap reads as noise)
    const clear = 0.022 * (1 - typing) * (1 - think);
    lH[0] -= clear;
    rH[0] += clear;
    lE[0] -= clear * 0.4;
    rE[0] += clear * 0.4;
    const [r0, r1, r2] = B.arm;
    set(12, lS[0], lS[1], lS[2], r0 * (1 - 0.6 * ball));
    set(13, lE[0], lE[1], lE[2], r1 * (1 - 0.6 * ball));
    set(14, lH[0], lH[1], lH[2], r2 * (1 - 0.6 * ball));
    set(15, rS[0], rS[1], rS[2], r0 * (1 - 0.6 * ball));
    set(16, rE[0], rE[1], rE[2], r1 * (1 - 0.6 * ball));
    set(17, rH[0], rH[1], rH[2], r2 * (1 - 0.6 * ball));
    set(10, kbC[0], kbC[1], kbC[2], kb);

    // boil: a new seed per exposure while stop-motion is on
    const seed = c.stopMotion ? (step % 61) * 1.618 : 0;
    set(18, B.feet, B.thumb, fc.l.dx, seed);
    set(19, pose.poke[0], pose.poke[1], pose.poke[2], pose.pokeAmp);
    set(20, pose.wobble * 0.6, pose.wobblePhase, ball, 0);
    set(21, Math.floor(pose.phase * 9), fc.r.dx, beak, B.pear);
  },
};

export type ClayAvatar = Avatar<ClayConfig>;
