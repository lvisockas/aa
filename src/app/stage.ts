import { Avatar } from '../avatar/avatar';
import { add, clamp, cross, lerp, normalize, quatEuler, quatRotate, sub, dot, type Vec3 } from '../engine/math';
import { damp } from '../engine/spring';
import type { Camera, Renderer, View } from '../engine/renderer';
import type { BaseConfig, EmoteKind, FamilyDef } from '../families/types';
import type { Composition } from '../families/compose';
import type { Overlay, Tag } from './overlay';

export interface StageOptions {
  compact: boolean;
  /** pixels covered by stage UI at the top / bottom; the cast is framed in between */
  insets?: [number, number] | (() => [number, number]);
  /** show a name tag over the selected avatar */
  tags: boolean;
  slot: number;
  onSelect?: (index: number) => void;
  onActivity?: () => void;
}

interface Press {
  index: number;
  id: number;
  x: number;
  y: number;
  t: number;
  moved: boolean;
  lastX: number;
  lastT: number;
}

/**
 * A DOM element that hosts a family's roster and shows one avatar at a time
 * (the selected one): camera framing, pointer picking, gaze targets and emote
 * anchoring. The renderer draws every stage into one shared full-window
 * canvas, scissored to the element's rectangle.
 */
export class Stage<C extends BaseConfig = BaseConfig> {
  avatars: Avatar<C>[] = [];
  selected = 0;
  ready = false;
  private cam: Camera | null = null;
  private rect = { left: 0, top: 0, width: 1, height: 1 };
  private view: View | null = null;
  private hoverIdx = -1;
  private press: Press | null = null;
  private tagAlpha = 0;
  private shown: Avatar<C> | null = null;
  private shownAt = -Infinity;
  private parallax: [number, number] = [0, 0];
  private comp: Composition | null = null;
  private placed = false;

  constructor(
    readonly el: HTMLElement,
    readonly family: FamilyDef<C>,
    configs: C[],
    private renderer: Renderer,
    private overlay: Overlay,
    readonly opts: StageOptions,
  ) {
    this.setConfigs(configs);
    this.bind();
  }

  setConfigs(configs: C[]): void {
    this.avatars = configs.map(
      (c, i) => new Avatar(this.family, c, (a, kind) => this.emote(a as Avatar<C>, kind), i + 1 + this.opts.slot * 31),
    );
    this.placed = false;
    this.selected = Math.min(this.selected, this.avatars.length - 1);
  }

  /** the one avatar on stage */
  private get lead(): Avatar<C> | undefined {
    return this.avatars[this.selected];
  }

  private freeHeight(): number {
    const [top, bottom] = this.insets();
    return Math.max(this.rect.height - top - bottom, this.rect.height * 0.45);
  }

  private insets(): [number, number] {
    const raw = this.opts.insets;
    const [top, bottom] = typeof raw === 'function' ? raw() : raw ?? [0, 0];
    // never let the UI eat more than ~45% of a small stage
    const k = Math.min(1, (this.rect.height * 0.45) / Math.max(top + bottom, 1));
    return [top * k, bottom * k];
  }

  /** Re-compose for the current aspect; the home glides to its new spot. */
  private compose(dt: number): void {
    const aspect = this.rect.width / Math.max(this.freeHeight(), 1);
    this.comp = this.family.compose(1, aspect, this.opts.compact);
    const a = this.lead;
    const p = this.comp.placements[0];
    if (!a || !p) return;
    const k = this.placed ? 1 - Math.exp(-6 * dt) : 1;
    const h = a.home;
    h.pos = [lerp(h.pos[0], p.pos[0], k), lerp(h.pos[1], p.pos[1], k), lerp(h.pos[2], p.pos[2], k)];
    h.scale = lerp(h.scale, p.scale, k);
    h.yaw = lerp(h.yaw, p.yaw, k);
    h.roll = lerp(h.roll ?? 0, p.roll ?? 0, k);
    this.placed = true;
  }

