import { deg, normalize } from '../engine/math';
import type { Pose } from '../avatar/avatar';
import type { BaseConfig, Draw2DEnv, EyeSpec, FaceState, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';

/** Cards: STUB, to be replaced by the full family. */
export interface CardsConfig extends BaseConfig {
  color: string;
}

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
];

const eye = (kind = 0): EyeSpec => ({ kind, w: 1, h: 1, rot: 0, lid: 0, lidAng: 0, dx: 0, dy: 0 });
const faceFor = (_c: CardsConfig, expr: string): FaceTarget => ({ l: eye(), r: eye(), lidB: 0, mouth: expr === 'happy' ? 1 : 0.3, mouthOpen: 0, cheeks: 0 });

const draw = (ctx: CanvasRenderingContext2D, c: CardsConfig, pose: Pose, _face: FaceState, _env: Draw2DEnv) => {
  ctx.beginPath();
  ctx.arc(pose.headYaw * 0.05, 0.45, 0.35, 0, Math.PI * 2);
  ctx.fillStyle = c.color;
  ctx.fill();
};

export const cards: FamilyDef<CardsConfig> = {
  id: 'cards',
  name: 'Cards',
  maker: 'Character cards',
  tagline: 'Character cards · white line-drawn people · colour-coded archetypes',
  subtitle: 'Character cards · white line-drawn people · colour-coded archetypes',
  shader: '',
  anchors: 0,
  background: '#0E5E5A',
  backgroundSolid: '#0E5E5A',
  dark: false,
  traits: ['Stub'],
  look: {
    dark: false, groundShadow: 0, exposure: 1, groundY: 0,
    lights: { key: normalize([-0.5, 0.8, 0.6]), keyI: 1, rim: normalize([0.5, 0.4, -0.7]), rimI: 0.5, fill: normalize([0.8, 0.1, 0.55]), fillI: 0.3, sky: [0.8, 0.8, 0.8], ground: [0.5, 0.5, 0.5], warm: [1, 1, 1], env: 1 },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Breathing, blinking', bob: [0.006, 0.4] },
    listening: { label: 'Listening', hint: 'Eyes on you', gaze: 'user' },
    thinking: { label: 'Thinking', hint: 'Mulling it over', gaze: 'up' },
    working: { label: 'Working', hint: 'Busy', bob: [0.01, 1.6] },
    speaking: { label: 'Speaking', hint: 'Talking', talk: 1, gaze: 'user' },
    done: { label: 'Done', hint: 'A little celebration', expr: 'happy', enter: 'celebrate', emote: ['check', 4] },
    sleeping: { label: 'Sleeping', hint: 'Dozing off', gaze: 'closed', emote: ['zzz', 2.6] },
  },
  personality: { body: [2.0, 0.55, 0.6], eyes: [6.5, 0.85, 0.0], squash: [240, 11], reach: [0.2, 0.14], eyeShare: 0.55, hopGravity: 12 },
  expressions: EXPRESSIONS,
  schema: [
    { id: 'identity', title: 'Identity', controls: [{ type: 'text', key: 'name', label: 'Name' }, { type: 'chips', key: 'state', label: 'State', options: [] }] },
    { id: 'look', title: 'Look', controls: [{ type: 'swatches', key: 'color', label: 'Colour', colors: ['#2BA9E0', '#F2C94C'], custom: true }, { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS }] },
  ],
  roster: () => [{ name: 'Cards 1', state: 'idle', expression: 'neutral', color: '#2BA9E0' }, { name: 'Cards 2', state: 'idle', expression: 'neutral', color: '#F2C94C' }],
  randomize: (c, rnd) => ({ ...c, color: rnd() < 0.5 ? '#2BA9E0' : '#F2C94C' }),
  compose: (n, aspect, compact) =>
    groupPhoto(n, aspect, { gap: compact ? 1.0 : 1.1, charW: 1.05, charH: 1.05, riser: 0, depth: 0, fov: deg(18), margin: 0.1, turn: 0, lift: 0.08 }),
  solo: (aspect) => soloCamera(aspect, 1.05, 1.05, deg(18), 0.08),
  headLocal: () => [0, 0.55, 0.1],
  bounds: () => ({ c: [0, 0.5, 0], r: 0.6, occ: [] }),
  face: faceFor,
  pack: (_c, _pose, f) => {
    f.data.fill(0);   // drawn in 2D by draw2d
  },
  draw2d: draw,
};
