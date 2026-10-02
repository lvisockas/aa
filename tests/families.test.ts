import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Avatar } from '../src/avatar/avatar';
import { NP } from '../src/engine/renderer';
import { rng } from '../src/engine/math';
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
