import { deg, hexToRgb, normalize } from '../engine/math';
import type { Pose } from '../avatar/avatar';
import type { BaseConfig, Draw2DEnv, EyeSpec, FaceState, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';

/**
 * Clawd, inspired by the little terminal crab Claude Code greets you with.
 * The sprite is its quadrant-block artwork,
 *
 *     ▐▛███▜▌
 *    ▝▜█████▛▘
 *      ▘▘ ▝▝
 *
 * decoded to pixels: a terminal cell is twice as tall as wide, so each quadrant
 * pixel is one grid column by two grid rows. Everything that moves (eyes, arms,
 * legs, hops, squash) moves in whole pixels, the way pixel art animates.
 */
export interface ClawdConfig extends BaseConfig {
  color: string;
  accentColor: string;
  eyes: number;
  accessory: number;
  glow: number;
  crt: boolean;
  status: boolean;
}

/** grid column/row of a sprite pixel -> character units */
const S = 0.055;
const CX = 9;      // body centre column
const ROWS = 10;   // rows 0..9, legs on 8..9
// offscreen sprite canvas with margins for hats above and arms to the sides
const GX0 = -4, GY0 = -7, GW = 26, GH = 18;

const COLORS = ['#D77757', '#4ADE80', '#FFB000', '#60A5FA', '#F472B6', '#E5E7EB'];
const ACCENTS = ['#F0EEE6', '#FFD166', '#60A5FA', '#F472B6', '#4ADE80', '#3F3F46'];
const VERBS = ['Clauding', 'Tinkering', 'Noodling', 'Percolating', 'Scuttling', 'Pondering', 'Compiling', 'Brewing'];

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'excited', label: 'Excited' },
  { value: 'wink', label: 'Wink' },
];

// eye kinds: 0 open slit, 1 happy caret, 2 closed, 3 wide
const clawdFace = (c: ClawdConfig, expr: string): FaceTarget => {
  const e = (kind: number): EyeSpec => ({ kind, w: 1, h: 1, rot: 0, lid: 0, lidAng: 0, dx: 0, dy: 0 });
  const base = c.eyes;
  const make = (l: number, r: number, mouthOpen = 0, cheeks = 0): FaceTarget => ({ l: e(l), r: e(r), lidB: 0, mouth: 0, mouthOpen, cheeks });
  switch (expr) {
    case 'happy':
    case 'squeeze':
      return make(1, 1, 0, 0.6);
    case 'surprised':
      return make(3, 3, 0.6);
    case 'sleepy':
    case 'dizzy':
      return make(2, 2);
    case 'excited':
      return make(3, 3, 0.4, 0.8);
    case 'wink':
      return make(base === 1 ? 0 : base, 1);
    default:
      return make(base, base);
  }
};

const base = (o: Partial<ClawdConfig>): ClawdConfig => ({
  name: 'Clawd',
  state: 'idle',
  expression: 'neutral',
  color: '#D77757',
  accentColor: '#F0EEE6',
  eyes: 0,
  accessory: 0,
  glow: 0.6,
  crt: true,
  status: true,
  ...o,
});

// ------------------------------------------------------------- the sprite
type Px = Array<[number, number, number]>; // column, row, colour index (0 body, 1 accent, 2 grey, 3 eye ink)

/** body pixels with the eye slits filled in; eyes are cut afterwards so they can move */
const bodyPixels = (lean: number, arms: [number, number], legs: [number, number]): Px => {
  const out: Px = [];
  const row = (y: number, xs: number[]) => xs.forEach((x) => out.push([x + lean, y, 0]));
  const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  for (const y of [0, 1]) row(y, span(3, 14));
  for (const y of [2, 3]) row(y, span(3, 14));
  for (const y of [4, 5]) row(y, span(3, 14));
  for (const y of [6, 7]) row(y, span(3, 14));
  // arm nubs: 2x2 blocks on the shoulder row, raised by `arms` rows
  for (const [x0, up] of [[1, arms[0]], [15, arms[1]]] as const)
    for (const y of [4, 5]) for (const x of [x0, x0 + 1]) out.push([x + lean, y - up, 0]);
  // four legs; a lifted leg loses its bottom pixel
  [4, 6, 11, 13].forEach((x, i) => {
    const lifted = (i % 2 === 0 ? legs[0] : legs[1]) > 0;
    out.push([x, 8, 0]);
    if (!lifted) out.push([x, 9, 0]);
  });
  return out;
};

