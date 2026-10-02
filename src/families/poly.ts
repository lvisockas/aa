import shader from '../shaders/mesh.frag.glsl';
import { clamp, deg, hexToLinear, lerp, normalize, type Vec3 } from '../engine/math';
import type { Pose } from '../avatar/avatar';
import type { CharFrame } from '../engine/renderer';
import type { BaseConfig, EyeSpec, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';
import { MAT, MeshBuilder, addv, clipPolyhedron, cross, faceHash, mapFaces, polyhedron, scl, type Plane } from '../engine/mesh';
import { DOTS_SHAPES } from './dots';

/**
 * Polydots: a low-poly mash-up of OpenAI's Dots blobs and the RebelMouse mouse.
 * Unlike the other families this one is rasterised: pack() builds the character
 * as flat-shaded triangles every frame. The body is a union of faceted
 * ellipsoids (convex polyhedra cut by an icosahedron's plane set); a CPU
 * distance field of the same polyhedra anchors eyes, nose, ears and tail.
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
  raster: true,
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
    f.data.fill(0);   // mesh family: the shader parameters are unused
    const mb = builderFor(f);
    mb.reset();
    const m = pose.morph;
    const ease = m * m * (3 - 2 * m);
    const from = c._from && m < 1 ? clamp(c._from.shape, 0, SHAPES.length - 1) : c.shape;
    const S = blend(SHAPES[from], SHAPES[c.shape], m < 1 ? ease : 1);
    const w = c.width;
    const blobs = S.blobs.map((b) => [b[0] * w, b[1], b[2], b[3], b[4] * w, b[5], b[6] * Math.sqrt(w), b[7]] as Blob);
    const k = lerp(0.0, 0.26, c.facets);
    const fin = Math.max(0, ['paper', 'gem', 'toy'].indexOf(c.material));
    const amp = [0.18, 0.12, 0.06][fin];
    const tintOf = (salt: number) => (i: number) => 1 - amp / 2 + amp * faceHash(i, salt);
    const col = hexToLinear(c.color), acc = hexToLinear(c.accentColor), bc = hexToLinear(c.bandanaColor);
    const live = blobs.filter((b) => b[4] >= 0.002);

    // ---- body: one faceted ellipsoid per blob (the z-buffer does the union)
    live.forEach((b, bi) => mb.faces(blobFaces(b, k, 0), col, MAT.body, tintOf(bi + 1)));

    // ---- anchors on the faceted surface, traced from the face ellipsoid's centre
    const fc: Vec3 = [S.faceC[0] * w, S.faceC[1], S.faceC[2]];
    const fr: Vec3 = [S.faceR[0] * w, S.faceR[1], S.faceR[2]];
    const ex = 0.42 * c.eyeSpacing * fr[0], ey = (0.05 + c.eyeHeight) * fr[1];
    const [eL, nL] = anchor(blobs, k, fc, [-ex, ey, fr[2]]);
    const [eR, nR] = anchor(blobs, k, fc, [ex, ey, fr[2]]);
    const [np, nn] = anchor(blobs, k, fc, [0, ey - 0.4 * fr[1], fr[2]]);
    const s = c.eyeSize * face.l.w;

    // ---- eyes: octahedral gems that slide across the face with the gaze
    const black: Vec3 = [0.01, 0.01, 0.01], ink: Vec3 = [0.03, 0.025, 0.025];
    ([[eL, nL, face.l.kind], [eR, nR, face.r.kind]] as Array<[Vec3, Vec3, number]>).forEach(([A, n, kind]) => {
      const F = frameOn(n);
      const a = addv(A, addv(scl(F.T, pose.lookX * 0.022 * s), scl(F.B, pose.lookY * 0.016 * s)));
      const at = (x: number, y: number, z: number): Vec3 => addv(a, addv(addv(scl(F.T, x), scl(F.B, y)), scl(n, z)));
      if (kind === 3 || pose.blink > 0.9) {
        const ew = 0.042 * s;
        mb.stroke(at(-ew, 0, 0.004), at(ew, 0, 0.004), n, 0.008 * s, 0.006 * s, ink, MAT.thread);
      } else if (kind === 2) {
        const ew = 0.04 * s;
        arc(mb, (th) => at(ew * Math.sin(th), ew * Math.cos(th) - 0.45 * ew, 0.004), -1.1, 1.1, 6, n, 0.009 * s, ink);
      } else {
        const sy = Math.max(0.12, 1 - 0.8 * pose.blink - 0.45 * 0.5 * (face.l.lid + face.r.lid));
        const r = 0.05 * s * (kind === 4 ? 1.25 : 1);
        if (kind === 1) {
          const R = 1.35 * r;
          octa(mb, (x, y, z) => at(x * R, y * R * sy, 0.004 + (z * R) / 3.2), black, MAT.gem);
        } else {
          octa(mb, (x, y, z) => at(x * r, y * r * sy, 0.3 * r + z * r), black, MAT.gem);
        }
      }
    });

    // ---- nose, whiskers, mouth in the nose anchor's frame
    {
      const F = frameOn(nn);
      const at = (x: number, y: number, z: number): Vec3 => addv(np, addv(addv(scl(F.T, x), scl(F.B, y)), scl(nn, z)));
      if (c.nose) {
        const nc = lerpV(acc, [0.3, 0.05, 0.1], 0.35);
        const R = 0.04 * s;
        octa(mb, (x, y, z) => at(x * R, y * R, 0.012 + z * R), nc, MAT.nose);
      }
      if (c.whiskers) {
        for (const side of [-1, 1])
          for (let wi = 0; wi < 3; wi++) {
            const fw = wi - 1;
            mb.stroke(at(side * 0.035, 0.004 + fw * 0.013, 0.008), at(side * 0.2, -0.004 + fw * 0.036, 0), nn, 0.0034, 0.0034, ink, MAT.thread);
          }
      }
      const open = Math.max(face.mouthOpen, pose.talk);
      const my = -0.058 * s;
      if (open > 0.05) {
        const S0 = 0.03 * s * (0.6 + 0.6 * open);
        octa(mb, (x, y, z) => at(x * S0, my + y * S0 * (0.6 + open), -0.002 + (z * S0) / 2), [0.2, 0.03, 0.05], MAT.mouth);
      } else if (c.mouth !== 1) {
        const r2 = 0.03 * s * (1 + 0.3 * Math.abs(face.mouth));
        const sg = face.mouth + 1e-3 >= 0 ? 1 : -1;
        arc(mb, (th) => at(r2 * Math.sin(th), my + sg * r2 * (0.7 - Math.cos(th)), -0.002), -0.75, 0.75, 5, nn, 0.0055 * s, ink);
      }
      if (c.mouth === 2) {
        for (const side of [-1, 1]) box(mb, at(side * 0.011 * s, my - 0.016 * s, 0.002), [0.0095 * s, 0.015 * s, 0.005 * s], F.T, F.B, nn, [0.97, 0.96, 0.92], MAT.teeth);
      }
    }

    // ---- ears: faceted discs with an inset panel
    if (c.ears > 0.01) {
      const earR = 0.125 * c.ears;
      const perk = (pose.props.perk ?? 0) * 0.5 + pose.excite * 0.2;
      const flatten = pose.pokeAmp * 8;
      const twitch = Math.sin(pose.phase * 2.3) > 0.985 ? 0.3 : 0;
      const wiggle = 0.25 * twitch + flatten - 0.15 * perk;
      for (const side of [-1, 1]) {
        const dir: Vec3 = [side * 0.78 * fr[0], fr[1], -0.15 * fr[2]];
        const [a] = anchor(blobs, k, fc, dir);
        const cen = addv(a, scl(nrm(dir), earR * 0.6));
        const wig = side * wiggle * (side < 0 ? 1 : 0.7);
        const toChar = (p2: Vec3): Vec3 => {
          let [x, y, z] = p2;
          [x, z] = rot(x, z, -side * 0.4);
          [x, y] = rot(x, y, -wig);
          return [cen[0] + x, cen[1] + y, cen[2] + z];
        };
        mb.faces(mapFaces(unitFaces(0.08), (u) => toChar([u[0] * earR, u[1] * earR, u[2] * earR * 0.26])), col, MAT.finish, tintOf(10 + side));
        mb.faces(mapFaces(unitFaces(0.08), (u) => toChar([u[0] * earR * 0.68, u[1] * earR * 0.68, u[2] * earR * 0.26 + earR * 0.1])), acc, MAT.finish, tintOf(20 + side));
      }
    }

    // ---- bandana: the body grown by a few millimetres, clipped to a band, with knot, ribbons, flag
    if (c.bandana > 0) {
      const bs = c.bandana;
      const [waist] = anchor(blobs, k, [0, S.neckY, 0], [0, 0, 1]);
      const cuts: Plane[] =
        bs === 1 ? [{ n: [0, 1, 0], d: S.headY + 0.03 }, { n: [0, -1, 0], d: -(S.headY - 0.03) }]
        : bs === 2 ? [{ n: [0, -1, 0], d: -(S.headY - 0.02) }]
        : [{ n: [0, 1, 0], d: S.neckY + 0.036 }, { n: [0, -1, 0], d: -(S.neckY - 0.036) }];
      live.forEach((b, bi) => {
        let fs = blobFaces(b, k, 0.014);
        for (const pl of cuts) fs = clipPolyhedron(fs, pl);
        if (fs.length) mb.faces(fs, bc, MAT.finish, tintOf(30 + bi));
      });
      const A0 = blobs[0];
      const kp: Vec3 = bs === 3 ? [0.04, S.neckY - 0.01, waist[2] + 0.012] : [A0[0] + A0[4] * 0.5, S.headY, A0[2] - A0[6] * 0.86];
      mb.faces(mapFaces(unitFaces(0.1), (u) => [kp[0] + u[0] * 0.045, kp[1] + u[1] * 0.036, kp[2] + u[2] * 0.036]), bc, MAT.finish, tintOf(40));
      const sway = Math.sin(pose.phase * 3.1) * 0.25 + pose.roll * 1.2 + pose.headYaw * 0.8;
      for (let ri = 0; ri < 2; ri++) {
        const sw = sway * (1 + 0.5 * ri) + 0.3 * ri;
        const dir = nrm([0.5 - 0.3 * ri, -0.8, (bs === 3 ? 0.3 : -0.4) + 0.15 * sw]);
        const L = 0.14 + 0.03 * ri;
        const wd = nrm(cross(dir, [0, 0, 1]));
        const tn = cross(dir, wd);
        const base = addv(kp, scl(dir, L * 0.5));
        mb.faces(
          mapFaces(unitFaces(0.2), (u) => {
            let x = u[0] * 0.026, z = u[2] * 0.007;
            [x, z] = rot(x, z, -sw * 0.5);
            const y = u[1] * L * 0.5;
            return addv(base, addv(addv(scl(wd, x), scl(dir, y)), scl(tn, z)));
          }),
          bc,
          MAT.finish,
          tintOf(50 + ri),
        );
      }
      if (c.flag > 0) {
        const dir = nrm([0.12, 1, -0.08]);
        const top = addv(kp, scl(dir, 0.52));
        mb.stroke(addv(kp, scl(dir, -0.04)), top, [0, 0, 1], 0.008, 0.008, [0.86, 0.87, 0.9], MAT.metal);
        const tip = addv(top, scl(dir, 0.012));
        octa(mb, (x, y, z) => [tip[0] + x * 0.018, tip[1] + y * 0.018, tip[2] + z * 0.018], [0.86, 0.87, 0.9], MAT.metal);
        flagCloth(mb, top, pose.phase * 6, c.flag === 2);
      }
    }

    // ---- tail beads, feet, thinking bits
    const tail = tailBeads(blobs, k, pose);
    tail.forEach(([p, r], ti) => mb.faces(mapFaces(unitFaces(0.26), (u) => [p[0] + u[0] * r, p[1] + u[1] * r, p[2] + u[2] * r]), acc, MAT.finish, tintOf(60 + ti)));
    const wag = pose.props.wag ?? 0;
    const hop = Math.max(0, wag - 1) * 0.03;
    for (const side of [-1, 1]) {
      const lift = hop * Math.max(0, Math.sin(pose.phase * 7 + (side > 0 ? Math.PI : 0)));
      const fp: Vec3 = [0.14 * side, 0.045 + lift, S.feetZ];
      mb.faces(mapFaces(unitFaces(0.1), (u) => [fp[0] + u[0] * 0.07, fp[1] + u[1] * 0.042, fp[2] + u[2] * 0.085]), acc, MAT.finish, tintOf(70 + side));
    }
    const bits = pose.props.bits ?? 0;
    if (bits > 0.02) {
      for (let bi = 0; bi < 3; bi++) {
        const an = pose.phase * 2.4 + bi * 2.094;
        const p: Vec3 = [fc[0] + Math.cos(an) * 0.16, fc[1] + fr[1] + 0.16 + 0.03 * Math.sin(an * 2 + bi), fc[2] + Math.sin(an) * 0.16];
        const R = (0.03 + 0.008 * bi) * bits;
        octa(mb, (x, y, z) => [p[0] + x * R, p[1] + y * R, p[2] + z * R], [1, 0.72, 0.2], MAT.gold);
      }
    }

    f.mesh = {
      data: mb.data,
      count: mb.count,
      wob: [pose.wobble * 0.7, pose.wobblePhase],
      poke: [pose.poke[0], pose.poke[1], pose.poke[2], pose.pokeAmp],
      finish: fin,
      blush: Math.min(1, c.blush + face.cheeks * 0.4),
      cheeks: [addv(eL, [-0.045, -0.06, 0]), addv(eR, [0.045, -0.06, 0])],
    };
  },
};

// ------------------------------------------------------------- mesh helpers
const builders = new WeakMap<CharFrame, MeshBuilder>();
const builderFor = (f: CharFrame): MeshBuilder => {
  let b = builders.get(f);
  if (!b) builders.set(f, (b = new MeshBuilder()));
  return b;
};

/** unit faceted ellipsoid (inradius 1) for a cap lift k, cached */
const unitCache = new Map<number, Vec3[][]>();
const unitFaces = (k: number): Vec3[][] => {
  const key = Math.round(k * 1000) / 1000;
  let fs = unitCache.get(key);
  if (!fs) {
    fs = polyhedron([...PF.map((n) => ({ n, d: 1 })), ...PV.map((n) => ({ n, d: 1 + key }))]);
    if (unitCache.size > 64) unitCache.clear();
    unitCache.set(key, fs);
  }
  return fs;
};

const rot = (x: number, y: number, a: number): [number, number] => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c * x - s * y, s * x + c * y];
};
const lerpV = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** a blob's faces in character space (inverse of the shader's blobSpace), grown by off */
const blobFaces = (b: Blob, k: number, off: number): Vec3[][] =>
  mapFaces(unitFaces(k), (u) => {
    let x = u[0] * (b[4] + off), y = u[1] * (b[5] + off), z = u[2] * (b[6] + off);
    [y, z] = rot(y, z, -b[7]);
    [x, z] = rot(x, z, -b[3]);
    return [b[0] + x, b[1] + y, b[2] + z];
  });