  get dark(): boolean {
    return this.family.dark;
  }

  // ------------------------------------------------------------- camera
  private targetCamera(): Camera {
    const freeH = this.freeHeight();
    const aspect = this.rect.width / Math.max(freeH, 1);
    const target = this.comp?.placements[0];
    let cam = this.family.solo(aspect);
    if (target) {
      const s = target.scale;
      const off: Vec3 = target.pos;
      const rel = sub(cam.pos, cam.target);
      const tgt: Vec3 = [cam.target[0] * s + off[0], cam.target[1] * s + off[1], cam.target[2] * s + off[2]];
      cam = { pos: add(tgt, [rel[0] * s, rel[1] * s, rel[2] * s]), target: tgt, fov: cam.fov };
    }
    // frame inside the free band: widen the lens to the full height and shift it
    const [top, bottom] = this.insets();
    const h = Math.max(this.rect.height, 1);
    const fov = 2 * Math.atan(Math.tan(cam.fov / 2) * (h / freeH));
    return { ...cam, fov, shift: [0, (bottom - top) / h] };
  }

  private updateCamera(dt: number, pointer: { x: number; y: number } | null, motion: number): Camera {
    const tgt = this.targetCamera();
    // gentle parallax towards the pointer adds depth without stealing control
    const px = pointer ? clamp(((pointer.x - this.rect.left) / this.rect.width - 0.5) * 2, -1.5, 1.5) : 0;
    const py = pointer ? clamp(((pointer.y - this.rect.top) / this.rect.height - 0.5) * 2, -1.5, 1.5) : 0;
    this.parallax[0] = damp(this.parallax[0], px * motion, 2.5, dt);
    this.parallax[1] = damp(this.parallax[1], py * motion, 2.5, dt);
    const dist = Math.hypot(...sub(tgt.pos, tgt.target));
    const pos: Vec3 = [
      tgt.pos[0] + this.parallax[0] * dist * 0.012,
      tgt.pos[1] - this.parallax[1] * dist * 0.008,
      tgt.pos[2],
    ];
    const shift = tgt.shift ?? [0, 0];
    if (!this.cam) this.cam = { pos, target: [...tgt.target] as Vec3, fov: tgt.fov, shift: [...shift] as [number, number] };
    const k = 1 - Math.exp(-5 * dt);
    for (let i = 0; i < 3; i++) {
      this.cam.pos[i] = lerp(this.cam.pos[i], pos[i], k);
      this.cam.target[i] = lerp(this.cam.target[i], tgt.target[i], k);
    }
    this.cam.fov = lerp(this.cam.fov, tgt.fov, k);
    const cs = this.cam.shift!;
    cs[0] = lerp(cs[0], shift[0], k);
    cs[1] = lerp(cs[1], shift[1], k);
    return this.cam;
  }

  /** world-space ray through a client pixel */
  ray(clientX: number, clientY: number): { o: Vec3; d: Vec3 } | null {
    if (!this.cam) return null;
    const r = this.rect;
    const c = this.cam;
    const f = normalize(sub(c.target, c.pos));
    const right = normalize(cross(f, [0, 1, 0]));
    const up = cross(right, f);
    const focal = 1 / Math.tan(c.fov / 2);
    const sh = c.shift ?? [0, 0];
    const ux = (clientX - r.left - r.width / 2) / (r.height / 2) - sh[0];
    const uy = -(clientY - r.top - r.height / 2) / (r.height / 2) - sh[1];
    const d = normalize(add(add([right[0] * ux, right[1] * ux, right[2] * ux], [up[0] * uy, up[1] * uy, up[2] * uy]), [f[0] * focal, f[1] * focal, f[2] * focal]));
    return { o: [...c.pos] as Vec3, d };
  }

