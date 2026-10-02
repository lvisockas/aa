import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Dyn, Spring, damp } from '../src/engine/spring';

test('Dyn converges to its target', () => {
  const d = new Dyn(0, 2, 0.8, 0);
  for (let i = 0; i < 240; i++) d.update(1, 1 / 60);
  assert.ok(Math.abs(d.y - 1) < 1e-3, `y=${d.y}`);
});

test('under-damped Dyn overshoots (personality), critically damped does not', () => {
  const bouncy = new Dyn(0, 2, 0.3, 0);
  const calm = new Dyn(0, 2, 1.0, 0);
  let maxB = 0, maxC = 0;
  for (let i = 0; i < 240; i++) {
    maxB = Math.max(maxB, bouncy.update(1, 1 / 60));
    maxC = Math.max(maxC, calm.update(1, 1 / 60));
  }
  assert.ok(maxB > 1.2, `bouncy max ${maxB}`);
  assert.ok(maxC < 1.02, `calm max ${maxC}`);
});

test('Dyn stays stable with huge time steps', () => {
  const d = new Dyn(0, 6, 0.2, 2);
  for (let i = 0; i < 50; i++) d.update(i % 2, 0.5);
  assert.ok(Number.isFinite(d.y) && Math.abs(d.y) < 10, `y=${d.y}`);
});

test('Spring kick decays back to rest', () => {
  const s = new Spring(0, 260, 10);
  s.kick(5);
  let peak = 0;
  for (let i = 0; i < 600; i++) peak = Math.max(peak, Math.abs(s.update(0, 1 / 60)));
  assert.ok(peak > 0.05);
  assert.ok(Math.abs(s.x) < 1e-3 && Math.abs(s.v) < 1e-2);
});

test('damp is frame-rate independent', () => {
  let a = 0, b = 0;
  for (let i = 0; i < 60; i++) a = damp(a, 1, 5, 1 / 60);
  for (let i = 0; i < 120; i++) b = damp(b, 1, 5, 1 / 120);
  assert.ok(Math.abs(a - b) < 1e-9);
});
