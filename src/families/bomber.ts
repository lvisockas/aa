import shader from '../shaders/bomber.glsl';
import { clamp, deg, hexToLinear, normalize, quatEuler, type Vec3 } from '../engine/math';
import type { Avatar, Pose } from '../avatar/avatar';
import type { CharFrame } from '../engine/renderer';
import type { BaseConfig, EyeSpec, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';
import { solveArm } from './limbs';

/**
 * Bombers: chunky, glossy toy "bomb heroes". A big round helmet with a face
 * window and a springy antenna ball, a compact suit with a belt, round mittens
 * and big boots, and a classic round bomb with a sparking fuse.
 */
export interface BomberConfig extends BaseConfig {
  /** helmet colour (named bodyColor so the roster chips show it) */
  bodyColor: string;
  suitColor: string;
  gearColor: string;
  ballColor: string;
  antenna: number;
  window: number;
  eyes: number;
  accessory: number;
  accColor: string;
  bomb: number;
}

export const HELMET_COLORS = ['#F7F7F4', '#26262E', '#F0453A', '#FF8DBE', '#4CC46E', '#FFD23F', '#3D7BF0', '#9B6BFF'];
export const SUIT_COLORS = ['#2F6FE8', '#3B3650', '#F7F3EA', '#E8344A', '#FFC93C', '#2DB37A', '#8E5BEF', '#FF8A2B'];
export const GEAR_COLORS = ['#FF5FA8', '#FFC93C', '#F7F7F4', '#3D7BF0', '#FF8A2B', '#E8344A', '#2DB37A', '#26262E'];
export const BALL_COLORS = ['#FF3FA4', '#FFC93C', '#FF3B3B', '#3DD6F5', '#7CE35A', '#F7F7F4', '#9B6BFF'];
export const ACC_COLORS = ['#E8344A', '#FFC93C', '#3D7BF0', '#2DB37A', '#FF5FA8', '#F7F7F4', '#26262E'];

const ANTENNAS: Option[] = [
  { value: 0, label: 'Ball' },
  { value: 1, label: 'Star' },
  { value: 2, label: 'Heart' },
  { value: 4, label: 'Double' },
  { value: 3, label: 'None' },
];
const WINDOWS: Option[] = [
  { value: 0, label: 'Oval' },
  { value: 1, label: 'Wide' },
  { value: 2, label: 'Tall' },
];
const EYE_STYLES: Option[] = [
  { value: 0, label: 'Classic' },
  { value: 1, label: 'Round' },
  { value: 2, label: 'Sleepy' },
  { value: 3, label: 'Determined' },
];
const ACCESSORIES: Option[] = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Scarf' },
  { value: 2, label: 'Cape' },
  { value: 3, label: 'Headband' },
  { value: 4, label: 'Goggles' },
  { value: 5, label: 'Crown' },
];
const BOMBS: Option[] = [
  { value: 0, label: 'Classic' },
  { value: 1, label: 'Star mark' },
  { value: 2, label: 'Cherry twin' },
];

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Ready' },
  { value: 'happy', label: 'Happy' },
  { value: 'laugh', label: 'Laughing' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'curious', label: 'Curious' },
  { value: 'focused', label: 'Focused' },
  { value: 'determined', label: 'Determined' },
  { value: 'angry', label: 'Angry' },
  { value: 'shout', label: 'Shouting' },
  { value: 'sad', label: 'Sad' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'wink', label: 'Wink' },
  { value: 'love', label: 'Love' },
  { value: 'starstruck', label: 'Star eyes' },
  { value: 'dizzy', label: 'Dizzy' },
];

// eye kinds understood by the shader
const PILL = 0, OVAL = 1, ARC = 2, LINE = 3, X = 4, CHEVRON = 5, HEART = 6, STAR = 7;

const eye = (kind: number, w: number, h: number, o: Partial<EyeSpec> = {}): EyeSpec => ({
  kind, w, h, rot: 0, lid: 0, lidAng: 0, dx: 0, dy: 0, ...o,
});
const face2 = (l: EyeSpec, r: EyeSpec = { ...l }, o: Partial<FaceTarget> = {}): FaceTarget => ({
  l, r, lidB: 0, mouth: 0, mouthOpen: 0, cheeks: 0.35, ...o,
});

