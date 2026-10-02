import shader from '../shaders/dots.glsl';
import { deg, hexToLinear, lerp, normalize } from '../engine/math';
import type { Pose } from '../avatar/avatar';
import type { CharFrame } from '../engine/renderer';
import type { BaseConfig, EyeSpec, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';

export interface DotsConfig extends BaseConfig {
  shape: number;
  width: number;
  color: string;
  furLength: number;
  fuzz: number;
  eyes: number;
  eyeSize: number;
  eyeSpacing: number;
  eyeHeight: number;
  glasses: number;
  frameColor: string;
  lensColor: string;
  hat: number;
  hatColor: string;
  hatTilt: number;
  neck: number;
  neckColor: string;
  ears: number;
  earColor: string;
  mouth: number;
  blush: number;
  _from?: { shape: number };
}

/** Per-shape facial layout: eye y, eye spacing, top x, neck y, side y, mouth y, front z, top y. */
const SHAPES: Array<{ label: string; icon: string; s: [number, number, number, number, number, number, number, number] }> = [
  { label: 'Bean', icon: 'M9 3c4-1 8 2 7.5 6.5S15 13 16 16.5 14 22 10 21 5 17 6 12 5 4 9 3z', s: [0.66, 0.24, 0.02, 0.3, 0.6, 0.53, 0.3, 0.97] },
  { label: 'Cloud', icon: 'M6.5 19a4.5 4.5 0 0 1-.4-9 5.5 5.5 0 0 1 10.6-1A4.5 4.5 0 0 1 17.5 19z', s: [0.46, 0.27, -0.13, 0.19, 0.42, 0.34, 0.29, 0.93] },
  { label: 'Pear', icon: 'M12 3c1.6 0 2.5 1.2 2.5 3 0 2.5 5.5 5 5.5 9.5a8 6.5 0 0 1-16 0C4 11 9.5 8.5 9.5 6 9.5 4.2 10.4 3 12 3z', s: [0.5, 0.23, 0.0, 0.27, 0.48, 0.4, 0.35, 1.0] },
  { label: 'Heart', icon: 'M12 20.5S3 15 3 8.8A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 9 2.2c0 6.2-9 11.7-9 11.7z', s: [0.6, 0.27, -0.22, 0.3, 0.6, 0.47, 0.24, 0.92] },
  { label: 'Frog', icon: 'M7.5 5a3 3 0 0 1 3 2.2h3A3 3 0 1 1 18 10c2 1.3 3 3.2 3 5 0 3.3-4 5-9 5s-9-1.7-9-5c0-1.8 1-3.7 3-5a3 3 0 0 1 1.5-5z', s: [0.77, 0.56, 0.0, 0.24, 0.42, 0.5, 0.46, 0.94] },
  { label: 'Bunny', icon: 'M9 2.5c1.2 0 1.8 2.5 1.8 6h2.4c0-3.5.6-6 1.8-6s1.5 3 1 7.2A6.5 6.5 0 1 1 8 9.7C7.5 5.5 7.8 2.5 9 2.5z', s: [0.45, 0.22, 0.0, 0.2, 0.4, 0.34, 0.36, 0.74] },
  { label: 'Ring', icon: 'M12 3a9 9 0 1 1 0 18 9 9 0 1 1 0-18zm0 5a4 4 0 1 0 0 8 4 4 0 1 0 0-8z', s: [0.86, 0.16, 0.0, 0.2, 0.52, 0.76, 0.17, 1.03] },
  { label: 'Hexagon', icon: 'M7.5 3.5h9L21 12l-4.5 8.5h-9L3 12z', s: [0.55, 0.26, 0.0, 0.24, 0.5, 0.43, 0.22, 0.94] },
  { label: 'Flower', icon: 'M12 2.5a3.5 3.5 0 0 1 3.3 4.6 3.5 3.5 0 1 1 1.9 6.1 3.5 3.5 0 1 1-5.2 4 3.5 3.5 0 1 1-5.2-4 3.5 3.5 0 1 1 1.9-6.1A3.5 3.5 0 0 1 12 2.5z', s: [0.55, 0.2, 0.0, 0.3, 0.5, 0.45, 0.19, 0.97] },
  { label: 'Pill', icon: 'M12 2.5a6 6 0 0 1 6 6v7a6 6 0 0 1-12 0v-7a6 6 0 0 1 6-6z', s: [0.6, 0.2, 0.0, 0.25, 0.55, 0.5, 0.26, 1.0] },
  { label: 'Rounded square', icon: 'M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5z', s: [0.56, 0.26, 0.0, 0.25, 0.5, 0.44, 0.22, 0.94] },
];

export const DOTS_SHAPES: Option[] = SHAPES.map((s, i) => ({ value: i, label: s.label, icon: s.icon }));
export const DOTS_COLORS = [
  '#2F6BFF', '#8EDB4F', '#FFC628', '#FF4FA7', '#2FBF71', '#A98BFF',
  '#FF7A2F', '#F0443A', '#1EC8C8', '#F4EFE6', '#9A6A43', '#26262A',
];

const EYES: Option[] = [
  { value: 0, label: 'Bead' },
  { value: 1, label: 'Oval' },
  { value: 2, label: 'Diamond' },
  { value: 3, label: 'Googly' },
  { value: 4, label: 'Happy' },
  { value: 5, label: 'Sleepy' },
  { value: 6, label: 'Shiny' },
];

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'listening', label: 'Attentive' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'worried', label: 'Worried' },
  { value: 'squeeze', label: 'Squeeze' },
  { value: 'excited', label: 'Excited' },
];

