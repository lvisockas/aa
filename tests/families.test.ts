import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Avatar } from '../src/avatar/avatar';
import { NP } from '../src/engine/renderer';
import { rng } from '../src/engine/math';
import { rebel } from '../src/families/rebel';
import { poly } from '../src/families/poly';
import { doodle, doodleItems } from '../src/families/doodle';
import { clawd } from '../src/families/clawd';
import { faces } from '../src/families/faces';
import { VERT_FLOATS } from '../src/engine/mesh';
import { FAMILY_LIST } from './helpers';

test('every schema control maps to a real config key', () => {
  for (const f of FAMILY_LIST) {
    for (const c of f.roster()) {
      for (const sec of f.schema) for (const ctl of sec.controls) assert.ok(ctl.key in c, `${f.id}: ${ctl.key} missing in ${c.name}`);
    }
  }
});

test('every preset, expression and state packs finite parameters', () => {
  for (const f of FAMILY_LIST) {
    for (const cfg of f.roster()) {
      const a = new Avatar(f, cfg, () => {}, 1);
      for (const state of Object.keys(f.states)) {
        a.setState(state, 0);
        for (const e of f.expressions) {
          a.config.expression = String(e.value);
          for (let i = 0; i < 4; i++) a.update(1 / 30, { t: i / 30, pointer: [0.5, 1, 1], pointerIdle: 0, camera: [0, 1, 6], neighbors: [a], reducedMotion: false });
          const frame = a.build();
          assert.equal(frame.data.length, NP * 4);
          for (const v of frame.data) assert.ok(Number.isFinite(v), `${f.id}/${cfg.name}/${state}/${e.value}: NaN in params`);
          assert.ok(frame.squash.every((s) => s > 0.3 && s < 2), `${f.id}: squash out of range`);
        }
      }
    }
  }
});

test('randomize keeps the config shape and produces renderable characters', () => {
  const r = rng(7);
  for (const f of FAMILY_LIST) {
    const base = f.roster()[0];
    for (let i = 0; i < 25; i++) {
      const c = f.randomize({ ...base }, r);
      assert.deepEqual(Object.keys(c).sort(), Object.keys({ ...base, ...c }).sort());
      const b = f.bounds(c);
      assert.ok(b.r > 0.3 && b.r < 2, `${f.id}: bound radius ${b.r}`);
    }
  }
});

test('interactions never produce NaNs (boop, hold, pet, trick)', () => {
  for (const f of FAMILY_LIST) {
    const a = new Avatar(f, f.roster()[0], () => {}, 3);
    const ctx = (t: number) => ({ t, pointer: [0, 1, 1] as [number, number, number], pointerIdle: 0, camera: [0, 1, 6] as [number, number, number], neighbors: [a], reducedMotion: false });
    let t = 0;
    const step = (n: number) => { for (let i = 0; i < n; i++) a.update(1 / 60, ctx((t += 1 / 60))); };
    a.boop([0.1, 0.5, 0.3], t); step(30);
    a.pressStart(t); step(40); a.pressEnd(t, true); step(60);
    for (let i = 0; i < 10; i++) { a.petMove(900, t); step(3); }
    a.trick(t); step(90);
    for (let i = 0; i < 6; i++) a.boop([0, 0.6, 0.3], t + i * 0.1);
    step(120);
    const frame = a.build();
    for (const v of frame.data) assert.ok(Number.isFinite(v), `${f.id}: NaN after interactions`);
    assert.ok(frame.rot.every(Number.isFinite));
  }
});

test('species presets and prop-aware arm poses (family hooks)', () => {
  const panda = rebel.onChange!(rebel.roster()[0], 'species', 1)!;
  assert.equal(panda.species, 1);
  assert.equal(panda.bodyColor, '#F6F5F1');
  assert.equal(panda.name, rebel.roster()[0].name, 'a species switch keeps the rest of the config');
  const bandit = rebel.roster().find((c) => c.prop === 2)!;
  assert.equal(rebel.armPose!(bandit, 'rally'), 'aim');
  assert.equal(rebel.armPose!({ ...bandit, prop: 1 }, 'rally'), 'rally');
  const a = new Avatar(rebel, { ...bandit }, () => {}, 1);
  a.setState('publishing', 0);
  for (let i = 0; i < 180; i++) a.update(1 / 60, { t: i / 60, pointer: null, pointerIdle: 99, camera: [0, 1, 6], neighbors: [a], reducedMotion: false });
  assert.ok(a.pose.arms.rFwd < 0.1 && a.pose.arms.rRaise > 2, `arms ${JSON.stringify(a.pose.arms)}`);
});