const bomberFace = (c: BomberConfig, expr: string): FaceTarget => {
  // the "resting" eye depends on the chosen eye style
  const style = c.eyes;
  const base = (o: Partial<EyeSpec> = {}): EyeSpec => {
    if (style === 1) return eye(OVAL, 0.058, 0.066, o);
    if (style === 2) return eye(PILL, 0.05, 0.095, { lid: 0.42, ...o });
    if (style === 3) return eye(PILL, 0.05, 0.096, { lid: 0.3, lidAng: 0.45, ...o });
    return eye(PILL, 0.048, 0.1, o);
  };
  const mirror = (e: EyeSpec): EyeSpec => ({ ...e, lidAng: -e.lidAng, rot: -e.rot });
  switch (expr) {
    case 'happy':
      return face2(eye(ARC, 0.024, 0.075, { dy: 0.008 }), undefined, { cheeks: 0.8, mouth: 1 });
    case 'laugh':
    case 'squeeze':
      return face2(eye(CHEVRON, 0.022, 0.07), eye(CHEVRON, 0.022, 0.07, { rot: Math.PI }), { cheeks: 0.9, mouth: 1, mouthOpen: 0.75 });
    case 'surprised':
      return face2(eye(OVAL, 0.066, 0.1, { dy: 0.006 }), undefined, { mouthOpen: 0.55, cheeks: 0.2 });
    case 'listening':
      return face2(base({ h: (style === 1 ? 0.07 : 0.104), lid: style === 2 ? 0.3 : 0, lidAng: 0, dy: 0.004 }), undefined, { cheeks: 0.45 });
    case 'curious':
      return face2(base({ lid: 0 }), base({ h: style === 1 ? 0.058 : 0.084, lid: 0.18, lidAng: -0.3, dy: -0.004 }), { cheeks: 0.3 });
    case 'focused':
      return face2(base({ lid: 0.34, lidAng: 0 }), undefined, { cheeks: 0.25 });
    case 'determined': {
      const e = base({ lid: 0.36, lidAng: 0.5 });
      return face2(e, mirror(e), { cheeks: 0.25 });
    }
    case 'angry': {
      const e = base({ lid: 0.5, lidAng: 0.7 });
      return face2(e, mirror(e), { cheeks: 0.1 });
    }
    case 'shout': {
      const e = base({ lid: 0.42, lidAng: 0.65 });
      return face2(e, mirror(e), { cheeks: 0.3, mouthOpen: 0.95, mouth: 0.2 });
    }
    case 'sad': {
      const e = base({ lid: 0.34, lidAng: -0.5, dy: -0.006 });
      return face2(e, mirror(e), { cheeks: 0.15, mouth: -1 });
    }
    case 'sleepy':
      return face2(eye(LINE, 0.018, 0.064, { dy: -0.012, rot: 0.06 }), eye(LINE, 0.018, 0.064, { dy: -0.012, rot: -0.06 }), { cheeks: 0.5 });
    case 'wink':
      return face2(base(), eye(ARC, 0.024, 0.075, { dy: 0.008 }), { cheeks: 0.7, mouth: 1 });
    case 'love':
      return face2(eye(HEART, 0, 0.085, { dy: 0.004 }), undefined, { cheeks: 1 });
    case 'starstruck':
      return face2(eye(STAR, 0, 0.11), undefined, { cheeks: 0.8, mouthOpen: 0.4, mouth: 1 });
    case 'dizzy':
      return face2(eye(X, 0.022, 0.07), undefined, { cheeks: 0.2, mouthOpen: 0.3, mouth: -0.6 });
    default:
      return face2(base());
  }
};

const base = (o: Partial<BomberConfig>): BomberConfig => ({
  name: 'Bomber',
  state: 'idle',
  expression: 'neutral',
  bodyColor: '#F7F7F4',
  suitColor: '#2F6FE8',
  gearColor: '#FF5FA8',
  ballColor: '#FF3FA4',
  antenna: 0,
  window: 0,
  eyes: 0,
  accessory: 0,
  accColor: '#E8344A',
  bomb: 0,
  ...o,
});