const dotsFace = (c: DotsConfig, expr: string): FaceTarget => {
  const googly = c.eyes === 3;
  const e = (kind: number, size = 1, squint = 0): EyeSpec => ({ kind, w: size, h: 1, rot: 0, lid: squint, lidAng: 0, dx: 0, dy: 0 });
  const base = c.eyes;
  const make = (l: EyeSpec, mouth = 0, open = 0, cheeks = 0): FaceTarget => ({ l, r: { ...l }, lidB: 0, mouth, mouthOpen: open, cheeks });
  switch (expr) {
    case 'happy':
      return make(googly ? e(3, 1, 0.55) : e(4), 0.4, 0, 0.6);
    case 'squeeze':
      return make(googly ? e(3, 1, 0.9) : e(4, 1.05), 0.6, 0, 1);
    case 'listening':
      return make(e(base, 1.12), 0, 0, 0.2);
    case 'surprised':
      return make(googly ? e(3, 1.15) : e(6, 1.0), 0, 0.5, 0);
    case 'sleepy':
      return make(googly ? e(3, 1, 1) : e(5), 0, 0, 0);
    case 'worried':
      return make(googly ? e(3, 0.95, 0.35) : e(base === 4 || base === 5 ? 0 : base, 0.85, 0.35), -0.4, 0.15, 0);
    case 'excited':
      return make(googly ? e(3, 1.2) : e(6, 1.05), 0.6, 0.35, 0.8);
    case 'dizzy':
      return make(googly ? e(3, 1, 0.7) : e(5), 0, 0.25, 0);
    default:
      return make(e(base));
  }
};

const base = (o: Partial<DotsConfig>): DotsConfig => ({
  name: 'Dot',
  state: 'idle',
  expression: 'neutral',
  shape: 0,
  width: 1,
  color: '#2FBF71',
  furLength: 0.03,
  fuzz: 1,
  eyes: 0,
  eyeSize: 1,
  eyeSpacing: 1,
  eyeHeight: 0,
  glasses: 0,
  frameColor: '#141414',
  lensColor: '#121418',
  hat: 0,
  hatColor: '#1B1B1E',
  hatTilt: -8,
  neck: 0,
  neckColor: '#D6282E',
  ears: 0,
  earColor: '#26262A',
  mouth: 0,
  blush: 0,
  ...o,
});

