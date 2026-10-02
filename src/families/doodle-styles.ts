// Five 2D art styles that can draw any Doodles character. A character is a
// back-to-front list of simple items (polygons, strokes, dots) tagged with a
// role; each style decides how a role is put on paper.

export type RGB = [number, number, number];
export type Pt = [number, number];
export type Role = 'main' | 'accent' | 'light' | 'dark' | 'blush' | 'shadow';
export type Item =
  | { k: 'poly'; pts: Pt[]; col: RGB; role: Role; shade?: boolean }
  | { k: 'line'; pts: Pt[]; w: number; col: RGB; role: Role }
  | { k: 'dot'; x: number; y: number; r: number; col: RGB; role: Role };

export type StyleId = 'flat' | 'ink' | 'pixel' | 'paper' | 'riso';

export interface StyleOpts {
  t: number;
  /** one device pixel in character units */
  px: number;
  lineWeight: number;
  wobble: number;
  pixelSize: number;
  misregister: number;
  paperDepth: number;
  inkA: RGB;
  inkB: RGB;
  /** offscreen 2D context of the given size (cached by id), transform reset and cleared */
  canvas: (id: string, w: number, h: number) => CanvasRenderingContext2D;
  /** width and height of the target in device pixels */
  size: [number, number];
}

export const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const INK: RGB = [28, 24, 34];
const WHITE: RGB = [255, 255, 255];

// ------------------------------------------------------------- shape helpers
export const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 32, rot = 0): Pt[] => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    return [cx + c * x - s * y, cy + s * x + c * y] as Pt;
  });
};
/** superellipse: p = 2 is an ellipse, larger p squarer */
export const blob = (cx: number, cy: number, rx: number, ry: number, p = 2.6, n = 40): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    return [cx + rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / p), cy + ry * Math.sign(s) * Math.pow(Math.abs(s), 2 / p)] as Pt;
  });
export const rrect = (cx: number, cy: number, hx: number, hy: number, r: number, seg = 5): Pt[] => {
  const out: Pt[] = [];
  const corners: Array<[number, number, number]> = [[hx - r, hy - r, 0], [-hx + r, hy - r, 1], [-hx + r, -hy + r, 2], [hx - r, -hy + r, 3]];
  for (const [x, y, q] of corners)
    for (let i = 0; i <= seg; i++) {
      const a = ((q + i / seg) * Math.PI) / 2;
      out.push([cx + x + Math.cos(a) * r, cy + y + Math.sin(a) * r]);
    }
  return out;
};
export const leaf = (cx: number, cy: number, len: number, wid: number, ang: number, n = 14): Pt[] => {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) pts.push([(i / n) * len, Math.sin((i / n) * Math.PI) * wid]);
  for (let i = n - 1; i > 0; i--) pts.push([(i / n) * len, -Math.sin((i / n) * Math.PI) * wid]);
  const c = Math.cos(ang), s = Math.sin(ang);
  return pts.map(([x, y]) => [cx + c * x - s * y, cy + s * x + c * y] as Pt);
};
export const arcPts = (cx: number, cy: number, r: number, a0: number, a1: number, n = 10): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as Pt;
  });
export const shift = (pts: Pt[], dx: number, dy: number): Pt[] => pts.map(([x, y]) => [x + dx, y + dy] as Pt);

const hash = (i: number, s: number) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const path = (ctx: CanvasRenderingContext2D, pts: Pt[], closed: boolean, append = false) => {
  if (!append) ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (closed) ctx.closePath();
};
/** clip to the inside of pts minus a copy shifted by (dx, dy): the crescent the light misses */
const clipCrescent = (ctx: CanvasRenderingContext2D, pts: Pt[], dx: number, dy: number) => {
  path(ctx, pts, true);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(-5, -5, 10, 10);
  path(ctx, shift(pts, dx, dy), true, true);
  ctx.clip('evenodd');
};
const centroid = (pts: Pt[]): Pt => {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
};

type Paint = string | CanvasPattern;
/** a pattern drawn at one tile pixel per device pixel, whatever the current transform */
const devicePattern = (ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, px: number): CanvasPattern | null => {
  const p = ctx.createPattern(src, 'repeat');
  if (p && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().scale(px, px));
  return p;
};
/** plain vector paint of one item (shared by several styles) */
const paintFlat = (ctx: CanvasRenderingContext2D, it: Item, col?: Paint) => {
  if (it.k === 'poly') {
    path(ctx, it.pts, true);
    ctx.fillStyle = col ?? css(it.col, it.role === 'blush' ? 0.55 : it.role === 'shadow' ? 0.16 : 1);
    ctx.fill();
  } else if (it.k === 'line') {
    path(ctx, it.pts, false);
    ctx.strokeStyle = col ?? css(it.col);
    ctx.lineWidth = it.w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
    ctx.fillStyle = col ?? css(it.col);
    ctx.fill();
  }
};

