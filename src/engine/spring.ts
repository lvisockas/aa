// Procedural motion primitives.
//
// `Dyn` is a second-order dynamics filter (as popularised by t3ssel8r's
// "Giving Personality to Procedural Animations using Math"): it follows a
// target with a natural frequency `f` (Hz), damping `z` (zeta) and initial
// response `r` (r < 0 anticipates, r > 1 overshoots on start). It gives each
// avatar family its own "physical personality" from three numbers.

export class Dyn {
  y: number;
  private yd = 0;
  private xp: number;
  private k1 = 0;
  private k2 = 0;
  private k3 = 0;

  constructor(x0 = 0, f = 2, z = 0.6, r = 0) {
    this.y = x0;
    this.xp = x0;
    this.tune(f, z, r);
  }

  tune(f: number, z: number, r: number): this {
    const w = 2 * Math.PI * f;
    this.k1 = z / (Math.PI * f);
    this.k2 = 1 / (w * w);
    this.k3 = (r * z) / w;
    return this;
  }

  /** Advance towards target `x` by `dt` seconds. */
  update(x: number, dt: number): number {
    if (dt <= 0) return this.y;
    const xd = (x - this.xp) / dt;
    this.xp = x;
    // stable integration: clamp k2 to the critical value for this dt
    const k2s = Math.max(this.k2, (dt * dt) / 2 + (dt * this.k1) / 2, dt * this.k1);
    this.y += dt * this.yd;
    this.yd += (dt * (x + this.k3 * xd - this.y - this.k1 * this.yd)) / k2s;
    return this.y;
  }

  /** Instant velocity kick (e.g. from a click). */
  kick(v: number): void {
    this.yd += v;
  }

  get velocity(): number {
    return this.yd;
  }

  snap(x: number): void {
    this.y = x;
    this.xp = x;
    this.yd = 0;
  }
}

/** Damped spring with explicit stiffness/damping, used for impulse reactions. */
export class Spring {
  x: number;
  v = 0;
  constructor(
    x0 = 0,
    public stiffness = 180,
    public damping = 12,
  ) {
    this.x = x0;
  }
  update(target: number, dt: number): number {
    // sub-step for stability with stiff springs
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = this.stiffness * (target - this.x) - this.damping * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  kick(v: number): void {
    this.v += v;
  }
}

/** Exponential smoothing that is frame-rate independent. */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  target + (current - target) * Math.exp(-lambda * dt);