const frameOn = (n: Vec3) => {
  const T = nrm(cross([0, 1, 0], n));
  return { T, B: cross(n, T) };
};

/** octahedron through a mapping of its six unit vertices */
const OCT: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const octa = (mb: MeshBuilder, at: (x: number, y: number, z: number) => Vec3, col: Vec3, mat: number) => {
  const v = OCT.map((p) => at(p[0], p[1], p[2]));
  for (const x of [0, 1]) for (const y of [2, 3]) for (const z of [4, 5]) mb.tri(v[x], v[y], v[z], col, mat);
};

const box = (mb: MeshBuilder, c: Vec3, h: Vec3, T: Vec3, B: Vec3, N: Vec3, col: Vec3, mat: number) => {
  const p = (sx: number, sy: number, sz: number) => addv(c, addv(addv(scl(T, sx * h[0]), scl(B, sy * h[1])), scl(N, sz * h[2])));
  const q = [p(-1, -1, -1), p(1, -1, -1), p(1, 1, -1), p(-1, 1, -1), p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)];
  for (const f of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]]) mb.poly(f.map((i) => q[i]), col, mat);
};

/** low-poly arc of stroke segments */
const arc = (mb: MeshBuilder, at: (th: number) => Vec3, a0: number, a1: number, n: number, up: Vec3, w: number, col: Vec3) => {
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    mb.stroke(at(t0), at(t1 + (t1 - t0) * 0.15), up, w, w * 0.7, col, MAT.thread);
  }
};

