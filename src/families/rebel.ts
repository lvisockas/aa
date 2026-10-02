import shader from '../shaders/rebel.glsl';
import { clamp, deg, hexToLinear, normalize, quatEuler, type Vec3 } from '../engine/math';
import type { Pose } from '../avatar/avatar';
import type { CharFrame } from '../engine/renderer';
import type { BaseConfig, EyeSpec, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';
import { solveArm } from './limbs';

export interface RebelConfig extends BaseConfig {
  species: number;
  material: string;
  bodyColor: string;
  lightColor: string;
  darkColor: string;
  accentColor: string;
  furLength: number;
  chub: number;
  headSize: number;
  earSize: number;
  tailSize: number;
  eyes: number;
  eyeSize: number;
  eyeSpacing: number;
  pupils: number;
  attitude: number;
  mouth: number;
  whiskers: boolean;
  blush: number;
  bandana: number;
  bandanaColor: string;
  prop: number;
  flag: number;
  glasses: number;
}

const SPECIES_OPTS: Option[] = [
  { value: 0, label: 'Mouse' },
  { value: 1, label: 'Panda' },
  { value: 2, label: 'Raccoon' },
  { value: 3, label: 'Fox' },
];

/** Species palettes: body, light (muzzle/belly), dark (markings), accent (ears/nose/paws). */
const SPECIES: Record<number, Partial<RebelConfig>> = {
  0: { bodyColor: '#5E6573', lightColor: '#D7DBE2', darkColor: '#2B2F37', accentColor: '#F59DB4', whiskers: true },
  1: { bodyColor: '#F6F5F1', lightColor: '#FFFFFF', darkColor: '#1D1D21', accentColor: '#F59DB4', whiskers: false },
  2: { bodyColor: '#8D939D', lightColor: '#EEECE7', darkColor: '#26282D', accentColor: '#E9A5B2', whiskers: true },
  3: { bodyColor: '#F07A2B', lightColor: '#FFF5E8', darkColor: '#2A1C17', accentColor: '#FFD3B9', whiskers: true },
};

/** the mascot's signature red first, then blues and pinks in the spirit of the RebelMouse site */
export const BANDANA_COLORS = ['#E2231A', '#2684B1', '#FF47DA', '#6366F1', '#141414', '#F5F5F5', '#2FBF71'];

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Confident' },
  { value: 'rebel', label: 'Rebel' },
  { value: 'happy', label: 'Happy' },
  { value: 'laugh', label: 'Laughing' },
  { value: 'wow', label: 'Wow' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'curious', label: 'Curious' },
  { value: 'thinking', label: 'Thinking' },
  { value: 'focused', label: 'Focused' },
  { value: 'shout', label: 'Shouting' },
  { value: 'sad', label: 'Sad' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'wink', label: 'Wink' },
];

