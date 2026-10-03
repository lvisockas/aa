// ---------------------------------------------------------------------------
// Chompers: maze-arcade characters as glossy 3D toys. Two kinds share one
// family: round chompers (a sphere with a wedge mouth that chomps) and maze
// ghosts (a dome with a rippling scalloped hem and big look-around eyes).
// Eyes, blush, sunglasses and the ghost mouth are decals evaluated at shading
// time; the geometry is a sphere / dome plus small gated extras.
// ---------------------------------------------------------------------------
import shader from '../shaders/arcade.glsl';
import { clamp, deg, hexToLinear, normalize, quatRotate, type Quat, type Vec3 } from '../engine/math';
import type { Avatar, Pose } from '../avatar/avatar';
import type { CharFrame } from '../engine/renderer';
import type { BaseConfig, EyeSpec, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';

export interface ArcadeConfig extends BaseConfig {
  /** 0 chomper, 1 maze ghost */
  kind: number;
  color: string;
  /** 0 big, 1 none (chompers only), 2 sleepy, 3 angry */
  eyeStyle: number;
  /** chomper: how wide the mouth opens */
  mouthSize: number;
  /** chomper: 0 none, 1 boots, 2 boots + gloves */
  gear: number;
  gearColor: string;
  /** ghost: scallops across the front of the hem */
  scallops: number;
  /** 0 none, 1 bow, 2 cap, 3 sunglasses, 4 crown */
  accessory: number;
  accColor: string;
  /** neon rim glow */
  glow: number;
  /** resting turn, degrees (negative faces left) */
  facing: number;
}

const KINDS: Option[] = [
  { value: 0, label: 'Chomper', icon: 'M12 3a9 9 0 1 0 7.8 13.5L12 12l7.8-4.5A9 9 0 0 0 12 3z' },
  { value: 1, label: 'Ghost', icon: 'M4 21V11a8 8 0 0 1 16 0v10l-2.7-2-2.6 2-2.7-2-2.6 2-2.7-2z' },
];

export const ARCADE_COLORS = [
  '#FFD21F', '#FF7FC4', '#FF3B3B', '#FF9BDB', '#3FE0F0', '#FFA53D',
  '#5BE36B', '#9B6BFF', '#3B6BFF', '#F4F2EC', '#FF5A1F', '#2B2B33',
];
const GHOST_QUARTET = ['#FF3B3B', '#FF9BDB', '#3FE0F0', '#FFA53D'];
const ACC_COLORS = ['#E8202E', '#2B59FF', '#FFD21F', '#1F1F24', '#F4F2EC', '#FF7FC4', '#34C759'];
const GEAR_COLORS = ['#E8202E', '#2B59FF', '#1F1F24', '#F4F2EC', '#8A4B2A', '#34C759'];

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'wink', label: 'Wink' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'curious', label: 'Curious' },
  { value: 'focused', label: 'Focused' },
  { value: 'mischief', label: 'Mischief' },
  { value: 'shy', label: 'Shy' },
  { value: 'sad', label: 'Sad' },
  { value: 'angry', label: 'Grumpy' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'love', label: 'Love' },
  { value: 'starstruck', label: 'Starstruck' },
  { value: 'dizzy', label: 'Dizzy' },
  { value: 'laugh', label: 'Laugh' },
  { value: 'frightened', label: 'Frightened' },
  { value: 'content', label: 'Content' },
  { value: 'gameover', label: 'Game over' },
];

// eye kinds understood by the shader
const OPEN = 0, ARC = 1, LINE = 2, X = 3, SPIRAL = 4, STAR = 5, HEART = 6, SMALL = 7, CHEVRON = 8;

// EyeSpec: w/h scale the eye, rot is the pupil scale offset (OPEN eyes), lid / lidAng the upper lid
const eye = (kind: number, o: Partial<EyeSpec> = {}): EyeSpec => ({
  kind, w: 1, h: 1, rot: 0, lid: 0, lidAng: 0, dx: 0, dy: 0, ...o,
});