/** pixels of the eyes (and a mouth when talking), drawn in eye ink */
const eyeHoles = (kindL: number, kindR: number, blink: number, dx: number, dy: number, lean: number, mouth: number): Array<[number, number]> => {
  const holes: Array<[number, number]> = [];
  ([[5, kindL, -1], [12, kindR, 1]] as const).forEach(([x0, kind, side]) => {
    const x = x0 + dx + lean, y = 2 + dy;
    if (kind === 2) holes.push([x, y + 1], [x - side, y + 1]);            // closed: a flat slit
    else if (blink > 0.6) holes.push([x, y + 1]);                          // mid-blink
    else if (kind === 1) holes.push([x - 1, y + 1], [x, y], [x + 1, y + 1]); // happy ^
    else if (kind === 3) holes.push([x, y - 1], [x, y], [x, y + 1]);       // wide
    else holes.push([x, y], [x, y + 1]);                                   // the classic tall slit
  });
  if (mouth > 0.15) {
    holes.push([8 + lean, 5], [9 + lean, 5]);
    if (mouth > 0.5) holes.push([8 + lean, 4], [9 + lean, 4]);
  }
  return holes;
};

const accessoryPixels = (kind: number, t: number, lean: number): Px => {
  const out: Px = [];
  const add = (x: number, y: number, c: number) => out.push([x + lean, y, c]);
  if (kind === 1) {
    // party hat with stripes and a pompom
    const rows: Array<[number, number, number]> = [[-1, 6, 11], [-2, 7, 10], [-3, 7, 10], [-4, 8, 9], [-5, 8, 9]];
    rows.forEach(([y, a, b], i) => { for (let x = a; x <= b; x++) add(x, y, i % 2 ? 0 : 1); });
    add(8, -6, 1); add(9, -6, 1);
  } else if (kind === 2) {
    // headphones: a band over the top and cups on the sides
    for (let x = 6; x <= 11; x++) add(x, -2, 2);
    for (const x of [4, 5, 12, 13]) add(x, -1, 2);
    for (const x of [1, 2, 15, 16]) for (let y = 0; y <= 3; y++) add(x, y, x === 1 || x === 16 ? 2 : 1);
  } else if (kind === 3) {
    // antenna with a blinking light: the terminal robot
    for (const y of [-1, -2, -3]) add(9, y, 2);
    if (Math.sin(t * 4) > -0.3) for (const [x, y] of [[8, -5], [9, -5], [8, -4], [9, -4]]) add(x, y, 1);
  } else if (kind === 4) {
    // bow tie under the chin
    for (const x of [6, 7, 10, 11]) for (const y of [6, 7]) add(x, y, 1);
    for (const x of [8, 9]) add(x, 6, 2);
  }
  return out;
};

const STATUS = (state: string, t: number): { spinner: boolean; text: string; dim?: string; tone?: 'ok' | 'err' } => {
  switch (state) {
    case 'thinking':
      return { spinner: true, text: 'Pondering…' };
    case 'working':
      return { spinner: true, text: `${VERBS[Math.floor(t / 2.4) % VERBS.length]}…`, dim: ' (esc to interrupt)' };
    case 'listening':
      return { spinner: false, text: '> ' + 'hey clawd'.slice(0, Math.floor((t * 6) % 14)) };
    case 'speaking':
      return { spinner: true, text: 'Writing…' };
    case 'awaiting':
      return { spinner: false, text: '? Allow this edit?', dim: '  (y/n)' };
    case 'done':
      return { spinner: false, text: '✓ Done', tone: 'ok' };
    case 'error':
      return { spinner: false, text: '✗ Error', dim: ' · retrying', tone: 'err' };
    case 'sleeping':
      return { spinner: false, text: 'zzz…' };
    default:
      return { spinner: false, text: '>' };
  }
};