  project(p: Vec3): { x: number; y: number; z: number } | null {
    if (!this.cam) return null;
    const c = this.cam;
    const f = normalize(sub(c.target, c.pos));
    const right = normalize(cross(f, [0, 1, 0]));
    const up = cross(right, f);
    const v = sub(p, c.pos);
    const z = dot(v, f);
    if (z <= 0.01) return null;
    const focal = 1 / Math.tan(c.fov / 2);
    const sh = c.shift ?? [0, 0];
    const x = (dot(v, right) / z) * focal + sh[0];
    const y = (dot(v, up) / z) * focal + sh[1];
    const r = this.rect;
    return { x: r.left + r.width / 2 + (x * r.height) / 2, y: r.top + r.height / 2 - (y * r.height) / 2, z };
  }

  private headTop(a: Avatar<C>): Vec3 {
    const h = this.family.headLocal(a.config);
    const b = this.family.bounds(a.config);
    const top: Vec3 = [h[0], b.c[1] + b.r * 0.62, h[2] * 0.3];
    const r = quatRotate(quatEuler(a.home.yaw, 0, a.home.roll ?? 0), top);
    const o = a.pose.offset;
    return [
      a.home.pos[0] + (r[0] + o[0]) * a.home.scale,
      a.home.pos[1] + (r[1] + o[1]) * a.home.scale,
      a.home.pos[2] + (r[2] + o[2]) * a.home.scale,
    ];
  }

  private emote(a: Avatar<C>, kind: EmoteKind): void {
    const p = this.project(this.headTop(a));
    if (!p) return;
    const scale = clamp(this.rect.height / 520, 0.7, 1.4);
    this.overlay.spawn(kind, p.x, p.y, scale);
  }

  // ------------------------------------------------------------- picking
  private hitTest(clientX: number, clientY: number): number {
    const ray = this.ray(clientX, clientY);
    if (!ray || !this.view) return -1;
    let best = -1, bestT = Infinity;
    this.view.chars.forEach((c, i) => {
      const sq = Math.max(...c.squash);
      const center = add(c.pos, quatRotate(c.rot, [c.boundC[0] * c.squash[0] * c.scale, c.boundC[1] * c.squash[1] * c.scale, c.boundC[2] * c.squash[2] * c.scale]));
      const r = c.boundR * c.scale * sq * 0.72;
      const oc = sub(ray.o, center);
      const b = dot(oc, ray.d);
      const h = b * b - (dot(oc, oc) - r * r);
      if (h < 0) return;
      const t = -b - Math.sqrt(h);
      if (t > 0 && t < bestT) {
        bestT = t;
        best = i;
      }
    });
    return best < 0 ? -1 : this.selected;
  }

  private gpuPick(clientX: number, clientY: number): { index: number; q: Vec3 } | null {
    if (!this.view) return null;
    const r = this.renderer.pick(this.view, this.opts.slot, clientX, clientY);
    if (r) return { index: this.selected, q: r.q };
    const i = this.hitTest(clientX, clientY);
    if (i < 0) return null;
    const a = this.avatars[i];
    return { index: i, q: this.family.headLocal(a.config) };
  }

