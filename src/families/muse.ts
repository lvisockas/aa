import shader from '../shaders/muse.glsl';
import { add, deg, hexToLinear, normalize, quatEuler, scale, type Vec3 } from '../engine/math';
import type { ArmPose, Pose } from '../avatar/avatar';
import type { CharFrame } from '../engine/renderer';
import type { BaseConfig, EyeSpec, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';

export interface MuseConfig extends BaseConfig {
  species: number;
  furColor: string;
  furLength: number;
  fluff: number;
  chub: number;
  headSize: number;
  ears: number;
  earInner: string;
  eyes: number;
  eyeSize: number;
  eyeSpacing: number;
  eyeHeight: number;
  mouth: number;
  blush: number;
  hair: number;
  hairColor: string;
  hat: number;
  hatColor: string;
  eyewear: number;
  frameColor: string;
  top: number;
  topColor: string;
  accent: string;
  number: number;
  neck: number;
  neckColor: string;
  belt: boolean;
  boots: boolean;
  held: number;
}

export const MUSE_FUR = ['#F2E6D3', '#FFFFFF', '#F6D6C8', '#E9C9A0', '#C9A27E', '#9BA0A8', '#9B7BEA', '#7FB7E8', '#F7B2C4', '#B8D98D', '#6E5A4B', '#3A3A40'];

const SPECIES: Option[] = [
  { value: 0, label: 'Jolly' },
  { value: 1, label: 'Bunny' },
  { value: 2, label: 'Bird' },
  { value: 3, label: 'Yeti' },
];

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Content' },
  { value: 'laugh', label: 'Laughing' },
  { value: 'blissful', label: 'Blissful' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'excited', label: 'Excited' },
  { value: 'talk', label: 'Chatty' },
];

const museFace = (c: MuseConfig, expr: string): FaceTarget => {
  const e = (kind: number, w = 1, squint = 0): EyeSpec => ({ kind, w, h: 1, rot: 0, lid: squint, lidAng: 0, dx: 0, dy: 0 });
  const make = (l: EyeSpec, mouth: number, open: number, cheeks: number): FaceTarget => ({ l, r: { ...l }, lidB: 0, mouth, mouthOpen: open, cheeks });
  const base = c.eyes;
  switch (expr) {
    case 'laugh':
      return make(e(1), 1, 0.7, 0.5);
    case 'blissful':
      return make(e(1), 1, 0.15, 0.6);
    case 'surprised':
      return make(e(3, 1.05), 0, 0.55, 0);
    case 'sleepy':
      return make(e(2), 0.2, 0, 0);
    case 'excited':
      return make(e(3, 1.1), 1, 0.6, 0.5);
    case 'dizzy':
      return make(e(2), -0.2, 0.3, 0);
    case 'talk':
      return make(e(base), 0.6, 0.35, 0.2);
    default:
      return make(e(base), 0.6, c.mouth === 1 ? 0.45 : 0, 0);
  }
};

const base = (o: Partial<MuseConfig>): MuseConfig => ({
  name: 'Jolly',
  state: 'idle',
  expression: 'neutral',
  species: 0,
  furColor: '#F2E6D3',
  furLength: 0.032,
  fluff: 1,
  chub: 1,
  headSize: 1,
  ears: 0,
  earInner: '#F7A8B8',
  eyes: 0,
  eyeSize: 1,
  eyeSpacing: 1,
  eyeHeight: 0,
  mouth: 0,
  blush: 0.85,
  hair: 0,
  hairColor: '#2F6BFF',
  hat: 0,
  hatColor: '#8B5A2B',
  eyewear: 0,
  frameColor: '#141414',
  top: 0,
  topColor: '#7A4A22',
  accent: '#FFFFFF',
  number: 7,
  neck: 0,
  neckColor: '#C8102E',
  belt: false,
  boots: false,
  held: 0,
  ...o,
});

const SPECIES_DEFAULTS: Record<number, Partial<MuseConfig>> = {
  0: { ears: 0, furLength: 0.032 },
  1: { ears: 1, furLength: 0.03 },
  2: { ears: 0, furLength: 0.022, hair: 2 },
  3: { ears: 0, furLength: 0.085 },
};