const face2 = (l: EyeSpec, r: EyeSpec = { ...l }, mouth = 0, mouthOpen = 0, cheeks = 0): FaceTarget => ({
  l, r, lidB: 0, mouth, mouthOpen, cheeks,
});

const arcadeFace = (c: ArcadeConfig, expr: string): FaceTarget => {
  const ghost = c.kind === 1;
  // the eye style sets the resting lids
  const lid = c.eyeStyle === 2 ? 0.42 : c.eyeStyle === 3 ? 0.3 : 0;
  const ang = c.eyeStyle === 3 ? 0.55 : 0;
  const open = (o: Partial<EyeSpec> = {}) => eye(OPEN, { lid, lidAng: ang, ...o });
  switch (expr) {
    case 'happy':
      return face2(eye(ARC), eye(ARC), 0.7, 0, 0.45);
    case 'wink':
      return face2(open(), eye(ARC), 0.5, 0, 0.3);
    case 'surprised':
      return face2(eye(OPEN, { w: 1.08, h: 1.12, rot: -0.3 }), undefined, 0, 0.8);
    case 'listening':
      return face2(eye(OPEN, { w: 1.04, h: 1.07, lid: lid * 0.5 }), undefined, 0.2, 0.1);
    case 'curious':
      return face2(open({ h: 1.08, dy: 0.06 }), open({ lid: Math.max(lid, 0.32), lidAng: -0.15 }), 0.1, 0.15);
    case 'focused':
      return face2(open({ lid: Math.max(lid, 0.36), lidAng: 0.22 }), undefined, 0, 0);
    case 'mischief':
      return face2(open({ lid: 0.42, lidAng: 0.5, rot: -0.1 }), open({ lid: 0.3, lidAng: 0.2, rot: -0.1 }), 0.55, 0, 0.1);
    case 'shy':
      return face2(open({ lid: Math.max(lid, 0.28), dy: -0.08, rot: 0.08 }), undefined, 0.25, 0, 1);
    case 'sad':
      return face2(open({ lid: 0.3, lidAng: -0.45, dy: -0.04 }), undefined, -0.6, 0);
    case 'angry':
      return face2(open({ lid: 0.46, lidAng: 0.62 }), undefined, -0.4, 0);
    case 'sleepy':
      return face2(open({ lid: 0.62 }), undefined, 0, 0);
    case 'love':
      return face2(eye(HEART), eye(HEART), 0.6, 0.2, 0.7);
    case 'starstruck':
      return face2(eye(STAR), eye(STAR), 0.4, 0.6, 0.3);
    case 'dizzy':
      return face2(eye(SPIRAL), eye(SPIRAL), 0, 0.3);
    case 'laugh':
    case 'squeeze':
      return face2(eye(CHEVRON), eye(CHEVRON), 0.9, 0.85, 0.5);
    case 'content':
      return face2(eye(LINE), eye(LINE), 0.5, 0, 0.5);
    case 'gameover':
      return face2(eye(X), eye(X), -0.3, 0.3);
    case 'frightened':
      return ghost
        ? face2(eye(SMALL), eye(SMALL), 0, 0)
        : face2(eye(OPEN, { w: 1.06, h: 1.14, rot: -0.55 }), undefined, -0.3, 1);
    default:
      return face2(open());
  }
};

const base = (o: Partial<ArcadeConfig>): ArcadeConfig => ({
  name: 'Chomper',
  state: 'idle',
  expression: 'neutral',
  kind: 0,
  color: '#FFD21F',
  eyeStyle: 0,
  mouthSize: 1,
  gear: 0,
  gearColor: '#E8202E',
  scallops: 4,
  accessory: 0,
  accColor: '#E8202E',
  glow: 0.35,
  facing: 22,
  ...o,
});

/** per-kind geometry the shader and the TS side agree on */
const CHOMP_R = 0.42;
const GHOST_R = 0.36;

const conj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

/** a burst of three chomps every few seconds while idle */
const idleBurst = (ph: number): number => {
  const cyc = ph % 4.6;
  if (cyc > 1.2) return 0;
  return Math.sin((cyc / 1.2) * Math.PI * 3) ** 2;
};

