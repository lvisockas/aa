import { deg, hexToRgb, normalize } from '../engine/math';
import type { Pose } from '../avatar/avatar';
import type { BaseConfig, Draw2DEnv, EyeSpec, FaceState, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';
import { STYLES, arcPts, blob, ellipse, leaf, mix, rrect, type Item, type Pt, type RGB, type StyleId } from './doodle-styles';

/**
 * Doodles: five 2D characters, each drawn in its own simple art style (flat
 * vector, ink doodle, pixel art, paper cut-out, risograph). They are drawn with
 * Canvas2D by the stage, but share the avatar brain with the 3D families: gaze,
 * blinks, squash and hop, boops, states and expressions.
 */
export interface DoodleConfig extends BaseConfig {
  character: number;
  style: StyleId;
  color: string;
  accentColor: string;
  eyes: number;
  eyeSize: number;
  blush: number;
  lineWeight: number;
  wobble: number;
  pixelSize: number;
  misregister: number;
  paperDepth: number;
}

const CHARACTERS: Option[] = [
  { value: 0, label: 'Blob' },
  { value: 1, label: 'Cat' },
  { value: 2, label: 'Robot' },
  { value: 3, label: 'Owl' },
  { value: 4, label: 'Frog' },
];
const STYLE_OPTS: Option[] = [
  { value: 'flat', label: 'Flat vector' },
  { value: 'ink', label: 'Ink doodle' },
  { value: 'pixel', label: 'Pixel art' },
  { value: 'paper', label: 'Paper cut-out' },
  { value: 'riso', label: 'Risograph' },
];
const COLORS = ['#FF7A5C', '#FFF1D6', '#5EEAD4', '#F4A259', '#00A95C', '#2F6BFF', '#A98BFF', '#FF48B0', '#FFC628', '#26262A'];
const ACCENTS = ['#FFD166', '#FFB703', '#F43F5E', '#5B8E7D', '#FF48B0', '#0078BF', '#26262A', '#FFFFFF'];

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'worried', label: 'Worried' },
  { value: 'excited', label: 'Excited' },
  { value: 'wink', label: 'Wink' },
];

// eye kinds: 0 open, 1 happy arc, 2 closed, 3 wide
const doodleFace = (c: DoodleConfig, expr: string): FaceTarget => {
  const e = (kind: number, size = 1, lid = 0): EyeSpec => ({ kind, w: size, h: 1, rot: 0, lid, lidAng: 0, dx: 0, dy: 0 });
  const base = c.eyes;
  const open = base === 1 || base === 2 ? 0 : base;
  const make = (l: EyeSpec, r: EyeSpec, mouth = 0, mouthOpen = 0, cheeks = 0): FaceTarget => ({ l, r, lidB: 0, mouth, mouthOpen, cheeks });
  switch (expr) {
    case 'happy':
      return make(e(1), e(1), 0.8, 0, 0.6);
    case 'squeeze':
      return make(e(1, 1.05), e(1, 1.05), 0.9, 0, 1);
    case 'listening':
      return make(e(base, 1.1), e(base, 1.1), 0.2, 0, 0.2);
    case 'surprised':
      return make(e(3), e(3), 0, 0.6);
    case 'sleepy':
      return make(e(2), e(2), 0.1);
    case 'worried':
      return make(e(open, 0.9, 0.4), e(open, 0.9, 0.4), -0.6, 0.1);
    case 'excited':
      return make(e(3, 1.05), e(3, 1.05), 0.8, 0.5, 0.8);
    case 'wink':
      return make(e(open), e(1), 0.7, 0, 0.4);
    case 'dizzy':
      return make(e(2), e(2), -0.4, 0.3);
    default:
      return make(e(base), e(base), 0.45);
  }
};

const base = (o: Partial<DoodleConfig>): DoodleConfig => ({
  name: 'Doodle',
  state: 'idle',
  expression: 'neutral',
  character: 0,
  style: 'flat',
  color: '#FF7A5C',
  accentColor: '#FFD166',
  eyes: 0,
  eyeSize: 1,
  blush: 0.4,
  lineWeight: 1,
  wobble: 0.6,
  pixelSize: 0.034,
  misregister: 0.5,
  paperDepth: 0.8,
  ...o,
});

