import shader from '../shaders/poly.glsl';
import { clamp, deg, hexToLinear, lerp, normalize, type Vec3 } from '../engine/math';
import type { Pose } from '../avatar/avatar';
import type { CharFrame } from '../engine/renderer';
import type { BaseConfig, EyeSpec, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';
import { DOTS_SHAPES } from './dots';

/**
 * Polydots: a low-poly mash-up of OpenAI's Dots blobs and the RebelMouse mouse.
 * The body is a union of faceted ellipsoids; this file mirrors the shader's
 * distance field so eyes, nose, ears and tail can be anchored on the facets
 * from the CPU (no GPU anchor pass needed).
 */
export interface PolyConfig extends BaseConfig {
  shape: number;
  color: string;
  accentColor: string;
  material: string;
  facets: number;
  width: number;
  eyes: number;
  eyeSize: number;
  eyeSpacing: number;
  eyeHeight: number;
  nose: boolean;
  whiskers: boolean;
  mouth: number;
  blush: number;
  ears: number;
  bandana: number;
  bandanaColor: string;
  flag: number;
  _from?: { shape: number };
}

type Blob = [number, number, number, number, number, number, number, number]; // cx cy cz yaw rx ry rz pitch
interface ShapeDef {
  label: string;
  icon: string;
  blobs: Blob[];
  /** smooth ellipsoid the face sits on (centre, radii) */
  face: [Vec3, Vec3];
  feetZ: number;
  /** headband / neckerchief heights */
  headY: number;
  neckY: number;
}

const iconOf = (label: string) => DOTS_SHAPES.find((s) => s.label === label)?.icon ?? '';
const HIDDEN = (c: Vec3): Blob => [c[0], c[1], c[2], 0, 0, 0, 0, 0];
const pad = (blobs: Blob[]): Blob[] => {
  const c: Vec3 = [blobs[0][0], blobs[0][1], blobs[0][2]];
  while (blobs.length < 5) blobs.push(HIDDEN(c));
  return blobs;
};

const SHAPES: ShapeDef[] = [
  {
    label: 'Bean',
    icon: iconOf('Bean'),
    blobs: pad([
      [0.03, 0.7, 0.0, 0.3, 0.33, 0.3, 0.31, 0.12],
      [-0.03, 0.4, 0.0, -0.4, 0.4, 0.37, 0.36, -0.1],
    ]),
    face: [[0.02, 0.66, 0.0], [0.33, 0.31, 0.31]],
    feetZ: 0.2,
    headY: 0.86,
    neckY: 0.56,
  },
  {
    label: 'Cloud',
    icon: iconOf('Cloud'),
    blobs: pad([
      [0.0, 0.55, 0.0, 0.2, 0.3, 0.28, 0.28, 0.0],
      [-0.3, 0.42, 0.02, -0.5, 0.24, 0.22, 0.23, 0.2],
      [0.3, 0.42, 0.02, 0.6, 0.25, 0.23, 0.24, -0.2],
      [0.0, 0.33, 0.0, 0.9, 0.42, 0.22, 0.26, 0.0],
      [-0.14, 0.7, -0.02, 0.4, 0.2, 0.19, 0.19, 0.3],
    ]),
    face: [[0.0, 0.5, 0.0], [0.5, 0.3, 0.29]],
    feetZ: 0.16,
    headY: 0.74,
    neckY: 0.3,
  },
  {
    label: 'Pear',
    icon: iconOf('Pear'),
    blobs: pad([
      [0.0, 0.76, 0.0, 0.2, 0.26, 0.24, 0.25, 0.0],
      [0.0, 0.38, 0.0, -0.3, 0.42, 0.38, 0.4, 0.0],
    ]),
    face: [[0.0, 0.72, 0.0], [0.26, 0.25, 0.25]],
    feetZ: 0.24,
    headY: 0.85,
    neckY: 0.6,
  },
  {
    label: 'Heart',
    icon: iconOf('Heart'),
    blobs: pad([
      [-0.21, 0.7, 0.0, 0.35, 0.3, 0.29, 0.26, 0.0],
      [0.21, 0.7, 0.0, -0.35, 0.3, 0.29, 0.26, 0.0],
      [0.0, 0.42, 0.0, 0.0, 0.37, 0.42, 0.25, 1.017],
    ]),
    face: [[0.0, 0.6, 0.0], [0.5, 0.4, 0.26]],
    feetZ: 0.1,
    headY: 0.84,
    neckY: 0.3,
  },
  {
    label: 'Round',
    icon: 'M12 3a9 9 0 1 1 0 18 9 9 0 1 1 0-18z',
    blobs: pad([[0.0, 0.5, 0.0, 0.0, 0.44, 0.44, 0.42, 0.0]]),
    face: [[0.0, 0.5, 0.0], [0.44, 0.44, 0.42]],
    feetZ: 0.22,
    headY: 0.74,
    neckY: 0.3,
  },
  {
    label: 'Drop',
    icon: 'M12 2.5c3 4 7 8.5 7 12.5a7 7 0 0 1-14 0c0-4 4-8.5 7-12.5z',
    blobs: pad([
      [0.0, 0.42, 0.0, 0.0, 0.42, 0.4, 0.4, 0.0],
      [0.0, 0.8, 0.0, 0.3, 0.2, 0.26, 0.19, 0.0],
    ]),
    face: [[0.0, 0.42, 0.0], [0.42, 0.4, 0.4]],
    feetZ: 0.22,
    headY: 0.66,
    neckY: 0.3,
  },
];

export const POLY_SHAPES: Option[] = SHAPES.map((s, i) => ({ value: i, label: s.label, icon: s.icon }));
const COLORS = ['#2FBF71', '#2F6BFF', '#FF4FA7', '#FFC628', '#A98BFF', '#7B8494', '#FF7A2F', '#1EC8C8', '#F4EFE6', '#26262A'];
const ACCENTS = ['#F6A5BB', '#FFD3B9', '#FFFFFF', '#141414', '#2684B1', '#FF47DA'];
const BANDANAS = ['#E2231A', '#2684B1', '#FF47DA', '#6366F1', '#141414', '#F5F5F5', '#2FBF71'];

// ------------------------------------------------------------- facet maths
const PHI = (1 + Math.sqrt(5)) / 2;
const nrm = (v: Vec3): Vec3 => normalize(v);
const ICO_RAW: Vec3[] = [];
for (const a of [-1, 1]) for (const b of [-1, 1]) ICO_RAW.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
const PV: Vec3[] = ICO_RAW.map(nrm);
const PF: Vec3[] = [];
{
  const dist = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  for (let i = 0; i < 12; i++)
    for (let j = i + 1; j < 12; j++)
      for (let k = j + 1; k < 12; k++) {
        const [a, b, c] = [ICO_RAW[i], ICO_RAW[j], ICO_RAW[k]];
        if (Math.abs(dist(a, b) - 2) < 1e-6 && Math.abs(dist(b, c) - 2) < 1e-6 && Math.abs(dist(a, c) - 2) < 1e-6)
          PF.push(nrm([a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]]));
      }
}

