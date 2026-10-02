import { clamp, quatEuler, quatRotate, rng, sub, type Vec3 } from '../engine/math';
import { Dyn, Spring, damp } from '../engine/spring';
import type { CharFrame } from '../engine/renderer';
import type { BaseConfig, EmoteKind, EyeSpec, FaceState, FaceTarget, FamilyDef, Placement, StateSpec } from '../families/types';

/** Everything a family needs to pose its character for one frame. */
export interface Pose {
  t: number;
  offset: Vec3;
  yaw: number;
  pitch: number;
  roll: number;
  headYaw: number;
  headPitch: number;
  headRoll: number;
  lookX: number;
  lookY: number;
  blink: number;
  squash: number;
  poke: Vec3;
  pokeAmp: number;
  wobble: number;
  wobblePhase: number;
  talk: number;
  excite: number;
  pet: number;
  props: Record<string, number>;
  phase: number;
  arms: ArmPose;
  morph: number;
}

export interface ArmPose {
  lRaise: number;
  rRaise: number;
  lFwd: number;
  rFwd: number;
  lBend: number;
  rBend: number;
  wave: number;
  tap: number;
}

export const ARM_POSES: Record<string, ArmPose> = {
  rest: { lRaise: 0.5, rRaise: 0.5, lFwd: 0.2, rFwd: 0.2, lBend: 0.3, rBend: 0.3, wave: 0, tap: 0 },
  wave: { lRaise: 0.5, rRaise: 2.3, lFwd: 0.2, rFwd: 0.3, lBend: 0.3, rBend: 0.6, wave: 1, tap: 0 },
  type: { lRaise: 0.45, rRaise: 0.45, lFwd: 1.05, rFwd: 1.05, lBend: 0.9, rBend: 0.9, wave: 0, tap: 1 },
  cheer: { lRaise: 2.5, rRaise: 2.5, lFwd: 0.2, rFwd: 0.2, lBend: 0.3, rBend: 0.3, wave: 0.4, tap: 0 },
  think: { lRaise: 0.2, rRaise: 0.95, lFwd: 0.2, rFwd: 1.2, lBend: 0.2, rBend: 1.9, wave: 0, tap: 0 },
  hold: { lRaise: 0.5, rRaise: 0.55, lFwd: 0.2, rFwd: 0.85, lBend: 0.3, rBend: 1.1, wave: 0, tap: 0 },
  hug: { lRaise: 0.75, rRaise: 0.75, lFwd: 1.1, rFwd: 1.1, lBend: 1.0, rBend: 1.0, wave: 0, tap: 0 },
  rally: { lRaise: 0.55, rRaise: 2.75, lFwd: 0.25, rFwd: 0.35, lBend: 0.5, rBend: 0.25, wave: 0.15, tap: 0 },
  aim: { lRaise: 0.55, rRaise: 2.55, lFwd: 0.25, rFwd: -0.2, lBend: 0.5, rBend: 1.15, wave: 0, tap: 0 },
};

export interface UpdateContext {
  t: number;
  /** pointer target in world space, or null when the pointer is outside */
  pointer: Vec3 | null;
  /** seconds since the pointer last moved */
  pointerIdle: number;
  camera: Vec3;
  neighbors: Avatar[];
  reducedMotion: boolean;
}

export type EmoteSink = (a: Avatar, kind: EmoteKind) => void;

const cloneEye = (e: EyeSpec): EyeSpec => ({ ...e });
const cloneFace = (f: FaceTarget): FaceState => ({ ...f, l: cloneEye(f.l), r: cloneEye(f.r) });

let uid = 1;

export class Avatar<C extends BaseConfig = BaseConfig> {
  readonly id = uid++;
  config: C;
  home: Placement = { pos: [0, 0, 0], scale: 1, yaw: 0 };
  readonly frame: CharFrame;
  readonly pose: Pose;
  face: FaceState;
  hovered = false;
  selected = false;