// ------------------------------------------------------------- characters
const INK: RGB = [28, 24, 34];
const PINK: RGB = [255, 120, 140];

interface Ctx {
  c: DoodleConfig;
  pose: Pose;
  face: FaceState;
  t: number;
  main: RGB;
  acc: RGB;
  light: RGB;
  /** horizontal / vertical shift of the face as the head turns and nods */
  fx: number;
  fy: number;
  items: Item[];
}

const poly = (k: Ctx, pts: Pt[], col: RGB, role: Item['role'], shade = false) => k.items.push({ k: 'poly', pts, col, role, shade });
const line = (k: Ctx, pts: Pt[], w: number, col: RGB, role: Item['role'] = 'dark') => k.items.push({ k: 'line', pts, w, col, role });
const dot = (k: Ctx, x: number, y: number, r: number, col: RGB, role: Item['role']) => k.items.push({ k: 'dot', x, y, r, col, role });

type EyeStyle = 'dot' | 'sclera' | 'owl' | 'screen';
const eyes = (k: Ctx, dx: number, y0: number, r0: number, style: EyeStyle) => {
  const { pose, face } = k;
  const r = r0 * k.c.eyeSize;
  ([[-1, face.l], [1, face.r]] as Array<[number, EyeSpec]>).forEach(([side, spec]) => {
    const x = side * dx + k.fx;
    const y = y0 + k.fy;
    const open = 1 - pose.blink;
    if (spec.kind === 2 || open < 0.2) {
      line(k, arcPts(x, y + r * 0.5, r * 0.85, -Math.PI * 0.82, -Math.PI * 0.18, 8), r * 0.32, style === 'screen' ? k.light : INK, style === 'screen' ? 'light' : 'dark');
      return;
    }
    if (spec.kind === 1) {
      line(k, arcPts(x, y - r * 0.45, r * 0.85, Math.PI * 0.18, Math.PI * 0.82, 8), r * 0.32, style === 'screen' ? k.light : INK, style === 'screen' ? 'light' : 'dark');
      return;
    }
    const rr = r * (spec.kind === 3 ? 1.25 : 1) * spec.w;
    const hy = rr * open * (1 - 0.45 * spec.lid);
    const lx = pose.lookX, ly = pose.lookY;
    if (style === 'dot') {
      const cx = x + lx * rr * 0.35, cy = y + ly * rr * 0.3;
      poly(k, ellipse(cx, cy, rr * 0.72, hy, 20), INK, 'dark');
      dot(k, cx - rr * 0.22, cy + hy * 0.38, rr * 0.2, [255, 255, 255], 'light');
    } else if (style === 'screen') {
      poly(k, rrect(x + lx * 0.02, y + ly * 0.015, rr * 0.7, Math.max(hy * 0.8, 0.008), rr * 0.18, 3), k.light, 'light');
    } else {
      poly(k, ellipse(x, y, rr, hy, 24), [255, 255, 255], 'light');
      const pr = Math.min(rr * (style === 'owl' ? 0.56 : 0.46), hy * 0.92);
      const px = x + lx * (rr - pr) * 0.8, py = y + ly * (hy - pr) * 0.7;
      dot(k, px, py, pr, INK, 'dark');
      dot(k, px - pr * 0.35, py + pr * 0.38, pr * 0.3, [255, 255, 255], 'light');
    }
  });
};

const mouth = (k: Ctx, x: number, y: number, w: number) => {
  const open = Math.max(k.face.mouthOpen, k.pose.talk);
  if (open > 0.08) {
    const depth = w * (0.5 + 0.9 * open);
    const pts: Pt[] = [[x - w, y]];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI;
      pts.push([x + Math.cos(a) * w, y + Math.sin(a) * depth]);
    }
    poly(k, pts, INK, 'dark');
    if (open > 0.35) poly(k, ellipse(x, y - depth * 0.62, w * 0.55, depth * 0.3, 14), PINK, 'accent');
    return;
  }
  const sm = k.face.mouth;
  const pts: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const u = i / 5 - 1;
    pts.push([x + u * w, y - sm * w * 0.55 * (1 - u * u)]);
  }
  line(k, pts, 0.018, INK);
};

