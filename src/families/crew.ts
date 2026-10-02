// STUB copied from grok.ts: to be replaced by the full family.
import shader from '../shaders/crew.glsl';
import { deg, hexToLinear, normalize, relLuminance, type Vec3 } from '../engine/math';
import type { Avatar, Pose } from '../avatar/avatar';
import type { CharFrame } from '../engine/renderer';
import type { BaseConfig, EyeSpec, FaceTarget, FamilyDef, Option, Placement } from './types';
import { groupPhoto, soloCamera } from './compose';

export interface CrewConfig extends BaseConfig {
  shape: number;
  sides: number;
  roundness: number;
  aspect: number;
  bulge: number;
  waves: number;
  waveCount: number;
  tilt: number;
  thickness: number;
  inflate: number;
  color: string;
  material: string;
  eyeSize: number;
  eyeSpacing: number;
  eyeHeight: number;
  eyeTilt: number;
  eyeColor: string;
  /** previous silhouette while a shape morph is running */
  _from?: { shape: number; sides: number; roundness: number; aspect: number };
}

export const GROK_SHAPES: Option[] = [
  { value: 0, label: 'Circle', icon: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z' },
  { value: 1, label: 'Oval', icon: 'M12 6c6 0 10 2.7 10 6s-4 6-10 6S2 15.3 2 12s4-6 10-6z' },
  { value: 2, label: 'Rounded square', icon: 'M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5z' },
  { value: 3, label: 'Pill', icon: 'M8 6h8a6 6 0 0 1 0 12H8A6 6 0 0 1 8 6z' },
  { value: 4, label: 'Triangle', icon: 'M10.3 4.2a2 2 0 0 1 3.4 0l7.6 13a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3z' },
  { value: 5, label: 'Hexagon', icon: 'M7.5 3.5h9L21 12l-4.5 8.5h-9L3 12z' },
  { value: 6, label: 'Cloud', icon: 'M7 19a4.5 4.5 0 0 1-.6-9A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 .5 10.5z' },
  { value: 7, label: 'Teardrop', icon: 'M12 2.5c3 4.5 7 8 7 12a7 7 0 0 1-14 0c0-4 4-7.5 7-12z' },
  { value: 8, label: 'Polygon', icon: 'M12 2.5l9 6.5-3.4 10.5H6.4L3 9z' },
];

export const GROK_COLORS = [
  '#EE7330', '#F2A03D', '#F5C518', '#3CBF6B', '#4DB8A4', '#3B82F6',
  '#8B5CF6', '#EC4899', '#EF4444', '#8B6B4A', '#6B7280', '#141414',
];

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'wink', label: 'Wink' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'curious', label: 'Curious' },
  { value: 'focused', label: 'Focused' },
  { value: 'determined', label: 'Determined' },
  { value: 'sad', label: 'Sad' },
  { value: 'angry', label: 'Grumpy' },
  { value: 'love', label: 'Love' },
  { value: 'starstruck', label: 'Starstruck' },
  { value: 'dizzy', label: 'Dizzy' },
  { value: 'laugh', label: 'Laugh' },
  { value: 'skeptical', label: 'Skeptical' },
  { value: 'error', label: 'Error' },
];

// eye kinds understood by the shader
const PILL = 0, OVAL = 1, ARC = 2, LINE = 3, X = 4, CHEVRON = 5, HEART = 6, STAR = 7, SPIRAL = 8;

const eye = (kind: number, w: number, h: number, o: Partial<EyeSpec> = {}): EyeSpec => ({
  kind, w, h, rot: 0, lid: 0, lidAng: 0, dx: 0, dy: 0, ...o,
});

const both = (l: EyeSpec, r: EyeSpec = { ...l }, lidB = 0): FaceTarget => ({
  l, r, lidB, mouth: 0, mouthOpen: 0, cheeks: 0,
});