  private rnd: () => number;
  private yawD: Dyn;
  private pitchD: Dyn;
  private headYawD: Dyn;
  private headPitchD: Dyn;
  private eyeXD: Dyn;
  private eyeYD: Dyn;
  private squashS: Spring;
  private pokeS = new Spring(0, 320, 9);
  private hopY = 0;
  private hopV = 0;
  private jumpAt = -1;
  private jumpV = 0;
  private spinA = 0;
  private spinV = 0;
  private rollS = new Spring(0, 90, 7);
  private yawKick = new Spring(0, 70, 6);
  private nodS = new Spring(0, 110, 8);
  private wobA = 0;
  private wobP = 0;
  private blinkStart = -1;
  private nextBlink = 1;
  private swapPending = false;
  private faceTarget: FaceTarget;
  private override: { expr: string; until: number } | null = null;
  private stateId: string;
  private stateT = 0;
  private amp = { bob: 0, bobF: 1, squash: 0, squashF: 1, sway: 0, swayF: 1, lean: 0, shake: 0, spin: 0, sink: 0, talk: 0 };
  private wander: Vec3 = [0, 0, 5];
  private nextWander = 0;
  private holdStart = -1;
  private holdSquash = 0;
  private clicks: number[] = [];
  private lastEmote = 0;
  private dragLean = 0;
  private excite = 0;
  private pet = 0;
  private morphT = 1;
  private armD: Record<keyof ArmPose, Dyn>;
  private lastT = 0;

  constructor(
    readonly family: FamilyDef<C>,
    config: C,
    private emit: EmoteSink,
    seed = 1,
  ) {
    this.config = config;
    this.rnd = rng(seed * 7919 + 13);
    const P = family.personality;
    this.yawD = new Dyn(0, ...P.body);
    this.pitchD = new Dyn(0, ...P.body);
    this.headYawD = new Dyn(0, P.body[0] * 1.8, P.body[1], P.body[2]);
    this.headPitchD = new Dyn(0, P.body[0] * 1.8, P.body[1], P.body[2]);
    this.eyeXD = new Dyn(0, ...P.eyes);
    this.eyeYD = new Dyn(0, ...P.eyes);
    this.squashS = new Spring(0, P.squash[0], P.squash[1]);
    this.stateId = config.state;
    this.faceTarget = family.face(config, config.expression);
    this.face = cloneFace(this.faceTarget);
    this.nextBlink = 0.5 + this.rnd() * 3;
    this.nextWander = this.rnd() * 2;
    // start already in the state's pose so first frames (and stills) look right
    const rest = ARM_POSES[this.armPoseId()] ?? ARM_POSES.rest;
    this.armD = Object.fromEntries(
      (Object.keys(rest) as Array<keyof ArmPose>).map((k) => [k, new Dyn(rest[k], 1.6, 0.55, 0.4)]),
    ) as Record<keyof ArmPose, Dyn>;
    this.frame = {
      pos: [0, 0, 0],
      scale: 1,
      rot: [0, 0, 0, 1],
      squash: [1, 1, 1],
      boundC: [0, 0.5, 0],
      boundR: 1,
      occ: [],
      data: new Float32Array(32 * 4),
    };
    this.pose = {
      t: 0,
      offset: [0, 0, 0],
      yaw: 0,
      pitch: 0,
      roll: 0,
      headYaw: 0,
      headPitch: 0,
      headRoll: 0,
      lookX: 0,
      lookY: 0,
      blink: 0,
      squash: 0,
      poke: [0, 0.5, 0.5],
      pokeAmp: 0,
      wobble: 0,
      wobblePhase: 0,
      talk: 0,
      excite: 0,
      pet: 0,
      props: {},
      phase: this.rnd() * 100,
      arms: { ...(ARM_POSES[this.armPoseId()] ?? rest) },
      morph: 1,
    };
  }

  get state(): string {
    return this.stateId;
  }

  get spec(): StateSpec {
    return this.family.states[this.stateId] ?? this.family.states[this.family.defaultState];
  }

  /** world-space head position */
  headWorld(): Vec3 {
    const h = this.family.headLocal(this.config);
    const r = quatRotate(quatEuler(this.home.yaw, 0, this.home.roll ?? 0), h);
    return [
      this.home.pos[0] + r[0] * this.home.scale,
      this.home.pos[1] + r[1] * this.home.scale,
      this.home.pos[2] + r[2] * this.home.scale,
    ];
  }