// face window half sizes (x, y) and vertical offset, in head space
const WINDOW_SIZE: Array<[number, number, number]> = [
  [0.158, 0.118, -0.012],
  [0.185, 0.106, -0.018],
  [0.138, 0.142, -0.008],
];

// geometry shared with the shader
const HEAD_C: Vec3 = [0, 0.6, 0];

/**
 * The antenna ball rides a damped spring: it lags behind hops, squashes and
 * turns, then wobbles back. One small state record per character frame.
 */
interface Spring3 { p: Vec3; v: Vec3; t: number }
const springs = new WeakMap<CharFrame, Spring3>();
const antennaLag = (f: CharFrame, pose: Pose): Vec3 => {
  const H = 0.95 * (1 - pose.squash);
  const roll = pose.roll + pose.headRoll;
  const pitch = pose.pitch + pose.headPitch;
  const target: Vec3 = [pose.offset[0] - Math.sin(roll) * H, pose.offset[1] + H, Math.sin(pitch) * H];
  let s = springs.get(f);
  if (!s || !(pose.t >= s.t) || pose.t - s.t > 0.5) {
    s = { p: [...target], v: [0, 0, 0], t: pose.t };
    springs.set(f, s);
  }
  const dt = Math.min(pose.t - s.t, 0.05);
  s.t = pose.t;
  const k = 300, damp = 7.5;
  const n = 4;
  for (let i = 0; i < n && dt > 0; i++) {
    const h = dt / n;
    for (let a = 0; a < 3; a++) {
      const acc = k * (target[a] - s.p[a]) - damp * s.v[a];
      s.v[a] += acc * h;
      s.p[a] += s.v[a] * h;
    }
  }
  const d: Vec3 = [s.p[0] - target[0], s.p[1] - target[1], s.p[2] - target[2]];
  for (let a = 0; a < 3; a++) {
    if (!Number.isFinite(d[a])) {
      springs.delete(f);
      return [0, 0, 0];
    }
    d[a] = clamp(d[a], -0.07, 0.07);
  }
  return d;
};