const crewFace = (c: CrewConfig, expr: string): FaceTarget => {
  // positive slant leans the top of the slits to the right, as in the reference pile
  const tilt = -deg(c.eyeTilt);
  const pill = (o: Partial<EyeSpec> = {}) => eye(PILL, 0.085, 0.2, { rot: tilt, ...o });
  switch (expr) {
    case 'happy':
      return both(eye(ARC, 0.05, 0.17, { dy: 0.01 }));
    case 'wink':
      return both(pill(), eye(ARC, 0.05, 0.17, { dy: 0.01 }));
    case 'sleepy':
      return both(eye(LINE, 0.045, 0.15, { dy: -0.025, rot: 0.08 }), eye(LINE, 0.045, 0.15, { dy: -0.025, rot: -0.08 }));
    case 'surprised':
      return both(eye(OVAL, 0.12, 0.23, { dy: 0.01 }));
    case 'curious':
      return both(pill({ h: 0.22, rot: tilt + 0.1 }), pill({ h: 0.16, rot: tilt + 0.1, dy: 0.012 }));
    case 'focused':
      return both(pill({ w: 0.09, h: 0.18, lid: 0.3 }));
    case 'determined':
      return both(pill({ w: 0.09, h: 0.19, lid: 0.32, lidAng: 0.42 }), pill({ w: 0.09, h: 0.19, lid: 0.32, lidAng: -0.42 }));
    case 'sad':
      return both(
        pill({ w: 0.08, h: 0.17, lid: 0.3, lidAng: -0.5, dy: -0.015 }),
        pill({ w: 0.08, h: 0.17, lid: 0.3, lidAng: 0.5, dy: -0.015 }),
      );
    case 'angry':
      return both(pill({ w: 0.09, h: 0.18, lid: 0.46, lidAng: 0.62 }), pill({ w: 0.09, h: 0.18, lid: 0.46, lidAng: -0.62 }));
    case 'love':
      return both(eye(HEART, 0.0, 0.17, { dy: 0.005 }));
    case 'starstruck':
      return both(eye(STAR, 0.0, 0.22));
    case 'dizzy':
      return both(eye(SPIRAL, 0.03, 0.2));
    case 'laugh':
      return both(eye(CHEVRON, 0.045, 0.16), eye(CHEVRON, 0.045, 0.16, { rot: Math.PI }));
    case 'skeptical':
      return both(pill({ lid: 0.45 }), pill({ h: 0.22, rot: tilt - 0.12 }));
    case 'error':
      return both(eye(X, 0.042, 0.16));
    default:
      return both(pill());
  }
};

const base = (o: Partial<CrewConfig>): CrewConfig => ({
  name: 'Crew',
  state: 'idle',
  expression: 'neutral',
  shape: 0,
  sides: 5,
  roundness: 0.6,
  aspect: 1,
  bulge: 0,
  waves: 0,
  waveCount: 6,
  tilt: 0,
  thickness: 0.2,
  inflate: 0.05,
  color: '#EE7330',
  material: 'soft',
  eyeSize: 1,
  eyeSpacing: 1,
  eyeHeight: 0.02,
  eyeTilt: 0,
  eyeColor: 'auto',
  ...o,
});

// Composition after the reference pile (9 bots resting on each other).
const PILE: Placement[] = [
  { pos: [-1.92, 0.0, 0.18], scale: 1.03, yaw: 0.06 },
  { pos: [-1.36, 0.82, -0.12], scale: 0.98, yaw: 0.0 },
  { pos: [-0.34, 0.82, -0.12], scale: 0.95, yaw: -0.05 },
  { pos: [0.48, 1.44, -0.3], scale: 0.85, yaw: 0.05 },
  { pos: [-0.84, 0.0, 0.2], scale: 1.1, yaw: 0.03 },
  { pos: [0.33, 0.02, 0.22], scale: 1.13, yaw: -0.03 },
  { pos: [1.16, 0.62, -0.1], scale: 0.97, yaw: -0.06 },
  { pos: [1.14, 0.02, 0.32], scale: 0.56, yaw: 0.0 },
  { pos: [1.94, 0.02, 0.16], scale: 0.98, yaw: -0.08 },
];