  setState(id: string, t: number): void {
    if (!this.family.states[id]) return;
    this.config.state = id;
    if (id === this.stateId) return;
    this.stateId = id;
    this.stateT = 0;
    const enter = this.family.states[id].enter ?? 'none';
    if (enter === 'hop') this.jump(1.6, t);
    else if (enter === 'spin') this.spin();
    else if (enter === 'nod') this.nodS.kick(-3.2);
    else if (enter === 'shake') this.yawKick.kick(5);
    else if (enter === 'celebrate') {
      this.jump(2.6, t);
      this.spin();
      this.emit(this, 'sparkle');
    }
  }

  /** Re-evaluate the face after a config change. */
  refreshFace(): void {
    this.faceTarget = this.family.face(this.config, this.currentExpr(this.lastT));
  }

  markMorph(): void {
    this.morphT = 0;
    this.wobA = Math.max(this.wobA, 0.04);
    this.squashS.kick(-1.2);
  }

  jump(v: number, t: number): void {
    if (this.jumpAt > 0 || this.hopY > 0.001) return;
    this.squashS.kick(2.2); // anticipation
    this.jumpAt = t + 0.07;
    this.jumpV = v;
  }

  spin(): void {
    this.spinV = 0;
    this.spinA -= Math.PI * 2;
  }

  // ---------------------------------------------------------------- input
  onHover(on: boolean, t: number): void {
    if (on && !this.hovered && t - this.lastEmote > 2.5 && this.rnd() < 0.4) {
      this.jump(1.0, t);
    }
    this.hovered = on;
  }

  /** A click / tap at `q` (local squash space). */
  boop(q: Vec3, t: number): void {
    this.pose.poke = q;
    this.pokeS.x = 0.055;
    this.pokeS.v = 0;
    this.squashS.kick(3.2);
    this.wobA = Math.max(this.wobA, 0.035);
    this.wobP = 0;
    // lean away from the poke a little
    this.rollS.kick(-q[0] * 7);
    this.nodS.kick((q[1] - 0.55) * 4);
    this.clicks = this.clicks.filter((c) => t - c < 1.6);
    this.clicks.push(t);
    if (this.clicks.length >= 5) {
      this.override = { expr: this.familyExpr('dizzy'), until: t + 2.2 };
      this.emit(this, 'star');
      this.clicks = [];
    } else {
      this.override = { expr: this.familyExpr('squeeze'), until: t + 0.55 };
      if (t - this.lastEmote > 0.35) {
        this.emit(this, this.rnd() < 0.6 ? 'heart' : 'sparkle');
        this.lastEmote = t;
      }
      if (this.hopY <= 0.001) {
        this.jumpAt = t + 0.13;
        this.jumpV = 1.3;
      }
    }
  }

  pressStart(t: number): void {
    this.holdStart = t;
  }

  pressEnd(t: number, wasHold: boolean): void {
    if (wasHold && this.holdSquash > 0.05) {
      const v = 2.0 + this.holdSquash * 9;
      this.hopV = 0;
      this.jumpAt = -1;
      this.holdStart = -1;
      this.hopY = 0.0001;
      this.hopV = v;
      this.squashS.kick(-6);
      this.emit(this, 'sparkle');
      this.override = { expr: this.familyExpr('excited'), until: t + 0.9 };
    }
    this.holdStart = -1;
  }

  /** Pointer dragged across the avatar while pressed: petting. vx in CSS px/s. */
  petMove(vx: number, t: number): void {
    this.holdStart = -1;
    this.pet = Math.min(1, this.pet + 0.12);
    this.dragLean = clamp(this.dragLean + vx * 0.00035, -0.35, 0.35);
    this.override = { expr: this.familyExpr('pet'), until: t + 0.6 };
    if (t - this.lastEmote > 0.7) {
      this.emit(this, 'heart');
      this.lastEmote = t;
    }
  }

  trick(t: number): void {
    this.spin();
    this.jump(2.2, t);
    this.override = { expr: this.familyExpr('excited'), until: t + 1.0 };
  }

  private familyExpr(kind: 'squeeze' | 'dizzy' | 'pet' | 'excited'): string {
    const map: Record<string, Record<string, string>> = {
      grok: { squeeze: 'laugh', dizzy: 'dizzy', pet: 'happy', excited: 'starstruck' },
      dots: { squeeze: 'squeeze', dizzy: 'dizzy', pet: 'happy', excited: 'excited' },
      muse: { squeeze: 'laugh', dizzy: 'dizzy', pet: 'blissful', excited: 'excited' },
      rebel: { squeeze: 'laugh', dizzy: 'dizzy', pet: 'happy', excited: 'wow' },
    };
    return map[this.family.id]?.[kind] ?? 'happy';
  }

