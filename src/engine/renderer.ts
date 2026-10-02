import headSrc from '../shaders/common_head.glsl';
import mainSrc from '../shaders/common_main.glsl';
import { createProgram, type Program } from './gl';
import { lookAt, quatRotate, type Quat, type Vec3 } from './math';
import { createNoiseTexture, createStrandTexture } from './textures';

export type FamilyId = 'dots' | 'grok' | 'muse' | 'rebel';

/** Characters per view and parameter texels per character (shared by all families). */
export const MAXC = 10;
export const NP = 32;

export interface CharFrame {
  pos: Vec3;
  scale: number;
  rot: Quat;
  squash: Vec3;
  /** bounding sphere in local space (before squash / scale) */
  boundC: Vec3;
  boundR: number;
  /** up to three local-space occluder spheres [x, y, z, r] for ground shadows */
  occ: Array<[number, number, number, number]>;
  /** NP * 4 floats of family specific parameters */
  data: Float32Array;
}

export interface Lights {
  key: Vec3;
  keyI: number;
  rim: Vec3;
  rimI: number;
  fill: Vec3;
  fillI: number;
  sky: Vec3;
  ground: Vec3;
  warm: Vec3;
  env: number;
}

export interface Look {
  dark: boolean;
  groundShadow: number;
  exposure: number;
  groundY: number;
  lights: Lights;
}

export interface Camera {
  pos: Vec3;
  target: Vec3;
  fov: number; // vertical, radians
  /** off-axis lens shift in uv units (y: +1 = half the viewport height) */
  shift?: [number, number];
}

export interface View {
  /** viewport rectangle in CSS pixels, relative to the window */
  rect: { left: number; top: number; width: number; height: number };
  family: FamilyId;
  camera: Camera;
  look: Look;
  chars: CharFrame[];
  /** anchors per character solved on the GPU before the main pass (0 = none) */
  anchors: number;
}

export interface Quality {
  steps: number;
  fur: number;
  shadow: number;
  ao: number;
}

export type QualityName = 'low' | 'medium' | 'high' | 'ultra';
export const QUALITY: Record<QualityName, Quality> = {
  low: { steps: 72, fur: 0, shadow: 14, ao: 0 },
  medium: { steps: 96, fur: 10, shadow: 20, ao: 1 },
  high: { steps: 128, fur: 16, shadow: 28, ao: 1 },
  ultra: { steps: 168, fur: 26, shadow: 40, ao: 1 },
};

export interface PickResult {
  index: number;
  /** hit point in the character's local (squash) space */
  q: Vec3;
}