const facetBall = (p: Vec3, r: Vec3, k: number): number => {
  const u: Vec3 = [p[0] / r[0], p[1] / r[1], p[2] / r[2]];
  let d = -1e5;
  for (const n of PF) d = Math.max(d, u[0] * n[0] + u[1] * n[1] + u[2] * n[2]);
  for (const n of PV) d = Math.max(d, u[0] * n[0] + u[1] * n[1] + u[2] * n[2] - k);
  return (d - 1) * Math.min(r[0], r[1], r[2]);
};
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k * 4 - Math.abs(a - b), 0) / (k * 4);
  return Math.min(a, b) - h * h * k;
};
const bodySDF = (blobs: Blob[], k: number, q: Vec3): number => {
  let d = 1e5;
  for (const b of blobs) {
    if (b[4] < 0.002) continue;
    let x = q[0] - b[0], y = q[1] - b[1], z = q[2] - b[2];
    const cy = Math.cos(b[3]), sy = Math.sin(b[3]);
    [x, z] = [cy * x - sy * z, sy * x + cy * z];
    const cp = Math.cos(b[7]), sp = Math.sin(b[7]);
    [y, z] = [cp * y - sp * z, sp * y + cp * z];
    d = smin(d, facetBall([x, y, z], [b[4], b[5], b[6]], k), 0.012);
  }
  return d;
};
/** march from inside the body along dir until the faceted surface; returns point and facet normal */
const anchor = (blobs: Blob[], k: number, from: Vec3, dir: Vec3): [Vec3, Vec3] => {
  const d = nrm(dir);
  let t = 0;
  for (let i = 0; i < 24; i++) {
    const p: Vec3 = [from[0] + d[0] * t, from[1] + d[1] * t, from[2] + d[2] * t];
    const v = bodySDF(blobs, k, p);
    if (v > -0.0008 || t > 1.4) break;
    t += Math.max(-v, 0.003);
  }
  const p: Vec3 = [from[0] + d[0] * t, from[1] + d[1] * t, from[2] + d[2] * t];
  const e = 0.004;
  const g: Vec3 = [
    bodySDF(blobs, k, [p[0] + e, p[1], p[2]]) - bodySDF(blobs, k, [p[0] - e, p[1], p[2]]),
    bodySDF(blobs, k, [p[0], p[1] + e, p[2]]) - bodySDF(blobs, k, [p[0], p[1] - e, p[2]]),
    bodySDF(blobs, k, [p[0], p[1], p[2] + e]) - bodySDF(blobs, k, [p[0], p[1], p[2] - e]),
  ];
  const n = Math.hypot(...g) > 1e-6 ? nrm(g) : d;
  return [p, n];
};