  private bind(): void {
    const el = this.el;
    const now = () => performance.now() / 1000;
    el.addEventListener('pointerdown', (e) => {
      if (!this.ready || e.button > 0) return;
      const hit = this.gpuPick(e.clientX, e.clientY);
      this.opts.onActivity?.();
      if (!hit) return;
      el.setPointerCapture(e.pointerId);
      const a = this.avatars[hit.index];
      this.press = { index: hit.index, id: e.pointerId, x: e.clientX, y: e.clientY, t: now(), moved: false, lastX: e.clientX, lastT: now() };
      (this.press as Press & { q?: Vec3 }).q = hit.q;
      a.pressStart(now());
      if (this.opts.onSelect) this.opts.onSelect(hit.index);
      el.dataset.press = 'true';
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.press;
      if (p && p.id === e.pointerId) {
        const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
        if (dist > 7) p.moved = true;
        if (p.moved) {
          const t = now();
          const vx = (e.clientX - p.lastX) / Math.max(t - p.lastT, 1 / 120);
          if (this.hitTest(e.clientX, e.clientY) === p.index) this.avatars[p.index].petMove(vx, t);
          p.lastX = e.clientX;
          p.lastT = t;
        }
      }
    });
    const end = (e: PointerEvent) => {
      const p = this.press;
      if (!p || p.id !== e.pointerId) return;
      const a = this.avatars[p.index];
      const t = now();
      if (!p.moved) {
        if (t - p.t < 0.28) a.boop((p as Press & { q?: Vec3 }).q ?? [0, 0.5, 0.3], t);
        else a.pressEnd(t, true);
      } else a.pressEnd(t, false);
      this.press = null;
      el.dataset.press = 'false';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', (e) => {
      const i = this.hitTest(e.clientX, e.clientY);
      if (i >= 0) this.avatars[i].trick(now());
    });
  }

  // ------------------------------------------------------------- frame
  update(dt: number, t: number, pointer: { x: number; y: number } | null, pointerIdle: number, reducedMotion: boolean): void {
    const r = this.el.getBoundingClientRect();
    this.rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    if (this.lead !== this.shown) {
      // a different character steps on stage: snap it into place with a little hop
      if (this.shown && this.lead) {
        this.lead.jump(1.3, t);
        this.shownAt = performance.now() / 1000;
      }
      this.shown = this.lead ?? null;
      this.placed = false;
      this.press = null;
    }
    this.compose(dt);
    const cam = this.updateCamera(dt, pointer, reducedMotion ? 0 : 1);

    // hover feedback
    const hover = pointer && !this.press && pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom
      ? this.hitTest(pointer.x, pointer.y)
      : -1;
    if (hover !== this.hoverIdx) {
      if (this.hoverIdx >= 0 && this.avatars[this.hoverIdx]) this.avatars[this.hoverIdx].onHover(false, t);
      if (hover >= 0) this.avatars[hover].onHover(true, t);
      this.hoverIdx = hover;
      this.el.dataset.hover = hover >= 0 ? 'true' : 'false';
    }

    // pointer as a world-space gaze target on a plane in front of the cast
    let target: Vec3 | null = null;
    if (pointer) {
      const ray = this.ray(pointer.x, pointer.y);
      if (ray) {
        const planeZ = 0.85;
        const tt = Math.abs(ray.d[2]) > 1e-3 ? (planeZ - ray.o[2]) / ray.d[2] : 4;
        target = add(ray.o, [ray.d[0] * tt, ray.d[1] * tt, ray.d[2] * tt]);
      }
    }
    const a = this.lead;
    if (a) {
      a.selected = this.opts.tags;
      a.update(dt, { t, pointer: target, pointerIdle, camera: cam.pos, neighbors: [a], reducedMotion });
    }
    this.view = {
      rect: this.rect,
      family: this.family.id,
      camera: cam,
      look: this.family.look,
      chars: a ? [a.build()] : [],
      anchors: this.family.anchors,
    };
  }

  /** screen position of an avatar's head (tests, tooling) */
  screenOf(i: number): { x: number; y: number } | null {
    const a = this.avatars[i];
    return a ? this.project(a.headWorld()) : null;
  }

  getView(): View | null {
    return this.view;
  }

  isVisible(): boolean {
    const r = this.rect;
    return r.width > 2 && r.height > 2 && r.top + r.height > 0 && r.top < window.innerHeight;
  }

  tags(dt: number): Tag[] {
    if (!this.opts.tags || !this.ready) return [];
    const a = this.lead;
    if (!a) return [];
    // the name pops up when a new character steps on stage, then fades
    this.tagAlpha = damp(this.tagAlpha, performance.now() / 1000 - this.shownAt < 1.6 ? 1 : 0, 6, dt);
    const p = this.project(this.headTop(a));
    if (!p) return [];
    return [{ x: p.x, y: p.y - 6, text: a.config.name || 'Unnamed', alpha: this.tagAlpha, dark: this.dark }];
  }
}