/** Two-segment arm from shoulder angles (local space, metres ~ character units). */
const solveArm = (side: number, chub: number, a: ArmPose, phase: number, held: number): [Vec3, Vec3, Vec3] => {
  const raise = side < 0 ? a.lRaise : a.rRaise;
  const fwd = side < 0 ? a.lFwd : a.rFwd;
  let bend = side < 0 ? a.lBend : a.rBend;
  const S: Vec3 = [side * 0.19 * chub, 0.385, 0.0];
  // upper arm: rotate "down" outward by raise, then forward by fwd
  let u: Vec3 = [side * Math.sin(raise), -Math.cos(raise), 0];
  const cf = Math.cos(-fwd), sf = Math.sin(-fwd);
  u = [u[0], u[1] * cf - u[2] * sf, u[1] * sf + u[2] * cf];
  u = normalize(u);
  const E = add(S, scale(u, 0.12));
  // forearm bends towards the front (or swings side to side when waving)
  const waveOsc = side > 0 ? a.wave * Math.sin(phase * 9) * 0.55 : a.wave * Math.sin(phase * 9 + 1.3) * 0.25;
  const tap = a.tap * Math.max(0, Math.sin(phase * 14 + (side > 0 ? 0 : Math.PI))) * 0.25;
  bend += tap;
  const fwdDir: Vec3 = [side * waveOsc * 1.4, 0.35, 1];
  const perp = normalize(add(fwdDir, scale(u, -(fwdDir[0] * u[0] + fwdDir[1] * u[1] + fwdDir[2] * u[2]))));
  let f = normalize(add(scale(u, Math.cos(bend)), scale(perp, Math.sin(bend))));
  if (held === 1 && side > 0) f = normalize(add(f, [0, 0.2, 0.1]));
  const H = add(E, scale(f, 0.105));
  return [S, E, H];
};

