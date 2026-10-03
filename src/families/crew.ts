import shader from '../shaders/crew.glsl';
import { clamp, deg, hexToLinear, lerp, normalize, smoothstep, type Vec3 } from '../engine/math';
import type { Avatar, Pose } from '../avatar/avatar';
import type { CharFrame } from '../engine/renderer';
import type { BaseConfig, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';

/**
 * Crew: bean-shaped space crewmates in satin vinyl. There is no face: the
 * glossy visor slides around the bean to look at you, its highlight follows
 * the gaze, and its shape (squint, tilt, happy arch) carries the expression.
 */
export interface CrewConfig extends BaseConfig {
  color: string;
  visor: string;
  visorSize: number;
  backpack: string;
  hat: string;
  hatColor: string;
  sticker: string;
  pet: string;
  petColor: string;
}

export const CREW_COLORS = [
  '#D7262B', '#2347D8', '#1E8F3E', '#EE5DB8', '#F28A1C', '#F4E04D',
  '#3A4048', '#E4E9F2', '#7240C4', '#7A5230', '#3EE6D4', '#6EE046',
];

const HAT_COLORS = ['#F4C430', '#E8424F', '#3B82F6', '#22B07D', '#A855F7', '#F2F2F2', '#1F2937', '#F28A1C'];

const VISORS: Option[] = [
  { value: 'cyan', label: 'Cyan' },
  { value: 'gold', label: 'Gold' },
  { value: 'mirror', label: 'Mirror' },
  { value: 'dark', label: 'Smoke' },
];
const TINTS: Record<string, string> = { cyan: '#A6E3F2', gold: '#F2C45A', mirror: '#C9CED6', dark: '#2A3550' };

const HATS: Option[] = [
  { value: 'none', label: 'None' },
  { value: 'party', label: 'Party hat' },
  { value: 'tophat', label: 'Top hat' },
  { value: 'sprout', label: 'Sprout' },
  { value: 'beanie', label: 'Beanie' },
  { value: 'crown', label: 'Crown' },
  { value: 'egg', label: 'Egg shell' },
  { value: 'chef', label: 'Chef hat' },
  { value: 'halo', label: 'Halo' },
];
/** default jaunty tilt per hat */
const HAT_TILT: Record<string, number> = { party: 0.2, tophat: -0.12, sprout: 0.1, beanie: 0.05, crown: -0.08, egg: 0.12, chef: 0, halo: 0.05 };
const COLOURED_HATS = ['party', 'tophat', 'beanie'];

const PACKS: Option[] = [
  { value: 'standard', label: 'Backpack' },
  { value: 'jetpack', label: 'Jetpack' },
  { value: 'none', label: 'None' },
];

const STICKERS: Option[] = [
  { value: 'none', label: 'None' },
  { value: 'star', label: 'Star' },
  { value: 'heart', label: 'Heart' },
  { value: 'sus', label: 'Side-eye' },
  { value: 'plus', label: 'Medic' },
];

const PETS: Option[] = [
  { value: 'none', label: 'None' },
  { value: 'mini', label: 'Mini crewmate' },
  { value: 'bot', label: 'Robot buddy' },
];

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'laugh', label: 'Laugh' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'suspicious', label: 'Suspicious' },
  { value: 'confused', label: 'Confused' },
  { value: 'focused', label: 'Focused' },
  { value: 'determined', label: 'Determined' },
  { value: 'sad', label: 'Sad' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'love', label: 'Love' },
  { value: 'starstruck', label: 'Starstruck' },
  { value: 'dizzy', label: 'Dizzy' },
  { value: 'alarmed', label: 'Alarmed' },
];

// highlight kinds understood by the shader
const HL = 0, HEART = 1, STAR = 2, SPIRAL = 3;

interface VisorSpec {
  kind?: number;
  /** visor width / height scale, tilt, top lid (0..0.5) and its angle, offset */
  w?: number;
  h?: number;
  rot?: number;
  lid?: number;
  lidAng?: number;
  dx?: number;
  dy?: number;
  /** highlight size, offset (-1..1), rotation, dimming */
  hw?: number;
  hh?: number;
  hx?: number;
  hy?: number;
  hrot?: number;
  dim?: number;
  /** bottom lid, happy arch, inner glow, blush */
  bot?: number;
  arch?: number;
  glow?: number;
  blush?: number;
}

