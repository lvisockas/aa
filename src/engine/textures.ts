import { rng } from './math';

/**
 * Tileable smooth value noise in a 32^3 RGBA8 texture. Each channel is an
 * independent field so a single fetch yields a 4D random vector.
 */
export const createNoiseTexture = (gl: WebGL2RenderingContext): WebGLTexture => {
  const N = 32;
  const P = 8; // lattice period inside the tile
  const rand = rng(1337);
  const lattice = new Float32Array(P * P * P * 4);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const data = new Uint8Array(N * N * N * 4);
  const L = (x: number, y: number, z: number, c: number) =>
    lattice[((((z % P) * P + (y % P)) * P + (x % P)) << 2) + c];
  for (let z = 0; z < N; z++)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * P, fy = (y / N) * P, fz = (z / N) * P;
        const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
        const tx = fade(fx - ix), ty = fade(fy - iy), tz = fade(fz - iz);
        for (let c = 0; c < 4; c++) {
          const c00 = L(ix, iy, iz, c) + (L(ix + 1, iy, iz, c) - L(ix, iy, iz, c)) * tx;
          const c10 = L(ix, iy + 1, iz, c) + (L(ix + 1, iy + 1, iz, c) - L(ix, iy + 1, iz, c)) * tx;
          const c01 = L(ix, iy, iz + 1, c) + (L(ix + 1, iy, iz + 1, c) - L(ix, iy, iz + 1, c)) * tx;
          const c11 = L(ix, iy + 1, iz + 1, c) + (L(ix + 1, iy + 1, iz + 1, c) - L(ix, iy + 1, iz + 1, c)) * tx;
          const c0 = c00 + (c10 - c00) * ty;
          const c1 = c01 + (c11 - c01) * ty;
          data[(((z * N + y) * N + x) << 2) + c] = Math.round((c0 + (c1 - c0) * tz) * 255);
        }
      }
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_3D, tex);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, N, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
  return tex;
};

/**
 * Fur cross-section map. Strands are jittered points on a tileable grid; each
 * channel stores the coverage of strand discs at one height of the pile:
 *   R: root  (thick, every strand)        G: middle (strands longer than 45%)
 *   B: tips  (thin, strands longer than 80%)   A: per-strand random value
 * Storing coverage (not distance) means mipmaps average correctly, so distant
 * fur resolves to smooth fuzz instead of shimmering.
 */
export const createStrandTexture = (gl: WebGL2RenderingContext): WebGLTexture => {
  const S = 256;
  const C = 40; // cells per side
  const cell = S / C;
  const rand = rng(4242);
  const pts = new Float32Array(C * C * 4);
  for (let i = 0; i < C * C; i++) {
    pts[i * 4] = 0.15 + 0.7 * rand();
    pts[i * 4 + 1] = 0.15 + 0.7 * rand();
    pts[i * 4 + 2] = Math.pow(rand(), 0.6); // strand length
    pts[i * 4 + 3] = rand(); // random tint
  }
  const data = new Uint8Array(S * S * 4);
  const aa = 0.75 / cell; // ~0.75px soft edge, in cell units
  const disc = (d: number, r: number) => {
    const t = Math.min(Math.max((r - d) / aa + 0.5, 0), 1);
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const gx = (x + 0.5) / cell, gy = (y + 0.5) / cell;
      const cx = Math.floor(gx), cy = Math.floor(gy);
      let r0 = 0, r1 = 0, r2 = 0, tint = 0.5, best = 9;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const ix = (cx + ox + C) % C, iy = (cy + oy + C) % C;
          const k = (iy * C + ix) * 4;
          const px = cx + ox + pts[k], py = cy + oy + pts[k + 1];
          const d = Math.hypot(gx - px, gy - py);
          const len = pts[k + 2];
          r0 = Math.max(r0, disc(d, 0.62));
          if (len > 0.45) r1 = Math.max(r1, disc(d, 0.38));
          if (len > 0.8) r2 = Math.max(r2, disc(d, 0.2));
          if (d < best) {
            best = d;
            tint = pts[k + 3];
          }
        }
      const o = (y * S + x) * 4;
      data[o] = Math.round(r0 * 255);
      data[o + 1] = Math.round(r1 * 255);
      data[o + 2] = Math.round(r2 * 255);
      data[o + 3] = Math.round(tint * 255);
    }
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tex;
};