export const muse: FamilyDef<MuseConfig> = {
  id: 'muse',
  name: 'Muse',
  maker: 'Meta',
  tagline: 'Cross-cultural friendliness · highly detailed rendering · extensive customization',
  shader,
  anchors: 0,
  background: '#FAF9F7',
  dark: false,
  traits: ['Cross-cultural friendliness', 'Highly detailed rendering', 'Extensive customization options'],
  look: {
    dark: false,
    groundShadow: 0.26,
    exposure: 1.0,
    groundY: 0,
    lights: {
      key: normalize([-0.5, 0.72, 0.7]),
      keyI: 1.05,
      rim: normalize([0.45, 0.5, -0.75]),
      rimI: 0.75,
      fill: normalize([0.75, 0.15, 0.6]),
      fillI: 0.3,
      sky: [0.46, 0.47, 0.5],
      ground: [0.26, 0.25, 0.24],
      warm: [1.0, 0.96, 0.9],
      env: 0.9,
    },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Breathing, blinking, gently swaying', sway: [0.025, 0.3], bob: [0.006, 0.35] },
    waving: { label: 'Waving', hint: 'Says hello', expr: 'blissful', arms: 'wave', sway: [0.03, 0.5], gaze: 'user' },
    listening: { label: 'Listening', hint: 'Head tilt, attentive', expr: 'neutral', gaze: 'user', lean: 0.06, sway: [0.015, 0.25] },
    working: { label: 'Working', hint: 'Tapping away at a keyboard', expr: 'neutral', arms: 'type', gaze: 'down', props: { keyboard: 1 }, bob: [0.006, 2.2] },
    speaking: { label: 'Speaking', hint: 'Animated mouth, small gestures', expr: 'talk', talk: 1, arms: 'rest', gaze: 'user', sway: [0.02, 0.6] },
    thinking: { label: 'Thinking', hint: 'Hand to chin, eyes up', expr: 'neutral', arms: 'think', gaze: 'up', sway: [0.015, 0.3] },
    celebrating: { label: 'Celebrating', hint: 'Arms up, little hops', expr: 'excited', arms: 'cheer', enter: 'celebrate', bob: [0.03, 1.8], emote: ['sparkle', 2.2] },
    sleeping: { label: 'Sleeping', hint: 'Dozing off', expr: 'sleepy', gaze: 'closed', squash: [0.03, 0.22], sink: 0.01, emote: ['zzz', 2.6] },
  },
  personality: {
    body: [1.1, 0.7, 0.25],
    eyes: [3.6, 0.8, 0.0],
    squash: [190, 10],
    reach: [0.22, 0.12],
    eyeShare: 0.35,
    hopGravity: 10,
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
      title: 'Body & fur',
      controls: [
        { type: 'chips', key: 'species', label: 'Character', options: SPECIES },
        { type: 'swatches', key: 'furColor', label: 'Fur colour', colors: MUSE_FUR, custom: true },
        { type: 'slider', key: 'furLength', label: 'Fur length', min: 0.012, max: 0.11, step: 0.001 },
        { type: 'slider', key: 'fluff', label: 'Fluffiness', min: 0.5, max: 1.6, step: 0.01 },
        { type: 'slider', key: 'chub', label: 'Chubbiness', min: 0.85, max: 1.25, step: 0.01 },
        { type: 'slider', key: 'headSize', label: 'Head size', min: 0.85, max: 1.2, step: 0.01 },
        {
          type: 'chips',
          key: 'ears',
          label: 'Ears',
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Bunny' },
            { value: 2, label: 'Bear' },
            { value: 3, label: 'Cat' },
          ],
        },
      ],
    },
    {
      id: 'face',
      title: 'Face',
      controls: [
        {
          type: 'chips',
          key: 'eyes',
          label: 'Eyes',
          options: [
            { value: 0, label: 'Beady' },
            { value: 1, label: 'Smiling' },
            { value: 2, label: 'Closed' },
            { value: 3, label: 'Big' },
          ],
        },
        { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS },
        { type: 'slider', key: 'eyeSize', label: 'Eye size', min: 0.7, max: 1.5, step: 0.01 },
        { type: 'slider', key: 'eyeSpacing', label: 'Eye spacing', min: 0.75, max: 1.35, step: 0.01 },
        { type: 'slider', key: 'eyeHeight', label: 'Eye height', min: -0.08, max: 0.08, step: 0.002 },
        {
          type: 'chips',
          key: 'mouth',
          label: 'Mouth',
          options: [
            { value: 0, label: 'Smile' },
            { value: 1, label: 'Open' },
            { value: 2, label: '“o”' },
          ],
        },
        { type: 'slider', key: 'blush', label: 'Blush', min: 0, max: 1, step: 0.01 },
      ],
    },
    {
      id: 'style',
      title: 'Outfit',
      controls: [
        {
          type: 'chips',
          key: 'top',
          label: 'Top',
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Vest' },
            { value: 2, label: 'Leather jacket' },
            { value: 3, label: 'Lab coat' },
            { value: 4, label: 'Jersey' },
          ],
        },
        { type: 'swatches', key: 'topColor', label: 'Top colour', colors: ['#7A4A22', '#141414', '#F7F7F5', '#5B3FA0', '#C8102E', '#2F6BFF', '#2FBF71'], custom: true, when: (c) => c.top > 0 },
        { type: 'slider', key: 'number', label: 'Jersey number', min: 0, max: 9, step: 1, when: (c) => c.top === 4 },
        {
          type: 'chips',
          key: 'hat',
          label: 'Hat',
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Cowboy' },
            { value: 2, label: 'Cap' },
            { value: 3, label: 'Bow' },
            { value: 4, label: 'Crown' },
          ],
        },
        { type: 'swatches', key: 'hatColor', label: 'Hat colour', colors: ['#8B5A2B', '#5B3FA0', '#FF8FB1', '#141414', '#C8102E', '#2F6BFF'], custom: true, when: (c) => c.hat > 0 && c.hat !== 4 },
        {
          type: 'chips',
          key: 'hair',
          label: 'Hair',
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Mohawk' },
            { value: 2, label: 'Tuft' },
          ],
        },
        { type: 'swatches', key: 'hairColor', label: 'Hair colour', colors: ['#2F6BFF', '#FF4FA7', '#2FBF71', '#FFC628', '#141414', '#9BA0A8'], custom: true, when: (c) => c.hair > 0 },
        {
          type: 'chips',
          key: 'eyewear',
          label: 'Eyewear',
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Goggles' },
            { value: 2, label: 'Shades' },
            { value: 3, label: 'Round' },
          ],
        },
        {
          type: 'chips',
          key: 'neck',
          label: 'Neck',
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Bandana' },
            { value: 2, label: 'Bow tie' },
          ],
        },
        { type: 'swatches', key: 'neckColor', label: 'Neck colour', colors: ['#C8102E', '#2F6BFF', '#141414', '#FF8FB1', '#FFC628'], custom: true, when: (c) => c.neck > 0 },
        { type: 'toggle', key: 'belt', label: 'Belt & buckle' },
        { type: 'toggle', key: 'boots', label: 'Boots' },
        {
          type: 'chips',
          key: 'held',
          label: 'Holding',
          options: [
            { value: 0, label: 'Nothing' },
            { value: 1, label: 'Bat' },
            { value: 2, label: 'Test tube' },
            { value: 3, label: 'Mug' },
          ],
        },
      ],
    },
  ],
  roster: () => [
    base({ name: 'Punk', hair: 1, hairColor: '#2F6BFF', top: 2, topColor: '#141414', state: 'idle' }),
    base({ name: 'Pidge', species: 2, furColor: '#A3A8B0', furLength: 0.022, hair: 2, hairColor: '#A3A8B0', blush: 0.9 }),
    base({ name: 'Tex', hat: 1, hatColor: '#8B5A2B', neck: 1, neckColor: '#C8102E', top: 1, topColor: '#7A4A22', belt: true, boots: true, state: 'waving' }),
    base({ name: 'Yeti', species: 3, furColor: '#F7F7F5', furLength: 0.085, hat: 3, hatColor: '#FF8FB1', blush: 0.7, eyes: 0 }),
    base({ name: 'Dr. Hops', species: 1, ears: 1, furColor: '#9B7BEA', furLength: 0.03, eyewear: 1, top: 3, topColor: '#F7F7F5', held: 2, state: 'idle' }),
    base({ name: 'Slugger', hat: 2, hatColor: '#5B3FA0', top: 4, topColor: '#5B3FA0', accent: '#FFFFFF', number: 7, held: 1, mouth: 1 }),
    base({ name: 'Jolly', state: 'waving' }),
  ],
  randomize: (c, rnd) => {
    const species = Math.floor(rnd() * 4);
    return {
      ...c,
      ...SPECIES_DEFAULTS[species],
      species,
      furColor: MUSE_FUR[Math.floor(rnd() * MUSE_FUR.length)],
      chub: 0.9 + rnd() * 0.25,
      eyes: rnd() < 0.75 ? 0 : 3,
      mouth: Math.floor(rnd() * 3),
      blush: 0.4 + rnd() * 0.6,
      hair: rnd() < 0.25 ? 1 + Math.floor(rnd() * 2) : 0,
      hat: rnd() < 0.5 ? Math.floor(rnd() * 5) : 0,
      eyewear: rnd() < 0.3 ? 1 + Math.floor(rnd() * 3) : 0,
      top: rnd() < 0.6 ? 1 + Math.floor(rnd() * 4) : 0,
      topColor: ['#7A4A22', '#141414', '#F7F7F5', '#5B3FA0', '#C8102E', '#2F6BFF'][Math.floor(rnd() * 6)],
      neck: rnd() < 0.3 ? 1 + Math.floor(rnd() * 2) : 0,
      held: rnd() < 0.35 ? 1 + Math.floor(rnd() * 3) : 0,
      belt: rnd() < 0.25,
      boots: rnd() < 0.25,
    };
  },
  compose: (n, aspect, compact) =>
    groupPhoto(n, aspect, {
      gap: compact ? 0.7 : 0.76,
      charW: 0.8,
      charH: 1.12,
      riser: 0.46,
      depth: 0.7,
      fov: deg(24),
      margin: compact ? 0.06 : 0.12,
      turn: 0.1,
      lift: 0.32,
    }),
  solo: (aspect) => soloCamera(aspect, 0.85, 1.1, deg(24), 0.32),
  subtitle: 'Meta · Jolly and friends, dressed any way you like',
  headLocal: (c) => [0, 0.47 + 0.21 * c.headSize, 0.22],
  bounds: (c) => ({
    c: [0, 0.56, 0],
    r: 0.74 + c.furLength + (c.hat ? 0.1 : 0) + (c.ears === 1 ? 0.14 : 0) + (c.hair === 1 ? 0.08 : 0),
    occ: [
      [0, 0.29, 0, 0.23 * c.chub],
      [0, 0.47 + 0.21 * c.headSize, 0, 0.26 * c.headSize],
    ],
  }),
  face: museFace,
  pack: (c: MuseConfig, pose: Pose, f: CharFrame, face: FaceTarget) => {
    const d = f.data;
    d.fill(0);
    const set = (k: number, a: number, b: number, cc: number, dd: number) => {
      d[k * 4] = a;
      d[k * 4 + 1] = b;
      d[k * 4 + 2] = cc;
      d[k * 4 + 3] = dd;
    };
    const lin = hexToLinear;
    const fc = lin(c.furColor);
    set(0, fc[0], fc[1], fc[2], c.furLength);
    const longFur = c.furLength > 0.06;
    set(1, (longFur ? 1.35 : 1.1) * c.fluff, longFur ? 2.4 : 5.2, longFur ? 0.75 : 0.16, longFur ? 0.05 : 0.004);
    set(2, c.chub, c.headSize, c.species, c.ears);
    const hq = quatEuler(pose.headYaw, pose.headPitch, pose.headRoll);
    set(3, hq[0], hq[1], hq[2], hq[3]);
    set(4, face.l.kind, c.eyeSize * face.l.w, c.eyeSpacing, c.eyeHeight);
    set(5, pose.blink, face.l.lid, pose.lookX, pose.lookY);
    set(6, c.mouth, Math.max(face.mouthOpen, pose.talk), face.mouth, 0);
    const bc = lin('#FF8FA3');
    set(7, Math.min(1, c.blush + face.cheeks * 0.3), bc[0], bc[1], bc[2]);
    const [lS, lE, lH] = solveArm(-1, c.chub, pose.arms, pose.phase, c.held);
    const [rS, rE, rH] = solveArm(1, c.chub, pose.arms, pose.phase, c.held);
    set(8, lS[0], lS[1], lS[2], 0.064);
    set(9, lE[0], lE[1], lE[2], 0.057);
    set(10, lH[0], lH[1], lH[2], 0.066);
    set(11, rS[0], rS[1], rS[2], 0.064);
    set(12, rE[0], rE[1], rE[2], 0.057);
    set(13, rH[0], rH[1], rH[2], 0.066);
    const step = (pose.props.keyboard ?? 0) > 0.5 ? 0 : Math.max(0, pose.arms.wave > 0.5 ? 0 : 0);
    set(14, -0.12 * c.chub, 0.12 * c.chub, step, 0);
    const tc = lin(c.topColor);
    set(15, c.top, tc[0], tc[1], tc[2]);
    const hc = lin(c.hatColor);
    set(16, c.hat, hc[0], hc[1], hc[2]);
    const ec = lin(c.frameColor);
    set(17, c.eyewear, ec[0], ec[1], ec[2]);
    const hr = lin(c.hairColor);
    set(18, c.hair, hr[0], hr[1], hr[2]);
    const nc = lin(c.neckColor);
    set(19, c.neck, nc[0], nc[1], nc[2]);
    set(20, c.belt ? 1 : 0, c.boots ? 1 : 0, c.number, 0);
    set(21, c.held, 0, 0, 0);
    const ac = lin(c.accent);
    set(22, ac[0], ac[1], ac[2], 0);
    set(23, pose.poke[0], pose.poke[1], pose.poke[2], pose.pokeAmp);
    set(24, pose.wobble * 0.6, pose.wobblePhase, pose.excite, 0);
    const ei = lin(c.earInner);
    set(25, ei[0], ei[1], ei[2], 0);
    set(26, pose.props.keyboard ?? 0, Math.floor(pose.phase * 9), 0, 0);
  },
};

export const applySpecies = (c: MuseConfig, species: number): MuseConfig => ({ ...c, ...SPECIES_DEFAULTS[species], species });