export const dots: FamilyDef<DotsConfig> = {
  id: 'dots',
  name: 'Dots',
  maker: 'OpenAI',
  tagline: 'Plush-like texture · limited character roster · distinctive forms and accessories',
  shader,
  anchors: 8,
  background: '#050506',
  dark: true,
  traits: ['Plush-like texture', 'Limited character roster', 'Distinctive forms and accessories'],
  look: {
    dark: true,
    groundShadow: 0,
    exposure: 1.0,
    groundY: 0,
    lights: {
      key: normalize([-0.5, 0.7, 0.75]),
      keyI: 1.25,
      rim: normalize([0.35, 0.55, -0.75]),
      rimI: 1.5,
      fill: normalize([0.8, 0.1, 0.55]),
      fillI: 0.28,
      sky: [0.2, 0.21, 0.24],
      ground: [0.05, 0.05, 0.055],
      warm: [1.0, 0.96, 0.9],
      env: 1.0,
    },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Gentle breathing and occasional blinks', bob: [0.006, 0.35], squash: [0.014, 0.35] },
    listening: { label: 'Listening', hint: 'Attentive, leaning in', expr: 'listening', lean: 0.1, gaze: 'user', bob: [0.004, 0.5] },
    thinking: { label: 'Processing', hint: 'Subtle, focused motion', expr: 'neutral', gaze: 'up', sway: [0.04, 0.3], squash: [0.02, 0.6] },
    working: { label: 'Working', hint: 'Restrained activity loop', expr: 'neutral', bob: [0.022, 1.6], squash: [0.04, 1.6], lean: 0.05, gaze: 'down' },
    speaking: { label: 'Speaking', hint: 'Mouth moves with the voice', expr: 'happy', talk: 1, bob: [0.01, 1.1], gaze: 'user' },
    awaiting: { label: 'Awaiting approval', hint: 'Patient, settled pose', expr: 'listening', gaze: 'user', sway: [0.025, 0.35], emote: ['question', 3.2] },
    complete: { label: 'Complete', hint: 'Brief acknowledgement', expr: 'happy', enter: 'celebrate', emote: ['check', 4] },
    error: { label: 'Error', hint: 'Clear change in expression', expr: 'worried', enter: 'shake', sink: 0.015, emote: ['sweat', 2.6] },
  },
  personality: {
    body: [1.5, 0.6, 0.5],
    eyes: [4.2, 0.8, 0.0],
    squash: [230, 9],
    reach: [0.45, 0.3],
    eyeShare: 0.45,
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
      id: 'body',
      title: 'Shape & colour',
      controls: [
        { type: 'icons', key: 'shape', label: 'Shape', options: DOTS_SHAPES },
        { type: 'swatches', key: 'color', label: 'Colour', colors: DOTS_COLORS, custom: true },
        { type: 'slider', key: 'width', label: 'Chubbiness', min: 0.8, max: 1.25, step: 0.01 },
      ],
    },
    {
      id: 'plush',
      title: 'Plush',
      controls: [
        { type: 'slider', key: 'furLength', label: 'Pile length', min: 0.008, max: 0.06, step: 0.001 },
        { type: 'slider', key: 'fuzz', label: 'Fuzz density', min: 0.4, max: 1.6, step: 0.01 },
        { type: 'slider', key: 'blush', label: 'Blush', min: 0, max: 1, step: 0.01 },
      ],
    },
    {
      id: 'face',
      title: 'Face',
      controls: [
        { type: 'chips', key: 'eyes', label: 'Eyes', options: EYES },
        { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS },
        { type: 'slider', key: 'eyeSize', label: 'Eye size', min: 0.6, max: 1.6, step: 0.01 },
        { type: 'slider', key: 'eyeSpacing', label: 'Eye spacing', min: 0.6, max: 1.5, step: 0.01 },
        { type: 'slider', key: 'eyeHeight', label: 'Eye height', min: -0.12, max: 0.12, step: 0.005 },
        {
          type: 'chips',
          key: 'mouth',
          label: 'Mouth',
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Smile' },
            { value: 2, label: 'Open' },
          ],
        },
      ],
    },
    {
      id: 'acc',
      title: 'Accessories',
      controls: [
        {
          type: 'chips',
          key: 'glasses',
          label: 'Glasses',
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Round' },
            { value: 2, label: 'Shades' },
          ],
        },
        {
          type: 'chips',
          key: 'hat',
          label: 'Hat',
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Beret' },
            { value: 2, label: 'Beanie' },
            { value: 3, label: 'Party' },
            { value: 4, label: 'Crown' },
          ],
        },
        { type: 'swatches', key: 'hatColor', label: 'Hat colour', colors: ['#1B1B1E', '#F4EFE6', '#D6282E', '#2F6BFF', '#FFC628', '#FF4FA7', '#2FBF71'], custom: true, when: (c) => c.hat > 0 && c.hat !== 4 },
        { type: 'slider', key: 'hatTilt', label: 'Hat tilt', min: -30, max: 30, step: 1, unit: '°', when: (c) => c.hat > 0 },
        {
          type: 'chips',
          key: 'neck',
          label: 'Neck',
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Bow tie' },
            { value: 2, label: 'Bell' },
          ],
        },
        { type: 'swatches', key: 'neckColor', label: 'Bow tie colour', colors: ['#D6282E', '#141414', '#2F6BFF', '#FF4FA7', '#FFC628', '#F4EFE6'], custom: true, when: (c) => c.neck === 1 },
        {
          type: 'chips',
          key: 'ears',
          label: 'Ears & gear',
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Headphones' },
            { value: 2, label: 'Bunny ears' },
            { value: 3, label: 'Bear ears' },
            { value: 4, label: 'Antenna' },
          ],
        },
        { type: 'swatches', key: 'earColor', label: 'Gear colour', colors: ['#26262A', '#F4EFE6', '#FF4FA7', '#2F6BFF', '#FFC628', '#A98BFF'], custom: true, when: (c) => c.ears > 0 },
      ],
    },
  ],
  roster: () => [
    base({ name: 'Felipe', shape: 1, color: '#2F6BFF', eyes: 1, eyeSize: 0.95, hat: 1, hatColor: '#151517', hatTilt: -10 }),
    base({ name: 'Todd', shape: 4, color: '#8EDB4F', eyes: 3, mouth: 1, blush: 0.0 }),
    base({ name: 'Alfred', shape: 2, color: '#FFC628', eyes: 4, glasses: 1, neck: 1, neckColor: '#D6282E', eyeSize: 1.0 }),
    base({ name: 'Jojo', shape: 3, color: '#FF4FA7', eyes: 0, glasses: 2, eyeSize: 1.0 }),
    base({ name: 'Dottie', shape: 0, color: '#2FBF71', eyes: 2, eyeSize: 1.0, blush: 0.35 }),
    base({ name: 'Bun', shape: 5, color: '#A98BFF', eyes: 0, ears: 1, earColor: '#F4EFE6', blush: 0.5 }),
  ],
  randomize: (c, rnd) => ({
    ...c,
    shape: Math.floor(rnd() * SHAPES.length),
    color: DOTS_COLORS[Math.floor(rnd() * DOTS_COLORS.length)],
    width: 0.9 + rnd() * 0.25,
    eyes: [0, 0, 1, 2, 3, 4, 6][Math.floor(rnd() * 7)],
    eyeSize: 0.85 + rnd() * 0.35,
    glasses: rnd() < 0.35 ? 1 + Math.floor(rnd() * 2) : 0,
    hat: rnd() < 0.45 ? 1 + Math.floor(rnd() * 4) : 0,
    hatColor: ['#1B1B1E', '#F4EFE6', '#D6282E', '#2F6BFF', '#FFC628'][Math.floor(rnd() * 5)],
    neck: rnd() < 0.3 ? 1 + Math.floor(rnd() * 2) : 0,
    ears: rnd() < 0.3 ? 1 + Math.floor(rnd() * 4) : 0,
    mouth: rnd() < 0.3 ? 1 : 0,
    blush: rnd() < 0.5 ? rnd() * 0.7 : 0,
  }),
  compose: (n, aspect, compact) =>
    groupPhoto(n, aspect, {
      gap: compact ? 1.04 : 1.12,
      charW: 1.28,
      charH: 1.16,
      riser: 0.56,
      depth: 0.85,
      fov: deg(26),
      margin: compact ? 0.08 : 0.16,
      turn: 0.06,
      lift: 0.2,
    }),
  solo: (aspect) => soloCamera(aspect, 1.35, 1.15, deg(26), 0.2),
  subtitle: 'OpenAI · always-on agents with plush personas',
  headLocal: (c) => [0, SHAPES[c.shape].s[0], 0.3],
  bounds: (c) => ({ c: [0, 0.55, 0], r: 0.78 * Math.max(c.width, 1) + c.furLength + (c.hat ? 0.12 : 0) + (c.ears ? 0.12 : 0), occ: [[0, 0.45, 0, 0.42]] }),
  face: dotsFace,
  pack: (c: DotsConfig, pose: Pose, f: CharFrame, face: FaceTarget) => {
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
    const from = c._from && m < 1 ? c._from.shape : c.shape;
    set(0, from, c.shape, m < 1 ? ease : 0, c.width);
    const col = hexToLinear(c.color);
    set(1, col[0], col[1], col[2], c.furLength);
    set(2, 1.15 * c.fuzz, 4.6, 0.22, 0.9);
    const eyeKind = face.l.kind;
    set(3, eyeKind, c.eyeSize * face.l.w, c.eyeSpacing, c.eyeHeight);
    set(4, pose.blink, face.l.lid, pose.lookX, pose.lookY);
    const fc = hexToLinear(c.frameColor);
    set(5, c.glasses, fc[0], fc[1], fc[2]);
    set(6, c.hat, deg(c.hatTilt), 1, 0);
    const hc = hexToLinear(c.hatColor);
    set(7, hc[0], hc[1], hc[2], 0);
    const nc = hexToLinear(c.neckColor);
    set(8, c.neck, nc[0], nc[1], nc[2]);
    const ec = hexToLinear(c.earColor);
    set(9, c.ears, ec[0], ec[1], ec[2]);
    set(10, pose.poke[0], pose.poke[1], pose.poke[2], pose.pokeAmp);
    set(11, pose.wobble * 0.8, pose.wobblePhase, pose.excite, 0);
    set(12, c.mouth, 1 + 0.2 * face.mouth, Math.max(face.mouthOpen, pose.talk), 0);
    const blushC = hexToLinear('#FF6F91');
    set(13, Math.min(1, c.blush + face.cheeks * 0.5), blushC[0], blushC[1], blushC[2]);
    const lc = hexToLinear(c.lensColor);
    set(14, lc[0], lc[1], lc[2], 0);
    const A = SHAPES[from].s, B = SHAPES[c.shape].s;
    const t = m < 1 ? ease : 1;
    const s = A.map((v, i) => lerp(v, B[i], t));
    set(15, s[0], s[1], s[2], s[3]);
    set(16, s[4], s[5], s[6], s[7]);
  },
};