// eye kinds understood by the shader: 0 open, 1 happy arc, 2 closed line, 3 wide
const rebelFace = (c: RebelConfig, expr: string): FaceTarget => {
  const att = c.attitude;
  // EyeSpec fields reused as: rot = brow angle (+ angry), dy = brow raise, lid = upper lid, dx = pupil scale
  const e = (kind: number, brow: number, raise: number, lid = 0, pupil = 1): EyeSpec => ({ kind, w: 1, h: 1, rot: brow, lid, lidAng: 0, dx: pupil, dy: raise });
  const face = (l: EyeSpec, r: EyeSpec, mouth: number, open = 0, lidB = 0, cheeks = 0): FaceTarget => ({ l, r, lidB, mouth, mouthOpen: open, cheeks });
  const open = c.eyes;
  const b0 = -0.02 + att * 0.34;
  const r0 = 0.12 - att * 0.22;
  switch (expr) {
    case 'rebel':
      return face(e(open, 0.55, -0.2, 0.3, 0.92), e(open, 0.5, -0.1, 0.28, 0.92), 0.75);
    case 'happy':
      return face(e(open, -0.1, 0.35), e(open, -0.1, 0.35), 1, 0.35, 0.42, 0.5);
    case 'laugh':
      return face(e(1, -0.15, 0.45), e(1, -0.15, 0.45), 1, 0.8, 0, 0.6);
    case 'wow':
      return face(e(3, -0.25, 0.9, 0, 0.85), e(3, -0.25, 0.9, 0, 0.85), 0.9, 0.65, 0, 0.4);
    case 'surprised':
      return face(e(3, -0.25, 1.0, 0, 0.8), e(3, -0.25, 1.0, 0, 0.8), 0.0, 0.55);
    case 'curious':
      return face(e(open, -0.12, 0.65, 0, 1.08), e(open, 0.25, 0.1, 0.08, 1.08), 0.3);
    case 'thinking':
      return face(e(open, 0.35, 0.0, 0.15), e(open, -0.2, 0.7, 0.1), 0.05);
    case 'focused':
      return face(e(open, 0.35, -0.1, 0.35), e(open, 0.35, -0.1, 0.35), 0.2);
    case 'shout':
      return face(e(3, 0.55, -0.2, 0, 0.8), e(3, 0.55, -0.2, 0, 0.8), 0.3, 1.0);
    case 'sad':
      return face(e(open, -0.5, 0.4, 0.2), e(open, -0.5, 0.4, 0.2), -0.7);
    case 'sleepy':
      return face(e(2, 0.0, 0.0), e(2, 0.0, 0.0), 0.15);
    case 'wink':
      return face(e(open, 0.1, 0.25), e(1, 0.0, 0.3), 0.85, 0.15, 0, 0.3);
    case 'dizzy':
      return face(e(2, -0.3, 0.3), e(2, 0.3, 0.3), -0.3, 0.25);
    default:
      return face(e(open, b0, r0, att * 0.18), e(open, b0, r0, att * 0.18), 0.45 + att * 0.25);
  }
};

const base = (o: Partial<RebelConfig>): RebelConfig => ({
  name: 'Rebel',
  state: 'idle',
  expression: 'neutral',
  species: 0,
  material: 'vinyl',
  bodyColor: '#5E6573',
  lightColor: '#D7DBE2',
  darkColor: '#2B2F37',
  accentColor: '#F59DB4',
  furLength: 0.03,
  chub: 1,
  headSize: 1,
  earSize: 1,
  tailSize: 1,
  eyes: 0,
  eyeSize: 1,
  eyeSpacing: 1,
  pupils: 1,
  attitude: 0.45,
  mouth: 0,
  whiskers: true,
  blush: 0.35,
  bandana: 1,
  bandanaColor: '#E2231A',
  prop: 0,
  flag: 0,
  glasses: 0,
  ...o,
});

const withSpecies = (sp: number, o: Partial<RebelConfig>) => base({ species: sp, ...SPECIES[sp], ...o });

interface TailParams {
  lens: [number, number, number];
  radii: [number, number, number, number];
  pitch0: number;
  curl: [number, number, number];
}
const TAILS: TailParams[] = [
  { lens: [0.13, 0.13, 0.12], radii: [0.015, 0.012, 0.009, 0.006], pitch0: -0.3, curl: [0.75, 0.85, 1.0] },
  { lens: [0.004, 0.004, 0.004], radii: [0.055, 0.05, 0.04, 0.03], pitch0: 0, curl: [0, 0, 0] },
  { lens: [0.12, 0.13, 0.11], radii: [0.045, 0.074, 0.07, 0.042], pitch0: 0.3, curl: [0.32, 0.3, 0.26] },
  { lens: [0.13, 0.14, 0.13], radii: [0.045, 0.09, 0.086, 0.026], pitch0: 0.22, curl: [0.36, 0.34, 0.3] },
];