// The shared FaceTarget is reused as a visor description: l = visor shape, r = highlight.
const visor = (o: VisorSpec): FaceTarget => ({
  l: { kind: o.kind ?? HL, w: o.w ?? 1, h: o.h ?? 1, rot: o.rot ?? 0, lid: o.lid ?? 0, lidAng: o.lidAng ?? 0, dx: o.dx ?? 0, dy: o.dy ?? 0 },
  r: { kind: o.kind ?? HL, w: o.hw ?? 1, h: o.hh ?? 1, rot: o.hrot ?? 0, lid: o.dim ?? 0, lidAng: 0, dx: o.hx ?? 0, dy: o.hy ?? 0 },
  lidB: o.bot ?? 0,
  mouth: o.arch ?? 0,
  mouthOpen: o.glow ?? 0,
  cheeks: o.blush ?? 0,
});

const crewFace = (_c: CrewConfig, expr: string): FaceTarget => {
  switch (expr) {
    case 'happy':
      return visor({ arch: 0.68, hh: 1.1, hy: 0.25 });
    case 'laugh':
      return visor({ arch: 0.8, h: 1.05, w: 1.04, hw: 1.1, hy: 0.35 });
    case 'squeeze':
      return visor({ w: 1.1, h: 0.72, arch: 0.7, lid: 0.08, hw: 1.15, hh: 0.8 });
    case 'surprised':
      return visor({ h: 1.34, w: 0.92, hw: 0.75, hh: 1.5, hy: 0.25 });
    case 'alarmed':
      return visor({ h: 1.3, w: 0.95, hw: 0.55, hh: 1.1, hy: 0.1, glow: 0.25 });
    case 'suspicious':
      return visor({ h: 0.62, lid: 0.16, lidAng: 0.16, hx: 0.6, hw: 0.75, hh: 0.75, dy: 0.008 });
    case 'confused':
      return visor({ rot: 0.2, lid: 0.16, lidAng: -0.35, hw: 0.85, hy: 0.3, hx: -0.2 });
    case 'thinking':
      return visor({ rot: 0.16, lid: 0.1, lidAng: -0.3, hy: 0.5, hx: 0.35, hw: 0.9 });
    case 'focused':
      return visor({ lid: 0.26, h: 0.88, hw: 1.15, hh: 0.8, hy: -0.2 });
    case 'determined':
      return visor({ lid: 0.3, lidAng: 0.32, hw: 1.1, hh: 0.85 });
    case 'sad':
      return visor({ lid: 0.24, lidAng: -0.3, dy: -0.012, hy: -0.5, dim: 0.25, h: 0.95 });
    case 'sleepy':
      return visor({ lid: 0.42, h: 0.85, dim: 0.45, hy: -0.4, rot: -0.06 });
    case 'love':
      return visor({ kind: HEART, blush: 0.75, arch: 0.25, hw: 1.0 });
    case 'starstruck':
      return visor({ kind: STAR, h: 1.15, glow: 0.25 });
    case 'dizzy':
      return visor({ kind: SPIRAL, rot: 0.12, h: 1.05 });
    case 'listening':
      return visor({ h: 1.08, rot: -0.08, hw: 1.1, hh: 1.1, hy: 0.15 });
    default:
      return visor({});
  }
};

const base = (o: Partial<CrewConfig>): CrewConfig => ({
  name: 'Crewmate',
  state: 'idle',
  expression: 'neutral',
  color: '#D7262B',
  visor: 'cyan',
  visorSize: 1,
  backpack: 'standard',
  hat: 'none',
  hatColor: '#F4C430',
  sticker: 'none',
  pet: 'none',
  petColor: '#3EE6D4',
  ...o,
});

const idx = (list: Option[], v: string) => Math.max(0, list.findIndex((o) => o.value === v));

