import { add, normalize, scale, type Vec3 } from '../engine/math';
import type { ArmPose } from '../avatar/avatar';

export interface ArmRig {
  /** right shoulder in local space; the left one is mirrored */
  shoulder: Vec3;
  upper: number;
  fore: number;
  /** tilt the right forearm up a little (holding a bat, flag, ...) */
  heldUp?: boolean;
}

/**
 * Two-segment arm from shoulder angles: `raise` swings the arm outward from
 * hanging down, `fwd` swings it forward, `bend` folds the forearm towards the
 * front. Waving and typing oscillations are layered on top.
 */
export const solveArm = (side: number, a: ArmPose, phase: number, rig: ArmRig): [Vec3, Vec3, Vec3] => {
  const raise = side < 0 ? a.lRaise : a.rRaise;
  const fwd = side < 0 ? a.lFwd : a.rFwd;
  let bend = side < 0 ? a.lBend : a.rBend;
  const S: Vec3 = [side * rig.shoulder[0], rig.shoulder[1], rig.shoulder[2]];
  let u: Vec3 = [side * Math.sin(raise), -Math.cos(raise), 0];
  const cf = Math.cos(-fwd), sf = Math.sin(-fwd);
  u = normalize([u[0], u[1] * cf - u[2] * sf, u[1] * sf + u[2] * cf]);
  const E = add(S, scale(u, rig.upper));
  const waveOsc = side > 0 ? a.wave * Math.sin(phase * 9) * 0.55 : a.wave * Math.sin(phase * 9 + 1.3) * 0.25;
  bend += a.tap * Math.max(0, Math.sin(phase * 14 + (side > 0 ? 0 : Math.PI))) * 0.25;
  const fwdDir: Vec3 = [side * waveOsc * 1.4, 0.35, 1];
  const perp = normalize(add(fwdDir, scale(u, -(fwdDir[0] * u[0] + fwdDir[1] * u[1] + fwdDir[2] * u[2]))));
  let f = normalize(add(scale(u, Math.cos(bend)), scale(perp, Math.sin(bend))));
  if (rig.heldUp && side > 0) f = normalize(add(f, [0, 0.2, 0.1]));
  return [S, E, add(E, scale(f, rig.fore))];
};