const ANCHOR_W = 16; // 8 anchor positions + 8 normals per character

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly floatTargets: boolean;
  private programs = new Map<FamilyId, Program>();
  private pending = new Map<FamilyId, Promise<Program>>();
  private vao: WebGLVertexArrayObject;
  private noiseTex: WebGLTexture;
  private strandTex: WebGLTexture;
  private dataTex: WebGLTexture[] = [];
  private dataBuf = new Float32Array(NP * 4 * MAXC);
  private aXf = new Float32Array(MAXC * 4);
  private aRot = new Float32Array(MAXC * 4);
  private aSq = new Float32Array(MAXC * 4);
  private aBnd = new Float32Array(MAXC * 4);
  private aOcc = new Float32Array(MAXC * 12);
  private anchorFbo: WebGLFramebuffer | null = null;
  private anchorTex: WebGLTexture | null = null;
  private pickFbo: WebGLFramebuffer | null = null;
  private pickTex: WebGLTexture | null = null;
  private dummyTex: WebGLTexture;
  private cssW = 1;
  private cssH = 1;

  /** fraction of the device pixel ratio actually rendered (adaptive) */
  scale = 1;
  dprCap = 2;
  quality: Quality = QUALITY.high;
  lost = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.floatTargets = !!gl.getExtension('EXT_color_buffer_float');
    this.vao = gl.createVertexArray()!;
    this.noiseTex = createNoiseTexture(gl);
    this.strandTex = createStrandTexture(gl);
    this.dummyTex = this.makeFloatTex(1, 1);
    if (this.floatTargets) {
      this.anchorTex = this.makeFloatTex(ANCHOR_W, MAXC);
      this.anchorFbo = this.makeFbo(this.anchorTex);
      this.pickTex = this.makeFloatTex(1, 1);
      this.pickFbo = this.makeFbo(this.pickTex);
    }
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
  }

  private makeFloatTex(w: number, h: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private makeFbo(tex: WebGLTexture): WebGLFramebuffer {
    const gl = this.gl;
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fb;
  }

  private dataTexture(slot: number): WebGLTexture {
    while (this.dataTex.length <= slot) this.dataTex.push(this.makeFloatTex(NP, MAXC));
    return this.dataTex[slot];
  }

  /** Compile a family program (idempotent). */
  load(id: FamilyId, familySrc: string): Promise<Program> {
    const ready = this.programs.get(id);
    if (ready) return Promise.resolve(ready);
    let p = this.pending.get(id);
    if (!p) {
      const src = `#version 300 es\n${headSrc}\n${familySrc}\n${mainSrc}`;
      p = createProgram(this.gl, src, id).then((prog) => {
        this.programs.set(id, prog);
        return prog;
      });
      this.pending.set(id, p);
    }
    return p;
  }

  isReady(id: FamilyId): boolean {
    return this.programs.has(id);
  }

  /** Match the backing store to the window. Returns true when it changed. */
  resize(): boolean {
    const cssW = Math.max(1, window.innerWidth);
    const cssH = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap) * this.scale;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    this.cssW = cssW;
    this.cssH = cssH;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      return true;
    }
    return false;
  }

  private deviceRect(r: View['rect']) {
    const sx = this.canvas.width / this.cssW;
    const sy = this.canvas.height / this.cssH;
    const x0 = Math.floor(r.left * sx);
    const x1 = Math.ceil((r.left + r.width) * sx);
    const y0 = Math.floor((this.cssH - (r.top + r.height)) * sy);
    const y1 = Math.ceil((this.cssH - r.top) * sy);
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }

  private bindView(prog: Program, view: View, slot: number, vp: { x: number; y: number; w: number; h: number }) {
    const gl = this.gl;
    const U = (n: string) => prog.uniforms.get(n) ?? null;
    const cam = view.camera;
    const n = Math.min(view.chars.length, MAXC);

    this.aXf.fill(0);
    this.aRot.fill(0);
    this.aSq.fill(1);
    this.aBnd.fill(0);
    this.aOcc.fill(0);
    this.dataBuf.fill(0);
    for (let i = 0; i < n; i++) {
      const c = view.chars[i];
      this.aXf.set([c.pos[0], c.pos[1], c.pos[2], c.scale], i * 4);
      this.aRot.set(c.rot, i * 4);
      this.aSq.set([c.squash[0], c.squash[1], c.squash[2], 0], i * 4);
      const sqMax = Math.max(c.squash[0], c.squash[1], c.squash[2]);
      const toWorld = (p: Vec3): Vec3 => {
        const s: Vec3 = [p[0] * c.squash[0], p[1] * c.squash[1], p[2] * c.squash[2]];
        const r = quatRotate(c.rot, s);
        return [c.pos[0] + r[0] * c.scale, c.pos[1] + r[1] * c.scale, c.pos[2] + r[2] * c.scale];
      };
      const bc = toWorld(c.boundC);
      this.aBnd.set([bc[0], bc[1], bc[2], c.boundR * c.scale * sqMax], i * 4);
      for (let k = 0; k < Math.min(3, c.occ.length); k++) {
        const o = c.occ[k];
        const oc = toWorld([o[0], o[1], o[2]]);
        this.aOcc.set([oc[0], oc[1], oc[2], o[3] * c.scale * sqMax], (i * 3 + k) * 4);
      }
      this.dataBuf.set(c.data.subarray(0, NP * 4), i * NP * 4);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dataTexture(slot));
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, NP, MAXC, gl.RGBA, gl.FLOAT, this.dataBuf);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.strandTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, this.noiseTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.dummyTex);

    gl.useProgram(prog.prog);
    gl.uniform1i(U('uData'), 0);
    gl.uniform1i(U('uStrand'), 1);
    gl.uniform1i(U('uNoise'), 2);
    gl.uniform1i(U('uAnchors'), 3);
    gl.uniform1i(U('uHasAnchors'), 0);
    gl.uniform4f(U('uView'), vp.x, vp.y, vp.w, vp.h);
    gl.uniform3fv(U('uCamPos'), cam.pos);
    gl.uniformMatrix3fv(U('uCamRot'), false, lookAt(cam.pos, cam.target));
    const tanHalf = Math.tan(cam.fov / 2);
    gl.uniform1f(U('uFocal'), 1 / tanHalf);
    gl.uniform1f(U('uPixAng'), (2 * tanHalf) / vp.h);
    gl.uniform2f(U('uShift'), cam.shift?.[0] ?? 0, cam.shift?.[1] ?? 0);
    gl.uniform1i(U('uCount'), n);
    gl.uniform4fv(U('uXf'), this.aXf);
    gl.uniform4fv(U('uRot'), this.aRot);
    gl.uniform4fv(U('uSq'), this.aSq);
    gl.uniform4fv(U('uBnd'), this.aBnd);
    gl.uniform4fv(U('uOcc'), this.aOcc);
    const L = view.look.lights;
    gl.uniform4f(U('uKey'), L.key[0], L.key[1], L.key[2], L.keyI);
    gl.uniform4f(U('uRim'), L.rim[0], L.rim[1], L.rim[2], L.rimI);
    gl.uniform4f(U('uFill'), L.fill[0], L.fill[1], L.fill[2], L.fillI);
    gl.uniform3fv(U('uSky'), L.sky);
    gl.uniform3fv(U('uGround'), L.ground);
    gl.uniform4f(U('uWarm'), L.warm[0], L.warm[1], L.warm[2], L.env);
    gl.uniform4f(U('uStage'), view.look.dark ? 1 : 0, view.look.groundShadow, view.look.exposure, view.look.groundY);
    const q = this.quality;
    gl.uniform4f(U('uQual'), q.steps, q.fur, q.shadow, q.ao);
    gl.uniform1f(U('uTime'), performance.now() / 1000);
    gl.uniform2f(U('uPickPx'), 0, 0);
    gl.uniform1i(U('uMode'), 0);
    return U;
  }

  private anchorPass(view: View, U: (n: string) => WebGLUniformLocation | null) {
    const gl = this.gl;
    if (!view.anchors || !this.anchorFbo || !this.anchorTex) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.anchorFbo);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, ANCHOR_W, MAXC);
    gl.uniform1i(U('uMode'), 2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.anchorTex);
    gl.uniform1i(U('uHasAnchors'), 1);
    gl.uniform1i(U('uMode'), 0);
  }

  /** Draw all views. Views whose program is still compiling are skipped. */
  render(views: View[]): void {
    const gl = this.gl;
    if (this.lost) return;
    this.resize();
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    views.forEach((view, slot) => {
      const prog = this.programs.get(view.family);
      if (!prog) return;
      const vp = this.deviceRect(view.rect);
      if (vp.x >= this.canvas.width || vp.y >= this.canvas.height || vp.x + vp.w <= 0 || vp.y + vp.h <= 0) return;
      const U = this.bindView(prog, view, slot, vp);
      this.anchorPass(view, U);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(vp.x, vp.y, vp.w, vp.h);
      gl.viewport(vp.x, vp.y, vp.w, vp.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.SCISSOR_TEST);
    });
  }

  /** Exact GPU pick using the same distance fields as the renderer. */
  pick(view: View, slot: number, cssX: number, cssY: number): PickResult | null {
    const gl = this.gl;
    const prog = this.programs.get(view.family);
    if (!prog || !this.pickFbo || this.lost) return null;
    const vp = this.deviceRect(view.rect);
    const sx = this.canvas.width / this.cssW;
    const sy = this.canvas.height / this.cssH;
    const px = cssX * sx - vp.x;
    const py = (this.cssH - cssY) * sy - vp.y;
    gl.bindVertexArray(this.vao);
    const U = this.bindView(prog, view, slot, vp);
    this.anchorPass(view, U);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFbo);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, 1, 1);
    gl.uniform1i(U('uMode'), 1);
    gl.uniform2f(U('uPickPx'), px, py);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const out = new Float32Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (out[0] < 0.5) return null;
    return { index: Math.round(out[0]) - 1, q: [out[1], out[2], out[3]] };
  }
}