const blush = (k: Ctx, dx: number, y: number, r: number) => {
  const amt = Math.min(1, k.c.blush + k.face.cheeks * 0.5);
  if (amt < 0.05) return;
  for (const s of [-1, 1]) poly(k, ellipse(s * dx + k.fx, y + k.fy, r * (0.6 + 0.6 * amt), r * 0.55 * (0.6 + 0.6 * amt), 18), PINK, 'blush');
};

const thinkingBits = (k: Ctx, x: number, y: number) => {
  const b = k.pose.props.bits ?? 0;
  if (b < 0.05) return;
  for (let i = 0; i < 3; i++) dot(k, x + i * 0.07, y + i * 0.05 + 0.02 * Math.sin(k.t * 3 + i), (0.018 + 0.006 * i) * b, k.acc, 'accent');
};

const shadow = (k: Ctx, rx: number) => poly(k, ellipse(0, 0.01, rx, rx * 0.16, 28), INK, 'shadow');

const DRAW: Array<(k: Ctx) => void> = [
  // 0 Mochi, the blob: soft rounded square, nub ears, bead eyes
  (k) => {
    const { main, light, fx } = k;
    const dark = mix(main, INK, 0.25);
    shadow(k, 0.34);
    for (const s of [-1, 1]) poly(k, ellipse(s * 0.22 - fx * 0.3, 0.8, 0.1, 0.1, 18), main, 'main', true);
    for (const s of [-1, 1]) poly(k, ellipse(s * 0.15, 0.045, 0.1, 0.05, 16), dark, 'main');
    poly(k, blob(fx * 0.15, 0.43, 0.42, 0.41, 2.7), main, 'main', true);
    poly(k, ellipse(fx * 0.5, 0.3, 0.24, 0.18, 24), light, 'light');
    blush(k, 0.27, 0.44, 0.07);
    eyes(k, 0.15, 0.53, 0.07, 'dot');
    mouth(k, fx, 0.42 + k.fy, 0.06);
    thinkingBits(k, 0.32, 0.92);
  },
  // 1 Scribble, the cat: pear body, pointy ears, a patch, whiskers, a swishing tail
  (k) => {
    const { main, acc, light, fx, fy, pose } = k;
    shadow(k, 0.3);
    const sway = Math.sin(pose.phase * (1.6 + 2 * pose.excite)) * (0.5 + pose.excite);
    const tail: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const s = i / 12;
      tail.push([0.2 + 0.24 * s + 0.06 * Math.sin(s * 3 + sway) * s, 0.12 + 0.36 * s + 0.05 * Math.sin(s * 4 + sway * 0.7) * s]);
    }
    line(k, tail, 0.06, main, 'main');
    poly(k, ellipse(0, 0.25, 0.27, 0.24, 28), main, 'main', true);
    for (const s of [-1, 1]) poly(k, ellipse(s * 0.12, 0.04, 0.075, 0.045, 14), light, 'light');
    for (const s of [-1, 1]) {
      const ex = fx * 0.2;
      poly(k, [[s * 0.27 + ex, 0.7], [s * 0.21 + ex, 0.96], [s * 0.05 + ex, 0.84]], main, 'main');
      poly(k, [[s * 0.23 + ex, 0.74], [s * 0.2 + ex, 0.89], [s * 0.1 + ex, 0.82]], acc, 'accent');
    }
    poly(k, ellipse(fx * 0.3, 0.62, 0.3, 0.27, 32), main, 'main', true);
    poly(k, blob(-0.13 + fx * 0.6, 0.73, 0.11, 0.08, 2.2, 20), acc, 'accent');
    blush(k, 0.2, 0.53, 0.05);
    eyes(k, 0.11, 0.63, 0.075, 'sclera');
    poly(k, [[fx - 0.025, 0.565 + fy], [fx + 0.025, 0.565 + fy], [fx, 0.535 + fy]], PINK, 'accent');
    const my = 0.52 + fy;
    line(k, [...arcPts(fx - 0.025, my, 0.025, Math.PI, Math.PI * 2, 6)], 0.014, INK);
    line(k, [...arcPts(fx + 0.025, my, 0.025, Math.PI, Math.PI * 2, 6)], 0.014, INK);
    if (Math.max(k.face.mouthOpen, k.pose.talk) > 0.08) mouth(k, fx, my - 0.02, 0.04);
    for (const s of [-1, 1])
      for (let w = -1; w <= 1; w++) line(k, [[s * 0.1 + fx, 0.55 + fy + w * 0.015], [s * 0.3 + fx, 0.56 + fy + w * 0.045]], 0.008, INK);
    thinkingBits(k, 0.3, 0.98);
  },
  // 2 Bit, the robot: boxy head with a screen face, antenna light, little arms
  (k) => {
    const { main, acc, light, fx, fy, t, pose } = k;
    shadow(k, 0.3);
    const wave = Math.sin(pose.phase * 6) * 0.04 * (pose.excite + (pose.props.wag ?? 0));
    for (const s of [-1, 1]) poly(k, rrect(s * 0.27, 0.28 + (s > 0 ? wave : -wave), 0.05, 0.1, 0.03, 3), main, 'main', true);
    for (const s of [-1, 1]) poly(k, rrect(s * 0.1, 0.04, 0.075, 0.04, 0.02, 3), mix(main, INK, 0.35), 'main');
    poly(k, rrect(0, 0.26, 0.21, 0.17, 0.05), main, 'main', true);
    poly(k, rrect(0, 0.26, 0.11, 0.075, 0.02, 3), light, 'light');
    dot(k, -0.04, 0.26, 0.018, acc, 'accent');
    dot(k, 0.04, 0.26, 0.018, mix(acc, [255, 255, 255], 0.4), 'accent');
    line(k, [[fx * 0.5, 0.8], [fx * 0.6, 0.95]], 0.02, INK);
    dot(k, fx * 0.6, 0.97, 0.035 * (1 + 0.18 * Math.sin(t * 5)), acc, 'accent');
    poly(k, rrect(fx * 0.3, 0.6, 0.31, 0.22, 0.07), main, 'main', true);
    poly(k, rrect(fx * 0.55, 0.6, 0.24, 0.155, 0.045), INK, 'dark');
    eyes(k, 0.09, 0.63, 0.055, 'screen');
    const open = Math.max(k.face.mouthOpen, pose.talk);
    const my = 0.53 + fy;
    if (open > 0.08) poly(k, rrect(fx, my, 0.05, 0.012 + 0.03 * open, 0.01, 2), light, 'light');
    else line(k, arcPts(fx, my + 0.05 * Math.max(k.face.mouth, 0), 0.05, -Math.PI * 0.75, -Math.PI * 0.25, 6), 0.014, light, 'light');
    thinkingBits(k, 0.3, 0.92);
  },
  // 3 Fern, the owl: egg body, ear tufts, leaf wings, big disc eyes, a beak
  (k) => {
    const { main, acc, light, fx, fy, pose } = k;
    shadow(k, 0.3);
    const flap = Math.sin(pose.phase * 9) * 0.25 * (pose.excite + 0.6 * (pose.props.wag ?? 0));
    for (const s of [-1, 1]) poly(k, ellipse(s * 0.1, 0.03, 0.06, 0.03, 12), acc, 'accent');
    for (const s of [-1, 1]) poly(k, [[s * 0.14, 0.78], [s * 0.3, 0.98], [s * 0.3, 0.72]], main, 'main');
    const wing = mix(main, INK, 0.22);
    poly(k, leaf(0.22, 0.6, 0.34, 0.1, -1.05 + flap), wing, 'main', true);
    poly(k, leaf(-0.22, 0.6, 0.34, 0.1, -Math.PI + 1.05 - flap), wing, 'main', true);
    poly(k, ellipse(0, 0.43, 0.33, 0.42, 36), main, 'main', true);
    poly(k, ellipse(fx * 0.4, 0.3, 0.22, 0.25, 28), light, 'light');
    for (let r = 0; r < 3; r++)
      for (let i = -1; i <= 1; i++) {
        if (r === 2 && i !== 0) continue;
        const x = fx * 0.4 + i * 0.09 + (r % 2) * 0.045, y = 0.36 - r * 0.07;
        line(k, [[x - 0.025, y + 0.015], [x, y - 0.005], [x + 0.025, y + 0.015]], 0.012, acc, 'accent');
      }
    blush(k, 0.24, 0.5, 0.05);
    eyes(k, 0.13, 0.62, 0.11, 'owl');
    const by = 0.53 + fy;
    const open = Math.max(k.face.mouthOpen, pose.talk);
    poly(k, [[fx - 0.035, by], [fx + 0.035, by], [fx, by - 0.06 - 0.03 * open]], acc, 'accent');
    thinkingBits(k, 0.3, 0.98);
  },
  // 4 Ribbit, the frog: wide body, eye bumps, spots, a big smile
  (k) => {
    const { main, acc, light, fx, fy } = k;
    shadow(k, 0.38);
    for (const s of [-1, 1]) poly(k, ellipse(s * 0.24, 0.035, 0.13, 0.045, 16), main, 'main');
    poly(k, blob(fx * 0.1, 0.33, 0.42, 0.29, 2.3), main, 'main', true);
    for (const s of [-1, 1]) poly(k, ellipse(s * 0.19 + fx * 0.5, 0.6, 0.13, 0.12, 24), main, 'main', true);
    poly(k, ellipse(fx * 0.3, 0.2, 0.26, 0.14, 24), light, 'light');
    dot(k, -0.27, 0.3, 0.035, acc, 'accent');
    dot(k, 0.3, 0.22, 0.028, acc, 'accent');
    dot(k, 0.24, 0.36, 0.02, acc, 'accent');
    eyes(k, 0.19, 0.62, 0.085, 'sclera');
    for (const s of [-1, 1]) poly(k, ellipse(s * 0.29 + fx, 0.41 + fy, 0.06, 0.035, 14), acc, 'accent');
    mouth(k, fx, 0.43 + fy, 0.17);
    thinkingBits(k, 0.36, 0.86);
  },
];