// ------------------------------------------------------------- face
// eye kinds: 0 bead, 1 diamond, 2 happy arc, 3 closed, 4 wide bead
const EYES: Option[] = [
  { value: 0, label: 'Bead' },
  { value: 1, label: 'Diamond' },
  { value: 2, label: 'Happy' },
  { value: 3, label: 'Closed' },
  { value: 4, label: 'Wide' },
];
const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'listening', label: 'Attentive' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'worried', label: 'Worried' },
  { value: 'excited', label: 'Excited' },
  { value: 'wink', label: 'Wink' },
];

const polyFace = (c: PolyConfig, expr: string): FaceTarget => {
  const e = (kind: number, size = 1, squint = 0): EyeSpec => ({ kind, w: size, h: 1, rot: 0, lid: squint, lidAng: 0, dx: 0, dy: 0 });
  const base = c.eyes;
  const open = base === 2 || base === 3 ? 0 : base;
  const make = (l: EyeSpec, r: EyeSpec, mouth = 0, openM = 0, cheeks = 0): FaceTarget => ({ l, r, lidB: 0, mouth, mouthOpen: openM, cheeks });
  switch (expr) {
    case 'happy':
      return make(e(2), e(2), 0.5, 0, 0.6);
    case 'squeeze':
      return make(e(2, 1.05), e(2, 1.05), 0.7, 0, 1);
    case 'listening':
      return make(e(base, 1.12), e(base, 1.12), 0.1, 0, 0.2);
    case 'surprised':
      return make(e(4, 1.05), e(4, 1.05), 0, 0.6, 0);
    case 'sleepy':
      return make(e(3), e(3), 0, 0, 0);
    case 'worried':
      return make(e(open, 0.85, 0.4), e(open, 0.85, 0.4), -0.5, 0.15, 0);
    case 'excited':
      return make(e(4, 1.1), e(4, 1.1), 0.6, 0.45, 0.8);
    case 'wink':
      return make(e(open), e(2), 0.6, 0, 0.3);
    case 'dizzy':
      return make(e(3), e(3), -0.3, 0.3, 0);
    default:
      return make(e(base), e(base), 0.25, 0, 0);
  }
};

