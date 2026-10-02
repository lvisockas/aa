import { normalize, type Vec3 } from './math';

/** Floats per vertex: position xyz (character local), albedo rgb (linear), material id, uv. */
export const VERT_FLOATS = 9;

/** A character drawn as triangles instead of a ray-marched field. */
export interface MeshFrame {
  data: Float32Array;
  /** vertex count (triangles * 3) */
  count: number;
  /** jelly wobble amplitude and phase */
  wob: [number, number];
  /** dent centre (local) and amplitude */
  poke: [number, number, number, number];
  /** 0 cut paper, 1 gem, 2 vinyl toy */
  finish: number;
  blush: number;
  cheeks: [Vec3, Vec3];
}

/** Material ids understood by mesh.frag.glsl. */
export const MAT = {
  finish: 0,
  body: 1,
  gem: 2,
  thread: 3,
  nose: 4,
  mouth: 5,
  teeth: 6,
  metal: 7,
  cloth: 8,
  brandFlag: 9,
  gold: 10,
} as const;

/** Growable interleaved triangle soup (flat shading needs no shared vertices). */
export class MeshBuilder {
  data = new Float32Array(VERT_FLOATS * 6000);
  count = 0;

  reset(): void {
    this.count = 0;
  }

  private grow(n: number): void {
    if ((this.count + n) * VERT_FLOATS <= this.data.length) return;
    const next = new Float32Array(Math.max(this.data.length * 2, (this.count + n) * VERT_FLOATS));
    next.set(this.data);
    this.data = next;
  }

  vert(p: Vec3, col: Vec3, mat: number, u = 0, v = 0): void {
    this.grow(1);
    const o = this.count * VERT_FLOATS;
    const d = this.data;
    d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2];
    d[o + 3] = col[0]; d[o + 4] = col[1]; d[o + 5] = col[2];
    d[o + 6] = mat; d[o + 7] = u; d[o + 8] = v;
    this.count++;
  }

  tri(a: Vec3, b: Vec3, c: Vec3, col: Vec3, mat: number): void {
    this.vert(a, col, mat);
    this.vert(b, col, mat);
    this.vert(c, col, mat);
  }

  /** convex polygon as a fan */
  poly(pts: Vec3[], col: Vec3, mat: number): void {
    for (let i = 1; i + 1 < pts.length; i++) this.tri(pts[0], pts[i], pts[i + 1], col, mat);
  }

  /** every face of a polyhedron; tint(i) scales the colour per face (cut-paper variation) */
  faces(fs: Vec3[][], col: Vec3, mat: number, tint?: (i: number) => number): void {
    fs.forEach((f, i) => {
      const k = tint ? tint(i) : 1;
      this.poly(f, k === 1 ? col : [col[0] * k, col[1] * k, col[2] * k], mat);
    });
  }

  /** box between two points (a thin stroke: whiskers, closed eyes, smiles) */
  stroke(a: Vec3, b: Vec3, up: Vec3, w: number, h: number, col: Vec3, mat: number): void {
    const dir = normalize(sub(b, a));
    let side = cross(dir, up);
    if (len(side) < 1e-5) side = cross(dir, [0, 0, 1]);
    side = normalize(side);
    const nrm = cross(side, dir);
    const sx = scl(side, w), nz = scl(nrm, h);
    const c = (p: Vec3, s: number, t: number): Vec3 => [p[0] + sx[0] * s + nz[0] * t, p[1] + sx[1] * s + nz[1] * t, p[2] + sx[2] * s + nz[2] * t];
    const A = [c(a, -1, -1), c(a, 1, -1), c(a, 1, 1), c(a, -1, 1)];
    const B = [c(b, -1, -1), c(b, 1, -1), c(b, 1, 1), c(b, -1, 1)];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.poly([A[i], A[j], B[j], B[i]], col, mat);
    }
    this.poly(A, col, mat);
    this.poly(B, col, mat);
  }
}

// ------------------------------------------------------------- vector bits
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const addv = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scl = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

// ------------------------------------------------------------- polyhedra
export interface Plane {
  n: Vec3;
  d: number;
}

/** keep the part of a convex polygon with n·p <= d */
const clipPoly = (pts: Vec3[], pl: Plane, cut?: Vec3[]): Vec3[] => {
  const out: Vec3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const da = dot(pl.n, a) - pl.d, db = dot(pl.n, b) - pl.d;
    if (da <= 0) out.push(a);
    if (da * db < 0) {
      const t = da / (da - db);
      const p: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      out.push(p);
      cut?.push(p);
    }
  }
  return out;
};

/** Faces of the convex polyhedron {p : n_i·p <= d_i}, each a convex polygon. */
export const polyhedron = (planes: Plane[]): Vec3[][] => {
  const faces: Vec3[][] = [];
  const R = 1e3;
  for (let i = 0; i < planes.length; i++) {
    const { n, d } = planes[i];
    const c = scl(n, d);
    const t = normalize(Math.abs(n[1]) < 0.9 ? cross(n, [0, 1, 0]) : cross(n, [1, 0, 0]));
    const b = cross(n, t);
    // a huge square on the plane, counter-clockwise seen from outside
    let pts: Vec3[] = [
      addv(c, addv(scl(t, -R), scl(b, -R))),
      addv(c, addv(scl(t, R), scl(b, -R))),
      addv(c, addv(scl(t, R), scl(b, R))),
      addv(c, addv(scl(t, -R), scl(b, R))),
    ];
    for (let j = 0; j < planes.length && pts.length >= 3; j++) if (j !== i) pts = clipPoly(pts, planes[j]);
    if (pts.length >= 3) faces.push(pts);
  }
  return faces;
};

/** Clip a closed convex polyhedron by n·p <= d and cap the opening. */
export const clipPolyhedron = (faces: Vec3[][], pl: Plane): Vec3[][] => {
  const out: Vec3[][] = [];
  const cut: Vec3[] = [];
  for (const f of faces) {
    const g = clipPoly(f, pl, cut);
    if (g.length >= 3) out.push(g);
  }
  // add vertices lying exactly on the plane, then order the cap around its centre
  for (const f of faces) for (const p of f) if (Math.abs(dot(pl.n, p) - pl.d) < 1e-7) cut.push(p);
  if (cut.length >= 3) {
    const c = scl(cut.reduce((a, p) => addv(a, p), [0, 0, 0] as Vec3), 1 / cut.length);
    const t = normalize(Math.abs(pl.n[1]) < 0.9 ? cross(pl.n, [0, 1, 0]) : cross(pl.n, [1, 0, 0]));
    const b = cross(pl.n, t);
    const ang = (p: Vec3) => Math.atan2(dot(sub(p, c), b), dot(sub(p, c), t));
    const cap = cut.slice().sort((p, q) => ang(p) - ang(q));
    const dedup = cap.filter((p, i) => i === 0 || len(sub(p, cap[i - 1])) > 1e-6);
    if (dedup.length >= 3) out.push(dedup);
  }
  return out;
};

export const mapFaces = (faces: Vec3[][], f: (p: Vec3) => Vec3): Vec3[][] => faces.map((fc) => fc.map(f));

/** stable per-face hash in [0, 1) */
export const faceHash = (i: number, salt: number): number => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
