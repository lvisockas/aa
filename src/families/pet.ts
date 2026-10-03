import { deg, normalize } from '../engine/math';
import type { Pose } from '../avatar/avatar';
import type { BaseConfig, Draw2DEnv, EyeSpec, FaceState, FaceTarget, FamilyDef, Option } from './types';
import { groupPhoto, soloCamera } from './compose';

/**
 * Pocket pets: a 90s virtual-pet keychain. The character is the whole toy:
 * an egg-shaped plastic shell on a ball chain, a recessed bezel, three round
 * buttons, and a 32x16 dot-matrix LCD where an original pixel creature lives.
 * The pixels are composed into a tiny frame buffer every frame (with the
 * previous moment kept as a faint LCD afterimage), blown up with smoothing off
 * and laid on a faint unlit grid. The brain is the shared one: the pet's eyes
 * shift a pixel towards the cursor, it blinks, boops press a button and make it
 * jump, and each agent state is a little pet-care scene on the screen.
 */
export interface PetConfig extends BaseConfig {
  shell: string;
  pattern: number;
  finish: number;
  buttons: string;
  chain: boolean;
  lcd: number;
  species: number;
  stage: number;
  eyes: number;
  accessory: number;
}

type Pt = [number, number];
type RGB = [number, number, number];
const TAU = Math.PI * 2;
const INK = '#3B2440';

const opt = (labels: string[]): Option[] => labels.map((label, value) => ({ value, label }));
const SPECIES_OPTS = opt(['Chick', 'Kitty', 'Ghosty', 'Dino', 'Bunny']);
const STAGE_OPTS = opt(['Egg', 'Baby', 'Child', 'Teen', 'Adult']);
const EYE_OPTS = opt(['Dots', 'Tall', 'Big', 'Shiny', 'Lashes']);
const ACC_OPTS = opt(['None', 'Bow', 'Cap', 'Flower', 'Crown']);
const PATTERN_OPTS = opt(['None', 'Stars', 'Hearts', 'Polka dots', 'Marble']);
const FINISH_OPTS = opt(['Solid', 'Translucent', 'Glitter', 'Pearl']);
const LCD_OPTS = opt(['Green', 'Grey', 'Blue backlight', 'Amber', 'Pink']);
const SHELLS = ['#F9B4CB', '#C8B5F3', '#9FE3C6', '#9ED3F4', '#FFE184', '#FFC09C', '#F6F1EA', '#FF8FA8'];
const BUTTONS = ['#FFFFFF', '#FFD84D', '#FF7FA6', '#6CC8F2', '#A98BF0', '#7FDDA3', '#FF8A5C'];

interface Tint {
  bg: string;
  hi: string;
  px: RGB;
}
const TINTS: Tint[] = [
  { bg: '#AFC293', hi: '#C3D3A8', px: [30, 44, 26] },
  { bg: '#C3C8C0', hi: '#D6DAD3', px: [28, 31, 34] },
  { bg: '#86C2EC', hi: '#AEDBF8', px: [12, 36, 74] },
  { bg: '#F0BE62', hi: '#F8D58E', px: [70, 34, 6] },
  { bg: '#EFBFD0', hi: '#F8D7E3', px: [74, 22, 50] },
];

const EXPRESSIONS: Option[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'excited', label: 'Heart eyes' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'sad', label: 'Sad' },
  { value: 'grumpy', label: 'Grumpy' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'wink', label: 'Wink' },
  { value: 'sick', label: 'Sick' },
];

// eye kinds (pixel shapes): 0 open (the eye style), 1 happy ^, 2 closed -, 3 squeeze > <,
// 4 dizzy x, 5 wide, 6 sad (with worried brow), 7 hearts, 8 grumpy (angry brow).
// mouth: + smile / - frown (below -0.8: wobbly), mouthOpen: open wedge, cheeks: blush pixels.
const petFace = (_c: PetConfig, expr: string): FaceTarget => {
  const e = (kind: number): EyeSpec => ({ kind, w: 1, h: 1, rot: 0, lid: 0, lidAng: 0, dx: 0, dy: 0 });
  const make = (l: number, r: number, mouth = 0.1, mouthOpen = 0, cheeks = 0): FaceTarget => ({ l: e(l), r: e(r), lidB: 0, mouth, mouthOpen, cheeks });
  switch (expr) {
    case 'happy':
      return make(1, 1, 0.8, 0, 0.6);
    case 'squeeze':
      return make(3, 3, 0.6, 0.5, 0.7);
    case 'excited':
      return make(7, 7, 0.8, 0.6, 0.6);
    case 'surprised':
      return make(5, 5, 0, 0.7);
    case 'sad':
      return make(6, 6, -0.6);
    case 'grumpy':
      return make(8, 8, -0.5);
    case 'sleepy':
      return make(2, 2, 0);
    case 'wink':
      return make(0, 1, 0.7, 0, 0.4);
    case 'sick':
      return make(6, 6, -1);
    case 'dizzy':
      return make(4, 4, -0.3, 0.3);
    case 'listening':
      return make(5, 5, 0.3);
    case 'thinking':
      return make(0, 0, -0.1);
    default:
      return make(0, 0, 0.1);
  }
};

const base = (o: Partial<PetConfig>): PetConfig => ({
  name: 'Pocket pet',
  state: 'idle',
  expression: 'neutral',
  shell: '#F9B4CB',
  pattern: 2,
  finish: 0,
  buttons: '#FFFFFF',
  chain: true,
  lcd: 0,
  species: 0,
  stage: 4,
  eyes: 0,
  accessory: 1,
  ...o,
});