  private currentExpr(t: number): string {
    if (this.override && t < this.override.until) return this.override.expr;
    this.override = null;
    return this.spec.expr ?? this.config.expression;
  }

  // ---------------------------------------------------------------- update
  update(dt: number, ctx: UpdateContext): void {
    const t = ctx.t;
    this.lastT = t;
    dt = Math.min(dt, 1 / 20);
    this.stateT += dt;
    const S = this.spec;
    const P = this.family.personality;
    const motion = ctx.reducedMotion ? 0.35 : 1;

    // --- state amplitudes ease in/out so state changes never pop
    const k = 1 - Math.exp(-4 * dt);
    const a = this.amp;
    a.bob += ((S.bob?.[0] ?? 0.008) * motion - a.bob) * k;
    a.bobF += ((S.bob?.[1] ?? 0.45) - a.bobF) * k;
    a.squash += ((S.squash?.[0] ?? 0.012) * motion - a.squash) * k;
    a.squashF += ((S.squash?.[1] ?? 0.45) - a.squashF) * k;
    a.sway += ((S.sway?.[0] ?? 0) * motion - a.sway) * k;
    a.swayF += ((S.sway?.[1] ?? 0.5) - a.swayF) * k;
    a.lean += ((S.lean ?? 0) - a.lean) * k;
    a.shake += ((S.shake ?? 0) * motion - a.shake) * k;
    a.spin += ((S.spin ?? 0) - a.spin) * k;
    a.sink += ((S.sink ?? 0) - a.sink) * k;
    a.talk += ((S.talk ?? 0) - a.talk) * k;

    const pose = this.pose;
    pose.phase += dt;
    const ph = pose.phase;

    // --- gaze target
    const head = this.headWorld();
    let target: Vec3;
    let eyesClosed = false;
    const followPointer = ctx.pointer && ctx.pointerIdle < 10;
    if (S.gaze === 'up') target = [head[0] - 0.8, head[1] + 1.1, head[2] + 1.6];
    else if (S.gaze === 'down') target = [head[0], head[1] - 1.2, head[2] + 1.4];
    else if (S.gaze === 'away') target = [head[0] + 1.5 * Math.sin(ph * 0.4), head[1] + 0.2, head[2] + 1.0];
    // "look at the user": the cursor is where the user is while it moves, the camera otherwise
    else if (S.gaze === 'user') target = followPointer && ctx.pointer ? ctx.pointer : ctx.camera;
    else if (S.gaze === 'closed') {
      target = [head[0], head[1] - 0.3, head[2] + 2];
      eyesClosed = true;
    } else if (followPointer && ctx.pointer) target = ctx.pointer;
    else {
      if (t > this.nextWander) {
        const r = this.rnd();
        if (ctx.pointer && r < 0.45) this.wander = ctx.pointer; // keep checking on you
        else if (r < 0.65 && ctx.neighbors.length > 1) {
          const others = ctx.neighbors.filter((n) => n !== this);
          this.wander = others[Math.floor(this.rnd() * others.length)].headWorld();
        } else if (r < 0.8) this.wander = ctx.camera;
        else this.wander = [head[0] + (this.rnd() - 0.5) * 3, head[1] + (this.rnd() - 0.4) * 1.6, head[2] + 2.5];
        this.nextWander = t + 1.2 + this.rnd() * 3;
        if (this.rnd() < 0.5) this.startBlink(t);
      }
      target = this.wander;
    }

    // relative direction in the avatar's home frame
    const d = sub(target, head);
    const cy = Math.cos(-this.home.yaw), sy = Math.sin(-this.home.yaw);
    const lx = d[0] * cy + d[2] * sy;
    const lz = -d[0] * sy + d[2] * cy;
    const yawT = Math.atan2(lx, Math.max(lz, 0.05));
    const pitchT = Math.atan2(d[1], Math.hypot(lx, lz));
    const [reachY, reachP] = P.reach;
    const share = 1 - P.eyeShare;
    const bodyYaw = this.yawD.update(clamp(yawT * share, -reachY, reachY) * motion, dt);
    const bodyPitch = this.pitchD.update(clamp(pitchT * share, -reachP, reachP) * motion, dt);
    const headYaw = this.headYawD.update(clamp(yawT * 0.75, -0.9, 0.9) * motion, dt);
    const headPitch = this.headPitchD.update(clamp(pitchT * 0.7, -0.5, 0.45) * motion, dt);
    pose.lookX = this.eyeXD.update(clamp((yawT - bodyYaw) / 0.7, -1, 1), dt);
    pose.lookY = this.eyeYD.update(clamp((pitchT - bodyPitch) / 0.55, -1, 1), dt);

    // --- interaction state
    this.excite = damp(this.excite, this.hovered ? 1 : 0, 6, dt);
    this.pet = damp(this.pet, 0, 2.5, dt);
    this.dragLean = damp(this.dragLean, 0, 3, dt);
    if (this.holdStart > 0 && t - this.holdStart > 0.22) this.holdSquash = Math.min(0.32, this.holdSquash + dt * 0.9);
    else this.holdSquash = damp(this.holdSquash, 0, 10, dt);
    pose.excite = this.excite;
    pose.pet = this.pet;

    // --- hop (ballistic) with anticipation
    if (this.jumpAt > 0 && t >= this.jumpAt) {
      this.hopV = this.jumpV;
      this.hopY = 0.0001;
      this.jumpAt = -1;
      this.squashS.kick(-5.5);
    }
    if (this.hopY > 0) {
      this.hopV -= P.hopGravity * dt;
      this.hopY += this.hopV * dt;
      if (this.hopY <= 0) {
        this.squashS.kick(Math.min(7, Math.abs(this.hopV) * 2.6));
        this.hopY = 0;
        this.hopV = 0;
      }
    }

    // --- spin (critically damped towards 0)
    this.spinV += (-this.spinA * 60 - this.spinV * 13) * dt;
    this.spinA += this.spinV * dt;

    // --- rhythmic state motion
    const bob = a.bob * Math.sin(ph * a.bobF * Math.PI * 2);
    const sq = a.squash * Math.sin(ph * a.squashF * Math.PI * 2 + 0.6);
    const sway = a.sway * Math.sin(ph * a.swayF * Math.PI * 2);
    const shake = a.shake * Math.sin(ph * 26) * (0.5 + 0.5 * Math.sin(ph * 2.3) > 0.35 ? 1 : 0.15);
    const breathe = 0.01 * Math.sin(ph * 1.7) * motion;

    const squash = this.squashS.update(sq + this.holdSquash + breathe, dt);
    pose.squash = squash;
    pose.offset = [this.dragLean * 0.15, Math.max(0, bob) * 0.7 + bob * 0.3 + this.hopY - a.sink, 0];
    pose.yaw = bodyYaw + shake + this.yawKick.update(0, dt) + this.spinA + a.spin * ph;
    pose.pitch = -bodyPitch * 0.6 + a.lean + this.nodS.update(0, dt);
    pose.roll = sway + this.rollS.update(0, dt) - this.dragLean;
    pose.headYaw = headYaw - bodyYaw * 0.5;
    pose.headPitch = -headPitch;
    pose.headRoll = sway * 0.5 - this.dragLean * 0.5 + (this.pet > 0.2 ? Math.sin(ph * 3) * 0.08 * this.pet : 0);
    pose.pokeAmp = this.pokeS.update(0, dt);
    this.wobA *= Math.exp(-3.2 * dt);
    this.wobP += dt * 19;
    pose.wobble = this.wobA;
    pose.wobblePhase = this.wobP;
    this.morphT = Math.min(1, this.morphT + dt * 2.6);
    pose.morph = this.morphT;
    pose.t = t;

    // --- talking: syllable-like envelope
    pose.talk = a.talk * Math.max(0, Math.sin(ph * 11.0) * Math.sin(ph * 3.7 + 1.0) * 1.3 + 0.15);

    // --- props
    const props = S.props ?? {};
    for (const key of new Set([...Object.keys(props), ...Object.keys(pose.props)])) {
      pose.props[key] = damp(pose.props[key] ?? 0, props[key] ?? 0, 5, dt);
    }

    // --- arms (families with limbs)
    const armTarget = ARM_POSES[this.armPoseId()] ?? ARM_POSES.rest;
    for (const key of Object.keys(armTarget) as Array<keyof ArmPose>) {
      pose.arms[key] = this.armD[key].update(armTarget[key], dt);
    }

    // --- blink & face
    if (t > this.nextBlink) this.startBlink(t);
    let blink = 0;
    if (this.blinkStart >= 0) {
      const bt = t - this.blinkStart;
      blink = bt < 0.06 ? bt / 0.06 : bt < 0.16 ? 1 - (bt - 0.06) / 0.1 : 0;
      if (bt >= 0.16) this.blinkStart = -1;
    }
    const expr = this.currentExpr(t);
    const tgt = this.family.face(this.config, expr);
    const kindChange = tgt.l.kind !== this.face.l.kind || tgt.r.kind !== this.face.r.kind;
    if (kindChange && !this.swapPending) {
      this.swapPending = true;
      this.startBlink(t);
    }
    if (this.swapPending && blink > 0.7) {
      this.face.l.kind = tgt.l.kind;
      this.face.r.kind = tgt.r.kind;
      this.swapPending = false;
    }
    if (!kindChange) this.swapPending = false;
    this.faceTarget = tgt;
    const fk = 1 - Math.exp(-16 * dt);
    const lerpEye = (e: EyeSpec, g: EyeSpec) => {
      e.w += (g.w - e.w) * fk;
      e.h += (g.h - e.h) * fk;
      e.rot += (g.rot - e.rot) * fk;
      e.lid += (g.lid - e.lid) * fk;
      e.lidAng += (g.lidAng - e.lidAng) * fk;
      e.dx += (g.dx - e.dx) * fk;
      e.dy += (g.dy - e.dy) * fk;
    };
    lerpEye(this.face.l, tgt.l);
    lerpEye(this.face.r, tgt.r);
    this.face.lidB += (tgt.lidB - this.face.lidB) * fk;
    this.face.mouth += (tgt.mouth - this.face.mouth) * fk;
    this.face.mouthOpen += (tgt.mouthOpen - this.face.mouthOpen) * fk;
    this.face.cheeks += (tgt.cheeks - this.face.cheeks) * fk;
    pose.blink = eyesClosed ? 1 : blink;

    // --- periodic state emotes
    if (S.emote && this.stateT > 0.5 && t - this.lastEmote > S.emote[1]) {
      this.emit(this, S.emote[0]);
      this.lastEmote = t + this.rnd() * 0.5;
    }
  }