// props positions mirrored from the shader
const PANEL: Vec3 = [0.52, 0.58, 0.22];
const PANEL_X: Vec3 = [Math.cos(0.5), 0, Math.sin(0.5)];
const PANEL_N: Vec3 = [-Math.sin(0.5), 0, Math.cos(0.5)];
const SHOULDER: Vec3 = [0.245, 0.46, 0.03];

/** smallest-ish sphere around a set of spheres (x, y, z, r) */
const enclose = (s: Array<[number, number, number, number]>): { c: Vec3; r: number } => {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const [x, y, z, r] of s) {
    [x, y, z].forEach((v, i) => {
      lo[i] = Math.min(lo[i], v - r);
      hi[i] = Math.max(hi[i], v + r);
    });
  }
  const c: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  let r = 0;
  for (const [x, y, z, rr] of s) r = Math.max(r, Math.hypot(x - c[0], y - c[1], z - c[2]) + rr);
  return { c, r };
};

export const crew: FamilyDef<CrewConfig> = {
  id: 'crew',
  name: 'Crew',
  maker: 'Space impostors',
  tagline: 'Bean-suit space crewmates · a visor that looks back · body-language states',
  shader,
  anchors: 0,
  background: 'radial-gradient(120% 95% at 50% 22%, #22305A 0%, #141D3A 55%, #0B1124 100%)',
  backgroundSolid: '#141D3A',
  dark: true,
  traits: ['Satin bean suits, glossy visors', 'Emotes through the visor', 'Hats, pets & little ship tasks'],
  look: {
    dark: true,
    groundShadow: 0.45,
    exposure: 1.05,
    groundY: 0,
    lights: {
      key: normalize([-0.5, 0.75, 0.62]),
      keyI: 1.05,
      rim: normalize([0.6, 0.4, -0.7]),
      rimI: 1.0,
      fill: normalize([0.8, 0.05, 0.6]),
      fillI: 0.28,
      sky: [0.3, 0.34, 0.46],
      ground: [0.07, 0.07, 0.11],
      warm: [1.0, 0.96, 0.9],
      env: 1.0,
    },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Gentle bob and a side-to-side waddle', bob: [0.012, 0.9], sway: [0.05, 0.45], props: { waddle: 1 } },
    listening: { label: 'Listening', hint: 'Turns its visor to you and leans in', expr: 'listening', gaze: 'user', lean: 0.06, bob: [0.006, 0.5], squash: [0.012, 0.5], enter: 'nod' },
    thinking: { label: 'Thinking', hint: 'Tilted visor, gazing up, wondering', expr: 'thinking', gaze: 'up', sway: [0.04, 0.3], bob: [0.008, 0.4], emote: ['question', 2.6] },
    working: { label: 'Working', hint: 'Fixes wires on a floating task panel', expr: 'focused', arms: 'type', props: { panel: 1 }, bob: [0.012, 1.6], lean: 0.04, enter: 'nod' },
    speaking: { label: 'Speaking', hint: 'Bounces along, visor glowing as it talks', expr: 'neutral', talk: 1, gaze: 'user', bob: [0.018, 1.3], squash: [0.02, 2.6] },
    done: { label: 'Done', hint: 'Celebration hop and spin, nubs up', expr: 'happy', arms: 'cheer', enter: 'celebrate', bob: [0.02, 1.2], emote: ['star', 3.2] },
    sleeping: { label: 'Sleeping', hint: 'Slumped over, visor dark, snoozing', expr: 'sleepy', gaze: 'closed', lean: 0.13, sink: 0.02, squash: [0.03, 0.22], bob: [0.004, 0.22], props: { dark: 1 }, emote: ['zzz', 2.6] },
    suspicious: { label: 'Suspicious', hint: 'Side-eye, slow lean, glancing left and right', expr: 'suspicious', sway: [0.07, 0.16], bob: [0.004, 0.3], props: { sus: 1 }, emote: ['sweat', 3.0] },
    emergency: { label: 'Emergency', hint: 'Bonks the big red button, alarm flashing', expr: 'alarmed', props: { button: 1, alarm: 1 }, bob: [0.025, 2.2], enter: 'hop', emote: ['bang', 2.4] },
  },
  personality: {
    body: [2.3, 0.45, 1.3],
    eyes: [5.5, 0.7, 0.0],
    squash: [300, 8],
    reach: [0.42, 0.25],
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
      id: 'suit',
      title: 'Suit & visor',
      controls: [
        { type: 'swatches', key: 'color', label: 'Suit colour', colors: CREW_COLORS, custom: true },
        { type: 'chips', key: 'visor', label: 'Visor tint', options: VISORS },
        { type: 'slider', key: 'visorSize', label: 'Visor size', min: 0.85, max: 1.2, step: 0.01 },
        { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS },
      ],
    },
    {
      id: 'gear',
      title: 'Gear',
      controls: [
        { type: 'select', key: 'hat', label: 'Hat', options: HATS },
        { type: 'swatches', key: 'hatColor', label: 'Hat colour', colors: HAT_COLORS, custom: true, when: (c) => COLOURED_HATS.includes(c.hat) },
        { type: 'chips', key: 'backpack', label: 'Backpack', options: PACKS },
        { type: 'chips', key: 'sticker', label: 'Sticker', options: STICKERS },
      ],
    },
    {
      id: 'pet',
      title: 'Companion',
      controls: [
        { type: 'chips', key: 'pet', label: 'Pet', options: PETS },
        { type: 'swatches', key: 'petColor', label: 'Pet colour', colors: CREW_COLORS, custom: true, when: (c) => c.pet !== 'none' },
      ],
    },
  ],
  roster: () => [
    base({ name: 'Mochi', color: '#EE5DB8', hat: 'party', hatColor: '#F4C430', sticker: 'heart', expression: 'happy' }),
    base({ name: 'Comet', color: '#2347D8', visor: 'gold', hat: 'beanie', hatColor: '#F28A1C', backpack: 'jetpack' }),
    base({ name: 'Pepper', color: '#D7262B', hat: 'sprout', pet: 'mini', petColor: '#3EE6D4' }),
    base({ name: 'Jinx', color: '#3A4048', visor: 'mirror', hat: 'tophat', hatColor: '#7240C4', sticker: 'sus', expression: 'suspicious' }),
    base({ name: 'Nimbus', color: '#E4E9F2', hat: 'halo', pet: 'bot', petColor: '#6EE046', sticker: 'star' }),
  ],
  randomize: (c, rnd) => {
    const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
    return {
      ...c,
      color: pick(CREW_COLORS),
      visor: rnd() < 0.55 ? 'cyan' : (pick(VISORS).value as string),
      visorSize: Math.round((0.92 + rnd() * 0.18) * 100) / 100,
      backpack: rnd() < 0.7 ? 'standard' : (pick(PACKS).value as string),
      hat: pick(HATS).value as string,
      hatColor: pick(HAT_COLORS),
      sticker: rnd() < 0.5 ? 'none' : (pick(STICKERS).value as string),
      pet: rnd() < 0.75 ? 'none' : (pick(PETS.slice(1)).value as string),
      petColor: pick(CREW_COLORS),
      expression: pick(EXPRESSIONS.slice(0, 6)).value as string,
    };
  },
  compose: (n, aspect) =>
    groupPhoto(n, aspect, { gap: 1.0, charW: 1.0, charH: 1.25, riser: 0.6, depth: 0.5, fov: deg(18), margin: 0.1, turn: 0.16, lift: 0.12 }),
  solo: (aspect) => soloCamera(aspect, 1.3, 1.25, deg(18), 0.12),
  subtitle: 'Original space-crew vinyl figures · the visor does the emoting',
  headLocal: () => [0, 0.68, 0.2],
  bounds: (c) => {
    const s: Array<[number, number, number, number]> = [[0, 0.5, -0.02, 0.57]];
    if (c.hat !== 'none') s.push([0, 1.05, 0, 0.3]);
    if (c.state === 'working') s.push([PANEL[0], PANEL[1], PANEL[2], 0.25]);
    if (c.state === 'emergency') s.push([0.52, 0.2, 0.13, 0.24]);
    if (c.pet === 'mini') s.push([-0.37, 0.2, 0.35, 0.24]);
    if (c.pet === 'bot') s.push([-0.46, 0.83, 0.1, 0.15]);
    const b = enclose(s);
    const occ: Array<[number, number, number, number]> = [[0, 0.4, 0, 0.32]];
    if (c.pet === 'mini') occ.push([-0.43, 0.12, 0.3, 0.1]);
    return { c: b.c, r: b.r, occ };
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
    const ph = pose.phase;
    const P = pose.props;
    const sus = P.sus ?? 0, panel = P.panel ?? 0, button = P.button ?? 0, dark = P.dark ?? 0;
    const alarm = P.alarm ?? 0, waddle = P.waddle ?? 0;

    const col = hexToLinear(c.color);
    set(0, col[0], col[1], col[2], 0.32);
    const tint = hexToLinear(TINTS[c.visor] ?? TINTS.cyan);
    set(1, tint[0], tint[1], tint[2], idx(VISORS, c.visor));

    // gaze: the visor slides around the bean, the highlight slides inside the visor
    let lookX = pose.lookX, lookY = pose.lookY;
    const glance = Math.tanh(Math.sin(ph * 1.4) * 3.5);
    lookX = lerp(lookX, glance, sus);
    lookX = lerp(lookX, 0.8, panel * 0.85);
    lookY = lerp(lookY, -0.15, panel * 0.6);
    lookX = lerp(lookX, 0.75, button * 0.7);
    lookY = lerp(lookY, -0.45, button * 0.6);
    const yaw = clamp(pose.headYaw * 0.5 + lookX * 0.14 + glance * sus * 0.12, -0.55, 0.55);
    const vy = 0.655 + face.l.dy + clamp(-pose.headPitch * 0.04 + lookY * 0.008, -0.03, 0.03);
    set(2, face.l.dx + lookX * 0.01, vy, yaw, face.l.rot + pose.headRoll * 0.3);
    const blink = pose.blink;
    const vs = c.visorSize;
    const talk = pose.talk;
    set(3, face.l.w * vs, face.l.h * vs * (1 - 0.1 * blink) * (1 + 0.07 * talk), face.l.lid, face.l.lidAng);
    set(4, face.mouth, face.lidB, face.mouthOpen + talk * 0.7, face.cheeks);
    set(5, face.r.dx * 0.07 + lookX * 0.055, face.r.dy * 0.035 + lookY * 0.028, face.r.w * vs, face.r.h * vs * (1 - 0.9 * blink));
    set(6, face.l.kind, clamp(face.r.lid + blink * 0.6 + dark * 0.85, 0, 1), face.r.rot, dark);

    // hat
    const hat = idx(HATS, c.hat);
    set(7, hat, (HAT_TILT[c.hat] ?? 0) + pose.headRoll * 0.4, 0, 0);
    const hc = hexToLinear(c.hatColor);
    set(8, hc[0], hc[1], hc[2], 0);

    // backpack; the jetpack fires while airborne
    const pk = idx(PACKS, c.backpack);
    const flame = pk === 1 ? clamp(pose.offset[1] * 6, 0, 1) : 0;
    set(10, pk, flame, 0, 0);

    // stubby legs: waddle steps, a foot tap while working, tucked in mid-air
    const sw = Math.sin(ph * 0.45 * Math.PI * 2);
    const air = clamp(pose.offset[1] * 0.4, 0, 0.035);
    let lL = waddle * 0.03 * Math.max(0, -sw) + air + Math.max(0, -pose.roll) * 0.25;
    let lR = waddle * 0.03 * Math.max(0, sw) + air + Math.max(0, pose.roll) * 0.25;
    lL += panel * 0.022 * Math.max(0, Math.sin(ph * 7));
    lR += button * 0.02 * Math.max(0, Math.sin(ph * 2.2 * Math.PI * 2));
    lL = Math.min(lL, 0.06);
    lR = Math.min(lR, 0.06);
    const shuffle = waddle * 0.015 * sw;
    set(11, lL, lR, shuffle, -shuffle);

    // arm nubs from the shared arm pose, hidden while at rest
    const nub = (side: number): [Vec3, number] => {
      const a = pose.arms;
      const raise = (side < 0 ? a.lRaise : a.rRaise) + (side > 0 ? a.wave * Math.sin(ph * 9) * 0.35 : 0);
      const fwd = side < 0 ? a.lFwd : a.rFwd;
      const bend = side < 0 ? a.lBend : a.rBend;
      const dev = Math.abs(raise - 0.5) + Math.abs(fwd - 0.2) * 0.8 + Math.abs(bend - 0.3) * 0.3;
      const amt = clamp(dev * 2.5, 0, 1);
      const cf = Math.cos(-fwd), sf = Math.sin(-fwd);
      const u: Vec3 = [side * Math.sin(raise), -Math.cos(raise) * cf, -Math.cos(raise) * sf];
      const tapB = a.tap * Math.max(0, Math.sin(ph * 14 + (side > 0 ? 0 : Math.PI))) * 0.02;
      const len = 0.17 * smoothstep(0, 1, amt);
      return [[side * SHOULDER[0] + u[0] * len, SHOULDER[1] + u[1] * len + tapB, SHOULDER[2] + u[2] * len], amt];
    };
    const [tL, aL] = nub(-1);
    let [tR, aR] = nub(1);
    if (panel > 0.01) {
      // poke the wires on the panel
      const tap = 0.03 * Math.max(0, Math.sin(ph * 12));
      const tgt: Vec3 = [
        PANEL[0] - PANEL_X[0] * 0.135 + PANEL_N[0] * (0.03 + tap),
        PANEL[1] + 0.015 * Math.sin(ph * 4),
        PANEL[2] - PANEL_X[2] * 0.135 + PANEL_N[2] * (0.03 + tap),
      ];
      tR = [lerp(tR[0], tgt[0], panel), lerp(tR[1], tgt[1], panel), lerp(tR[2], tgt[2], panel)];
      aR = Math.max(aR, panel);
    }
    let press = 0;
    if (button > 0.01) {
      // wind up, then bonk the big red button
      const cyc = (ph * 1.1) % 1;
      const slam = cyc < 0.62 ? 0 : cyc < 0.72 ? smoothstep(0.62, 0.72, cyc) : 1 - smoothstep(0.82, 1, cyc);
      press = cyc > 0.7 && cyc < 0.86 ? 1 : 0;
      const up: Vec3 = [0.4, 0.64, 0.13];
      const down: Vec3 = [0.48, 0.46, 0.13];
      const wind = cyc < 0.62 ? smoothstep(0, 0.5, cyc) : 1;
      const raised: Vec3 = [lerp(0.42, up[0], wind), lerp(0.5, up[1], wind), up[2]];
      const tgt: Vec3 = [lerp(raised[0], down[0], slam), lerp(raised[1], down[1], slam), lerp(raised[2], down[2], slam)];
      tR = [lerp(tR[0], tgt[0], button), lerp(tR[1], tgt[1], button), lerp(tR[2], tgt[2], button)];
      aR = Math.max(aR, button);
      press *= button;
    }
    set(12, tL[0], tL[1], tL[2], aL);
    set(13, tR[0], tR[1], tR[2], aR);

    const strobe = alarm * Math.pow(0.5 + 0.5 * Math.sin(ph * 7), 2);
    set(14, panel, button, press, strobe);
    set(15, ph, (ph * 0.22) % 1, 0, 0);

    const pet = idx(PETS, c.pet);
    const hop = pet === 1 ? Math.abs(Math.sin(ph * 3.1)) * (0.035 + 0.05 * pose.excite) : 0.025 * Math.sin(ph * 1.7);
    set(16, pet, hop, ph, pet === 1 ? 0.12 * button : 0);
    const pc = hexToLinear(c.petColor);
    set(17, pc[0], pc[1], pc[2], 0);
    set(18, idx(STICKERS, c.sticker), 0, 0, 0);
    set(19, pose.poke[0], pose.poke[1], pose.poke[2], pose.pokeAmp);
    set(20, pose.wobble * 1.4, pose.wobblePhase, 0, 0);
  },
};

export type CrewAvatar = Avatar<CrewConfig>;