// ------------------------------------------------------------- colour helpers
const parse = (hex: string): RGB => {
  let h = String(hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n) || h.length < 6) return [249, 180, 203];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a: string, b: string, k: number) => {
  const A = parse(a), B = parse(b);
  return toHex(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k);
};
const rgba = (hex: string, a: number) => {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${a})`;
};
const lum = (hex: string) => {
  const [r, g, b] = parse(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
const hash = (n: number) => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const radial = (ctx: CanvasRenderingContext2D, x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, stops: Array<[number, string]>): CanvasGradient | string => {
  const g = typeof ctx.createRadialGradient === 'function' ? ctx.createRadialGradient(x0, y0, r0, x1, y1, r1) : null;
  if (!g) return stops[Math.floor(stops.length / 2)][1];
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
};
const linear = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: Array<[number, string]>): CanvasGradient | string => {
  const g = typeof ctx.createLinearGradient === 'function' ? ctx.createLinearGradient(x0, y0, x1, y1) : null;
  if (!g) return stops[0][1];
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
};

// ------------------------------------------------------------- pixel art
/** a little bitmap: 0 transparent, 1 lit, 2 half-lit, 3 clear (opaque, erases what is below) */
interface Bmp {
  w: number;
  h: number;
  d: Uint8Array;
}
const bmp = (rows: string[]): Bmp => {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const d = new Uint8Array(w * h);
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) d[y * w + x] = r[x] === '#' ? 1 : r[x] === ':' ? 2 : r[x] === '.' ? 3 : 0;
  });
  return { w, h, d };
};

const LW = 32, LH = 16;   // the LCD dot matrix
type Buf = Uint8Array;
const put = (b: Buf, x: number, y: number, v = 1) => {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && y >= 0 && x < LW && y < LH) b[y * LW + x] = v;
};
const blit = (b: Buf, s: Bmp, x0: number, y0: number, flip = false, rows?: [number, number]) => {
  const ya = rows ? rows[0] : 0, yb = rows ? rows[1] : s.h - 1;
  for (let y = ya; y <= yb; y++)
    for (let x = 0; x < s.w; x++) {
      const v = s.d[y * s.w + (flip ? s.w - 1 - x : x)];
      if (v) put(b, x0 + x, y0 + y, v === 3 ? 0 : v);
    }
};
/** clears a rectangle to unlit, then draws a pixel outline with clipped corners */
const box = (b: Buf, x0: number, y0: number, x1: number, y1: number) => {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const corner = (x === x0 || x === x1) && (y === y0 || y === y1);
      if (corner) continue;
      put(b, x, y, x === x0 || x === x1 || y === y0 || y === y1 ? 1 : 0);
    }
};

// glyphs & props
const G_BANG = bmp(['##', '##', '##', '##', '  ', '##']);
const G_Q = bmp([' ## ', '#  #', '   #', '  # ', '    ', '  # ']);
const G_NOTE = bmp(['  ###', '  # #', '  # #', '### #', '###  ']);
const G_NOTE2 = bmp(['  #  ', '  ## ', '  # #', '###  ', '###  ']);
const G_HEART = bmp([' # # ', '#####', ' ### ', '  #  ']);
const G_z = bmp(['###', ' # ', '###']);
const G_Z = bmp(['####', '  # ', ' #  ', '####']);
const G_SPARK = bmp([' # ', '# #', ' # ']);
const BIG_HEART = bmp([' ## ## ', '#..#..#', '#.....#', ' #...# ', '  #.#  ', '   #   ']);
const BIG_HEART_FULL = bmp([' ## ## ', '#######', '#######', ' ##### ', '  ###  ', '   #   ']);
const CLOUD = bmp([
  '   ##  ##   ',
  '  #..##..#  ',
  ' #........# ',
  '#..........#',
  '#..........#',
  '#..........#',
  ' #........# ',
  '  #..##..#  ',
  '   ##  ##   ',
]);
const POOP = bmp(['   #   ', '  #.#  ', '  ###  ', ' #...# ', ' ##### ', '#.....#', '#######']);
const BOWL = bmp(['#########', '#.......#', ' #.....# ', '  #####  ']);
const SICK_FACE = bmp([' ##### ', '#.....#', '#.#.#.#', '#.....#', '#..#..#', '#.#.#.#', ' ##### ']);
const PLASTER = bmp(['#.#', '.#.', '#.#']);
const EGG = bmp([
  '   ###   ',
  '  #...#  ',
  ' #.....# ',
  ' #..#..# ',
  '#..###..#',
  '#...#...#',
  '#.......#',
  '#.#...#.#',
  '#.......#',
  ' #.....# ',
  '  #####  ',
]);
const FOODS: Bmp[] = [
  // burger
  bmp([' ###### ', '#.#..#.#', '#......#', '########', '#::::::#', '########', '#......#', ' ###### ']),
  // rice ball with a nori band
  bmp(['   ##   ', '  #..#  ', ' #....# ', ' #....# ', '#.####.#', '#.####.#', '########']),
  // cake with a candle
  bmp(['   #    ', '   #    ', '########', '#.#..#.#', '#......#', '#::::::#', '########']),
];
const ACC: Bmp[] = [
  bmp([]),
  bmp(['##.##', '#.#.#', '##.##']),                 // bow
  bmp(['  ####  ', ' ###### ', '#########']),        // cap with a brim
  bmp([' # ', '#.#', ' # ']),                        // flower
  bmp(['# # #', '#####']),                           // crown
];

// LCD status icons (printed segments), 7x7: food, light, play, medicine / bathroom, status, discipline, attention
const ICONS: Bmp[] = [
  bmp(['  # #  ', ' # #   ', '       ', '#######', '#.....#', ' #...# ', '  ###  ']),
  bmp(['  ###  ', ' #...# ', '#..#..#', '#.#...#', ' #...# ', '  ###  ', '  ###  ']),
  bmp(['  ###  ', ' #..## ', '#..#..#', '#.#...#', '##...##', ' #..#. ', '  ###  ']),
  bmp(['  ###  ', '  #.#  ', '###.###', '#.....#', '###.###', '  #.#  ', '  ###  ']),
  bmp(['  ##   ', ' #..#  ', ' #.#.##', ' #..#  ', '###..##', '#.....#', ' ##### ']),
  bmp(['      #', '    # #', '    # #', '  # # #', '  # # #', '# # # #', '#######']),
  bmp(['###### ', '#....# ', '#.##.# ', '#....# ', '###### ', '##     ', '#      ']),
  bmp(['#     #', '  ###  ', ' #...# ', ' #.#.# ', ' #...# ', '  ###  ', '#     #']),
];

// ------------------------------------------------------------- the pet sprites
interface PetSprite {
  bmp: Bmp;
  cx: number;      // body centre column
  top: number;     // body top row
  bottom: number;  // lowest row (feet)
  ey: number;
  my: number;
  ed: number;      // eye distance from the centre
  bw: number;
}
/** body size per life stage: baby, child, teen, adult (odd widths keep faces centred) */
const BODY: Array<[number, number]> = [[7, 5], [9, 7], [11, 9], [13, 10]];
const sprites = new Map<string, PetSprite>();

/** builds a creature procedurally: a rasterised body silhouette plus species parts */
const petSprite = (sp: number, st: number, fr: number): PetSprite => {
  const key = `${sp}|${st}|${fr}`;
  const hit = sprites.get(key);
  if (hit) return hit;
  const [bw, bh] = BODY[st];
  const M = 5, W = bw + 2 * M, H = bh + 2 * M;
  const d = new Uint8Array(W * H);
  const set = (x: number, y: number, v: number) => {
    const X = x + M, Y = y + M;
    if (X >= 0 && Y >= 0 && X < W && Y < H) d[Y * W + X] = v;
  };
  const inside = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= bw || y >= bh) return false;
    const X = (x + 0.5 - bw / 2) / (bw / 2), Y = (y + 0.5 - bh / 2) / (bh / 2);
    const ax = Math.abs(X), ay = Math.abs(Y);
    switch (sp) {
      case 1: return ax ** 3 + ay ** 3 <= 1.05;                       // kitty: squircle
      case 2: return Y > 0 ? ax <= 1 : X * X + Y * Y <= 1.08;          // ghosty: dome
      case 3: { const k = ax / (1 + 0.1 * Y); return k ** 2.3 + ay ** 2.3 <= 1.05; } // dino: pear
      case 4: return X * X + ay ** 2.2 <= 1.06;                        // bunny
      default: return X * X + Y * Y <= 1.1;                            // chick: round
    }
  };
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++)
      if (inside(x, y)) set(x, y, !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1) ? 1 : 3);
  const cx = (bw - 1) / 2, L = 0, R = bw - 1, bot = bh - 1;
  let ts = 0;
  while (ts < bw && !inside(ts, 0)) ts++;
  const te = bw - 1 - ts;
  const mid = Math.round(bh * 0.55);
  const lit = (x: number, y: number) => set(x, y, 1);
  const clr = (x: number, y: number) => set(x, y, 3);
  let bottom = bot;
  if (sp !== 2) {
    // feet; on the second frame they step apart
    const fw = st >= 2 ? 2 : 1;
    const f0 = (st >= 2 ? 2 : 1) + fr;
    for (let i = 0; i < fw; i++) {
      lit(cx - f0 - i, bh);
      lit(cx + f0 + i, bh);
    }
    bottom = bh;
  }
  switch (sp) {
    case 0: {
      // chick: a sprout on top, wing nubs that flap
      lit(cx, -1);
      if (st >= 1) lit(cx + 1, -2);
      if (st >= 3) { lit(cx, -2); lit(cx - 1, -3); lit(cx + 2, -3); }
      if (st >= 1) {
        const wy = mid - fr;
        lit(L - 1, wy); lit(R + 1, wy);
        lit(L - 1, wy + 1); lit(R + 1, wy + 1);
        if (st >= 2) { lit(L - 2, wy + fr); lit(R + 2, wy + fr); }
      }
      break;
    }
    case 1: {
      // kitty: pointy ears on the flat top and a curly tail
      const eh = [1, 2, 2, 3][st];
      for (let k = 0; k < eh; k++) {
        const r = -eh + k;
        lit(ts, r); lit(te, r);
        lit(ts + k, r); lit(te - k, r);
        for (let x = ts + 1; x < ts + k; x++) { clr(x, r); clr(bw - 1 - x, r); }
      }
      if (st >= 1) {
        lit(R + 1, bot - 1);
        lit(R + 2, bot - 2);
        if (st >= 2) lit(R + 2, bot - 3);
        if (st >= 3) lit(R + 1 + fr, bot - 4);
      }
      // whiskers
      if (st >= 2) { lit(L - 1, mid); lit(R + 1, mid - (st >= 3 ? 0 : 1)); }
      break;
    }
    case 2: {
      // ghosty: a wavy hem that ripples, little arms
      for (let x = 1; x < R; x++) {
        const q = (x + 2 * fr) % 4;
        if (q >= 2) {
          set(x, bot, 0);
          lit(x, bot - 1);
        }
      }
      if (st >= 1) {
        lit(L - 1, mid - fr); lit(R + 1, mid - fr);
        if (st >= 2) { lit(L - 2, mid - 1 - fr); lit(R + 2, mid - 1 - fr); }
      }
      break;
    }
    case 3: {
      // dino: spikes along the top and a tail
      const spikes = st >= 3 ? [-4, -2, 0, 2, 4] : st >= 1 ? [-2, 0, 2] : [0];
      for (const s of spikes) if (cx + s >= ts && cx + s <= te) lit(cx + s, -1);
      if (st >= 2) lit(cx, -2);
      if (st >= 1) {
        lit(R + 1, bot - 1);
        lit(R + 2, bot - 1 - fr);
        if (st >= 2) lit(R + 3, bot - 2 - fr);
      }
      break;
    }
    case 4: {
      // bunny: tall ears; one flops on the second frame
      const eh = [1, 2, 3, 4][st];
      if (st === 0) { lit(cx - 2, -1); lit(cx + 2, -1); break; }
      const k = st >= 3 ? 2 : 1;
      for (const s of [-1, 1]) {
        const e0 = s < 0 ? cx - k - 2 : cx + k;   // leftmost column of this ear
        for (let r = -eh; r <= -1; r++) {
          if (r === -eh) {
            const flop = s > 0 && fr ? 1 : 0;
            lit(e0 + 1 + flop, r);
          } else {
            lit(e0, r); lit(e0 + 2, r); clr(e0 + 1, r);
          }
        }
      }
      break;
    }
  }
  const ey = Math.round(bh * 0.42);
  const s: PetSprite = { bmp: { w: W, h: H, d }, cx: M + cx, top: M, bottom: M + bottom, ey: M + ey, my: M + ey + (st >= 2 ? 2 : 1), ed: st === 3 ? 3 : 2, bw };
  sprites.set(key, s);
  return s;
};

interface PetPose {
  X: number;
  Y: number;
  fr: number;
  flip: boolean;
  dx: number;
  dy: number;
  kl: number;
  kr: number;
  blink: boolean;
  mouth: number;
  open: number;
  cheeks: number;
}

const eye = (b: Buf, x: number, y: number, kind: number, style: number, side: number, blink: boolean, small: boolean) => {
  const P = (px: number, py: number, v = 1) => put(b, px, py, v);
  if (blink && (kind === 0 || kind === 5 || kind === 6 || kind === 8)) kind = 2;
  switch (kind) {
    case 1: P(x - 1, y); P(x, y - 1); P(x + 1, y); return;
    case 2: P(x, y); P(x + side, y); return;
    case 3: P(x + side, y - 1); P(x, y); P(x + side, y + 1); return;
    case 4: P(x - 1, y - 1); P(x + 1, y - 1); P(x, y); P(x - 1, y + 1); P(x + 1, y + 1); return;
    case 5: P(x, y - 1); P(x + side, y - 1); P(x, y); P(x + side, y); return;
    case 6:
      P(x, y);
      if (!small) { P(x, y - 2); P(x - side, y - 3); }
      return;
    case 7: P(x - 1, y - 1); P(x + 1, y - 1); P(x - 1, y); P(x, y); P(x + 1, y); P(x, y + 1); return;
    case 8:
      P(x, y);
      if (!small) { P(x - side, y - 2); P(x, y - 2); P(x + side, y - 3); }
      return;
  }
  // open, in the chosen eye style
  switch (style) {
    case 1: P(x, y - 1); P(x, y); return;
    case 2: P(x, y - 1); P(x + side, y - 1); P(x, y); P(x + side, y); return;
    case 3: {
      const l = Math.min(x, x + side);
      P(l, y - 1, 0); P(l + 1, y - 1); P(l, y); P(l + 1, y);
      return;
    }
    case 4: P(x, y); P(x + side, y - 1); return;
    default: P(x, y);
  }
};

const drawPet = (b: Buf, c: PetConfig, sp: number, st: number, p: PetPose) => {
  const s = petSprite(sp, st, p.fr);
  blit(b, s.bmp, p.X - s.cx, p.Y - s.bottom, p.flip);
  const X = p.X + p.dx;
  const ey = p.Y - (s.bottom - s.ey) + p.dy;
  const small = st <= 1;
  const P = (x: number, y: number, v = 1) => put(b, x, y, v);
  eye(b, X - s.ed, ey, p.kl, c.eyes, -1, p.blink, small);
  eye(b, X + s.ed, ey, p.kr, c.eyes, 1, p.blink, small);
  // mouth (a beak for the chick)
  const my = p.Y - (s.bottom - s.my) + p.dy;
  const open = p.open > 0.35;
  if (sp === 0) {
    if (st === 0) { P(X, my); if (open) P(X, my + 1); }
    else if (open) { P(X - 1, my); P(X, my); P(X + 1, my); P(X - 1, my + 1, 0); P(X, my + 1, 0); P(X + 1, my + 1, 0); P(X, my + 2); }
    else { P(X - 1, my); P(X, my); P(X + 1, my); P(X, my + 1); }
  } else if (open) {
    if (small) { P(X, my); P(X, my + 1); }
    else { P(X - 1, my); P(X, my); P(X + 1, my); P(X, my + 1); }
  } else if (p.mouth < -0.8 && !small) {
    P(X - 2, my + 1); P(X - 1, my); P(X, my + 1); P(X + 1, my); P(X + 2, my + 1);
  } else if (p.mouth < -0.3) {
    if (small) P(X, my); else { P(X - 1, my + 1); P(X, my); P(X + 1, my + 1); }
  } else if (p.mouth > 0.45) {
    if (small) { P(X - 1, my); P(X, my + 1); P(X + 1, my); } else { P(X - 1, my); P(X, my + 1); P(X + 1, my); }
  } else P(X, my);
  // dino teeth: a tiny fang when the mouth is open
  if (sp === 3 && open && !small) P(X + 1, my + 1, 0);
  if (p.cheeks > 0.4 && !small) {
    P(X - s.ed - 1, my, 2);
    P(X + s.ed + 1, my, 2);
  }
  // accessory on the head (babies are too small to wear one)
  if (st === 0) return;
  const top = p.Y - (s.bottom - s.top);
  const half = (s.bw - 1) / 2;
  switch (c.accessory) {
    case 1: blit(b, ACC[1], p.X + (p.flip ? half - 3 : -half - 1), top - 1); break;
    case 2: blit(b, ACC[2], p.X - 4 + (p.flip ? -1 : 0), top - 2, p.flip); break;
    case 3: blit(b, ACC[3], p.X + (p.flip ? half - 3 : -half + 1), top - 2); break;
    case 4:
      for (let y = top - 4; y < top; y++) for (let x = p.X - 2; x <= p.X + 2; x++) put(b, x, y, 0);
      blit(b, ACC[4], p.X - 2, top - 2);
      break;
  }
};

/** the food being eaten loses bites from the side facing the pet */
const blitFood = (b: Buf, f: Bmp, x0: number, y0: number, bites: number) => {
  const cut = Math.round((bites / 4) * f.w);
  for (let y = 0; y < f.h; y++) {
    const limit = f.w - cut + (y % 3 === 1 ? 1 : 0) - (y % 4 === 3 ? 1 : 0);
    for (let x = 0; x < f.w; x++) {
      let v = f.d[y * f.w + x];
      if (x >= limit) continue;
      if (x === limit - 1 && cut > 0 && v === 3) v = 1;
      if (v) put(b, x0 + x, y0 + y, v === 3 ? 0 : v);
    }
  }
};

const stinkLines = (b: Buf, x: number, y: number, t: number) => {
  const ph = Math.floor(t * 3) % 2;
  for (const [sx, k] of [[x - 1, 0], [x + 7, 1]] as Array<[number, number]>)
    for (let i = 0; i < 3; i++) put(b, sx + ((i + ph + k) % 2), y - i);
};

const sparkles = (b: Buf, t: number, spots: Pt[]) => {
  const k = Math.floor(t * 3);
  spots.forEach(([x, y], i) => {
    if ((k + i) % 3 !== 0) blit(b, G_SPARK, x, y);
  });
};

interface Scene {
  c: PetConfig;
  pose: Pose;
  face: FaceState;
  state: string;
  poke: number;
}

/** composes one moment of the LCD into the frame buffer */
const scene = (b: Buf, S: Scene, t: number) => {
  b.fill(0);
  const { c, pose, face, state } = S;
  const sp = clamp(Math.round(Number(c.species) || 0), 0, 4);
  const stage = clamp(Math.round(Number(c.stage) || 0), 0, 4);
  const st = stage - 1;   // -1 egg
  const tick = Math.floor(t * 2);   // two frames a second, like the real thing
  const fr = tick & 1;
  const lookX = clamp(Math.round(pose.lookX * 1.5), -1, 1);
  const lookY = clamp(Math.round(-pose.lookY * 1.5), -1, 1);
  const hop = S.poke > 0.25 ? 2 : pose.excite > 0.6 && fr ? 1 : 0;
  const blink = pose.blink > 0.5;
  const halfW = st >= 0 ? (BODY[st][0] + 1) / 2 + 2 : 5;
  const pet = (X: number, Y: number, o: Partial<PetPose> = {}) => {
    if (st < 0) {
      // still an egg: it rocks in place
      const w = Math.floor(t * 3) % 4 === 1 ? 1 : Math.floor(t * 3) % 4 === 3 ? -1 : 0;
      blit(b, EGG, X - 4 + w, Y - 10, false, [0, 4]);
      blit(b, EGG, X - 4, Y - 10, false, [5, 10]);
      return;
    }
    const float = sp === 2 && Math.floor(t * 1.3) % 2 ? 1 : 0;
    drawPet(b, c, sp, st, {
      X, Y: Y - hop - float, fr, flip: false, dx: lookX, dy: lookY,
      kl: face.l.kind, kr: face.r.kind, blink, mouth: face.mouth, open: Math.max(face.mouthOpen, pose.talk), cheeks: face.cheeks, ...o,
    });
  };
  const petTop = (Y: number) => (st < 0 ? Y - 11 : Y - BODY[st][1] - 1 - hop);

  switch (state) {
    case 'listening': {
      const X = 12;
      pet(X, 15);
      if ((t * 2) % 1 < 0.8) {
        blit(b, G_BANG, 22, 3);
        put(b, 19, 3); put(b, 18, 2); put(b, 26, 3); put(b, 27, 2);
      }
      break;
    }
    case 'thinking': {
      const X = 10 + (tick % 4 < 2 ? 0 : 1);
      pet(X, 15, { dx: 1, dy: -1 });
      const bob = fr;
      put(b, X + halfW - 1, 10);
      put(b, X + halfW + 1, 8); put(b, X + halfW + 2, 8); put(b, X + halfW + 1, 7); put(b, X + halfW + 2, 7);
      blit(b, CLOUD, 19, bob);
      blit(b, G_Q, 23, bob + 2);
      break;
    }
    case 'working': {
      // eating: a snack loses a bite every second, then a happy pause
      const meal = Math.floor(t / 5.5), mt = t - meal * 5.5;
      const food = FOODS[meal % FOODS.length];
      const bites = Math.min(4, Math.floor(mt));
      const X = 21;
      const chewing = bites < 4 && mt > 0.6;
      const full = mt > 4.4;
      pet(X, 15, {
        dx: -1, dy: 0, fr: chewing ? 0 : fr,
        kl: full ? 1 : face.l.kind, kr: full ? 1 : face.r.kind,
        open: chewing && fr === 0 ? 1 : 0, mouth: full ? 0.8 : face.mouth,
      });
      const fx = X - halfW - food.w + 1;
      if (bites < 4) blitFood(b, food, fx, 16 - food.h, bites);
      if (chewing && mt % 1 < 0.35) { put(b, fx + food.w - 2 * bites + 1, 12 + fr); put(b, fx + food.w - 2 * bites, 14); }
      if (full) blit(b, G_HEART, X - 2, Math.max(0, petTop(15) - 5));
      break;
    }
    case 'speaking': {
      const X = 9;
      pet(X, 15);
      box(b, 17, 1, 30, 10);
      put(b, 17, 9, 0); put(b, 17, 8, 0);
      put(b, 16, 9); put(b, 15, 10); put(b, 16, 10); put(b, 17, 10);
      const k = Math.floor(t * 1.2) % 3;
      const yb = 3 + (fr ? 0 : 1);
      if (k === 0) { blit(b, G_NOTE, 19, yb); blit(b, G_NOTE2, 25, yb + (fr ? 1 : -1) + 0); }
      else if (k === 1) { blit(b, G_HEART, 21, yb + 1); blit(b, G_NOTE2, 26, yb); }
      else { blit(b, G_NOTE2, 19, yb); blit(b, G_HEART, 24, yb + 1); }
      break;
    }
    case 'done': {
      const tt = t % 8;
      if (tt < 4.6) {
        const X = 16;
        pet(X, 15 - (fr ? 2 : 0), { kl: 7, kr: 7, open: 1, mouth: 0.8, fr: 0 });
        for (let i = 0; i < 3; i++) {
          const ph = (tick + i * 3) % 7;
          const hx = [4, 25, 9][i] + (ph % 2), hy = 12 - ph * 2;
          if (hy >= -1) blit(b, G_HEART, hx, hy);
        }
      } else {
        // the status page: two rows of hearts filling up
        const n = Math.floor((tt - 4.6) / 0.28);
        for (let r = 0; r < 2; r++)
          for (let i = 0; i < 4; i++) blit(b, n > i + r * 4 ? BIG_HEART_FULL : BIG_HEART, 1 + i * 8, 1 + r * 8);
      }
      break;
    }
    case 'sleeping': {
      // lights off: the screen goes dark and the pet sleeps in negative
      pet(14, 15, { kl: 2, kr: 2, blink: true, open: 0, mouth: 0, dx: 0, dy: 0, fr: 0 });
      const k = Math.floor(t * 1.5) % 4;
      if (k >= 1) blit(b, G_z, 21, 9);
      if (k >= 2) blit(b, G_Z, 24, 5);
      if (k >= 3) blit(b, G_Z, 27, 1);
      for (let i = 0; i < b.length; i++) b[i] = b[i] ? 0 : 1;
      break;
    }
    case 'hatching': {
      const tt = t % 7;
      const X = 15;
      const sprBaby = st >= 0 ? st : 0;
      if (tt < 4.5) {
        const fast = tt > 3 ? 6 : 3;
        const q = Math.floor(t * fast) % 4;
        const w = q === 1 ? 1 : q === 3 ? -1 : 0;
        blit(b, EGG, X - 4 + w, 5, false, [0, 4]);
        blit(b, EGG, X - 4, 5, false, [5, 10]);
        if (tt > 3) {
          const n = Math.floor(((tt - 3) / 1.5) * 8);
          for (let x = 1; x <= Math.min(7, n); x++) put(b, X - 4 + x, 10 + (x % 2));
        }
      } else {
        const k = Math.min(6, Math.floor((tt - 4.5) * 8));
        drawPet(b, c, sp, sprBaby, {
          X, Y: tt > 5.3 && tt < 6.2 && fr ? 13 : 14, fr, flip: false, dx: 0, dy: 0, kl: 1, kr: 1, blink: false, mouth: 0.8, open: 0, cheeks: 0.6,
        });
        if (tt < 6.2) {
          for (let x = 0; x < 9; x++) put(b, X - 4 + x, 10 + (x % 2), 0);
          blit(b, EGG, X - 4, 5, false, [6, 10]);
          for (let x = 1; x <= 7; x++) put(b, X - 4 + x, 10 + (x % 2));
          if (k < 6) blit(b, EGG, X - 4 + k, 5 - k * 2, false, [0, 4]);
        }
        sparkles(b, t, [[6, 3], [23, 2], [25, 9], [4, 10]]);
      }
      break;
    }
    case 'hungry': {
      const X = 11;
      pet(X, 15, { dx: 1, dy: 1, fr: 0 });
      blit(b, BOWL, 21, 12);
      // a tummy rumble
      if (fr) { put(b, X + halfW, 8); put(b, X + halfW + 1, 7); put(b, X + halfW + 2, 8); put(b, X + halfW + 3, 7); }
      if ((t * 2) % 2 < 1.3) blit(b, G_Q, 24, 3);
      break;
    }
    case 'sick': {
      const X = 11 + (tick % 6 === 3 ? 1 : 0);
      pet(X, 15, { fr: 0, dx: 0, dy: 0 });
      if (st >= 0) blit(b, PLASTER, X + (st >= 2 ? 2 : 1), petTop(15) + 1);
      blit(b, POOP, 23, 9);
      stinkLines(b, 23, 7, t);
      blit(b, SICK_FACE, 24, 0 + (fr ? 0 : 0));
      break;
    }
    default: {
      // idle: wanders back and forth across the screen
      const pos = (k: number) => Math.round(6.5 * Math.sin(k * 0.13) + 2.5 * Math.sin(k * 0.41 + 1.3));
      const lo = Math.ceil(halfW), hi = Math.floor(31 - halfW);
      const X = clamp(15 + pos(tick), lo, hi);
      const dir = pose.excite > 0.5 ? 0 : Math.sign(pos(tick) - pos(tick - 1));
      // now and then a poop appears and gets flushed away
      const cyc = t % 26;
      if (cyc > 15 && cyc < 24.2) {
        blit(b, POOP, 24, 9);
        stinkLines(b, 24, 7, t);
      }
      pet(X, 15, dir ? { dx: dir, dy: 0, flip: dir > 0 } : {});
      if (cyc > 22.6 && cyc < 24.4) {
        const xw = Math.round(31 - ((cyc - 22.6) / 1.8) * 34);
        for (let y = 0; y < LH; y++) {
          for (let x = Math.max(0, xw + 2); x < LW; x++) put(b, x, y, 0);
          put(b, xw + (y % 3 === 0 ? 1 : 0), y);
        }
      }
    }
  }
  // a boop: a little heart pops up in the corner
  if (S.poke > 0.3 && state !== 'sleeping' && state !== 'done' && state !== 'speaking') blit(b, G_HEART, 1, 1);
};

/** which status icons are lit (index, blinking) */
const litIcons = (state: string, t: number): Array<[number, boolean]> => {
  switch (state) {
    case 'listening': return [[7, false]];
    case 'thinking': return [[5, false]];
    case 'working': return [[0, false]];
    case 'speaking': return [[2, false]];
    case 'done': return [[5, true]];
    case 'sleeping': return [[1, false]];
    case 'hatching': return t % 7 > 5 ? [[7, true]] : [];
    case 'hungry': return [[0, false], [7, true]];
    case 'sick': return [[3, false], [4, false], [7, true]];
    default: return t % 26 > 15 && t % 26 < 24.2 ? [[4, false]] : [];
  }
};

// ------------------------------------------------------------- the device
const EGG_SHAPE = { cy: 0.476, rx: 0.372, ry: 0.468 };
const eggPt = (a: number, inset = 0): Pt => {
  const s = Math.sin(a), c = Math.cos(a);
  return [c * (EGG_SHAPE.rx - inset) * (1 - 0.085 * s), EGG_SHAPE.cy + s * (EGG_SHAPE.ry - inset)];
};
const eggPath = (ctx: CanvasRenderingContext2D, inset = 0) => {
  ctx.beginPath();
  for (let i = 0; i < 72; i++) {
    const [x, y] = eggPt((i / 72) * TAU, inset);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
};
const rrect = (ctx: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hh: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(cx - hw + r, cy + hh);
  ctx.lineTo(cx + hw - r, cy + hh);
  ctx.arc(cx + hw - r, cy + hh - r, r, Math.PI / 2, 0, true);
  ctx.lineTo(cx + hw, cy - hh + r);
  ctx.arc(cx + hw - r, cy - hh + r, r, 0, -Math.PI / 2, true);
  ctx.lineTo(cx - hw + r, cy - hh);
  ctx.arc(cx - hw + r, cy - hh + r, r, -Math.PI / 2, -Math.PI, true);
  ctx.lineTo(cx - hw, cy + hh - r);
  ctx.arc(cx - hw + r, cy + hh - r, r, Math.PI, Math.PI / 2, true);
  ctx.closePath();
};
const circle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, TAU);
};

// scattered points for star / heart patterns, and glitter specks (deterministic)
const SCATTER: Array<[number, number, number, number]> = [];
for (let j = 0; j < 10; j++)
  for (let i = 0; i < 8; i++) {
    const n = i * 17 + j * 31;
    SCATTER.push([-0.4 + i * 0.112 + (j % 2) * 0.056 + (hash(n) - 0.5) * 0.035, 0.02 + j * 0.102 + (hash(n + 5) - 0.5) * 0.035, 0.8 + 0.45 * hash(n + 9), (hash(n + 13) - 0.5) * 1.1]);
  }
const GLITTER: Array<[number, number, number, number]> = [];
for (let i = 0; i < 140; i++) {
  const x = (hash(i * 3.1) - 0.5) * 0.74, y = hash(i * 7.7 + 2) * 0.94;
  const [ex] = eggPt(Math.asin(clamp((y - EGG_SHAPE.cy) / EGG_SHAPE.ry, -1, 1)));
  if (Math.abs(x) < Math.abs(ex) - 0.02) GLITTER.push([x, y, 0.004 + hash(i + 0.5) * 0.007, hash(i * 1.9) * TAU]);
}

const starPath = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) => {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + Math.PI / 2 + (i / 10) * TAU, rr = i % 2 ? r * 0.45 : r;
    if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
};
const heartPath = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.bezierCurveTo(-r * 0.2, -r * 0.55, -r * 1.15, -r * 0.2, -r * 0.95, r * 0.35);
  ctx.bezierCurveTo(-r * 0.8, r * 0.85, -r * 0.15, r * 0.9, 0, r * 0.4);
  ctx.bezierCurveTo(r * 0.15, r * 0.9, r * 0.8, r * 0.85, r * 0.95, r * 0.35);
  ctx.bezierCurveTo(r * 1.15, -r * 0.2, r * 0.2, -r * 0.55, 0, -r);
  ctx.closePath();
  ctx.restore();
};

const pattern = (ctx: CanvasRenderingContext2D, c: PetConfig, shell: string) => {
  const kind = c.pattern | 0;
  if (!kind) return;
  const light = lum(shell) > 0.86;
  if (kind === 1 || kind === 2) {
    const col = kind === 1 ? (light ? '#F7C948' : mix(shell, '#FFFFFF', 0.72)) : light ? '#F48FB1' : mix(shell, '#E8467C', 0.42);
    ctx.fillStyle = col;
    SCATTER.forEach(([x, y, s, rot], i) => {
      if ((i * 7) % 3 === 0) return;
      if (kind === 1) starPath(ctx, x, y, 0.026 * s, rot);
      else heartPath(ctx, x, y, 0.022 * s, rot * 0.6);
      ctx.fill();
    });
  } else if (kind === 3) {
    ctx.fillStyle = light ? '#9ED3F4' : mix(shell, '#FFFFFF', 0.6);
    for (let j = 0; j < 13; j++)
      for (let i = 0; i < 10; i++) {
        circle(ctx, -0.42 + i * 0.09 + (j % 2) * 0.045, j * 0.078, 0.016);
        ctx.fill();
      }
  } else if (kind === 4) {
    // marble: soft swirled streaks
    ctx.lineCap = 'round';
    for (let k = 0; k < 7; k++) {
      ctx.beginPath();
      const y0 = 0.06 + k * 0.14 + 0.03 * Math.sin(k * 2.1);
      for (let i = 0; i <= 24; i++) {
        const x = -0.42 + i * 0.035;
        const y = y0 + 0.05 * Math.sin(x * 7 + k * 1.7) + 0.025 * Math.sin(x * 17 + k);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = k % 2 ? rgba(mix(shell, '#FFFFFF', 0.75), 0.75) : rgba(mix(shell, '#7A4A8A', 0.25), 0.35);
      ctx.lineWidth = 0.012 + 0.02 * hash(k + 3);
      ctx.stroke();
    }
  }
};

/** the circuit board seen through clear plastic */
const guts = (ctx: CanvasRenderingContext2D) => {
  eggPath(ctx, 0.05);
  ctx.fillStyle = '#86BFA0';
  ctx.fill();
  ctx.strokeStyle = 'rgba(214,240,200,0.6)';
  ctx.lineWidth = 0.005;
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of [[-0.22, 0.2, -0.05, 0.2], [-0.05, 0.2, -0.05, 0.32], [0.08, 0.16, 0.22, 0.16], [0.15, 0.16, 0.15, 0.35], [-0.2, 0.82, 0.2, 0.82], [-0.24, 0.3, -0.24, 0.7]])
    ctx.moveTo(x0, y0), ctx.lineTo(x1, y1);
  ctx.stroke();
  circle(ctx, 0.02, 0.2, 0.1);
  ctx.fillStyle = '#C9CDD3';
  ctx.fill();
  circle(ctx, 0.02, 0.2, 0.075);
  ctx.strokeStyle = 'rgba(120,125,135,0.7)';
  ctx.stroke();
  rrect(ctx, 0.15, 0.14, 0.035, 0.025, 0.006);
  ctx.fillStyle = '#3A4440';
  ctx.fill();
};

const ballChain = (ctx: CanvasRenderingContext2D, pose: Pose, t: number, px: number) => {
  const hx = 0, hy = 0.962;
  const sw = clamp(0.32 - pose.roll * 1.5 + Math.sin(pose.wobblePhase * 0.4) * pose.wobble * 7 + 0.07 * Math.sin(t * 1.6) - pose.offset[0] * 2, -0.9, 1.1);
  const N = 22, rx = 0.048, ry = 0.06;
  const pts: Pt[] = [];
  const cs = Math.cos(sw), sn = Math.sin(sw);
  for (let i = 0; i < N; i++) {
    const a = -Math.PI / 2 + (i / N) * TAU;
    const lx = Math.cos(a) * rx * (1 - 0.25 * Math.sin(a)), ly = ry + Math.sin(a) * ry;
    pts.push([hx + lx * cs + ly * sn, hy - lx * sn + ly * cs]);
  }
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.strokeStyle = '#8E949D';
  ctx.lineWidth = Math.max(px, 0.0028);
  ctx.stroke();
  pts.forEach(([x, y], i) => {
    if (i === 0) return;
    circle(ctx, x, y, 0.0068);
    ctx.fillStyle = '#C3C8D0';
    ctx.fill();
    ctx.strokeStyle = '#7F858F';
    ctx.lineWidth = Math.max(px * 0.8, 0.002);
    ctx.stroke();
    circle(ctx, x - 0.002, y + 0.0022, 0.0022);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
  });
  // the little barrel clasp at the top of the loop
  const [tx, ty] = pts[N / 2];
  ctx.save();
  ctx.translate(tx, ty);
  ctx.rotate(-sw);
  rrect(ctx, 0, 0, 0.016, 0.0085, 0.008);
  ctx.fillStyle = '#B6BCC5';
  ctx.fill();
  ctx.strokeStyle = '#7F858F';
  ctx.lineWidth = Math.max(px * 0.8, 0.002);
  ctx.stroke();
  ctx.restore();
};

const draw = (ctx: CanvasRenderingContext2D, c: PetConfig, pose: Pose, face: FaceState, env: Draw2DEnv) => {
  const t = env.t;
  const shell = typeof c.shell === 'string' ? c.shell : SHELLS[0];
  const finish = c.finish | 0;
  const tint = TINTS[clamp(c.lcd | 0, 0, TINTS.length - 1)];
  const dark = mix(shell, INK, 0.55);
  const fx = clamp(pose.headYaw, -1, 1) * 0.028;
  const fy = clamp(-pose.headPitch, -1, 1) * 0.02;
  const px = env.px;

  // ground shadow
  ctx.beginPath();
  ctx.ellipse(0, 0.006, 0.26, 0.032, 0, 0, TAU);
  ctx.fillStyle = 'rgba(120,60,110,0.14)';
  ctx.fill();

  // ball chain and the lug it threads through
  if (c.chain !== false) ballChain(ctx, pose, t, px);
  rrect(ctx, 0, 0.948, 0.05, 0.04, 0.03);
  ctx.fillStyle = mix(shell, '#FFFFFF', 0.12);
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.0065;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0.962, 0.02, 0.011, 0, 0, TAU);
  ctx.fillStyle = mix(shell, INK, 0.7);
  ctx.fill();
  if (c.chain !== false) {
    circle(ctx, 0, 0.962, 0.0068);
    ctx.fillStyle = '#C3C8D0';
    ctx.fill();
  }

  // ---- the shell
  ctx.save();
  eggPath(ctx);
  ctx.clip();
  if (finish === 1) {
    eggPath(ctx);
    ctx.fillStyle = mix(shell, '#FFFFFF', 0.55);
    ctx.fill();
    guts(ctx);
    ctx.globalAlpha = 0.62;
  }
  eggPath(ctx);
  ctx.fillStyle = shell;
  ctx.fill();
  ctx.globalAlpha = finish === 1 ? 0.8 : 1;
  pattern(ctx, c, shell);
  ctx.globalAlpha = 1;
  if (finish === 3) {
    // pearl: a soft iridescent sheen that slides as the toy turns
    const o = fx * 4;
    eggPath(ctx);
    ctx.fillStyle = linear(ctx, -0.4 + o, 0.05, 0.4 + o, 0.95, [
      [0, 'rgba(255,190,235,0)'],
      [0.3, 'rgba(255,195,240,0.42)'],
      [0.5, 'rgba(185,230,255,0.42)'],
      [0.7, 'rgba(255,248,200,0.38)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.fill();
  }
  // soft form shading: lit from the top left, rounding off into the rim
  eggPath(ctx);
  ctx.fillStyle = radial(ctx, -0.13, 0.7, 0.02, -0.04, 0.52, 0.56, [
    [0, 'rgba(255,255,255,0.5)'],
    [0.35, 'rgba(255,255,255,0.08)'],
    [0.72, rgba(dark, 0)],
    [1, rgba(dark, finish === 1 ? 0.5 : 0.36)],
  ]);
  ctx.fill();
  if (finish === 2) {
    GLITTER.forEach(([x, y, r, ph], i) => {
      const tw = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 + ph));
      ctx.fillStyle = i % 3 === 0 ? `rgba(255,236,160,${0.9 * tw})` : `rgba(255,255,255,${0.95 * tw})`;
      if (r > 0.0085 && tw > 0.8) {
        starPath(ctx, x, y, r * 1.6, ph);
        ctx.fill();
      } else {
        circle(ctx, x, y, r * 0.6);
        ctx.fill();
      }
    });
  }
  if (finish === 1) {
    // the thickness of clear plastic shows as a brighter band inside the rim
    eggPath(ctx, 0.016);
    ctx.strokeStyle = rgba(mix(shell, '#FFFFFF', 0.5), 0.6);
    ctx.lineWidth = 0.014;
    ctx.stroke();
  }
  ctx.restore();
  eggPath(ctx);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.0075;
  ctx.stroke();

  // glossy highlights (a crescent, a dot, and a rim light at the lower right)
  ctx.save();
  ctx.translate(-0.2 - fx * 0.6, 0.7);
  ctx.rotate(-0.42);
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.034, 0.12, 0, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
  ctx.restore();
  circle(ctx, -0.115 - fx * 0.6, 0.865, 0.017);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    const [x, y] = eggPt(-1.05 + (i / 16) * 0.85, 0.028);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 0.012;
  ctx.lineCap = 'round';
  ctx.stroke();

  // ---- recessed bezel around the screen
  const bx = fx, by = 0.565 + fy;
  rrect(ctx, bx, by, 0.258, 0.212, 0.085);
  ctx.fillStyle = mix(shell, '#FFFFFF', 0.28);
  ctx.fill();
  ctx.strokeStyle = rgba(dark, 0.55);
  ctx.lineWidth = 0.005;
  ctx.stroke();
  rrect(ctx, bx, by, 0.243, 0.197, 0.075);
  ctx.fillStyle = linear(ctx, 0, by + 0.2, 0, by - 0.2, [[0, mix(shell, INK, 0.5)], [0.5, mix(shell, INK, 0.3)], [1, mix(shell, '#FFFFFF', 0.1)]]);
  ctx.fill();
  rrect(ctx, bx, by - 0.003, 0.231, 0.183, 0.066);
  ctx.fillStyle = mix(shell, '#FFFFFF', 0.72);
  ctx.fill();

  // ---- the LCD
  const lx = bx, ly = by - 0.003, lhw = 0.206, lhh = 0.158;
  rrect(ctx, lx, ly, lhw + 0.006, lhh + 0.006, 0.034);
  ctx.fillStyle = mix(shell, INK, 0.45);
  ctx.fill();
  rrect(ctx, lx, ly, lhw, lhh, 0.03);
  ctx.fillStyle = linear(ctx, 0, ly + lhh, 0, ly - lhh, [[0, tint.hi], [1, tint.bg]]);
  ctx.fill();
  ctx.save();
  rrect(ctx, lx, ly, lhw, lhh, 0.03);
  ctx.clip();

  const S: Scene = { c, pose, face, state: c.state, poke: 0 };
  const pokeAmt = clamp(Math.abs(pose.pokeAmp) / 0.055, 0, 1);
  S.poke = pokeAmt;
  const cur = curBuf, prev = prevBuf;
  scene(cur, S, t);
  scene(prev, S, t - 0.2);
  const p = 0.0118;
  const mw = LW * p, mh = LH * p;
  const left = lx - mw / 2, top = ly + mh / 2;
  const [pr, pg, pb] = tint.px;
  const sc = env.canvas('pet-lcd', LW, LH);
  const img = typeof sc.createImageData === 'function' ? sc.createImageData(LW, LH) : null;
  if (img && img.data) {
    for (let i = 0; i < LW * LH; i++) {
      const v = cur[i], g = prev[i];
      const a = v === 1 ? 236 : v === 2 ? 110 : g ? 34 : 0;
      img.data[i * 4] = pr;
      img.data[i * 4 + 1] = pg;
      img.data[i * 4 + 2] = pb;
      img.data[i * 4 + 3] = a;
    }
    sc.putImageData(img, 0, 0);
  }
  ctx.save();
  ctx.translate(left, top);
  ctx.scale(p, -p);
  // the unlit cells are faintly visible
  ctx.fillStyle = `rgba(${pr},${pg},${pb},0.07)`;
  ctx.fillRect(0, 0, LW, LH);
  // pixels cast a soft shadow on the reflector behind the liquid crystal
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.2;
  if (sc.canvas) ctx.drawImage(sc.canvas, 0.35, 0.45, LW, LH);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;
  if (sc.canvas) ctx.drawImage(sc.canvas, 0, 0, LW, LH);
  // the dot grid
  ctx.beginPath();
  for (let x = 0; x <= LW; x++) { ctx.moveTo(x, 0); ctx.lineTo(x, LH); }
  for (let y = 0; y <= LH; y++) { ctx.moveTo(0, y); ctx.lineTo(LW, y); }
  ctx.strokeStyle = rgba(tint.bg, 0.8);
  ctx.lineWidth = 0.14;
  ctx.stroke();
  ctx.restore();

  // status icons along the top and bottom of the screen
  const lit = litIcons(c.state, t);
  const ip = 0.0058;
  for (let i = 0; i < 8; i++) {
    const ix = lx + (-0.15 + (i % 4) * 0.1), iy = i < 4 ? ly + 0.126 : ly - 0.126;
    const l = lit.find(([k]) => k === i);
    const on = !!l && (!l[1] || (t * 2.4) % 1 < 0.62);
    const ic = ICONS[i];
    ctx.save();
    ctx.translate(ix - 3.5 * ip, iy + 3.5 * ip);
    ctx.scale(ip, -ip);
    ctx.beginPath();
    for (let y = 0; y < ic.h; y++) for (let x = 0; x < ic.w; x++) if (ic.d[y * ic.w + x] === 1) ctx.rect(x + 0.06, y + 0.06, 0.88, 0.88);
    ctx.fillStyle = `rgba(${pr},${pg},${pb},${on ? 0.88 : 0.14})`;
    ctx.fill();
    ctx.restore();
  }
  // glass: an inner shadow at the top edge and a diagonal glare
  ctx.fillStyle = linear(ctx, 0, ly + lhh, 0, ly + lhh - 0.04, [[0, 'rgba(0,0,0,0.2)'], [1, 'rgba(0,0,0,0)']]);
  ctx.fillRect(lx - lhw, ly + lhh - 0.04, lhw * 2, 0.04);
  ctx.beginPath();
  ctx.moveTo(lx - lhw - 0.02 - fx, ly + lhh);
  ctx.lineTo(lx - lhw + 0.15 - fx, ly + lhh);
  ctx.lineTo(lx - lhw + 0.02 - fx, ly - lhh);
  ctx.lineTo(lx - lhw - 0.13 - fx, ly - lhh);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ctx.fill();
  ctx.restore();

  // ---- three round buttons; a boop presses the nearest one
  const btn = typeof c.buttons === 'string' ? c.buttons : '#FFFFFF';
  const pos: Pt[] = [[-0.138, 0.272], [0, 0.236], [0.138, 0.272]];
  let pressed = -1;
  if (pokeAmt > 0.05) {
    const qx = pose.poke[0];
    pressed = qx < -0.07 ? 0 : qx > 0.07 ? 2 : 1;
  }
  pos.forEach(([x0, y0], i) => {
    const x = x0 + fx * 0.8, y = y0 + fy * 0.8, r = 0.041;
    const down = i === pressed ? pokeAmt : 0;
    circle(ctx, x, y, r + 0.012);
    ctx.fillStyle = linear(ctx, 0, y + r, 0, y - r, [[0, mix(shell, INK, 0.5)], [1, mix(shell, '#FFFFFF', 0.25)]]);
    ctx.fill();
    ctx.strokeStyle = rgba(dark, 0.5);
    ctx.lineWidth = 0.004;
    ctx.stroke();
    const by2 = y - down * 0.008 + 0.003 * (1 - down);
    const rr = r * (1 - 0.06 * down);
    circle(ctx, x, by2, rr);
    ctx.fillStyle = radial(ctx, x - rr * 0.35, by2 + rr * 0.4, rr * 0.05, x, by2, rr * 1.05, [
      [0, mix(btn, '#FFFFFF', 0.65)],
      [0.55, btn],
      [1, mix(btn, INK, 0.28 + 0.12 * down)],
    ]);
    ctx.fill();
    ctx.strokeStyle = mix(btn, INK, 0.5);
    ctx.lineWidth = 0.0045;
    ctx.stroke();
    if (down < 0.6) {
      ctx.save();
      ctx.translate(x - rr * 0.36, by2 + rr * 0.4);
      ctx.rotate(-0.6);
      ctx.beginPath();
      ctx.ellipse(0, 0, rr * 0.28, rr * 0.16, 0, 0, TAU);
      ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - down)})`;
      ctx.fill();
      ctx.restore();
    }
  });
};