const PRIDE: Vec3[] = [[0.89, 0.02, 0.02], [1, 0.35, 0], [1, 0.85, 0], [0, 0.5, 0.15], [0, 0.2, 0.75], [0.45, 0.05, 0.55]];
/** paper flag: 6 rows (one per pride band) with zig-zag folds that travel along the cloth */
const flagCloth = (mb: MeshBuilder, top: Vec3, phase: number, brand: boolean) => {
  const NU = 16, NV = 6, W = 0.3, H = 0.19;
  const P = (iu: number, iv: number): Vec3 => {
    const u = (iu / NU) * W, v = (iv / NV) * H, uu = u / W;
    const sm = Math.min(1, uu / 0.3), ss = sm * sm * (3 - 2 * sm);
    const fr = uu * 2.5 - phase * 0.25;
    const fold = 0.022 * (Math.abs(fr - Math.floor(fr) - 0.5) * 2 - 0.5) * ss;
    return [top[0] + u, top[1] - v, top[2] - fold];
  };
  for (let iv = 0; iv < NV; iv++)
    for (let iu = 0; iu < NU; iu++) {
      const q = [P(iu, iv), P(iu + 1, iv), P(iu + 1, iv + 1), P(iu, iv + 1)];
      if (brand) {
        const uv = (a: number, b: number) => [a / NU, 1 - b / NV] as const;
        const corners: Array<[Vec3, readonly [number, number]]> = [[q[0], uv(iu, iv)], [q[1], uv(iu + 1, iv)], [q[2], uv(iu + 1, iv + 1)], [q[3], uv(iu, iv + 1)]];
        for (const [i0, i1, i2] of [[0, 1, 2], [0, 2, 3]]) for (const i of [i0, i1, i2]) mb.vert(corners[i][0], [1, 1, 1], MAT.brandFlag, corners[i][1][0], corners[i][1][1]);
      } else {
        const t = 0.94 + 0.12 * faceHash(iu + iv * NU, 7);
        const cc = PRIDE[iv];
        mb.poly(q, [cc[0] * t, cc[1] * t, cc[2] * t], MAT.cloth);
      }
    }
};