export const bomber: FamilyDef<BomberConfig> = {
  id: 'bomber',
  name: 'Bombers',
  maker: 'Arcade blasters',
  tagline: 'Glossy toy helmets · springy antenna balls · a lit bomb for every job',
  subtitle: 'Arcade blasters · chunky bomb heroes with a spark of mischief',
  shader,
  anchors: 0,
  background: 'radial-gradient(130% 95% at 50% 0%, #d6f0ff 0%, #9fd8ff 48%, #6bbcf2 100%)',
  backgroundSolid: '#9FD8FF',
  dark: false,
  traits: ['Glossy toy-figure helmets', 'Springy antenna & big mitts', 'Lit bombs and power-ups'],
  look: {
    dark: false,
    groundShadow: 0.4,
    exposure: 1.02,
    groundY: 0,
    lights: {
      key: normalize([-0.5, 0.8, 0.62]),
      keyI: 1.15,
      rim: normalize([0.55, 0.42, -0.72]),
      rimI: 1.25,
      fill: normalize([0.78, 0.12, 0.6]),
      fillI: 0.38,
      sky: [0.47, 0.56, 0.68],
      ground: [0.24, 0.25, 0.27],
      warm: [1.0, 0.97, 0.92],
      env: 1.05,
    },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Bounces on its toes, antenna bobbing', bob: [0.012, 1.15], squash: [0.022, 1.15] },
    listening: { label: 'Listening', hint: 'Leans in, antenna perked', expr: 'listening', gaze: 'user', lean: 0.07, bob: [0.005, 0.5], props: { perk: 1 } },
    thinking: { label: 'Thinking', hint: 'Hand to chin, antenna ball pulsing', expr: 'curious', arms: 'think', gaze: 'up', sway: [0.03, 0.3], props: { think: 1 } },
    working: { label: 'Working', hint: 'Holds up a lit bomb, fuse sparking', expr: 'determined', arms: 'wave', bob: [0.01, 1.6], squash: [0.02, 1.6], enter: 'nod', props: { bomb: 1 } },
    planting: { label: 'Planting', hint: 'Crouches and sets a bomb at its feet', expr: 'focused', arms: 'type', gaze: 'down', lean: 0.1, sink: 0.03, squash: [0.04, 0.5], emote: ['bang', 3.2], props: { plant: 1, crouch: 1 } },
    speaking: { label: 'Speaking', hint: 'Chatty, waving a mitt', expr: 'neutral', talk: 1, arms: 'wave', gaze: 'user', bob: [0.01, 1.4] },
    dancing: { label: 'Dancing', hint: 'Victory dance with stomping boots', expr: 'happy', arms: 'cheer', bob: [0.03, 2.0], squash: [0.035, 2.0], sway: [0.12, 1.0], emote: ['note', 1.8], props: { dance: 1 } },
    done: { label: 'Done', hint: 'Fists up, power-ups orbiting', expr: 'laugh', arms: 'cheer', enter: 'celebrate', bob: [0.014, 0.8], emote: ['sparkle', 2.4], props: { pu: 1 } },
    sleeping: { label: 'Sleeping', hint: 'Head droops, antenna sags', expr: 'sleepy', gaze: 'closed', squash: [0.03, 0.22], sink: 0.012, emote: ['zzz', 2.6], props: { droop: 1 } },
  },
  personality: {
    body: [2.0, 0.45, 1.2],
    eyes: [5.5, 0.75, 0.0],
    squash: [300, 8],
    reach: [0.42, 0.24],
    eyeShare: 0.55,
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
      id: 'colors',
      title: 'Colours',
      controls: [
        { type: 'swatches', key: 'bodyColor', label: 'Helmet', colors: HELMET_COLORS, custom: true },
        { type: 'swatches', key: 'suitColor', label: 'Suit', colors: SUIT_COLORS, custom: true },
        { type: 'swatches', key: 'gearColor', label: 'Gloves & boots', colors: GEAR_COLORS, custom: true },
        { type: 'swatches', key: 'ballColor', label: 'Antenna ball', colors: BALL_COLORS, custom: true },
      ],
    },
    {
      id: 'helmet',
      title: 'Helmet & face',
      controls: [
        { type: 'chips', key: 'antenna', label: 'Antenna', options: ANTENNAS },
        { type: 'chips', key: 'window', label: 'Face window', options: WINDOWS },
        { type: 'chips', key: 'eyes', label: 'Eyes', options: EYE_STYLES },
        { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS },
      ],
    },
    {
      id: 'gear',
      title: 'Gear',
      controls: [
        { type: 'chips', key: 'accessory', label: 'Accessory', options: ACCESSORIES },
        { type: 'swatches', key: 'accColor', label: 'Accessory colour', colors: ACC_COLORS, custom: true, when: (c) => c.accessory >= 1 && c.accessory <= 3 },
        { type: 'chips', key: 'bomb', label: 'Bomb', options: BOMBS },
      ],
    },
  ],
  roster: () => [
    base({ name: 'Blitz' }),
    base({
      name: 'Onyx', bodyColor: '#26262E', suitColor: '#3B3650', gearColor: '#FFC93C', ballColor: '#FFC93C',
      eyes: 3, accessory: 4, bomb: 1, expression: 'determined',
    }),
    base({
      name: 'Ember', bodyColor: '#F0453A', suitColor: '#F7F3EA', gearColor: '#3D7BF0', ballColor: '#FFC93C',
      accessory: 1, accColor: '#FFC93C', window: 1,
    }),
    base({
      name: 'Momo', bodyColor: '#FF8DBE', suitColor: '#FFF4F8', gearColor: '#9B6BFF', ballColor: '#FF3B3B',
      antenna: 2, eyes: 1, bomb: 2, expression: 'happy',
    }),
    base({
      name: 'Sprout', bodyColor: '#4CC46E', suitColor: '#FFC93C', gearColor: '#FF8A2B', ballColor: '#F7F7F4',
      antenna: 1, accessory: 3, accColor: '#E8344A', window: 2,
    }),
  ],
  randomize: (c, rnd) => {
    const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
    return {
      ...c,
      bodyColor: pick(HELMET_COLORS),
      suitColor: pick(SUIT_COLORS),
      gearColor: pick(GEAR_COLORS),
      ballColor: pick(BALL_COLORS),
      antenna: pick([0, 0, 0, 1, 2, 4, 3]),
      window: Math.floor(rnd() * 3),
      eyes: pick([0, 0, 1, 2, 3]),
      accessory: Math.floor(rnd() * 6),
      accColor: pick(ACC_COLORS),
      bomb: Math.floor(rnd() * 3),
      expression: pick(['neutral', 'neutral', 'happy', 'determined', 'curious', 'wink']),
    };
  },
  compose: (n, aspect, compact) =>
    groupPhoto(n, aspect, {
      gap: compact ? 0.66 : 0.72,
      charW: 0.72,
      charH: 1.08,
      riser: 0.36,
      depth: 0.6,
      fov: deg(22),
      margin: compact ? 0.05 : 0.1,
      turn: 0.08,
      lift: 0.22,
    }),
  solo: (aspect) => soloCamera(aspect, 0.76, 1.0, deg(22), 0.22),
  headLocal: () => [HEAD_C[0], HEAD_C[1], 0.2],
  bounds: (c) => ({
    c: [0, 0.53, 0.03],
    r: 0.6 + (c.antenna === 1 ? 0.01 : 0) + (c.accessory === 2 ? 0.02 : 0),
    occ: [
      [0, 0.24, 0, 0.16],
      [0, HEAD_C[1], 0, 0.25],
      [0, 0.06, 0.03, 0.12],
    ],
  }),
  face: bomberFace,
  pack: (c: BomberConfig, pose: Pose, f: CharFrame, face: FaceTarget) => {
    const d = f.data;
    d.fill(0);
    const set = (k: number, a: number, b: number, cc: number, dd: number) => {
      d[k * 4] = a;
      d[k * 4 + 1] = b;
      d[k * 4 + 2] = cc;
      d[k * 4 + 3] = dd;
    };
    const lin = hexToLinear;
    const P = pose.props;
    const ph = pose.phase;
    const droop = P.droop ?? 0;
    const perk = P.perk ?? 0;
    const think = P.think ?? 0;
    const crouch = P.crouch ?? 0;
    const dance = P.dance ?? 0;

    const hc = lin(c.bodyColor), sc = lin(c.suitColor), gc = lin(c.gearColor), bc = lin(c.ballColor), ac = lin(c.accColor);
    set(0, hc[0], hc[1], hc[2], c.window);
    set(1, sc[0], sc[1], sc[2], c.antenna);
    set(2, gc[0], gc[1], gc[2], c.accessory);
    set(3, bc[0], bc[1], bc[2], c.bomb);
    // head: follows the gaze, droops when asleep, dips while planting
    const hq = quatEuler(pose.headYaw, pose.headPitch + 0.32 * droop - 0.12 * crouch, pose.headRoll + 0.1 * droop * Math.sin(ph * 0.5));
    set(4, hq[0], hq[1], hq[2], hq[3]);

    // eyes: positions relative to the face window centre
    const win = WINDOW_SIZE[clamp(Math.round(c.window), 0, 2)];
    const size = 1 + 0.07 * pose.excite;
    const sx = 0.062 * (c.window === 1 ? 1.1 : 1);
    const lookX = pose.lookX * 0.03;
    const lookY = pose.lookY * 0.02;
    const squeeze = 1 - 0.15 * Math.abs(pose.lookX);
    const blink = pose.blink;
    const packEye = (e: EyeSpec, side: number, kc: number, ka: number) => {
      let w = e.w * size * squeeze;
      let h = e.h * size;
      if (e.kind === PILL || e.kind === OVAL) {
        h = Math.max(w * 0.42, h * (1 - 0.92 * blink));
        w *= 1 + 0.25 * blink;
      } else if (e.kind !== LINE) {
        h *= 1 - 0.5 * blink;
      }
      // keep the eyes inside the window
      const cx = clamp(side * sx + e.dx + lookX, -win[0] + 0.06, win[0] - 0.06);
      const cy = clamp(0.012 + e.dy + lookY, -win[1] + 0.065, win[1] - 0.06);
      set(kc, cx, cy, w, h);
      set(ka, e.rot, e.kind, e.lid, e.lidAng);
    };
    packEye(face.l, -1, 5, 7);
    packEye(face.r, 1, 6, 8);
    const open = clamp(Math.max(face.mouthOpen, pose.talk * 0.8), 0, 1);
    set(9, open, face.mouth, clamp(face.cheeks + 0.3 * pose.pet, 0, 1), face.lidB);

    // arms: short and stubby, big mitts
    const rig = { shoulder: [0.126, 0.318, 0.0] as Vec3, upper: 0.074, fore: 0.068 };
    const held = P.bomb ?? 0;
    const plant = P.plant ?? 0;
    // a mitt holding up a bomb doesn't wave it around
    const arms = held > 0.02 ? { ...pose.arms, wave: pose.arms.wave * (1 - held) } : pose.arms;
    const [lS, lE, lH] = solveArm(-1, arms, ph, rig);
    const [rS, rE, rH] = solveArm(1, arms, ph, rig);
    set(10, lS[0], lS[1], lS[2], 0.036);
    set(11, lE[0], lE[1], lE[2], 0.032);
    set(12, lH[0], lH[1], lH[2], 0.054);
    set(13, rS[0], rS[1], rS[2], 0.036);
    set(14, rE[0], rE[1], rE[2], 0.032);
    set(15, rH[0], rH[1], rH[2], 0.054);

    // antenna: spring lag + idle jiggle, perks up when listening, sags asleep
    const lag = antennaLag(f, pose);
    const jig = 0.006 * Math.sin(ph * 5.1) * (1 - droop);
    const sag: Vec3 = [0.018 * droop, -0.035 * droop + 0.012 * perk, 0.05 * droop];
    const pulse = think * (0.5 + 0.5 * Math.sin(ph * 6.0));
    set(16, lag[0] * 1.4 + jig + sag[0], lag[1] * 0.8 + sag[1], -lag[2] * 1.4 + sag[2], pulse);

    // the bomb: tossed in the right mitt (working) or set down at the feet (planting)
    const BS = 1.2;
    const R = 0.068 * BS;
    let bomb: Vec3 = [0, 0, 0];
    let bs = 0;
    if (held > plant && held > 0.02) {
      // held up on the raised mitt, bounced now and then
      const hop = Math.max(0, Math.sin(ph * 3.1)) ** 2 * 0.05;
      bomb = [rH[0] + 0.03, rH[1] + 0.046 + R + hop * held, rH[2] + 0.045];
      bs = held * BS;
    } else if (plant > 0.02) {
      bomb = [0.0, R * plant + 0.03 * crouch, 0.2];
      bs = plant * BS;
    }
    set(17, bomb[0], bomb[1], bomb[2], bs);
    const flicker = 0.5 + 0.25 * Math.sin(ph * 31.0) + 0.25 * Math.sin(ph * 47.0 + 1.3);
    set(18, flicker, ph, held > 0.02 ? Math.sin(ph * 5.2) * 0.25 : 0, 0);
    set(19, P.pu ?? 0, ph * 0.9, ph * 3.0, 0);
    set(20, pose.poke[0], pose.poke[1], pose.poke[2], pose.pokeAmp);
    set(21, pose.wobble * 0.7, pose.wobblePhase, droop, perk);
    // stomping boots while dancing
    const st = dance * 0.035;
    set(22, st * Math.max(0, Math.sin(ph * 6.3)), st * Math.max(0, Math.sin(ph * 6.3 + Math.PI)), crouch, 0);
    const flutter = Math.sin(ph * 3.3) * 0.5 + pose.roll * 2.0 + pose.yaw * 0.6;
    set(23, ac[0], ac[1], ac[2], flutter);
    set(24, win[0], win[1], win[2], 0);
  },
};

export type BomberAvatar = Avatar<BomberConfig>;