/** the sparkle spinner: a dot that grows arms and turns, then shrinks back */
const spinner = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, col: string) => {
  const seq = [0, 4, 6, 8, 8, 6, 4];
  const f = Math.floor(t * 9) % seq.length;
  const n = seq[f];
  ctx.strokeStyle = ctx.fillStyle = col;
  if (!n) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.lineWidth = Math.max(1, r * 0.28);
  ctx.lineCap = 'round';
  const rot = f * 0.4;
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const len = r * (n === 8 && i % 2 ? 0.7 : 1);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
};

const rgb = (hex: string): [number, number, number] => hexToRgb(hex).map((v) => Math.round(v * 255)) as [number, number, number];

const draw = (ctx: CanvasRenderingContext2D, c: ClawdConfig, pose: Pose, face: FaceState, env: Draw2DEnv) => {
  const t = env.t;
  const state = c.state;
  // ---- pixel-snapped motion
  const lean = Math.max(-1, Math.min(1, Math.round(pose.yaw * 4 + pose.headYaw * 1.2)));
  const dx = Math.max(-1, Math.min(1, Math.round(pose.lookX * 1.6)));
  const dy = Math.max(-1, Math.min(1, Math.round(-pose.lookY * 1.6)));
  const walking = (pose.props.wag ?? 0) > 0.3 || pose.excite > 0.6;
  const step = Math.floor(t * 8) % 2;
  const legs: [number, number] = walking ? [step, 1 - step] : [0, 0];
  let arms: [number, number] = [0, 0];
  if (state === 'done' || pose.excite > 0.7) arms = [2, 2];
  else if (state === 'working') arms = step ? [1, 0] : [0, 1];        // typing
  else if (state === 'speaking' || pose.pet > 0.3) arms = [0, Math.floor(t * 4) % 2 ? 2 : 1];
  const mouth = Math.max(face.mouthOpen, pose.talk * (0.5 + 0.5 * Math.sin(t * 18)));

  // ---- paint the sprite at native resolution
  const sc = env.canvas('clawd-sprite', GW, GH);
  const img = sc.createImageData(GW, GH);
  // body, accessory, accessory grey (visible on the dark terminal), eye ink
  const pal = [rgb(c.color), rgb(c.accentColor), [96, 92, 86] as [number, number, number], [20, 19, 18] as [number, number, number]];
  const put = (x: number, y: number, k: number) => {
    const gx = x - GX0, gy = y - GY0;
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return;
    const i = (gy * GW + gx) * 4;
    img.data[i] = pal[k][0]; img.data[i + 1] = pal[k][1]; img.data[i + 2] = pal[k][2]; img.data[i + 3] = 255;
  };
  for (const [x, y, k] of bodyPixels(lean, arms, legs)) put(x, y, k);
  // eyes are solid ink pixels, not holes, so the phosphor glow can't bleed into them
  for (const [x, y] of eyeHoles(face.l.kind, face.r.kind, pose.blink, dx, dy, lean, mouth)) put(x, y, 3);
  for (const [x, y, k] of accessoryPixels(c.accessory, t, lean)) put(x, y, k);
  sc.putImageData(img, 0, 0);

  // ---- place it: hop snapped to whole pixels, squash in whole rows and columns
  const off = pose.offset[1];
  const snapped = Math.round(off / S) * S;
  const ky = Math.max(4, Math.round(ROWS * env.squash[1])) / ROWS;
  const kx = Math.max(10, Math.round(16 * env.squash[0])) / 16;
  ctx.save();
  ctx.translate(0, snapped - off);
  ctx.scale(kx, ky);
  ctx.scale(1, -1);   // the sprite is stored top-down
  ctx.imageSmoothingEnabled = false;
  if (c.glow > 0) {
    ctx.shadowColor = c.color;
    ctx.shadowBlur = (6 + 14 * c.glow) * Math.min(2, 0.004 / env.px);
  }
  ctx.drawImage(sc.canvas, (GX0 - CX) * S, (GY0 - ROWS) * S, GW * S, GH * S);
  ctx.restore();

  // ---- the terminal status line under the sprite, drawn in device pixels
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  if (c.status && m && typeof DOMPoint !== 'undefined') {
    const st = STATUS(state, t);
    const p = m.transformPoint(new DOMPoint(-0.42, -0.14));
    const fs = 0.062 / env.px;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `500 ${fs}px ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`;
    ctx.textBaseline = 'middle';
    let x = p.x;
    if (st.spinner) {
      spinner(ctx, x + fs * 0.45, p.y, fs * 0.42, t, c.color);
      x += fs * 1.3;
    }
    ctx.fillStyle = st.tone === 'ok' ? '#4ADE80' : st.tone === 'err' ? '#F87171' : st.spinner ? c.color : '#E7E5DF';
    ctx.fillText(st.text, x, p.y);
    x += ctx.measureText(st.text).width;
    if (st.dim) {
      ctx.fillStyle = 'rgba(231,229,223,0.45)';
      ctx.fillText(st.dim, x, p.y);
      x += ctx.measureText(st.dim).width;
    }
    if (state === 'idle' || state === 'listening') {
      // a blinking block cursor
      if (Math.floor(t * 1.8) % 2 === 0) {
        ctx.fillStyle = '#E7E5DF';
        ctx.fillRect(x + fs * 0.3, p.y - fs * 0.5, fs * 0.55, fs);
      }
    }
    ctx.restore();
  }

  // ---- CRT scanlines over the whole stage
  if (c.crt) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    const [w, h] = env.size;
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    ctx.restore();
  }
};