export const crew: FamilyDef<CrewConfig> = {
  id: 'crew',
  name: 'Grok Bot',
  maker: 'Space impostors',
  tagline: 'Simple geometric forms · near-infinite shape variations · motion-based state expression',
  shader,
  anchors: 0,
  background: '#F3F4F6',
  dark: false,
  traits: ['Simple geometric forms', 'Near-infinite shape variations', 'Motion-based state expression'],
  look: {
    dark: false,
    groundShadow: 0.3,
    exposure: 1.0,
    groundY: 0,
    lights: {
      key: normalize([-0.45, 0.78, 0.62]),
      keyI: 1.0,
      rim: normalize([0.55, 0.45, -0.7]),
      rimI: 0.7,
      fill: normalize([0.75, 0.1, 0.65]),
      fillI: 0.22,
      sky: [0.42, 0.43, 0.46],
      ground: [0.2, 0.195, 0.19],
      warm: [1.0, 0.97, 0.93],
      env: 0.9,
    },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Calm and slightly curious', bob: [0.01, 0.4], squash: [0.012, 0.4] },
    thinking: { label: 'Thinking', hint: 'Looks up while the dots pulse', expr: 'curious', gaze: 'up', props: { dots: 1 }, bob: [0.012, 0.6], sway: [0.05, 0.35] },
    working: { label: 'Working', hint: 'Kicks into gear', expr: 'focused', bob: [0.05, 2.1], squash: [0.065, 2.1], lean: 0.07, enter: 'nod' },
    waiting: { label: 'Waiting', hint: 'Patient sway, glancing at you', expr: 'neutral', gaze: 'user', sway: [0.06, 0.45], bob: [0.008, 0.45] },
    blocked: { label: 'Needs help', hint: 'Shakes and asks for input', expr: 'sad', shake: 0.09, enter: 'shake', emote: ['question', 2.4] },
    done: { label: 'Done', hint: 'Celebrates, then settles', expr: 'happy', enter: 'celebrate', bob: [0.01, 0.5], emote: ['check', 3.6] },
    orbit: { label: 'Long task', hint: 'Rings orbit during long-running work', expr: 'focused', props: { rings: 1 }, bob: [0.015, 0.8] },
    paused: { label: 'Paused', hint: 'Dozes until it is needed', expr: 'sleepy', gaze: 'closed', squash: [0.035, 0.25], sink: 0.02, emote: ['zzz', 2.8] },
  },
  personality: {
    body: [2.1, 0.5, 1.4],
    eyes: [5.0, 0.75, 0.0],
    squash: [320, 8.5],
    reach: [0.5, 0.32],
    eyeShare: 0.6,
    hopGravity: 15,
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
      id: 'shape',
      title: 'Shape',
      controls: [
        { type: 'icons', key: 'shape', label: 'Silhouette', options: GROK_SHAPES },
        { type: 'slider', key: 'sides', label: 'Polygon sides', min: 3, max: 10, step: 1, when: (c) => c.shape === 8 },
        { type: 'slider', key: 'roundness', label: 'Corner roundness', min: 0, max: 1, step: 0.01 },
        { type: 'slider', key: 'aspect', label: 'Width', min: 0.7, max: 1.45, step: 0.01 },
        { type: 'slider', key: 'bulge', label: 'Bulge', min: 0, max: 1, step: 0.01 },
        { type: 'slider', key: 'waves', label: 'Wobbly edge', min: 0, max: 0.06, step: 0.001 },
        { type: 'slider', key: 'waveCount', label: 'Wobble count', min: 3, max: 12, step: 1, when: (c) => c.waves > 0.001 },
        { type: 'slider', key: 'tilt', label: 'Tilt', min: -35, max: 35, step: 1, unit: '°' },
        { type: 'slider', key: 'thickness', label: 'Depth', min: 0.1, max: 0.34, step: 0.01 },
        { type: 'slider', key: 'inflate', label: 'Inflate', min: 0, max: 0.14, step: 0.005 },
      ],
    },
    {
      id: 'color',
      title: 'Colour & material',
      controls: [
        { type: 'swatches', key: 'color', label: 'Colour', colors: GROK_COLORS, custom: true },
        {
          type: 'chips',
          key: 'material',
          label: 'Material',
          options: [
            { value: 'flat', label: 'Flat' },
            { value: 'soft', label: 'Soft-touch' },
            { value: 'clay', label: 'Clay' },
            { value: 'gloss', label: 'Gloss' },
          ],
        },
      ],
    },
    {
      id: 'face',
      title: 'Eyes',
      controls: [
        { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS },
        { type: 'slider', key: 'eyeSize', label: 'Size', min: 0.6, max: 1.5, step: 0.01 },
        { type: 'slider', key: 'eyeSpacing', label: 'Spacing', min: 0.6, max: 1.5, step: 0.01 },
        { type: 'slider', key: 'eyeHeight', label: 'Height', min: -0.12, max: 0.16, step: 0.005 },
        { type: 'slider', key: 'eyeTilt', label: 'Slant', min: -25, max: 25, step: 1, unit: '°' },
        {
          type: 'chips',
          key: 'eyeColor',
          label: 'Eye colour',
          options: [
            { value: 'auto', label: 'Auto' },
            { value: 'white', label: 'White' },
            { value: 'ink', label: 'Ink' },
          ],
        },
      ],
    },
  ],
  roster: () => [
    base({ name: 'Ember', shape: 0, color: '#EE7330', eyeTilt: 14, expression: 'neutral' }),
    base({ name: 'Onyx', shape: 0, color: '#141414', eyeTilt: 18, material: 'gloss' }),
    base({ name: 'Tide', shape: 2, color: '#4DB8A4', roundness: 0.75, tilt: -6 }),
    base({ name: 'Iris', shape: 2, color: '#8B5CF6', roundness: 0.85, tilt: 22, eyeSize: 0.75, expression: 'curious' }),
    base({ name: 'Puff', shape: 6, color: '#F2A03D', aspect: 1.05, eyeTilt: 8 }),
    base({ name: 'Peak', shape: 4, color: '#EC4899', roundness: 0.9, eyeSize: 0.8, eyeHeight: -0.04 }),
    base({ name: 'Cobalt', shape: 2, color: '#3B82F6', roundness: 0.55, tilt: -14, expression: 'surprised', eyeSize: 0.85 }),
    base({ name: 'Drip', shape: 7, color: '#6B7280', tilt: 32, eyeSize: 0.8, eyeHeight: -0.06, expression: 'surprised' }),
    base({ name: 'Cocoa', shape: 0, color: '#8B6B4A', eyeTilt: 16, eyeSize: 1.25 }),
  ],
  randomize: (c, rnd) => ({
    ...c,
    shape: Math.floor(rnd() * GROK_SHAPES.length),
    sides: 3 + Math.floor(rnd() * 6),
    roundness: 0.3 + rnd() * 0.7,
    aspect: 0.85 + rnd() * 0.35,
    bulge: rnd() < 0.3 ? rnd() * 0.5 : 0,
    waves: rnd() < 0.2 ? rnd() * 0.035 : 0,
    tilt: Math.round((rnd() - 0.5) * 40),
    color: GROK_COLORS[Math.floor(rnd() * GROK_COLORS.length)],
    material: ['flat', 'soft', 'soft', 'clay', 'gloss'][Math.floor(rnd() * 5)],
    expression: EXPRESSIONS[Math.floor(rnd() * 8)].value as string,
    eyeSize: 0.75 + rnd() * 0.5,
    eyeSpacing: 0.8 + rnd() * 0.4,
    eyeTilt: Math.round((rnd() - 0.5) * 30),
  }),
  compose: (n, aspect, compact) => {
    if (n <= PILE.length && aspect >= 1.05 && !compact) {
      // the signature pile, framed near-orthographically
      const fov = deg(18);
      const w = 5.5, h = 2.85;
      const halfH = Math.max(h / 2, w / 2 / aspect);
      const dist = halfH / Math.tan(fov / 2);
      return { placements: PILE.slice(0, n), camera: { pos: [0.02, 1.12 + halfH * 0.12, dist], target: [0.02, 1.12, 0], fov } };
    }
    if (n <= PILE.length && compact && aspect >= 0.9) {
      const fov = deg(18);
      const w = 5.3, h = 2.8;
      const halfH = Math.max(h / 2, w / 2 / aspect);
      const dist = halfH / Math.tan(fov / 2);
      return { placements: PILE.slice(0, n), camera: { pos: [0.02, 1.1 + halfH * 0.12, dist], target: [0.02, 1.1, 0], fov } };
    }
    return groupPhoto(n, aspect, { gap: 1.15, charW: 1.05, charH: 1.0, riser: 0.62, depth: 0.5, fov: deg(18), margin: 0.12, turn: 0.02, lift: 0.1 });
  },
  solo: (aspect) => soloCamera(aspect, 1.15, 1.0, deg(18), 0.1),
  subtitle: 'xAI · persistent agents with a geometric identity',
  headLocal: () => [0, 0.55, 0.15],
  bounds: (c) => {
    const r = 0.64 * Math.max(c.aspect, 1) + 0.06;
    return { c: [0, 0.5, 0], r: Math.max(r, 0.98), occ: [[0, 0.46, 0, 0.4]] };
  },
  face: crewFace,
  pack: (c: CrewConfig, pose: Pose, f: CharFrame, face: FaceTarget) => {
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
    const from = c._from && m < 1 ? c._from : c;
    set(0, from.shape, from.roundness, from.aspect, from.sides);
    set(1, c.shape, c.roundness, c.aspect, c.sides);
    set(2, m < 1 ? ease : 0, deg(c.tilt), c.thickness, c.inflate);
    const col = hexToLinear(c.color);
    const matIdx = ['flat', 'soft', 'clay', 'gloss'].indexOf(c.material);
    set(3, col[0], col[1], col[2], Math.max(0, matIdx));

    const size = c.eyeSize * (1 + 0.08 * pose.excite);
    const sx = 0.125 * c.eyeSpacing;
    const lookX = pose.lookX * 0.075;
    const lookY = pose.lookY * 0.05;
    const squeeze = 1 - 0.18 * Math.abs(pose.lookX);
    const blink = pose.blink;
    const packEye = (e: EyeSpec, side: number, kc: number, ka: number) => {
      let w = e.w * size * squeeze;
      let h = e.h * size;
      if (e.kind === PILL || e.kind === OVAL) {
        const closed = Math.max(w * 0.42, h * (1 - 0.92 * blink));
        h = closed;
        w *= 1 + 0.25 * blink;
      } else {
        h *= 1 - 0.5 * blink;
      }
      const cx = side * sx + e.dx + lookX;
      const cy = c.eyeHeight + e.dy + lookY;
      set(kc, cx, cy, w, h);
      set(ka, e.rot, e.kind, e.lid, e.lidAng);
    };
    packEye(face.l, -1, 4, 6);
    packEye(face.r, 1, 5, 7);
    const ink = c.eyeColor === 'ink' || (c.eyeColor === 'auto' && relLuminance(c.color) > 0.5);
    const ec: Vec3 = ink ? [0.012, 0.012, 0.014] : [0.96, 0.96, 0.95];
    set(8, ec[0], ec[1], ec[2], face.lidB);
    set(9, pose.poke[0], pose.poke[1], pose.poke[2], pose.pokeAmp);
    set(10, pose.wobble * 1.4, pose.wobblePhase, 9, 0);
    const rings = pose.props.rings ?? 0;
    const dots = pose.props.dots ?? 0;
    set(11, rings, pose.phase * 1.4, dots, pose.phase * 6.5);
    set(12, c.bulge, c.waves, c.waveCount, pose.phase * 0.0);
    set(13, 0.55, 0, 0, 0);
    const rc = hexToLinear(c.color);
    set(14, rc[0] * 0.55 + 0.25, rc[1] * 0.55 + 0.25, rc[2] * 0.55 + 0.25, 1);
  },
};

export type GrokAvatar = Avatar<CrewConfig>;