/** Tail as a 3-segment chain: a travelling wave sways it, `curl` wraps it round for naps. */
const tailChain = (c: RebelConfig, pose: Pose): Array<[Vec3, number]> => {
  const T = TAILS[clamp(c.species, 0, 3)];
  const s = c.tailSize;
  const wag = pose.props.wag ?? 0;
  const curl = pose.props.curl ?? 0;
  const amp = (0.16 + 0.32 * pose.excite + 0.45 * pose.pet + 0.32 * wag) * (1 - 0.7 * curl);
  const freq = 1.5 + 2.6 * wag + 2.2 * pose.pet;
  const out: Array<[Vec3, number]> = [];
  let p: Vec3 = [0, 0.15, -0.165 * c.chub];
  let pitch = T.pitch0 * (1 - curl) - 0.2 * curl;
  let yaw = 0;
  out.push([p, T.radii[0] * s]);
  for (let i = 0; i < 3; i++) {
    pitch += T.curl[i] * (1 - 0.75 * curl);
    yaw += amp * Math.sin(pose.phase * freq - i * 0.75) * (0.55 + 0.25 * i) - pose.yaw * 0.12 + curl * 0.75;
    const len = T.lens[i] * s;
    const dir: Vec3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    p = [p[0] + dir[0] * len, p[1] + dir[1] * len, p[2] + dir[2] * len];
    out.push([p, T.radii[i + 1] * s]);
  }
  return out;
};

/** short ear twitches at irregular intervals */
const twitch = (phase: number, k: number) => {
  const T = 2.7 + k * 1.35;
  const f = ((phase + k * 1.13) % T) / T;
  return f < 0.07 ? Math.sin((f / 0.07) * Math.PI) : 0;
};