export const clawd: FamilyDef<ClawdConfig> = {
  id: 'clawd',
  name: 'Clawd',
  maker: 'Claude Code',
  tagline: 'The terminal crab · pixel-perfect motion · a status line that works',
  subtitle: 'Claude Code’s terminal mascot, animated in whole pixels',
  shader: '',
  anchors: 0,
  pixelMotion: true,
  background: 'radial-gradient(120% 90% at 50% 18%, #2A2723 0%, #161514 62%, #0F0E0D 100%)',
  backgroundSolid: '#161514',
  dark: true,
  traits: ['Block-character sprite', 'Pixel-snapped motion', 'Terminal status line'],
  look: {
    dark: true,
    groundShadow: 0,
    exposure: 1,
    groundY: 0,
    lights: {
      key: normalize([-0.5, 0.8, 0.6]),
      keyI: 1,
      rim: normalize([0.5, 0.4, -0.7]),
      rimI: 0.5,
      fill: normalize([0.8, 0.1, 0.55]),
      fillI: 0.3,
      sky: [0.3, 0.3, 0.3],
      ground: [0.1, 0.1, 0.1],
      warm: [1, 1, 1],
      env: 1,
    },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Prompt waiting, cursor blinking', bob: [0.012, 0.5] },
    listening: { label: 'Listening', hint: 'You are typing', expr: 'neutral', gaze: 'user' },
    thinking: { label: 'Thinking', hint: 'Pondering, sparkle spinning', expr: 'neutral', gaze: 'up', sway: [0.03, 0.3] },
    working: { label: 'Working', hint: 'Scuttling and typing', expr: 'neutral', gaze: 'down', bob: [0.02, 2.4], props: { wag: 1 } },
    speaking: { label: 'Speaking', hint: 'Writing the answer', expr: 'happy', talk: 1, gaze: 'user' },
    awaiting: { label: 'Awaiting approval', hint: 'Allow this edit? (y/n)', expr: 'neutral', gaze: 'user', emote: ['question', 3.2] },
    done: { label: 'Done', hint: 'Task complete, arms up', expr: 'excited', enter: 'celebrate', emote: ['check', 4] },
    error: { label: 'Error', hint: 'Shakes it off', expr: 'surprised', enter: 'shake', emote: ['sweat', 2.6] },
    sleeping: { label: 'Sleeping', hint: 'zzz', expr: 'sleepy', gaze: 'closed', sink: 0.01, emote: ['zzz', 2.6] },
  },
  personality: {
    body: [3.2, 0.4, 1.2],
    eyes: [8.0, 0.9, 0.0],
    squash: [300, 10],
    reach: [0.25, 0.15],
    eyeShare: 0.7,
    hopGravity: 14,
  },
  expressions: EXPRESSIONS,
  schema: [
    {
      id: 'identity',
      title: 'Identity',
      controls: [
        { type: 'text', key: 'name', label: 'Name' },
        { type: 'chips', key: 'state', label: 'State', options: [] },
      ],
    },
    {
      id: 'look',
      title: 'Look',
      controls: [
        { type: 'swatches', key: 'color', label: 'Body', colors: COLORS, custom: true },
        {
          type: 'chips',
          key: 'accessory',
          label: 'Accessory',
          options: [
            { value: 0, label: 'None' },
            { value: 1, label: 'Party hat' },
            { value: 2, label: 'Headphones' },
            { value: 3, label: 'Antenna' },
            { value: 4, label: 'Bow tie' },
          ],
        },
        { type: 'swatches', key: 'accentColor', label: 'Accessory colour', colors: ACCENTS, custom: true, when: (c) => c.accessory > 0 },
        {
          type: 'chips',
          key: 'eyes',
          label: 'Eyes',
          options: [
            { value: 0, label: 'Slits' },
            { value: 1, label: 'Happy' },
            { value: 2, label: 'Closed' },
            { value: 3, label: 'Wide' },
          ],
        },
        { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS },
      ],
    },
    {
      id: 'terminal',
      title: 'Terminal',
      controls: [
        { type: 'slider', key: 'glow', label: 'Phosphor glow', min: 0, max: 1, step: 0.01 },
        { type: 'toggle', key: 'crt', label: 'CRT scanlines' },
        { type: 'toggle', key: 'status', label: 'Status line' },
      ],
    },
  ],
  roster: () => [
    base({ name: 'Clawd' }),
    base({ name: 'Phosphor', color: '#4ADE80', accessory: 2, accentColor: '#3F3F46', glow: 0.8 }),
    base({ name: 'Amber', color: '#FFB000', accessory: 3, accentColor: '#F472B6', glow: 0.7 }),
  ],
  randomize: (c, rnd) => ({
    ...c,
    color: COLORS[Math.floor(rnd() * COLORS.length)],
    accentColor: ACCENTS[Math.floor(rnd() * ACCENTS.length)],
    accessory: Math.floor(rnd() * 5),
    eyes: rnd() < 0.7 ? 0 : 3,
    glow: rnd(),
  }),
  compose: (n, aspect, compact) =>
    groupPhoto(n, aspect, { gap: compact ? 1.05 : 1.15, charW: 1.15, charH: 0.95, riser: 0, depth: 0, fov: deg(18), margin: 0.1, turn: 0, lift: 0.05 }),
  solo: (aspect) => soloCamera(aspect, 1.2, 0.95, deg(18), 0.05),
  headLocal: () => [0, 0.42, 0.1],
  bounds: () => ({ c: [0, 0.3, 0], r: 0.6, occ: [] }),
  face: clawdFace,
  pack: (_c, _pose, f) => {
    f.data.fill(0);   // drawn in 2D by draw2d
  },
  draw2d: draw,
};