const items = (c: DoodleConfig, pose: Pose, face: FaceState, t: number): Item[] => {
  const main = hexToRgb(c.color).map((v) => v * 255) as RGB;
  const acc = hexToRgb(c.accentColor).map((v) => v * 255) as RGB;
  const k: Ctx = {
    c,
    pose,
    face,
    t,
    main,
    acc,
    light: mix(main, [255, 255, 255], 0.72),
    fx: pose.headYaw * 0.08 + pose.yaw * 0.03,
    fy: -pose.headPitch * 0.06,
    items: [],
  };
  DRAW[Math.max(0, Math.min(DRAW.length - 1, c.character))](k);
  return k.items;
};

export const doodle: FamilyDef<DoodleConfig> = {
  id: 'doodle',
  name: 'Doodles',
  maker: '2D art styles',
  tagline: 'Five simple art styles · flat, ink, pixel, paper, riso · same reactive brain',
  subtitle: '2D characters in five simple art styles',
  shader: '',
  anchors: 0,
  background: 'linear-gradient(170deg, #FFFDF7 0%, #F6EFE2 100%)',
  backgroundSolid: '#FAF5EA',
  dark: false,
  traits: ['Five art styles', 'Drawn in 2D', 'Same reactive brain'],
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
    idle: { label: 'Idle', hint: 'Breathing, blinking', bob: [0.008, 0.45], squash: [0.015, 0.45] },
    listening: { label: 'Listening', hint: 'Leaning in, eyes on you', expr: 'listening', gaze: 'user', lean: 0.08 },
    thinking: { label: 'Thinking', hint: 'Little thought bubbles', expr: 'neutral', gaze: 'up', sway: [0.04, 0.3], props: { bits: 1 } },
    working: { label: 'Working', hint: 'Busy bounce', expr: 'neutral', bob: [0.025, 1.8], squash: [0.05, 1.8], gaze: 'down', props: { wag: 1 } },
    speaking: { label: 'Speaking', hint: 'Mouth moves with the voice', expr: 'happy', talk: 1, bob: [0.01, 1.1], gaze: 'user' },
    happy: { label: 'Done', hint: 'A little celebration', expr: 'excited', enter: 'celebrate', emote: ['check', 4], props: { wag: 1 } },
    sleeping: { label: 'Sleeping', hint: 'Dozing off', expr: 'sleepy', gaze: 'closed', squash: [0.03, 0.22], sink: 0.01, emote: ['zzz', 2.6] },
  },
  personality: {
    body: [2.0, 0.5, 0.8],
    eyes: [6.0, 0.8, 0.0],
    squash: [260, 8],
    reach: [0.3, 0.2],
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
      id: 'look',
      title: 'Character & style',
      controls: [
        { type: 'chips', key: 'character', label: 'Character', options: CHARACTERS },
        { type: 'chips', key: 'style', label: 'Art style', options: STYLE_OPTS },
        { type: 'swatches', key: 'color', label: 'Colour (ink 1 in riso)', colors: COLORS, custom: true },
        { type: 'swatches', key: 'accentColor', label: 'Accent (ink 2 in riso)', colors: ACCENTS, custom: true },
        { type: 'slider', key: 'lineWeight', label: 'Line weight', min: 0.5, max: 2, step: 0.01, when: (c) => c.style === 'ink' },
        { type: 'slider', key: 'wobble', label: 'Line boil', min: 0, max: 1.5, step: 0.01, when: (c) => c.style === 'ink' },
        { type: 'slider', key: 'pixelSize', label: 'Pixel size', min: 0.016, max: 0.06, step: 0.001, when: (c) => c.style === 'pixel' },
        { type: 'slider', key: 'paperDepth', label: 'Paper depth', min: 0, max: 1.5, step: 0.01, when: (c) => c.style === 'paper' },
        { type: 'slider', key: 'misregister', label: 'Misregistration', min: 0, max: 1.5, step: 0.01, when: (c) => c.style === 'riso' },
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
        { type: 'slider', key: 'eyeSize', label: 'Eye size', min: 0.7, max: 1.4, step: 0.01 },
        { type: 'slider', key: 'blush', label: 'Blush', min: 0, max: 1, step: 0.01 },
      ],
    },
  ],
  roster: () => [
    base({ name: 'Mochi', character: 0, style: 'flat', color: '#FF7A5C', accentColor: '#FFD166' }),
    base({ name: 'Scribble', character: 1, style: 'ink', color: '#FFF1D6', accentColor: '#FFB703', blush: 0.3 }),
    base({ name: 'Bit', character: 2, style: 'pixel', color: '#5EEAD4', accentColor: '#F43F5E', blush: 0 }),
    base({ name: 'Fern', character: 3, style: 'paper', color: '#F4A259', accentColor: '#5B8E7D', blush: 0.2 }),
    base({ name: 'Ribbit', character: 4, style: 'riso', color: '#00A95C', accentColor: '#FF48B0', blush: 0 }),
  ],
  randomize: (c, rnd) => ({
    ...c,
    character: Math.floor(rnd() * 5),
    style: (['flat', 'ink', 'pixel', 'paper', 'riso'] as StyleId[])[Math.floor(rnd() * 5)],
    color: COLORS[Math.floor(rnd() * COLORS.length)],
    accentColor: ACCENTS[Math.floor(rnd() * ACCENTS.length)],
    eyes: rnd() < 0.75 ? 0 : 3,
    eyeSize: 0.85 + rnd() * 0.4,
    blush: rnd() * 0.6,
  }),
  compose: (n, aspect, compact) =>
    groupPhoto(n, aspect, { gap: compact ? 0.95 : 1.05, charW: 1.05, charH: 1.1, riser: 0, depth: 0, fov: deg(18), margin: 0.1, turn: 0, lift: 0.1 }),
  solo: (aspect) => soloCamera(aspect, 1.05, 1.1, deg(18), 0.1),
  headLocal: () => [0, 0.62, 0.1],
  bounds: () => ({ c: [0, 0.5, 0], r: 0.62, occ: [] }),
  face: doodleFace,
  pack: (_c, _pose, f) => {
    f.data.fill(0);   // drawn in 2D by draw2d
  },
  draw2d: (ctx: CanvasRenderingContext2D, c: DoodleConfig, pose: Pose, face: FaceState, env: Draw2DEnv) => {
    const list = items(c, pose, face, env.t);
    const ink = (hex: string) => hexToRgb(hex).map((v) => v * 255) as RGB;
    (STYLES[c.style] ?? STYLES.flat)(ctx, list, {
      t: env.t,
      px: env.px,
      size: env.size,
      canvas: env.canvas,
      lineWeight: c.lineWeight,
      wobble: c.wobble,
      pixelSize: c.pixelSize,
      misregister: c.misregister,
      paperDepth: c.paperDepth,
      inkA: ink(c.color),
      inkB: ink(c.accentColor),
    });
  },
};

/** exported for tests: the drawing list of a character */
export const doodleItems = items;