// frame buffers (now, and a moment ago for the LCD afterimage)
const curBuf: Buf = new Uint8Array(LW * LH);
const prevBuf: Buf = new Uint8Array(LW * LH);

export const pet: FamilyDef<PetConfig> = {
  id: 'pet',
  name: 'Pocket pets',
  maker: 'Virtual pet',
  tagline: 'Egg-shaped keychains · a dot-matrix pet inside · feed it, play, lights off',
  subtitle: 'A 90s virtual-pet keychain: a pixel creature living on a tiny LCD',
  shader: '',
  anchors: 0,
  background: 'radial-gradient(circle, rgba(255,255,255,0.6) 1.6px, transparent 2.4px) 0 0 / 26px 26px, linear-gradient(160deg, #FCE3EF 0%, #F1DDF4 55%, #E4DAF7 100%)',
  backgroundSolid: '#F5E0F1',
  dark: false,
  traits: ['Egg-shaped keychain shell', 'Dot-matrix LCD with ghosting', 'Pet-care scenes for every state'],
  look: {
    dark: false,
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
      sky: [0.8, 0.8, 0.8],
      ground: [0.5, 0.5, 0.5],
      warm: [1, 1, 1],
      env: 1,
    },
  },
  defaultState: 'idle',
  states: {
    idle: { label: 'Idle', hint: 'Wanders about the screen', bob: [0.006, 0.45] },
    listening: { label: 'Listening', hint: 'Stops, looks right at you: !', expr: 'listening', gaze: 'user', enter: 'nod' },
    thinking: { label: 'Thinking', hint: 'A ? thought cloud', expr: 'thinking', gaze: 'up', sway: [0.025, 0.3] },
    working: { label: 'Working', hint: 'Eating a snack, bite by bite', expr: 'neutral', bob: [0.007, 1.0] },
    speaking: { label: 'Speaking', hint: 'Speech bubble with notes and hearts', expr: 'happy', talk: 1, gaze: 'user' },
    done: { label: 'Done', hint: 'Jumps for joy, then a page of full hearts', expr: 'excited', enter: 'celebrate', emote: ['heart', 3.5] },
    sleeping: { label: 'Sleeping', hint: 'Lights off, zzz', expr: 'sleepy', gaze: 'closed', sink: 0.004 },
    hatching: { label: 'Hatching', hint: 'The egg wobbles, cracks and hatches', expr: 'happy', sway: [0.03, 1.4], enter: 'shake' },
    hungry: { label: 'Hungry', hint: 'Empty bowl, calling for food', expr: 'sad', gaze: 'down' },
    sick: { label: 'Sick', hint: 'Bandaged and sorry, needs medicine', expr: 'sick', sway: [0.02, 0.25], emote: ['sweat', 4] },
  },
  personality: {
    body: [2.2, 0.5, 0.7],
    eyes: [7.0, 0.85, 0.0],
    squash: [260, 9],
    reach: [0.18, 0.12],
    eyeShare: 0.75,
    hopGravity: 13,
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
      id: 'pet',
      title: 'Pet',
      controls: [
        { type: 'chips', key: 'species', label: 'Species', options: SPECIES_OPTS },
        { type: 'chips', key: 'stage', label: 'Life stage', options: STAGE_OPTS },
        { type: 'chips', key: 'eyes', label: 'Eyes', options: EYE_OPTS },
        { type: 'chips', key: 'accessory', label: 'Accessory', options: ACC_OPTS },
        { type: 'select', key: 'expression', label: 'Expression', options: EXPRESSIONS },
      ],
    },
    {
      id: 'shell',
      title: 'Shell',
      controls: [
        { type: 'swatches', key: 'shell', label: 'Shell colour', colors: SHELLS, custom: true },
        { type: 'chips', key: 'pattern', label: 'Pattern', options: PATTERN_OPTS },
        { type: 'chips', key: 'finish', label: 'Finish', options: FINISH_OPTS },
        { type: 'swatches', key: 'buttons', label: 'Buttons', colors: BUTTONS, custom: true },
        { type: 'toggle', key: 'chain', label: 'Ball chain' },
      ],
    },
    {
      id: 'screen',
      title: 'Screen',
      controls: [{ type: 'chips', key: 'lcd', label: 'LCD', options: LCD_OPTS }],
    },
  ],
  roster: () => [
    base({ name: 'Mochi', shell: '#F9B4CB', pattern: 2, finish: 0, buttons: '#FFFFFF', lcd: 0, species: 0, stage: 4, eyes: 0, accessory: 1 }),
    base({ name: 'Puff', shell: '#9ED3F4', pattern: 0, finish: 1, buttons: '#FFD84D', lcd: 1, species: 2, stage: 3, eyes: 3, accessory: 2 }),
    base({ name: 'Nori', shell: '#9FE3C6', pattern: 1, finish: 2, buttons: '#FF7FA6', lcd: 2, species: 3, stage: 4, eyes: 1, accessory: 0 }),
    base({ name: 'Kiki', shell: '#C8B5F3', pattern: 4, finish: 3, buttons: '#FFFFFF', lcd: 4, species: 1, stage: 4, eyes: 4, accessory: 3 }),
    base({ name: 'Bun', shell: '#FFE184', pattern: 3, finish: 0, buttons: '#FF8A5C', lcd: 3, species: 4, stage: 3, eyes: 2, accessory: 0 }),
  ],
  randomize: (c, rnd) => {
    const pick = (n: number) => Math.floor(rnd() * n);
    return {
      ...c,
      shell: SHELLS[pick(SHELLS.length)],
      pattern: pick(PATTERN_OPTS.length),
      finish: rnd() < 0.4 ? 0 : 1 + pick(3),
      buttons: BUTTONS[pick(BUTTONS.length)],
      chain: rnd() < 0.85,
      lcd: pick(LCD_OPTS.length),
      species: pick(SPECIES_OPTS.length),
      stage: rnd() < 0.08 ? 0 : 2 + pick(3),
      eyes: pick(EYE_OPTS.length),
      accessory: rnd() < 0.45 ? 0 : 1 + pick(4),
    };
  },
  compose: (n, aspect, compact) =>
    groupPhoto(n, aspect, { gap: compact ? 1.0 : 1.1, charW: 1.05, charH: 1.05, riser: 0, depth: 0, fov: deg(18), margin: 0.1, turn: 0, lift: 0.08 }),
  solo: (aspect) => soloCamera(aspect, 1.05, 1.05, deg(18), 0.08),
  headLocal: () => [0, 0.57, 0.1],
  bounds: () => ({ c: [0, 0.5, 0], r: 0.6, occ: [] }),
  face: petFace,
  pack: (_c, _pose, f) => {
    f.data.fill(0);   // drawn in 2D by draw2d
  },
  draw2d: draw,
};