export const rebel: FamilyDef<RebelConfig> = {
  id: 'rebel',
  name: 'Rebels',
  maker: 'RebelMouse',
  tagline: 'Iconic red bandana · simple, playful silhouettes · expressive brows & tails',
  subtitle: 'RebelMouse · the mouse and friends, with attitude',
  shader,
  anchors: 0,
  background: 'radial-gradient(120% 95% at 28% 0%, #4f86e6 0%, #2684b1 50%, #17557c 100%)',
  backgroundSolid: '#2684B1',
  dark: true,
  traits: ['Iconic red bandana', 'Simple, playful silhouettes', 'Expressive brows & tails'],
  look: {
    dark: false,
    groundShadow: 0.36,
    exposure: 1.0,
    groundY: 0,
    lights: {
      key: normalize([-0.5, 0.75, 0.7]),
      keyI: 1.15,
      rim: normalize([0.45, 0.5, -0.75]),
      rimI: 1.1,
      fill: normalize([0.75, 0.12, 0.6]),
      fillI: 0.32,
      sky: [0.42, 0.5, 0.64],
      ground: [0.18, 0.24, 0.32],
      warm: [1.0, 0.96, 0.9],
      env: 1.0,
    },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Tail swishing, ears twitching', bob: [0.006, 0.4], sway: [0.02, 0.35] },
    listening: { label: 'Listening', hint: 'Ears perk up, head tilts', expr: 'curious', gaze: 'user', lean: 0.07, props: { perk: 1 } },
    planning: { label: 'Planning', hint: 'Chin in hand, eyes up', expr: 'thinking', arms: 'think', gaze: 'up', sway: [0.02, 0.3], props: { stow: 1 } },
    creating: { label: 'Creating', hint: 'Typing away on the laptop', expr: 'focused', arms: 'type', gaze: 'down', props: { laptop: 1, stow: 1 }, bob: [0.006, 2.2] },
    optimizing: { label: 'Optimizing', hint: 'Gears spinning, quick moves', expr: 'rebel', props: { gears: 1, wag: 1 }, bob: [0.02, 2.4], squash: [0.03, 2.4] },
    publishing: { label: 'Publishing', hint: 'Flag up, shouting it out', expr: 'shout', arms: 'rally', gaze: 'user', enter: 'hop', emote: ['bang', 2.2], props: { wag: 1, shout: 1 } },
    growing: { label: 'Growing', hint: 'Celebrates the win', expr: 'laugh', arms: 'cheer', enter: 'celebrate', bob: [0.03, 1.8], emote: ['sparkle', 2.0], props: { wag: 1.5 } },
    sleeping: { label: 'Sleeping', hint: 'Tail curled, dozing', expr: 'sleepy', gaze: 'closed', squash: [0.03, 0.22], sink: 0.01, emote: ['zzz', 2.6], props: { curl: 1 } },
  },
  personality: {
    body: [1.8, 0.55, 0.9],
    eyes: [5.5, 0.75, 0.0],
    squash: [240, 9],
    reach: [0.3, 0.18],
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
      id: 'character',
      title: 'Character',
      controls: [
        { type: 'chips', key: 'species', label: 'Animal', options: SPECIES_OPTS },
        {
          type: 'chips',
          key: 'material',
          label: 'Finish',
          options: [
            { value: 'vinyl', label: 'Vinyl toy' },
            { value: 'plush', label: 'Plush' },
            { value: 'flat', label: 'Flat logo' },
          ],
        },
        { type: 'slider', key: 'furLength', label: 'Fur length', min: 0.012, max: 0.07, step: 0.001, when: (c) => c.material === 'plush' },
        { type: 'slider', key: 'attitude', label: 'Rebel attitude', min: 0, max: 1, step: 0.01 },
      ],
    },
    {
      id: 'colors',
      title: 'Colours',
      controls: [
        { type: 'swatches', key: 'bodyColor', label: 'Body', colors: ['#5E6573', '#8D939D', '#F6F5F1', '#F07A2B', '#9A6A43', '#26262A', '#6366F1'], custom: true },
        { type: 'swatches', key: 'lightColor', label: 'Muzzle & belly', colors: ['#D7DBE2', '#FFFFFF', '#EEECE7', '#FFF5E8', '#F9D9C9'], custom: true },
        { type: 'swatches', key: 'darkColor', label: 'Markings', colors: ['#2B2F37', '#1D1D21', '#26282D', '#2A1C17', '#4B2E83'], custom: true },
        { type: 'swatches', key: 'accentColor', label: 'Ears, nose & paws', colors: ['#F59DB4', '#E9A5B2', '#FFD3B9', '#FF47DA', '#2684B1'], custom: true },
      ],
    },
    {
      id: 'shape',
      title: 'Proportions',
      collapsed: true,
      controls: [
        { type: 'slider', key: 'chub', label: 'Chubbiness', min: 0.85, max: 1.25, step: 0.01 },
        { type: 'slider', key: 'headSize', label: 'Head size', min: 0.85, max: 1.2, step: 0.01 },
        { type: 'slider', key: 'earSize', label: 'Ear size', min: 0.7, max: 1.35, step: 0.01 },
        { type: 'slider', key: 'tailSize', label: 'Tail size', min: 0.5, max: 1.5, step: 0.01 },
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
            { value: 0, label: 'Open' },
            { value: 1, label: 'Happy' },
            { value: 2, label: 'Closed' },
            { value: 3, label: 'Wide' },
          ],
        },
        { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS },
        { type: 'slider', key: 'eyeSize', label: 'Eye size', min: 0.75, max: 1.4, step: 0.01 },
        { type: 'slider', key: 'eyeSpacing', label: 'Eye spacing', min: 0.8, max: 1.3, step: 0.01 },
        { type: 'slider', key: 'pupils', label: 'Pupil size', min: 0.6, max: 1.5, step: 0.01 },
        {
          type: 'chips',
          key: 'mouth',
          label: 'Mouth',
          options: [
            { value: 0, label: 'Smile' },
            { value: 1, label: 'Smirk' },
            { value: 2, label: 'Open' },
            { value: 3, label: 'Buck teeth' },
          ],
        },
        { type: 'toggle', key: 'whiskers', label: 'Whiskers' },
        { type: 'slider', key: 'blush', label: 'Blush', min: 0, max: 1, step: 0.01 },
      ],
    },
    {
      id: 'gear',
      title: 'Gear',
      controls: [
        {
          type: 'chips',
          key: 'bandana',
          label: 'Bandana',
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Headband' },
            { value: 2, label: 'Bandana cap' },
            { value: 3, label: 'Neckerchief' },
          ],
        },
        { type: 'swatches', key: 'bandanaColor', label: 'Bandana colour', colors: BANDANA_COLORS, custom: true, when: (c) => c.bandana > 0 },
        {
          type: 'chips',
          key: 'prop',
          label: 'Holding',
          options: [
            { value: 0, label: 'Nothing' },
            { value: 1, label: 'Flag' },
            { value: 2, label: 'Megaphone' },
            { value: 3, label: 'Newspaper' },
            { value: 4, label: 'Pencil' },
          ],
        },
        {
          type: 'chips',
          key: 'flag',
          label: 'Flag',
          options: [
            { value: 0, label: 'Pride' },
            { value: 1, label: 'RebelMouse' },
          ],
          when: (c) => c.prop === 1,
        },
        {
          type: 'chips',
          key: 'glasses',
          label: 'Glasses',
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Shades' },
            { value: 2, label: 'Round' },
          ],
        },
      ],
    },
  ],
  roster: () => [
    withSpecies(0, { name: 'Rebel', bandana: 1, prop: 1, flag: 0, mouth: 3, attitude: 0.45 }),
    withSpecies(1, { name: 'Bamboo', bandana: 3, prop: 3, glasses: 2, mouth: 0, attitude: 0.05, blush: 0.45 }),
    withSpecies(2, { name: 'Bandit', bandana: 2, prop: 2, mouth: 1, attitude: 0.75 }),
    withSpecies(3, { name: 'Scout', bandana: 1, prop: 4, mouth: 0, attitude: 0.4 }),
  ],
  onChange: (c, key, value) => (key === 'species' ? { ...c, ...SPECIES[Number(value)], species: Number(value) } : null),
  armPose: (c, id) => (id === 'rally' && c.prop === 2 ? 'aim' : id),
  randomize: (c, rnd) => {
    const sp = Math.floor(rnd() * 4);
    return {
      ...c,
      ...SPECIES[sp],
      species: sp,
      material: ['vinyl', 'vinyl', 'plush', 'flat'][Math.floor(rnd() * 4)],
      attitude: rnd(),
      chub: 0.9 + rnd() * 0.25,
      earSize: 0.85 + rnd() * 0.35,
      tailSize: 0.8 + rnd() * 0.5,
      eyes: rnd() < 0.8 ? 0 : 3,
      mouth: Math.floor(rnd() * 4),
      bandana: Math.floor(rnd() * 4),
      bandanaColor: BANDANA_COLORS[Math.floor(rnd() * BANDANA_COLORS.length)],
      prop: Math.floor(rnd() * 5),
      flag: rnd() < 0.5 ? 0 : 1,
      glasses: rnd() < 0.25 ? 1 + Math.floor(rnd() * 2) : 0,
      blush: rnd() * 0.7,
    };
  },
  compose: (n, aspect, compact) =>
    groupPhoto(n, aspect, {
      gap: compact ? 0.8 : 0.86,
      charW: 0.95,
      charH: 1.32,
      riser: 0.42,
      depth: 0.7,
      fov: deg(24),
      margin: compact ? 0.06 : 0.12,
      turn: 0.09,
      lift: 0.26,
    }),
  solo: (aspect) => soloCamera(aspect, 1.0, 1.3, deg(24), 0.26),
  headLocal: (c) => [0, 0.45 + 0.215 * c.headSize, 0.25],
  bounds: (c) => ({
    c: [0, 0.62, -0.05],
    r: 0.92 + (c.prop === 1 ? 0.28 : 0.06) + (c.material === 'plush' ? c.furLength : 0) + 0.12 * (c.tailSize - 1),
    occ: [
      [0, 0.265, 0, 0.21 * c.chub],
      [0, 0.45 + 0.215 * c.headSize, 0, 0.27 * c.headSize],
    ],
  }),
  face: rebelFace,
  pack: (c: RebelConfig, pose: Pose, f: CharFrame, face: FaceTarget) => {
    const d = f.data;
    d.fill(0);
    const set = (k: number, a: number, b: number, cc: number, dd: number) => {
      d[k * 4] = a;
      d[k * 4 + 1] = b;
      d[k * 4 + 2] = cc;
      d[k * 4 + 3] = dd;
    };
    const lin = hexToLinear;
    const mat = Math.max(0, ['vinyl', 'plush', 'flat'].indexOf(c.material));
    const bc = lin(c.bodyColor), lc = lin(c.lightColor), dc = lin(c.darkColor), ac = lin(c.accentColor);
    set(0, bc[0], bc[1], bc[2], c.furLength);
    set(1, lc[0], lc[1], lc[2], mat);
    set(2, dc[0], dc[1], dc[2], c.species);
    set(3, c.chub, c.headSize, c.earSize, c.tailSize);
    const hq = quatEuler(pose.headYaw, pose.headPitch, pose.headRoll);
    set(4, hq[0], hq[1], hq[2], hq[3]);
    set(5, face.l.kind, c.eyeSize * face.l.w, c.eyeSpacing, 0);
    set(6, pose.blink, 0.5 * (face.l.lid + face.r.lid), pose.lookX, pose.lookY);
    set(7, face.l.rot, face.r.rot, face.l.dy + 0.25 * pose.excite, face.r.dy + 0.25 * pose.excite);
    set(8, c.mouth, Math.max(face.mouthOpen, pose.talk), face.mouth, face.lidB);
    const rig = { shoulder: [0.175 * c.chub, 0.37, 0] as Vec3, upper: 0.11, fore: 0.1, heldUp: c.prop === 1 };
    const [lS, lE, lH] = solveArm(-1, pose.arms, pose.phase, rig);
    const [rS, rE, rH] = solveArm(1, pose.arms, pose.phase, rig);
    set(9, lS[0], lS[1], lS[2], 0.056);
    set(10, lE[0], lE[1], lE[2], 0.05);
    set(11, lH[0], lH[1], lH[2], 0.058);
    set(12, rS[0], rS[1], rS[2], 0.056);
    set(13, rE[0], rE[1], rE[2], 0.05);
    set(14, rH[0], rH[1], rH[2], 0.058);
    tailChain(c, pose).forEach(([p, r], i) => set(15 + i, p[0], p[1], p[2], r));
    const nc = lin(c.bandanaColor);
    set(19, c.bandana, nc[0], nc[1], nc[2]);
    const ribbon = Math.sin(pose.phase * 3.1) * 0.25 + pose.roll * 1.2 + pose.headYaw * 0.8;
    set(20, 0, ribbon, c.pupils * face.l.dx, c.whiskers ? 1 : 0);
    set(21, c.prop, c.flag, pose.phase * 6, pose.props.stow ?? 0);
    const gc = lin('#141414');
    set(22, c.glasses, gc[0], gc[1], gc[2]);
    const perk = (pose.props.perk ?? 0) * 0.6 + pose.excite * 0.25;
    const flatten = pose.pokeAmp * 9;
    set(23, 0.28 * twitch(pose.phase, 0) + flatten - 0.12 * perk, 0.28 * twitch(pose.phase, 1) + flatten - 0.12 * perk, perk, 0);
    set(24, pose.poke[0], pose.poke[1], pose.poke[2], pose.pokeAmp);
    set(25, pose.wobble * 0.6, pose.wobblePhase, pose.excite, Math.min(1, c.blush + face.cheeks * 0.4));
    set(26, pose.props.laptop ?? 0, pose.props.gears ?? 0, pose.phase * 2.2, c.prop === 2 ? (pose.props.shout ?? 0) : 0);
    set(27, ac[0], ac[1], ac[2], 0);
    const hop = Math.max(0, (pose.props.wag ?? 0) - 1) * 0.03;
    set(28, hop * Math.max(0, Math.sin(pose.phase * 7)), hop * Math.max(0, Math.sin(pose.phase * 7 + Math.PI)), 0, 0);
    set(29, face.r.kind, 0, 0, 0);
  },
};
