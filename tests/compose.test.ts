import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupPhoto } from '../src/families/compose';
import { add, cross, dot, normalize, sub, type Vec3 } from '../src/engine/math';
import { FAMILY_LIST } from './helpers';

const opts = { gap: 1.1, charW: 1.2, charH: 1.1, riser: 0.5, depth: 0.8, fov: (26 * Math.PI) / 180, margin: 0.1, turn: 0.05, lift: 0.2 };

/** project a world point to normalised screen coordinates (y in [-1, 1]) */
const project = (cam: { pos: Vec3; target: Vec3; fov: number }, p: Vec3, aspect: number) => {
  const f = normalize(sub(cam.target, cam.pos));
  const r = normalize(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const v = sub(p, cam.pos);
  const z = dot(v, f);
  const k = 1 / Math.tan(cam.fov / 2);
  return { x: (dot(v, r) / z) * k / aspect, y: (dot(v, u) / z) * k };
};

test('wide stages get one row, narrow stages stack rows', () => {
  const wide = groupPhoto(6, 4, opts);
  const narrow = groupPhoto(6, 0.8, opts);
  const rows = (c: ReturnType<typeof groupPhoto>) => new Set(c.placements.map((p) => p.pos[1].toFixed(2))).size;
  assert.equal(wide.placements.length, 6);
  assert.equal(rows(wide), 1);
  assert.ok(rows(narrow) >= 2);
});

test('every character is framed inside the viewport', () => {
  for (const aspect of [0.6, 1, 1.5, 2.5]) {
    for (const n of [1, 3, 4, 6, 7, 9]) {
      const c = groupPhoto(n, aspect, opts);
      for (const p of c.placements) {
        for (const corner of [[-0.55, 0], [0.55, 0], [-0.55, 1.05], [0.55, 1.05]] as const) {
          const s = project(c.camera, add(p.pos, [corner[0] * opts.charW, corner[1] * opts.charH, 0]), aspect);
          assert.ok(Math.abs(s.x) <= 1.02 && Math.abs(s.y) <= 1.02, `n=${n} aspect=${aspect} -> ${s.x.toFixed(2)},${s.y.toFixed(2)}`);
        }
      }
    }
  }
});

test('family compositions return one placement per character', () => {
  for (const f of FAMILY_LIST) {
    const n = f.roster().length;
    for (const aspect of [0.7, 1.3, 2.2]) {
      const c = f.compose(n, aspect, false);
      assert.equal(c.placements.length, n, `${f.id} @${aspect}`);
      assert.ok(c.camera.fov > 0 && c.camera.fov < Math.PI / 2);
    }
  }
});