// ------------------------------------------------------------- 1 flat vector
/** bold flat shapes with a crescent of shade on the lower right, no outlines */
const flat = (ctx: CanvasRenderingContext2D, items: Item[]) => {
  for (const it of items) {
    if (it.k === 'poly' && it.shade) {
      path(ctx, it.pts, true);
      ctx.fillStyle = css(mix(it.col, INK, 0.16));
      ctx.fill();
      ctx.save();
      path(ctx, it.pts, true);
      ctx.clip();
      path(ctx, shift(it.pts, -0.035, 0.03), true);
      ctx.fillStyle = css(it.col);
      ctx.fill();
      ctx.restore();
    } else paintFlat(ctx, it);
  }
};

// ------------------------------------------------------------- 2 ink doodle
/** marker fill slightly off the line, boiling hand-drawn ink, hatched shade */
const ink = (ctx: CanvasRenderingContext2D, items: Item[], o: StyleOpts) => {
  const boil = Math.floor(o.t * 8);   // redraw the wobble 8 times a second, like hand-drawn animation
  const amp = 0.006 * o.wobble;
  const jit = (pts: Pt[], salt: number): Pt[] => pts.map(([x, y], i) => [x + (hash(i, salt + boil) - 0.5) * amp * 2, y + (hash(i + 50, salt + boil) - 0.5) * amp * 2] as Pt);
  const lw = 0.014 * o.lineWeight;
  items.forEach((it, idx) => {
    if (it.role === 'shadow' && it.k === 'poly') {
      // a few scribbled strokes instead of a filled shadow
      ctx.save();
      path(ctx, it.pts, true);
      ctx.clip();
      ctx.strokeStyle = css(INK, 0.35);
      ctx.lineWidth = lw * 0.5;
      const [cx, cy] = centroid(it.pts);
      for (let k = -6; k <= 6; k++) {
        ctx.beginPath();
        ctx.moveTo(cx + k * 0.03 - 0.1, cy - 0.1);
        ctx.lineTo(cx + k * 0.03 + 0.1, cy + 0.1);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (it.k === 'poly') {
      const fill = it.role === 'light' ? WHITE : it.role === 'dark' ? INK : it.col;
      if (it.role !== 'blush') {
        path(ctx, shift(it.pts, 0.012, -0.008), true);
        ctx.fillStyle = css(fill, it.role === 'dark' ? 1 : 0.92);
        ctx.fill();
      } else {
        paintFlat(ctx, it);
        return;
      }
      if (it.shade) {
        // hatching where the light doesn't reach
        ctx.save();
        clipCrescent(ctx, it.pts, -0.06, 0.05);
        ctx.strokeStyle = css(INK, 0.45);
        ctx.lineWidth = lw * 0.4;
        for (let k = -34; k <= 34; k++) {
          ctx.beginPath();
          ctx.moveTo(k * 0.03 - 1, -1);
          ctx.lineTo(k * 0.03 + 1, 1);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (it.role !== 'dark') {
        path(ctx, jit(it.pts, idx * 13), true);
        ctx.strokeStyle = css(INK);
        ctx.lineWidth = lw;
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    } else if (it.k === 'line') {
      const coloured = it.role === 'accent' || it.role === 'main';
      const pts = jit(it.pts, idx * 13);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (coloured && it.w > lw * 1.5) {
        // a thick coloured stroke (a tail) is drawn as an inked outline with colour inside
        path(ctx, pts, false);
        ctx.strokeStyle = css(INK);
        ctx.lineWidth = it.w + lw * 2;
        ctx.stroke();
      }
      path(ctx, pts, false);
      ctx.strokeStyle = css(coloured ? it.col : INK);
      ctx.lineWidth = Math.max(it.w, lw);
      ctx.stroke();
    } else {
      paintFlat(ctx, { ...it, col: it.role === 'light' ? WHITE : it.role === 'dark' ? INK : it.col });
    }
  });
};

// ------------------------------------------------------------- 3 pixel art
/** rasterised to a coarse grid, alpha snapped, with a one-pixel dark outline */
const pixel = (ctx: CanvasRenderingContext2D, items: Item[], o: StyleOpts) => {
  const g = Math.max(0.012, o.pixelSize);
  // grid cell -> character units: the sprite covers x [-0.7, 0.7], y [-0.1, 1.2]
  const W = Math.ceil(1.4 / g), H = Math.ceil(1.3 / g);
  const lc = o.canvas('pixel', W, H);
  const cv = lc.canvas as HTMLCanvasElement;
  lc.setTransform(1 / g, 0, 0, -1 / g, 0.7 / g, 1.2 / g);
  for (const it of items) {
    if (it.role === 'shadow') continue;
    // thin strokes would vanish on the grid: give them at least one cell
    if (it.k === 'line') paintFlat(lc, { ...it, w: Math.max(it.w, g * 1.05) });
    else if (it.k === 'dot') paintFlat(lc, { ...it, r: Math.max(it.r, g * 0.75) });
    else paintFlat(lc, it, it.role === 'blush' ? css(it.col) : undefined);
  }
  const img = lc.getImageData(0, 0, W, H);
  const d = img.data;
  const solid = new Uint8Array(W * H);
  // a real pixel-art palette: every cell snaps to one of the colours actually used
  const pal: RGB[] = [INK];
  for (const it of items) if (it.role !== 'shadow' && !pal.some((p) => p[0] === it.col[0] && p[1] === it.col[1] && p[2] === it.col[2])) pal.push(it.col);
  for (let i = 0; i < W * H; i++) {
    const a = d[i * 4 + 3];
    if (a >= 110) {
      solid[i] = 1;
      // undo premultiplied blending against transparency before matching
      const k = 255 / a;
      const r = d[i * 4] * (a < 255 ? k : 1), g = d[i * 4 + 1] * (a < 255 ? k : 1), b = d[i * 4 + 2] * (a < 255 ? k : 1);
      let best = pal[0], bd = Infinity;
      for (const p of pal) {
        const dd = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
        if (dd < bd) { bd = dd; best = p; }
      }
      d[i * 4] = best[0]; d[i * 4 + 1] = best[1]; d[i * 4 + 2] = best[2];
      d[i * 4 + 3] = 255;
    } else d[i * 4 + 3] = 0;
  }
  // outline: empty cells touching the sprite
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (solid[i]) continue;
      const n = (x > 0 && solid[i - 1]) || (x < W - 1 && solid[i + 1]) || (y > 0 && solid[i - W]) || (y < H - 1 && solid[i + W]);
      if (n) {
        d[i * 4] = INK[0]; d[i * 4 + 1] = INK[1]; d[i * 4 + 2] = INK[2]; d[i * 4 + 3] = 255;
      }
    }
  lc.putImageData(img, 0, 0);
  // ground shadow as a dithered row of cells
  ctx.save();
  ctx.fillStyle = css(INK, 0.18);
  for (let x = -0.3; x < 0.3; x += g) if (Math.round(x / g) % 2 === 0) ctx.fillRect(x, -0.01, g, g * 0.9);
  ctx.restore();
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // draw the sprite back with y flipped (the grid was drawn top-down)
  ctx.translate(-0.7, 1.2);
  ctx.scale(g, -g);
  ctx.drawImage(cv, 0, 0);
  ctx.restore();
};

// ------------------------------------------------------------- 4 paper cut-out
/** 96x96 noise tile: grey fibres (paper) or sparse alpha speckle (riso) */
const tiles = new Map<string, HTMLCanvasElement | null>();
const noiseTile = (kind: 'fibre' | 'speckle'): HTMLCanvasElement | null => {
  if (!tiles.has(kind)) {
    if (typeof document === 'undefined') {
      tiles.set(kind, null);
    } else {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 96;
      const g = cv.getContext('2d')!;
      const im = g.createImageData(96, 96);
      for (let i = 0; i < 96 * 96; i++) {
        const h = hash(i, kind === 'fibre' ? 3 : 5);
        if (kind === 'fibre') {
          const v = 205 + h * 50;
          im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v;
          im.data[i * 4 + 3] = 255;
        } else {
          im.data[i * 4 + 3] = h > 0.82 ? 120 + hash(i, 6) * 135 : 0;
        }
      }
      g.putImageData(im, 0, 0);
      tiles.set(kind, cv);
    }
  }
  return tiles.get(kind) ?? null;
};
/** stacked paper pieces: scissor-cut edges, a hair of rotation, soft drop shadows, grain */
const paper = (ctx: CanvasRenderingContext2D, items: Item[], o: StyleOpts) => {
  const depth = o.paperDepth;
  const fibre = noiseTile('fibre');
  items.forEach((it, idx) => {
    if (it.role === 'shadow' && it.k === 'poly') {
      path(ctx, it.pts, true);
      ctx.fillStyle = css(INK, 0.12);
      ctx.fill();
      return;
    }
    ctx.save();
    const pts = it.k === 'poly' ? it.pts : it.k === 'line' ? it.pts : ellipse(it.x, it.y, it.r, it.r, 14);
    const [cx, cy] = centroid(pts);
    ctx.translate(cx, cy);
    ctx.rotate((hash(idx, 9) - 0.5) * 0.05);
    ctx.translate(-cx, -cy);
    ctx.shadowColor = css(INK, 0.28 * depth);
    // shadow offsets are in device pixels, not affected by the transform
    ctx.shadowBlur = 6 * depth;
    ctx.shadowOffsetX = 2 * depth;
    ctx.shadowOffsetY = 3 * depth;
    const cut = (p: Pt[]) => p.map(([x, y], i) => [x + (hash(i, idx) - 0.5) * 0.006, y + (hash(i + 7, idx) - 0.5) * 0.006] as Pt);
    if (it.k === 'line') {
      path(ctx, it.pts, false);
      ctx.strokeStyle = css(it.role === 'dark' ? INK : it.col);
      ctx.lineWidth = Math.max(it.w, 0.016);
      ctx.lineCap = 'round';
      ctx.stroke();
    } else {
      const cp = cut(pts);
      path(ctx, cp, true);
      ctx.fillStyle = css(it.col, it.role === 'blush' ? 0.6 : 1);
      ctx.fill();
      if (fibre && it.role !== 'dark' && it.role !== 'blush') {
        // paper fibres: multiply a grain tile at device resolution inside the piece
        ctx.shadowColor = 'transparent';
        path(ctx, cp, true);
        ctx.clip();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.5;
        const pat = devicePattern(ctx, fibre, o.px);
        if (pat) {
          ctx.fillStyle = pat;
          ctx.fill();
        }
      }
    }
    ctx.restore();
  });
};

// ------------------------------------------------------------- 5 risograph
/** 8x8 halftone dot tile in one ink */
const dotTiles = new Map<string, HTMLCanvasElement | null>();
const dotTile = (col: RGB): HTMLCanvasElement | null => {
  const key = col.join(',');
  if (!dotTiles.has(key)) {
    if (typeof document === 'undefined') dotTiles.set(key, null);
    else {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 8;
      const g = cv.getContext('2d')!;
      g.fillStyle = css(col);
      g.beginPath();
      g.arc(4, 4, 2.3, 0, Math.PI * 2);
      g.fill();
      dotTiles.set(key, cv);
    }
  }
  return dotTiles.get(key) ?? null;
};
/** two spot inks overprinted (multiply), slightly out of register, halftone shade, speckled grain */
const riso = (ctx: CanvasRenderingContext2D, items: Item[], o: StyleOpts) => {
  const m = ctx.getTransform();
  const A = o.canvas('riso-a', o.size[0], o.size[1]), B = o.canvas('riso-b', o.size[0], o.size[1]);
  for (const L of [A, B]) L.setTransform(m);
  const tA = dotTile(o.inkA), tB = dotTile(o.inkB);
  const dotsB: Paint = (tB && devicePattern(B, tB, o.px)) || css(o.inkB, 0.5);
  const dotsA: Paint = (tA && devicePattern(A, tA, o.px)) || css(o.inkA, 0.5);
  for (const it of items) {
    const knock = it.role === 'light';
    const onA = it.role === 'main' || it.role === 'dark';
    const onB = it.role === 'accent' || it.role === 'dark';
    for (const [L, on, inkC] of [[A, onA, o.inkA], [B, onB, o.inkB]] as const) {
      L.save();
      if (knock) {
        L.globalCompositeOperation = 'destination-out';
        paintFlat(L, it, '#000');
      } else if (it.role === 'shadow' || it.role === 'blush') {
        if (L === B) paintFlat(L, it, dotsB);
      } else if (on) {
        paintFlat(L, it, css(inkC));
      } else {
        // the other drum knocks out under this shape so inks don't mud together
        L.globalCompositeOperation = 'destination-out';
        paintFlat(L, it, '#000');
      }
      L.restore();
    }
    // halftone shade in the other ink on the lower right (after that drum's knockout)
    if (it.k === 'poly' && it.shade && onA !== onB) {
      const other = onA ? B : A;
      other.save();
      clipCrescent(other, it.pts, -0.05, 0.045);
      path(other, it.pts, true);
      other.fillStyle = onA ? dotsB : dotsA;
      other.fill();
      other.restore();
    }
  }
  // speckle: ink that didn't take on the drum
  const speck = noiseTile('speckle');
  for (const L of [A, B]) {
    if (!speck) break;
    L.save();
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.globalCompositeOperation = 'destination-out';
    const pat = L.createPattern(speck, 'repeat');
    if (pat) {
      L.globalAlpha = 0.7;
      L.fillStyle = pat;
      L.fillRect(0, 0, L.canvas.width, L.canvas.height);
    }
    L.restore();
  }
  const mis = o.misregister * 0.012 / o.px;   // in device pixels
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(A.canvas, 0, 0);
  ctx.drawImage(B.canvas, mis, -mis * 0.6);
  ctx.restore();
};

export const STYLES: Record<StyleId, (ctx: CanvasRenderingContext2D, items: Item[], o: StyleOpts) => void> = { flat, ink, pixel, paper, riso };
