import { deg } from '../engine/math';
import type { Camera } from '../engine/renderer';
import type { Placement } from './types';

export interface Composition {
  placements: Placement[];
  camera: Camera;
}

export interface GroupOptions {
  /** centre-to-centre spacing within a row */
  gap: number;
  /** footprint of one character (local units) */
  charW: number;
  charH: number;
  /** each row further back stands this much higher (risers) and deeper */
  riser: number;
  depth: number;
  fov: number;
  margin: number;
  /** slight inward turn so the cast faces the camera */
  turn: number;
  /** camera elevation as a fraction of the framed half height */
  lift: number;
}

/**
 * Lays a cast out like a group photo: one row on wide stages, staggered rows
 * on risers when the stage is narrow, so characters stay as large as possible
 * at any aspect ratio.
 */
export const groupPhoto = (n: number, aspect: number, o: GroupOptions): Composition => {
  type Plan = { rows: number; perRow: number; w: number; h: number; s: number };
  let best: Plan | null = null;
  for (let rows = 1; rows <= 3; rows++) {
    const perRow = Math.ceil(n / rows);
    if (rows > 1 && perRow < 2) break;
    const stagger = rows > 1 ? o.gap * 0.5 : 0;
    const w = (perRow - 1) * o.gap + o.charW + stagger + o.margin * 2;
    const h = (rows - 1) * o.riser + o.charH + o.margin * 2;
    const s = 1 / Math.max(w / aspect, h);
    // only add rows when it makes everyone clearly bigger
    if (!best || s > best.s * 1.25) best = { rows, perRow, w, h, s };
  }
  const plan = best!;
  const placements: Placement[] = [];
  const counts: number[] = [];
  for (let r = 0, left = n; r < plan.rows; r++) {
    const c = r === plan.rows - 1 ? left : Math.min(plan.perRow, left);
    counts.push(c);
    left -= c;
  }
  let i = 0;
  counts.forEach((count, r) => {
    // rows of n and n-1 interleave on their own; equal rows get a quarter-gap
    // offset each way so the back row peeks between the front row
    const equal = counts.some((c, j) => j !== r && c === count);
    const shift = equal ? (r % 2 === 0 ? -0.25 : 0.25) * o.gap : 0;
    for (let k = 0; k < count; k++, i++) {
      const x = (k - (count - 1) / 2) * o.gap + shift;
      placements.push({ pos: [x, r * o.riser, -r * o.depth - (k % 2) * 0.04], scale: 1, yaw: -x * o.turn });
    }
  });
  let halfH = Math.max(plan.h / 2, plan.w / 2 / aspect);
  let dist = halfH / Math.tan(o.fov / 2);
  // the front row stands closer than the framing plane: compensate perspective
  const front = ((plan.rows - 1) * o.depth) / 2 + o.charW * 0.35;
  halfH *= dist / Math.max(dist - front, dist * 0.5);
  dist = halfH / Math.tan(o.fov / 2);
  const cy = ((plan.rows - 1) * o.riser + o.charH) / 2;
  const cz = -((plan.rows - 1) * o.depth) / 2;
  return {
    placements,
    camera: { pos: [0, cy + halfH * o.lift, cz + dist], target: [0, cy, cz], fov: o.fov },
  };
};

/** Camera that frames a single character standing at the origin. */
export const soloCamera = (aspect: number, charW: number, charH: number, fov = deg(24), lift = 0.25): Camera => {
  const halfH = Math.max(charH * 0.78, (charW * 0.8) / aspect);
  const dist = halfH / Math.tan(fov / 2);
  const cy = charH * 0.5;
  return { pos: [0, cy + halfH * lift, dist], target: [0, cy, 0], fov };
};