/** a do-nothing 2D context: enough surface for every style to run headless */
const mockCtx = (): CanvasRenderingContext2D => {
  const target: Record<string, unknown> = { canvas: { width: 320, height: 200 } };
  return new Proxy(target, {
    get(t, k) {
      if (typeof k === 'string' && k in t) return t[k];
      if (k === 'getImageData' || k === 'createImageData')
        return (_x: number, _y: number, w = 4, h = 4) => ({ data: new Uint8ClampedArray(Math.max(1, w * h) * 4), width: w, height: h });
      if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (k === 'createPattern') return () => null;
      return () => undefined;
    },
    set(t, k, v) {
      t[k as string] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
};

test('every doodle character draws in every style, in every state, with finite geometry', () => {
  const ctx = mockCtx();
  const env = { t: 1.2, px: 0.004, size: [320, 200] as [number, number], canvas: () => mockCtx(), squash: [1, 1] as [number, number], roll: 0 };
  for (let ch = 0; ch < 5; ch++)
    for (const style of ['flat', 'ink', 'pixel', 'paper', 'riso'] as const) {
      const a = new Avatar(doodle, { ...doodle.roster()[0], character: ch, style }, () => {}, 1);
      for (const state of Object.keys(doodle.states)) {
        a.setState(state, 0);
        for (let i = 0; i < 3; i++) a.update(1 / 30, { t: i / 30, pointer: [0.4, 1, 1], pointerIdle: 0, camera: [0, 1, 6], neighbors: [a], reducedMotion: false });
        const list = doodleItems(a.config, a.pose, a.face, 1);
        assert.ok(list.length > 5, `doodle ${ch}: too few items`);
        for (const it of list) {
          const pts = it.k === 'dot' ? [[it.x, it.y]] : it.pts;
          for (const p of pts) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]), `doodle ${ch}/${state}: NaN point`);
        }
        doodle.draw2d!(ctx, a.config, a.pose, a.face, env);
      }
    }
});

test('polydots build closed, finite triangle meshes for every preset and state', () => {
  for (const cfg of poly.roster()) {
    const a = new Avatar(poly, cfg, () => {}, 1);
    for (const state of Object.keys(poly.states)) {
      a.setState(state, 0);
      for (let i = 0; i < 3; i++) a.update(1 / 30, { t: i / 30, pointer: [0.4, 1, 1], pointerIdle: 0, camera: [0, 1, 6], neighbors: [a], reducedMotion: false });
      const m = a.build().mesh!;
      assert.ok(m && m.count > 300 && m.count % 3 === 0, `${cfg.name}/${state}: ${m?.count} vertices`);
      for (let i = 0; i < m.count * VERT_FLOATS; i++) assert.ok(Number.isFinite(m.data[i]), `${cfg.name}/${state}: NaN vertex data`);
    }
  }
});

test('a quick click (press then boop) springs back to full height instead of staying squashed', () => {
  for (const f of FAMILY_LIST) {
    const a = new Avatar(f, f.roster()[0], () => {}, 5);
    let t = 0;
    const ctx = () => ({ t, pointer: [0, 1, 1] as [number, number, number], pointerIdle: 0, camera: [0, 1, 6] as [number, number, number], neighbors: [a], reducedMotion: false });
    const step = (n: number) => { for (let i = 0; i < n; i++) { t += 1 / 60; a.update(1 / 60, ctx()); } };
    step(30);
    const rest = a.build().squash[1];
    a.pressStart(t);
    step(6);   // 0.1 s: a click, not a hold
    a.boop([0, 0.5, 0.3], t);
    step(240); // 4 s later
    const after = a.build().squash[1];
    assert.ok(Math.abs(after - rest) < 0.03, `${f.id}: height ${after.toFixed(3)} vs rest ${rest.toFixed(3)} after a click`);
  }
});

test('clawd draws every state and accessory without errors', () => {
  const ctx = mockCtx();
  const env = { t: 2.3, px: 0.004, size: [320, 200] as [number, number], canvas: () => mockCtx(), squash: [1.1, 0.8] as [number, number], roll: 0 };
  for (let acc = 0; acc < 5; acc++) {
    const a = new Avatar(clawd, { ...clawd.roster()[0], accessory: acc }, () => {}, 1);
    for (const state of Object.keys(clawd.states)) {
      a.setState(state, 0);
      for (let i = 0; i < 3; i++) a.update(1 / 30, { t: i / 30, pointer: [0.4, 1, 1], pointerIdle: 0, camera: [0, 1, 6], neighbors: [a], reducedMotion: false });
      clawd.draw2d!(ctx, a.config, a.pose, a.face, env);
    }
  }
});

test('faces draw every part option in every state without errors', () => {
  const ctx = mockCtx();
  const env = { t: 1.7, px: 0.004, size: [320, 200] as [number, number], canvas: () => mockCtx(), squash: [1, 1] as [number, number], roll: 0 };
  const parts: Array<[string, number]> = [['face', 6], ['hair', 8], ['eyes', 5], ['brows', 4], ['nose', 5], ['mouth', 5], ['glasses', 4], ['facialHair', 4], ['details', 4], ['accessory', 5]];
  for (const [key, n] of parts)
    for (let v = 0; v < n; v++) {
      const a = new Avatar(faces, { ...faces.roster()[0], [key]: v, backdrop: '#FFE3E3' }, () => {}, 1);
      for (const state of Object.keys(faces.states)) {
        a.setState(state, 0);
        for (let i = 0; i < 2; i++) a.update(1 / 30, { t: i / 30, pointer: [0.4, 1, 1], pointerIdle: 0, camera: [0, 1, 6], neighbors: [a], reducedMotion: false });
        faces.draw2d!(ctx, a.config, a.pose, a.face, env);
      }
    }
});
