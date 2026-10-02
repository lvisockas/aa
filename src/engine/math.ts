// Small, allocation-light vector helpers. Vectors are plain tuples so they can
// be stored in config objects and serialised without ceremony.

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const saturate = (x: number): number => clamp(x, 0, 1);
export const deg = (d: number): number => (d * Math.PI) / 180;

export const v3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

export const quatIdentity = (): Quat => [0, 0, 0, 1];
export const quatAxisAngle = (axis: Vec3, angle: number): Quat => {
  const s = Math.sin(angle / 2);
  const n = normalize(axis);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(angle / 2)];
};
export const quatMul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
/** Yaw (around Y), then pitch (around X), then roll (around Z) - applied in that order to local vectors. */
export const quatEuler = (yaw: number, pitch: number, roll = 0): Quat =>
  quatMul(quatAxisAngle([0, 1, 0], yaw), quatMul(quatAxisAngle([1, 0, 0], pitch), quatAxisAngle([0, 0, 1], roll)));
export const quatRotate = (q: Quat, v: Vec3): Vec3 => {
  const u: Vec3 = [q[0], q[1], q[2]];
  const t = cross(u, add(cross(u, v), scale(v, q[3])));
  return add(v, scale(t, 2));
};

/** Camera basis with columns (right, up, forward) as a column-major mat3. */
export const lookAt = (eye: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]): Float32Array => {
  const f = normalize(sub(target, eye));
  const r = normalize(cross(f, up));
  const u = cross(r, f);
  return new Float32Array([r[0], r[1], r[2], u[0], u[1], u[2], f[0], f[1], f[2]]);
};

export const hexToRgb = (hex: string): Vec3 => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const hexToLinear = (hex: string): Vec3 => hexToRgb(hex).map(srgbToLinear) as Vec3;
export const relLuminance = (hex: string): number => {
  const [r, g, b] = hexToLinear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Deterministic PRNG (mulberry32) so layouts and idle behaviour are reproducible. */
export const rng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