/** tail: three beads trailing from the back, swaying with mood */
const tailBeads = (blobs: Blob[], k: number, pose: Pose): Array<[Vec3, number]> => {
  const [root] = anchor(blobs, k, [0, 0.32, 0], [0.0, -0.25, -1]);
  const wag = pose.props.wag ?? 0;
  const curl = pose.props.curl ?? 0;
  const amp = (0.25 + 0.4 * pose.excite + 0.5 * pose.pet + 0.4 * wag) * (1 - 0.6 * curl);
  const freq = 1.6 + 2.5 * wag + 2.0 * pose.pet;
  let p: Vec3 = [root[0], root[1], root[2] + 0.02];
  let yaw = 0, pitch = -0.4 * (1 - curl) - 0.9 * curl;
  const radii = [0.055, 0.045, 0.035];
  const out: Array<[Vec3, number]> = [];
  for (let i = 0; i < 3; i++) {
    yaw += amp * Math.sin(pose.phase * freq - i * 0.8) * (0.6 + 0.3 * i) - pose.yaw * 0.1 + curl * 0.9;
    pitch += 0.35 * (1 - curl);
    const len = 0.075 + 0.01 * i;
    p = [p[0] + Math.sin(yaw) * Math.cos(pitch) * len, p[1] + Math.sin(pitch) * len * 0.6, p[2] - Math.cos(yaw) * Math.cos(pitch) * len];
    out.push([p, radii[i]]);
  }
  return out;
};