  private armPoseId(): string {
    const S = this.family.states[this.config.state] ?? this.family.states[this.family.defaultState];
    const c = this.config as { held?: number; prop?: number };
    const id = S.arms && S.arms !== 'rest' ? S.arms : this.pet > 0.3 ? 'hug' : c.held || c.prop ? 'hold' : 'rest';
    return this.family.armPose?.(this.config, id) ?? id;
  }

  private startBlink(t: number): void {
    if (this.blinkStart >= 0) return;
    this.blinkStart = t;
    this.nextBlink = t + 1.8 + this.rnd() * 4.2;
    if (this.rnd() < 0.15) this.nextBlink = t + 0.28;
  }

  /** Build the render frame for this avatar. */
  build(): CharFrame {
    const f = this.frame;
    const pose = this.pose;
    const h = this.home;
    const s = clamp(pose.squash, -0.35, 0.45);
    const sy = 1 - s;
    const sxz = 1 / Math.sqrt(Math.max(sy, 0.2));
    f.squash = [sxz, sy, sxz];
    f.scale = h.scale;
    f.rot = quatEuler(h.yaw + pose.yaw, pose.pitch, (h.roll ?? 0) + pose.roll);
    f.pos = [h.pos[0] + pose.offset[0] * h.scale, h.pos[1] + pose.offset[1] * h.scale, h.pos[2] + pose.offset[2] * h.scale];
    const b = this.family.bounds(this.config);
    f.boundC = b.c;
    f.boundR = b.r;
    f.occ = b.occ;
    this.family.pack(this.config, pose, f, this.face);
    return f;
  }
}
