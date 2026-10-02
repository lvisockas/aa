import type { Camera, CharFrame, FamilyId, Look } from '../engine/renderer';
import type { Vec3 } from '../engine/math';
import type { Pose } from '../avatar/avatar';
import type { Composition } from './compose';

export interface Option {
  value: string | number;
  label: string;
  /** small inline SVG (path data in a 24x24 box) or swatch colour */
  icon?: string;
}

interface ControlBase {
  key: string;
  label: string;
  /** only shown when this returns true for the current config */
  when?: (c: any) => boolean;
}

export type Control = ControlBase &
  (
    | { type: 'text' }
    | { type: 'select'; options: Option[] }
    | { type: 'chips'; options: Option[] }
    | { type: 'icons'; options: Option[] }
    | { type: 'swatches'; colors: string[]; custom?: boolean }
    | { type: 'slider'; min: number; max: number; step: number; unit?: string }
    | { type: 'toggle' }
  );

export interface Section {
  id: string;
  title: string;
  controls: Control[];
  /** collapsed by default */
  collapsed?: boolean;
}

export interface Placement {
  pos: Vec3;
  scale: number;
  yaw: number;
  /** optional fixed roll (radians) for piles / compositions */
  roll?: number;
}

/** Motion & behaviour of one agent state ("working", "thinking"...). */
export interface StateSpec {
  label: string;
  hint: string;
  expr?: string;
  bob?: [number, number];
  squash?: [number, number];
  sway?: [number, number];
  lean?: number;
  shake?: number;
  spin?: number;
  sink?: number;
  gaze?: 'follow' | 'up' | 'down' | 'away' | 'closed' | 'user';
  props?: Record<string, number>;
  talk?: number;
  arms?: string;
  enter?: 'hop' | 'spin' | 'nod' | 'shake' | 'celebrate' | 'none';
  emote?: [EmoteKind, number];
}

export type EmoteKind = 'heart' | 'sparkle' | 'bang' | 'question' | 'zzz' | 'note' | 'sweat' | 'star' | 'check';

/** what a 2D family's draw2d gets besides the context */
export interface Draw2DEnv {
  t: number;
  /** one device pixel in character units */
  px: number;
  /** target size in device pixels */
  size: [number, number];
  /** offscreen 2D context of the given size (cached by id), transform reset and cleared */
  canvas: (id: string, w: number, h: number) => CanvasRenderingContext2D;
  /** squash & stretch and tilt (already applied to ctx unless the family sets pixelMotion) */
  squash: [number, number];
  roll: number;
}

export interface Personality {
  /** body orientation follow: frequency (Hz), damping, response */
  body: [number, number, number];
  /** eye follow */
  eyes: [number, number, number];
  /** squash spring stiffness, damping */
  squash: [number, number];
  /** max body yaw / pitch towards the pointer (radians) */
  reach: [number, number];
  /** fraction of gaze handled by the eyes (vs body) */
  eyeShare: number;
  hopGravity: number;
}

export interface FamilyDef<C extends BaseConfig = BaseConfig> {
  id: FamilyId;
  name: string;
  maker: string;
  tagline: string;
  shader: string;
  /** drawn as a triangle mesh (CharFrame.mesh, shader = mesh fragment shader) instead of ray marched */
  raster?: boolean;
  /** 2D families: draw the character with Canvas2D (ctx is in character units, +y up, origin at the feet) */
  draw2d?(ctx: CanvasRenderingContext2D, c: C, pose: Pose, face: FaceState, env: Draw2DEnv): void;
  /** 2D pixel-art families: skip the smooth squash/tilt, the family snaps motion to its pixel grid */
  pixelMotion?: boolean;
  anchors: number;
  look: Look;
  background: string;
  /** solid colour for exports when `background` is a gradient */
  backgroundSolid?: string;
  dark: boolean;
  traits: string[];
  states: Record<string, StateSpec>;
  defaultState: string;
  personality: Personality;
  schema: Section[];
  roster(): C[];
  randomize(c: C, rnd: () => number): C;
  /** returns a new config when changing `key` implies other changes (e.g. species presets) */
  onChange?(c: C, key: string, value: unknown): C | null;
  /** swaps the arm pose a state asks for (e.g. aims a held megaphone instead of raising it) */
  armPose?(c: C, id: string): string;
  /** placements + camera for n characters on a stage of the given aspect */
  compose(n: number, aspect: number, compact: boolean): Composition;
  /** camera framing one character standing at the origin */
  solo(aspect: number): Camera;
  /** short line shown under the family name */
  subtitle: string;
  /** head position in local space (for gaze & emotes) */
  headLocal(c: C): Vec3;
  /** local bounding sphere and occluders */
  bounds(c: C): { c: Vec3; r: number; occ: Array<[number, number, number, number]> };
  /** fill frame.data (and adjust transform) from config + pose */
  pack(c: C, pose: Pose, frame: CharFrame, face: FaceState): void;
  /** expression ids available for this family */
  expressions: Option[];
  /** build the eye/face state target for an expression */
  face(c: C, expr: string): FaceTarget;
}

export interface BaseConfig {
  name: string;
  state: string;
  expression: string;
  [key: string]: unknown;
}

/** Interpolatable face description shared by all families. */
export interface EyeSpec {
  kind: number;
  w: number;
  h: number;
  rot: number;
  lid: number;
  lidAng: number;
  dx: number;
  dy: number;
}

export interface FaceTarget {
  l: EyeSpec;
  r: EyeSpec;
  lidB: number;
  mouth: number; // smile (+) / frown (-)
  mouthOpen: number;
  cheeks: number;
}

export type FaceState = FaceTarget;