const base = (o: Partial<PolyConfig>): PolyConfig => ({
  name: 'Polydot',
  state: 'idle',
  expression: 'neutral',
  shape: 0,
  color: '#2FBF71',
  accentColor: '#F6A5BB',
  material: 'paper',
  facets: 0.4,
  width: 1,
  eyes: 0,
  eyeSize: 1,
  eyeSpacing: 1,
  eyeHeight: 0,
  nose: true,
  whiskers: true,
  mouth: 0,
  blush: 0.3,
  ears: 1,
  bandana: 1,
  bandanaColor: '#E2231A',
  flag: 0,
  ...o,
});

/** interpolated shape (blobs + layout) for morphs */
const blend = (a: ShapeDef, b: ShapeDef, t: number) => ({
  blobs: a.blobs.map((ba, i) => ba.map((v, j) => lerp(v, b.blobs[i][j], t)) as Blob),
  faceC: a.face[0].map((v, i) => lerp(v, b.face[0][i], t)) as Vec3,
  faceR: a.face[1].map((v, i) => lerp(v, b.face[1][i], t)) as Vec3,
  feetZ: lerp(a.feetZ, b.feetZ, t),
  headY: lerp(a.headY, b.headY, t),
  neckY: lerp(a.neckY, b.neckY, t),
});