export const arcade: FamilyDef<ArcadeConfig> = {
  id: 'arcade',
  name: 'Chompers',
  maker: 'Maze arcade',
  tagline: 'Glossy arcade toys · one chomp, one glance · states you can read from across the room',
  shader,
  anchors: 0,
  background: 'radial-gradient(120% 95% at 50% 30%, #1B2160 0%, #0D1035 55%, #05061A 100%)',
  backgroundSolid: '#0D1035',
  dark: true,
  traits: ['Glossy toy plastic with a neon rim', 'Chomping, peeking, frightened: readable states', 'Maze props: dots, pellets, fruit'],
  look: {
    dark: true,
    groundShadow: 0.22,
    exposure: 1.05,
    groundY: 0,
    lights: {
      key: normalize([-0.5, 0.75, 0.62]),
      keyI: 1.15,
      rim: normalize([0.55, 0.4, -0.72]),
      rimI: 1.35,
      fill: normalize([0.8, 0.05, 0.6]),
      fillI: 0.3,
      sky: [0.2, 0.22, 0.36],
      ground: [0.05, 0.05, 0.1],
      warm: [1.0, 0.96, 0.9],
      env: 1.0,
    },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Bobs and chomps now and then', bob: [0.012, 0.45], squash: [0.014, 0.45], props: {} },
    listening: { label: 'Listening', hint: 'Leans in, mouth ajar', expr: 'listening', gaze: 'user', lean: 0.1, bob: [0.006, 0.5], props: { shut: 0.35 } },
    thinking: { label: 'Thinking', hint: 'Looks up and ponders', expr: 'curious', gaze: 'up', arms: 'think', sway: [0.05, 0.35], bob: [0.01, 0.6], props: { shut: 0.85 }, emote: ['question', 2.6] },
    working: { label: 'Working', hint: 'Chomps along a row of dots', expr: 'focused', bob: [0.03, 2.4], squash: [0.035, 2.4], props: { dots: 1, chomp: 1 } },
    speaking: { label: 'Speaking', hint: 'Mouth moves with the voice', expr: 'happy', talk: 1, gaze: 'user', arms: 'wave', bob: [0.012, 1.1], props: { shut: 0.8 } },
    done: { label: 'Done', hint: 'Spins and grabs a bonus fruit', expr: 'happy', enter: 'celebrate', arms: 'cheer', bob: [0.012, 0.5], props: { gape: 0.5, fruit: 1 }, emote: ['check', 3.6] },
    sleeping: { label: 'Sleeping', hint: 'Dozes with its mouth shut', expr: 'sleepy', gaze: 'closed', squash: [0.035, 0.25], sink: 0.03, props: { shut: 1 }, emote: ['zzz', 2.8] },
    powerup: { label: 'Power-up', hint: 'Ate a power pellet: grows and glows', expr: 'mischief', enter: 'hop', arms: 'rally', bob: [0.02, 1.6], squash: [0.03, 3.2], props: { power: 1, chomp: 1 }, emote: ['sparkle', 1.8] },
    frightened: { label: 'Frightened', hint: 'Ghosts turn blue, chompers jump', expr: 'frightened', enter: 'hop', arms: 'cheer', shake: 0.05, bob: [0.02, 1.4], props: { fright: 1, gape: 0.8 }, emote: ['sweat', 2.4] },
  },
  personality: {
    body: [2.0, 0.5, 1.2],
    eyes: [5.0, 0.75, 0.0],
    squash: [300, 8.5],
    reach: [0.35, 0.25],
    eyeShare: 0.6,
    hopGravity: 14,
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
        { type: 'icons', key: 'kind', label: 'Kind', options: KINDS },
        { type: 'swatches', key: 'color', label: 'Body colour', colors: ARCADE_COLORS, custom: true },
        {
          type: 'chips',
          key: 'eyeStyle',
          label: 'Eyes',
          options: [
            { value: 0, label: 'Big' },
            { value: 1, label: 'None' },
            { value: 2, label: 'Sleepy' },
            { value: 3, label: 'Angry' },
          ],
        },
        { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS },
      ],
    },
    {
      id: 'shape',
      title: 'Shape',
      controls: [
        { type: 'slider', key: 'mouthSize', label: 'Mouth size', min: 0.5, max: 1.4, step: 0.01, when: (c) => c.kind === 0 },
        {
          type: 'chips',
          key: 'gear',
          label: 'Boots & gloves',
          when: (c) => c.kind === 0,
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Boots' },
            { value: 2, label: 'Boots + gloves' },
          ],
        },
        { type: 'swatches', key: 'gearColor', label: 'Boot colour', colors: GEAR_COLORS, custom: true, when: (c) => c.kind === 0 && c.gear > 0 },
        {
          type: 'chips',
          key: 'scallops',
          label: 'Skirt scallops',
          when: (c) => c.kind === 1,
          options: [
            { value: 3, label: '3' },
            { value: 4, label: '4' },
            { value: 5, label: '5' },
          ],
        },
        { type: 'slider', key: 'facing', label: 'Facing', min: -45, max: 45, step: 1, unit: '°' },
      ],
    },
    {
      id: 'style',
      title: 'Style',
      controls: [
        {
          type: 'chips',
          key: 'accessory',
          label: 'Accessory',
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Bow' },
            { value: 2, label: 'Cap' },
            { value: 3, label: 'Sunglasses' },
            { value: 4, label: 'Crown' },
          ],
        },
        { type: 'swatches', key: 'accColor', label: 'Accessory colour', colors: ACC_COLORS, custom: true, when: (c) => c.accessory === 1 || c.accessory === 2 },
        { type: 'slider', key: 'glow', label: 'Neon glow', min: 0, max: 1, step: 0.01 },
      ],
    },
  ],
  roster: () => [
    base({ name: 'Munch', kind: 0, color: '#FFD21F', gear: 1, facing: 24 }),
    base({ name: 'Bitsy', kind: 0, color: '#FF7FC4', accessory: 1, accColor: '#E8202E', facing: -20, mouthSize: 0.85, expression: 'happy' }),
    base({ name: 'Ruckus', kind: 1, color: '#FF3B3B', eyeStyle: 3, accessory: 2, accColor: '#2B59FF', scallops: 4, facing: 12, expression: 'mischief' }),
    base({ name: 'Wisp', kind: 1, color: '#3FE0F0', eyeStyle: 0, scallops: 3, facing: -14, expression: 'shy' }),
    base({ name: 'Tango', kind: 1, color: '#FFA53D', accessory: 3, scallops: 5, facing: -6, glow: 0.5 }),
  ],
  onChange: (c, key, value) => {
    if (key !== 'kind') return null;
    if (value === 1 && c.color === '#FFD21F') return { ...c, kind: 1, color: '#FF3B3B', eyeStyle: c.eyeStyle === 1 ? 0 : c.eyeStyle };
    if (value === 0 && GHOST_QUARTET.includes(c.color)) return { ...c, kind: 0, color: '#FFD21F' };
    if (value === 1 && c.eyeStyle === 1) return { ...c, kind: 1, eyeStyle: 0 };
    return null;
  },
  randomize: (c, rnd) => {
    const kind = rnd() < 0.45 ? 0 : 1;
    const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
    return {
      ...c,
      kind,
      color: kind === 1 && rnd() < 0.6 ? pick(GHOST_QUARTET) : kind === 0 && rnd() < 0.5 ? '#FFD21F' : pick(ARCADE_COLORS),
      eyeStyle: kind === 0 ? pick([0, 0, 0, 1, 2, 3]) : pick([0, 0, 2, 3]),
      mouthSize: 0.75 + rnd() * 0.5,
      gear: kind === 0 ? pick([0, 1, 2]) : 0,
      gearColor: pick(GEAR_COLORS),
      scallops: pick([3, 4, 5]),
      accessory: rnd() < 0.55 ? 1 + Math.floor(rnd() * 4) : 0,
      accColor: pick(ACC_COLORS),
      glow: rnd() * 0.7,
      facing: Math.round((rnd() - 0.5) * 60),
      expression: pick(['neutral', 'neutral', 'happy', 'mischief', 'shy', 'curious']),
    };
  },
  compose: (n, aspect, compact) =>
    groupPhoto(n, aspect, {
      gap: compact ? 1.1 : 1.18,
      charW: 1.08,
      charH: 1.12,
      riser: 0.5,
      depth: 0.6,
      fov: deg(22),
      margin: compact ? 0.08 : 0.14,
      turn: 0.05,
      lift: 0.15,
    }),
  solo: (aspect) => soloCamera(aspect, 1.2, 1.12, deg(22), 0.15),
  subtitle: 'Maze arcade · chompers and ghosts as glossy toys',
  headLocal: (c) => (c.kind === 1 ? [0, 0.62, 0.3] : [0, 0.6, 0.3]),
  bounds: (c) => {
    // dots row in front of the mouth while working, fruit beside the body when done
    let r = 0.6;
    if (c.accessory === 4 || c.accessory === 1 || c.accessory === 2) r = 0.64;
    if (c.state === 'done') r = 0.9;
    if (c.state === 'working') r = 1.04;
    return { c: [0, 0.5, 0], r, occ: [[0, 0.46, 0, 0.38]] };
  },
  face: arcadeFace,
  pack: (c: ArcadeConfig, pose: Pose, f: CharFrame, face: FaceTarget) => {
    const d = f.data;
    d.fill(0);
    const set = (k: number, a: number, b: number, cc: number, dd: number) => {
      d[k * 4] = a;
      d[k * 4 + 1] = b;
      d[k * 4 + 2] = cc;
      d[k * 4 + 3] = dd;
    };
    const ghost = c.kind === 1 ? 1 : 0;
    const P = pose.props;
    const ph = pose.phase;
    const dots = P.dots ?? 0, chomp = P.chomp ?? 0, power = P.power ?? 0, fright = P.fright ?? 0;
    const fruit = P.fruit ?? 0, shut = P.shut ?? 0, gape = P.gape ?? 0;

    // power-up: the character grows a size
    f.scale *= 1 + 0.12 * power + 0.015 * power * Math.sin(ph * 9);

    // facing: resting turn + follow the cursor + turn along the dot row while working
    const R = ghost ? GHOST_R : CHOMP_R;
    const side = c.facing < 0 ? -1 : 1;
    const turn = ghost ? deg(c.facing) * 0.7 * (1 - dots) : deg(c.facing) * (1 - dots) + clamp(pose.headYaw * 0.35, -0.25, 0.25) * (1 - 0.6 * dots);
    const fy = clamp(turn + dots * side * (ghost ? 0.75 : 0.95), -1.3, 1.3);

    // the dot row scrolls one dot per chomp; the mouth shuts as each dot arrives
    const SP = 0.2;
    const scroll = ph * 0.62;
    const z0 = R * 0.62;
    const u = (((z0 + scroll) / SP) % 1 + 1) % 1;
    const synced = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (u - 0.5));
    // the idle mouth rests half open with a burst of chomps now and then; states shut it,
    // open it wider or take over with a steady chomp
    const busy = clamp(shut + gape + chomp + power + fright + dots, 0, 1);
    let open = 0.5 * (1 - shut) * (1 - chomp) + gape * 0.5 + chomp * synced + (1 - busy) * idleBurst(ph) * 0.45;
    open += pose.talk * 0.85 + face.mouthOpen * 0.35;
    open = clamp(open, 0.05, 1.15);
    const alpha = 0.48 * c.mouthSize * open;
    set(0, ghost, fy, alpha, alpha * 0.55);

    const col = hexToLinear(c.color);
    set(1, col[0], col[1], col[2], c.glow);

    // eyes: chompers place them by azimuth / elevation on the sphere, ghosts on the front plane
    // "None": eyeless chompers / faceless ghosts (a frightened ghost always shows its little eyes)
    const eyesOn = c.eyeStyle === 1 && !(ghost && fright > 0.5) ? 0 : 1;
    const blink = pose.blink;
    const size = 1 + 0.06 * pose.excite;
    const look: [number, number] = [clamp(pose.lookX - fy * 0.5, -1, 1), clamp(pose.lookY, -1, 1)];
    const packEye = (e: EyeSpec, s: number, kc: number, ka: number) => {
      const w = (ghost ? 0.1 : 0.094) * e.w * size;
      let h = (ghost ? 0.13 : 0.126) * e.h * size;
      let lid = e.lid;
      if (e.kind === OPEN || e.kind === SMALL) lid = Math.max(lid, blink);
      else h *= 1 - 0.5 * blink;
      if (ghost) {
        // arcade ghosts shift their whites a little towards where they look
        set(kc, s * 0.128 + e.dx * 0.1 + look[0] * 0.022, 0.045 + e.dy * 0.1 + look[1] * 0.015, w, h);
      } else {
        set(kc, s * 0.3 + e.dx, 0.64 + e.dy, w, h);
      }
      // frightened ghosts always get the little arcade eyes, whatever the expression
      set(ka, ghost && fright > 0.5 ? SMALL : e.kind, clamp(lid, 0, 1), e.lidAng, e.rot);
    };
    packEye(face.l, -1, 2, 4);
    packEye(face.r, 1, 3, 5);
    set(6, look[0], look[1], eyesOn, clamp(face.cheeks, 0, 1));

    const ac = hexToLinear(c.accColor);
    set(7, c.accessory, ac[0], ac[1], ac[2]);
    const k = Math.round(c.scallops) * 2;
    // the hem ripples: a sway of the scallops plus a faster flutter when busy
    const hemPhase = (Math.round(c.scallops) % 2 === 1 ? 0 : Math.PI / 2) + Math.sin(ph * 3.4) * 0.45 + ph * (0.6 + 1.6 * (dots + power + fright));
    set(8, ghost ? 0 : c.gear, k, hemPhase, 0.085);
    set(9, pose.poke[0], pose.poke[1], pose.poke[2], pose.pokeAmp);

    // frightened ghosts flash white near the end of each blue spell
    const cyc = ph % 6;
    const flash = ghost && fright > 0.5 && cyc > 4.2 ? (Math.sin(ph * 22) > 0 ? 1 : 0) : 0;
    set(10, pose.wobble * 1.2, pose.wobblePhase, ghost ? fright : 0, flash);
    set(11, dots, scroll, fruit, ph);

    // view direction in the local frame (for the neon rim; the camera sits in front)
    const v = quatRotate(conj(f.rot), normalize([0, 0.25, 1]));
    set(12, v[0], v[1], v[2], ph);
    set(13, face.mouth, Math.max(face.mouthOpen, pose.talk), power, 0);
    // neon rim: the blue of the maze walls with a hint of the body colour
    const g = col.map((x, i) => [0.12, 0.32, 1.0][i] * 0.75 + x * 0.25) as Vec3;
    set(14, g[0], g[1], g[2], 0.5 + 0.5 * Math.sin(ph * 10));
    const pup = ghost ? hexToLinear('#2340E0') : hexToLinear('#14121C');
    set(15, pup[0], pup[1], pup[2], 1);
    const gc = hexToLinear(c.gearColor);
    set(16, gc[0], gc[1], gc[2], ghost ? 0 : Math.sin(ph * 12) * 0.035 * (dots + chomp * 0.3));

    // floating gloves follow the arm pose (raise angle around the body)
    const A = pose.arms;
    const wave = A.wave * Math.sin(ph * 10) * 0.35;
    const glove = (raise: number, fwd: number, s: number, extra: number) => {
      const a = Math.min(1.05 + raise * 0.72, 2.4) + extra;
      const rr = R + 0.1;
      return [s * rr * Math.sin(a), -rr * Math.cos(a) * 0.9, 0.06 + fwd * 0.12] as Vec3;
    };
    const tap = A.tap * Math.sin(ph * 14) * 0.15;
    const gl = glove(A.lRaise, A.lFwd, -1, -tap);
    const gr = glove(A.rRaise, A.rFwd, 1, tap + wave);
    set(17, gl[0], gl[1], gl[2], c.gear === 2 && !ghost ? 0.078 : 0);
    set(18, gr[0], gr[1], gr[2], c.gear === 2 && !ghost ? 0.078 : 0);
  },
};

export type ArcadeAvatar = Avatar<ArcadeConfig>;