export const poly: FamilyDef<PolyConfig> = {
  id: 'poly',
  name: 'Polydots',
  maker: 'Dots × RebelMouse',
  tagline: 'Low-poly facets · Dots silhouettes · mouse ears, tail and bandana',
  subtitle: 'A mash-up: Dots blobs with RebelMouse ears, cut from paper',
  shader,
  anchors: 0,
  background: 'linear-gradient(165deg, #FFFCF5 0%, #F1EADB 60%, #E6DCC8 100%)',
  backgroundSolid: '#F3ECDD',
  dark: false,
  traits: ['Low-poly facets', 'Dots silhouettes', 'Mouse ears & bandana'],
  look: {
    dark: false,
    groundShadow: 0.42,
    exposure: 1.0,
    groundY: 0,
    lights: {
      key: normalize([-0.6, 0.8, 0.5]),
      keyI: 1.35,
      rim: normalize([0.5, 0.4, -0.7]),
      rimI: 0.9,
      fill: normalize([0.8, 0.1, 0.55]),
      fillI: 0.35,
      sky: [0.8, 0.78, 0.74],
      ground: [0.5, 0.45, 0.38],
      warm: [1.0, 0.97, 0.92],
      env: 1.0,
    },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Breathing, tail swishing', bob: [0.006, 0.4], squash: [0.012, 0.4] },
    listening: { label: 'Listening', hint: 'Ears up, leaning in', expr: 'listening', gaze: 'user', lean: 0.08, props: { perk: 1 } },
    thinking: { label: 'Thinking', hint: 'Bits orbit overhead', expr: 'neutral', gaze: 'up', sway: [0.03, 0.3], props: { bits: 1 } },
    working: { label: 'Working', hint: 'Busy bounce', expr: 'neutral', bob: [0.02, 1.7], squash: [0.04, 1.7], gaze: 'down', props: { bits: 0.6, wag: 1 } },
    speaking: { label: 'Speaking', hint: 'Mouth moves with the voice', expr: 'happy', talk: 1, bob: [0.01, 1.1], gaze: 'user' },
    awaiting: { label: 'Awaiting approval', hint: 'Patient sway', expr: 'listening', gaze: 'user', sway: [0.025, 0.35], emote: ['question', 3.2] },
    complete: { label: 'Complete', hint: 'A little celebration', expr: 'excited', enter: 'celebrate', emote: ['check', 4], props: { wag: 1.5 } },
    error: { label: 'Error', hint: 'Shakes it off', expr: 'worried', enter: 'shake', sink: 0.015, emote: ['sweat', 2.6] },
    sleeping: { label: 'Sleeping', hint: 'Dozing, tail curled', expr: 'sleepy', gaze: 'closed', squash: [0.03, 0.22], sink: 0.01, emote: ['zzz', 2.6], props: { curl: 1 } },
  },
  personality: {
    body: [2.2, 0.5, 0.8],
    eyes: [6.0, 0.8, 0.0],
    squash: [260, 8],
    reach: [0.42, 0.26],
    eyeShare: 0.3,
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
      id: 'body',
      title: 'Shape & finish',
      controls: [
        { type: 'icons', key: 'shape', label: 'Shape', options: POLY_SHAPES },
        { type: 'swatches', key: 'color', label: 'Colour', colors: COLORS, custom: true },
        { type: 'swatches', key: 'accentColor', label: 'Ears, nose & tail', colors: ACCENTS, custom: true },
        {
          type: 'chips',
          key: 'material',
          label: 'Finish',
          options: [
            { value: 'paper', label: 'Cut paper' },
            { value: 'gem', label: 'Gem' },
            { value: 'toy', label: 'Vinyl toy' },
          ],
        },
        { type: 'slider', key: 'facets', label: 'Facet size', min: 0, max: 1, step: 0.01 },
        { type: 'slider', key: 'width', label: 'Chubbiness', min: 0.85, max: 1.2, step: 0.01 },
      ],
    },
    {
      id: 'face',
      title: 'Face',
      controls: [
        { type: 'chips', key: 'eyes', label: 'Eyes', options: EYES },
        { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS },
        { type: 'slider', key: 'eyeSize', label: 'Eye size', min: 0.7, max: 1.5, step: 0.01 },
        { type: 'slider', key: 'eyeSpacing', label: 'Eye spacing', min: 0.7, max: 1.4, step: 0.01 },
        { type: 'slider', key: 'eyeHeight', label: 'Eye height', min: -0.15, max: 0.15, step: 0.005 },
        {
          type: 'chips',
          key: 'mouth',
          label: 'Mouth',
          options: [
            { value: 0, label: 'Smile' },
            { value: 1, label: 'None' },
            { value: 2, label: 'Buck teeth' },
          ],
        },
        { type: 'toggle', key: 'nose', label: 'Nose' },
        { type: 'toggle', key: 'whiskers', label: 'Whiskers' },
        { type: 'slider', key: 'blush', label: 'Blush', min: 0, max: 1, step: 0.01 },
      ],
    },
    {
      id: 'gear',
      title: 'Mouse gear',
      controls: [
        { type: 'slider', key: 'ears', label: 'Ear size', min: 0, max: 1.4, step: 0.01 },
        {
          type: 'chips',
          key: 'bandana',
          label: 'Bandana',
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Headband' },
            { value: 2, label: 'Cap' },
            { value: 3, label: 'Neckerchief' },
          ],
        },
        { type: 'swatches', key: 'bandanaColor', label: 'Bandana colour', colors: BANDANAS, custom: true, when: (c) => c.bandana > 0 },
        {
          type: 'chips',
          key: 'flag',
          label: 'Flag',
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Pride' },
            { value: 2, label: 'RebelMouse' },
          ],
          when: (c) => c.bandana > 0,
        },
      ],
    },
  ],
  roster: () => [
    base({ name: 'Dotmouse', shape: 0, color: '#2FBF71', eyes: 0, bandana: 1, flag: 1, mouth: 2 }),
    base({ name: 'Nimbus', shape: 1, color: '#2F6BFF', eyes: 1, bandana: 2, flag: 0, mouth: 0, blush: 0.2 }),
    base({ name: 'Amour', shape: 3, color: '#FF4FA7', accentColor: '#FFD3B9', material: 'gem', eyes: 0, bandana: 3, bandanaColor: '#F5F5F5', flag: 0, whiskers: false }),
    base({ name: 'Pip', shape: 2, color: '#FFC628', material: 'toy', eyes: 1, bandana: 1, bandanaColor: '#6366F1', flag: 0, facets: 0.9 }),
    base({ name: 'Byte', shape: 4, color: '#7B8494', eyes: 0, bandana: 1, flag: 2, facets: 0.25 }),
  ],
  randomize: (c, rnd) => ({
    ...c,
    shape: Math.floor(rnd() * SHAPES.length),
    color: COLORS[Math.floor(rnd() * COLORS.length)],
    accentColor: ACCENTS[Math.floor(rnd() * 3)],
    material: ['paper', 'paper', 'gem', 'toy'][Math.floor(rnd() * 4)],
    facets: rnd(),
    width: 0.9 + rnd() * 0.25,
    eyes: rnd() < 0.6 ? 0 : rnd() < 0.5 ? 1 : 4,
    mouth: Math.floor(rnd() * 3),
    nose: rnd() < 0.8,
    whiskers: rnd() < 0.6,
    blush: rnd() * 0.6,
    ears: 0.7 + rnd() * 0.6,
    bandana: Math.floor(rnd() * 4),
    bandanaColor: BANDANAS[Math.floor(rnd() * BANDANAS.length)],
    flag: rnd() < 0.5 ? 0 : 1 + Math.floor(rnd() * 2),
  }),
  compose: (n, aspect, compact) =>
    groupPhoto(n, aspect, {
      gap: compact ? 1.0 : 1.08,
      charW: 1.25,
      charH: 1.2,
      riser: 0.5,
      depth: 0.8,
      fov: deg(26),
      margin: compact ? 0.08 : 0.15,
      turn: 0.06,
      lift: 0.2,
    }),
  solo: (aspect) => soloCamera(aspect, 1.3, 1.2, deg(26), 0.2),
  headLocal: (c) => {
    const f = SHAPES[c.shape].face;
    return [f[0][0], f[0][1] + f[1][1] * 0.2, f[1][2]];
  },
  bounds: (c) => ({
    c: [0, 0.55, 0],
    r: 0.82 * Math.max(c.width, 1) + 0.1 * c.ears + (c.flag && c.bandana ? 0.3 : 0),
    occ: [[0, 0.45, 0, 0.4]],
  }),
  face: polyFace,
  pack: (c: PolyConfig, pose: Pose, f: CharFrame, face: FaceTarget) => {
    const d = f.data;
    d.fill(0);
    const set = (k: number, a: number, b: number, cc: number, dd: number) => {
      d[k * 4] = a;
      d[k * 4 + 1] = b;
      d[k * 4 + 2] = cc;
      d[k * 4 + 3] = dd;
    };
    const m = pose.morph;
    const ease = m * m * (3 - 2 * m);
    const from = c._from && m < 1 ? clamp(c._from.shape, 0, SHAPES.length - 1) : c.shape;
    const S = blend(SHAPES[from], SHAPES[c.shape], m < 1 ? ease : 1);
    const w = c.width;
    const blobs = S.blobs.map((b) => [b[0] * w, b[1], b[2], b[3], b[4] * w, b[5], b[6] * Math.sqrt(w), b[7]] as Blob);
    blobs.forEach((b, i) => {
      set(2 * i, b[0], b[1], b[2], b[3]);
      set(2 * i + 1, b[4], b[5], b[6], b[7]);
    });
    const k = lerp(0.0, 0.26, c.facets);
    const col = hexToLinear(c.color), acc = hexToLinear(c.accentColor), bc = hexToLinear(c.bandanaColor);
    set(10, col[0], col[1], col[2], Math.max(0, ['paper', 'gem', 'toy'].indexOf(c.material)));
    set(11, acc[0], acc[1], acc[2], k);
    set(12, c.bandana, bc[0], bc[1], bc[2]);

    // anchors on the faceted surface, traced from the face ellipsoid's centre
    const fc: Vec3 = [S.faceC[0] * w, S.faceC[1], S.faceC[2]];
    const fr: Vec3 = [S.faceR[0] * w, S.faceR[1], S.faceR[2]];
    const ex = 0.42 * c.eyeSpacing * fr[0], ey = (0.05 + c.eyeHeight) * fr[1];
    const [eL, nL] = anchor(blobs, k, fc, [-ex, ey, fr[2]]);
    const [eR, nR] = anchor(blobs, k, fc, [ex, ey, fr[2]]);
    const [np, nn] = anchor(blobs, k, fc, [0, ey - 0.4 * fr[1], fr[2]]);
    const earR = 0.125 * c.ears;
    const earDir = (side: number): Vec3 => [side * 0.78 * fr[0], fr[1], -0.15 * fr[2]];
    const [aL] = anchor(blobs, k, fc, earDir(-1));
    const [aR] = anchor(blobs, k, fc, earDir(1));
    const dL = nrm(earDir(-1)), dR = nrm(earDir(1));
    const perk = (pose.props.perk ?? 0) * 0.5 + pose.excite * 0.2;
    const flatten = pose.pokeAmp * 8;
    const twitch = Math.sin(pose.phase * 2.3) > 0.985 ? 0.3 : 0;
    const wiggle = 0.25 * twitch + flatten - 0.15 * perk;
    const [tailRoot] = anchor(blobs, k, [0, 0.32, 0], [0.0, -0.25, -1]);
    const [waist] = anchor(blobs, k, [0, S.neckY, 0], [0, 0, 1]);

    set(13, S.headY, S.neckY, Math.sin(pose.phase * 3.1) * 0.25 + pose.roll * 1.2 + pose.headYaw * 0.8, waist[2] + 0.012);
    set(14, face.l.kind, face.r.kind, c.eyeSize * face.l.w, 0);
    set(15, pose.blink, 0.5 * (face.l.lid + face.r.lid), pose.lookX, pose.lookY);
    const mouthStyle = c.mouth === 1 ? -1 : c.mouth === 2 ? 2 : 0;
    set(16, mouthStyle, Math.max(face.mouthOpen, pose.talk), face.mouth, Math.min(1, c.blush + face.cheeks * 0.4));
    set(17, eL[0], eL[1], eL[2], fc[0]);
    set(18, nL[0], nL[1], nL[2], fc[1]);
    set(19, eR[0], eR[1], eR[2], fc[2]);
    set(20, nR[0], nR[1], nR[2], fr[1]);
    set(21, np[0], np[1], np[2], c.nose ? 1 : 0);
    set(22, nn[0], nn[1], nn[2], c.whiskers ? 1 : 0);
    set(23, aL[0] + dL[0] * earR * 0.6, aL[1] + dL[1] * earR * 0.6, aL[2] + dL[2] * earR * 0.6, c.ears > 0.01 ? earR : 0);
    set(24, aR[0] + dR[0] * earR * 0.6, aR[1] + dR[1] * earR * 0.6, aR[2] + dR[2] * earR * 0.6, wiggle);
    set(25, pose.poke[0], pose.poke[1], pose.poke[2], pose.pokeAmp);
    set(26, pose.wobble * 0.7, pose.wobblePhase, pose.excite, 0);
    set(27, pose.props.bits ?? 0, pose.phase * 2.4, c.bandana > 0 ? c.flag : 0, Math.max(0, c.flag - 1));

    // tail: three beads trailing from the back, swaying with mood
    const wag = pose.props.wag ?? 0;
    const curl = pose.props.curl ?? 0;
    const amp = (0.25 + 0.4 * pose.excite + 0.5 * pose.pet + 0.4 * wag) * (1 - 0.6 * curl);
    const freq = 1.6 + 2.5 * wag + 2.0 * pose.pet;
    let p: Vec3 = [tailRoot[0], tailRoot[1], tailRoot[2] + 0.02];
    let yaw = 0, pitch = -0.4 * (1 - curl) - 0.9 * curl;
    const radii = [0.055, 0.045, 0.035];
    for (let i = 0; i < 3; i++) {
      yaw += amp * Math.sin(pose.phase * freq - i * 0.8) * (0.6 + 0.3 * i) - pose.yaw * 0.1 + curl * 0.9;
      pitch += 0.35 * (1 - curl);
      const len = 0.075 + 0.01 * i;
      p = [p[0] + Math.sin(yaw) * Math.cos(pitch) * len, p[1] + Math.sin(pitch) * len * 0.6, p[2] - Math.cos(yaw) * Math.cos(pitch) * len];
      set(28 + i, p[0], p[1], p[2], radii[i]);
    }
    const hop = Math.max(0, wag - 1) * 0.03;
    set(31, hop * Math.max(0, Math.sin(pose.phase * 7)), hop * Math.max(0, Math.sin(pose.phase * 7 + Math.PI)), pose.phase * 6, S.feetZ);
  },
};
