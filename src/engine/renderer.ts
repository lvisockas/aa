import headSrc from '../shaders/common_head.glsl';
import lightSrc from '../shaders/lighting.glsl';
import mainSrc from '../shaders/common_main.glsl';
import meshVertSrc from '../shaders/mesh.vert.glsl';
import { createProgram, type Program } from './gl';
import { lookAt, quatRotate, type Quat, type Vec3 } from './math';
import { VERT_FLOATS, type MeshFrame } from './mesh';
import { createNoiseTexture, createStrandTexture } from './textures';

export type FamilyId = 'dots' | 'grok' | 'muse' | 'rebel' | 'poly' | 'doodle' | 'clawd' | 'faces' | 'ghost' | 'blob' | 'cards' | 'moods' | 'bugs' | 'bomber' | 'crew' | 'arcade' | 'clay' | 'pet';

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
  /** mesh families: the character as triangles (drawn by rasterisation, not ray marching) */
  mesh?: MeshFrame;
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
  // mesh families: multisampled offscreen target, resolved and composited into the view
  private raster = new Set<FamilyId>();
  private meshVao: WebGLVertexArrayObject;
  private meshBuf: WebGLBuffer;
  private meshCap = 0;
  private msFbo: WebGLFramebuffer | null = null;
  private msColor: WebGLRenderbuffer | null = null;
  private msDepth: WebGLRenderbuffer | null = null;
  private resolveFbo: WebGLFramebuffer | null = null;
  private resolveTex: WebGLTexture | null = null;
  private msW = 0;
  private msH = 0;
  private msSamples = 0;
  private composite: Program | null = null;
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
    this.meshVao = gl.createVertexArray()!;
    this.meshBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.meshVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuf);
    const stride = VERT_FLOATS * 4;
    [[0, 3, 0], [1, 3, 3], [2, 1, 6], [3, 2, 7]].forEach(([loc, size, off]) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off * 4);
    });
    gl.bindVertexArray(null);
    createProgram(
      gl,
      '#version 300 es\nprecision highp float;\nuniform sampler2D uTex;\nuniform vec2 uOff;\nout vec4 o;\nvoid main() { o = texelFetch(uTex, ivec2(gl_FragCoord.xy - uOff), 0); }',
      'composite',
    ).then((p) => (this.composite = p));
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

  /** Compile a family program (idempotent). Mesh families pass their fragment shader and raster = true. */
  load(id: FamilyId, familySrc: string, raster = false): Promise<Program> {
    const ready = this.programs.get(id);
    if (ready) return Promise.resolve(ready);
    let p = this.pending.get(id);
    if (!p) {
      if (raster) this.raster.add(id);
      const src = raster
        ? `#version 300 es\n${headSrc}\n${lightSrc}\n${familySrc}`
        : `#version 300 es\n${headSrc}\n${lightSrc}\n${familySrc}\n${mainSrc}`;
      p = createProgram(this.gl, src, id, raster ? meshVertSrc : undefined).then((prog) => {
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
      if (this.raster.has(view.family)) {
        this.drawMeshView(prog, view, vp);
        return;
      }
      const U = this.bindView(prog, view, slot, vp);
      this.anchorPass(view, U);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(vp.x, vp.y, vp.w, vp.h);
      gl.viewport(vp.x, vp.y, vp.w, vp.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.SCISSOR_TEST);
    });
  }

  /** Exact pick: the same distance fields as the renderer, or the mesh triangles for mesh families. */
  pick(view: View, slot: number, cssX: number, cssY: number): PickResult | null {
    const gl = this.gl;
    const prog = this.programs.get(view.family);
    const vp = this.deviceRect(view.rect);
    const sx = this.canvas.width / this.cssW;
    const sy = this.canvas.height / this.cssH;
    const px = cssX * sx - vp.x;
    const py = (this.cssH - cssY) * sy - vp.y;
    if (this.raster.has(view.family)) return this.pickMesh(view, vp, px, py);
    if (!prog || !this.pickFbo || this.lost) return null;
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

  // ------------------------------------------------------------- mesh families
  private ensureTargets(w: number, h: number): boolean {
    const gl = this.gl;
    // 4x MSAA, or 2x on very large views to keep memory in check
    const want = Math.min(gl.getParameter(gl.MAX_SAMPLES) as number, w * h > 3e6 ? 2 : 4);
    if (this.msFbo && w <= this.msW && h <= this.msH && want === this.msSamples) return true;
    const W = Math.max(w, this.msW), H = Math.max(h, this.msH);
    this.msFbo ??= gl.createFramebuffer();
    this.msColor ??= gl.createRenderbuffer();
    this.msDepth ??= gl.createRenderbuffer();
    this.resolveFbo ??= gl.createFramebuffer();
    this.resolveTex ??= gl.createTexture();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.msColor);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, want, gl.RGBA8, W, H);
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.msDepth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, want, gl.DEPTH_COMPONENT24, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.msColor);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.msDepth);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindTexture(gl.TEXTURE_2D, this.resolveTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.resolveFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.resolveTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.msW = W;
    this.msH = H;
    this.msSamples = want;
    return ok;
  }

  private drawMeshView(prog: Program, view: View, vp: { x: number; y: number; w: number; h: number }): void {
    const gl = this.gl;
    const chars = view.chars.slice(0, MAXC).filter((c) => c.mesh);
    if (!chars.length || !this.composite || !this.ensureTargets(vp.w, vp.h)) return;
    const U = (n: string) => prog.uniforms.get(n) ?? null;
    const cam = view.camera;

    // one ground quad under the whole cast (world space, material -1)
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const c of chars) {
      x0 = Math.min(x0, c.pos[0] - 3 * c.scale); x1 = Math.max(x1, c.pos[0] + 3 * c.scale);
      z0 = Math.min(z0, c.pos[2] - 3 * c.scale); z1 = Math.max(z1, c.pos[2] + 3 * c.scale);
    }
    const gy = view.look.groundY;
    const gq: number[] = [];
    for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z0], [x1, z1], [x0, z1]]) gq.push(x, gy, z, 0, 0, 0, -1, 0, 0);
    const total = 6 + chars.reduce((n, c) => n + c.mesh!.count, 0);
    gl.bindVertexArray(this.meshVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuf);
    if (total > this.meshCap) {
      this.meshCap = Math.ceil(total * 1.5);
      gl.bufferData(gl.ARRAY_BUFFER, this.meshCap * VERT_FLOATS * 4, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(gq));
    const first: number[] = [];
    let at = 6;
    for (const c of chars) {
      first.push(at);
      gl.bufferSubData(gl.ARRAY_BUFFER, at * VERT_FLOATS * 4, c.mesh!.data, 0, c.mesh!.count * VERT_FLOATS);
      at += c.mesh!.count;
    }

    gl.useProgram(prog.prog);
    gl.uniform3fv(U('uCamPos'), cam.pos);
    gl.uniformMatrix3fv(U('uCamRot'), false, lookAt(cam.pos, cam.target));
    gl.uniform1f(U('uFocal'), 1 / Math.tan(cam.fov / 2));
    gl.uniform1f(U('uAspect'), vp.w / vp.h);
    gl.uniform2f(U('uShift'), cam.shift?.[0] ?? 0, cam.shift?.[1] ?? 0);
    gl.uniform4f(U('uView'), 0, 0, vp.w, vp.h);
    gl.uniform1i(U('uCount'), chars.length);
    // world-space occluder spheres for the contact shadow, exactly as the ray marcher gets them
    const occ = new Float32Array(MAXC * 12);
    chars.forEach((c, i) => {
      const sqMax = Math.max(c.squash[0], c.squash[1], c.squash[2]);
      c.occ.slice(0, 3).forEach((o, k) => {
        const r = quatRotate(c.rot, [o[0] * c.squash[0], o[1] * c.squash[1], o[2] * c.squash[2]]);
        occ.set([c.pos[0] + r[0] * c.scale, c.pos[1] + r[1] * c.scale, c.pos[2] + r[2] * c.scale, o[3] * c.scale * sqMax], (i * 3 + k) * 4);
      });
    });
    gl.uniform4fv(U('uOcc'), occ);
    const L = view.look.lights;
    gl.uniform4f(U('uKey'), L.key[0], L.key[1], L.key[2], L.keyI);
    gl.uniform4f(U('uRim'), L.rim[0], L.rim[1], L.rim[2], L.rimI);
    gl.uniform4f(U('uFill'), L.fill[0], L.fill[1], L.fill[2], L.fillI);
    gl.uniform3fv(U('uSky'), L.sky);
    gl.uniform3fv(U('uGround'), L.ground);
    gl.uniform4f(U('uWarm'), L.warm[0], L.warm[1], L.warm[2], L.env);
    gl.uniform4f(U('uStage'), view.look.dark ? 1 : 0, view.look.groundShadow, view.look.exposure, view.look.groundY);
    gl.uniform1f(U('uTime'), performance.now() / 1000);
    const charUniforms = (c: CharFrame) => {
      const m = c.mesh!;
      gl.uniform4f(U('uMXf'), c.pos[0], c.pos[1], c.pos[2], c.scale);
      gl.uniform4f(U('uMRot'), c.rot[0], c.rot[1], c.rot[2], c.rot[3]);
      gl.uniform4f(U('uMSq'), c.squash[0], c.squash[1], c.squash[2], 0);
      gl.uniform4f(U('uMWob'), m.wob[0], m.wob[1], 0, 0);
      gl.uniform4f(U('uMPoke'), m.poke[0], m.poke[1], m.poke[2], m.poke[3]);
      gl.uniform4f(U('uFinish'), m.finish, m.blush, 0, 0);
      gl.uniform4f(U('uCheekL'), m.cheeks[0][0], m.cheeks[0][1], m.cheeks[0][2], 0);
      gl.uniform4f(U('uCheekR'), m.cheeks[1][0], m.cheeks[1][1], m.cheeks[1][2], 0);
    };

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFbo);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, vp.w, vp.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // contact shadow first (premultiplied black), then the opaque character over it
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    chars.forEach((c, i) => {
      charUniforms(c);
      gl.drawArrays(gl.TRIANGLES, first[i], c.mesh!.count);
    });
    gl.disable(gl.DEPTH_TEST);

    // resolve the samples, then copy into this view's rectangle of the canvas
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msFbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolveFbo);
    gl.blitFramebuffer(0, 0, vp.w, vp.h, 0, 0, vp.w, vp.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.composite.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.resolveTex);
    gl.uniform1i(this.composite.uniforms.get('uTex') ?? null, 0);
    gl.uniform2f(this.composite.uniforms.get('uOff') ?? null, vp.x, vp.y);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(vp.x, vp.y, vp.w, vp.h);
    gl.viewport(vp.x, vp.y, vp.w, vp.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
  }

  private pickMesh(view: View, vp: { w: number; h: number }, px: number, py: number): PickResult | null {
    const cam = view.camera;
    const R = lookAt(cam.pos, cam.target);
    const f = 1 / Math.tan(cam.fov / 2);
    const ux = (2 * px - vp.w) / vp.h - (cam.shift?.[0] ?? 0);
    const uy = (2 * py - vp.h) / vp.h - (cam.shift?.[1] ?? 0);
    const rd: Vec3 = [R[0] * ux + R[3] * uy + R[6] * f, R[1] * ux + R[4] * uy + R[7] * f, R[2] * ux + R[5] * uy + R[8] * f];
    let hit: PickResult | null = null, bestWorld = Infinity;
    view.chars.slice(0, MAXC).forEach((c, index) => {
      const r = c.mesh && this.pickChar(c, cam.pos, rd);
      if (r && r.t < bestWorld) {
        bestWorld = r.t;
        hit = { index, q: r.q };
      }
    });
    return hit;
  }

  /** Ray against one character's triangles in its local (unsquashed) frame; t is world ray length. */
  private pickChar(c: CharFrame, ro: Vec3, rd: Vec3): { t: number; q: Vec3 } | null {
    const m = c.mesh!;
    const inv: Quat = [-c.rot[0], -c.rot[1], -c.rot[2], c.rot[3]];
    const o = quatRotate(inv, [ro[0] - c.pos[0], ro[1] - c.pos[1], ro[2] - c.pos[2]]);
    const d = quatRotate(inv, rd);
    const k = 1 / c.scale;
    const O: Vec3 = [(o[0] * k) / c.squash[0], (o[1] * k) / c.squash[1], (o[2] * k) / c.squash[2]];
    const D: Vec3 = [(d[0] * k) / c.squash[0], (d[1] * k) / c.squash[1], (d[2] * k) / c.squash[2]];
    let best = Infinity;
    const a = m.data;
    for (let t = 0; t < m.count; t += 3) {
      const i = t * VERT_FLOATS, j = i + VERT_FLOATS, l = j + VERT_FLOATS;
      // Moller-Trumbore
      const e1x = a[j] - a[i], e1y = a[j + 1] - a[i + 1], e1z = a[j + 2] - a[i + 2];
      const e2x = a[l] - a[i], e2y = a[l + 1] - a[i + 1], e2z = a[l + 2] - a[i + 2];
      const px_ = D[1] * e2z - D[2] * e2y, py_ = D[2] * e2x - D[0] * e2z, pz_ = D[0] * e2y - D[1] * e2x;
      const det = e1x * px_ + e1y * py_ + e1z * pz_;
      if (Math.abs(det) < 1e-12) continue;
      const id = 1 / det;
      const tx = O[0] - a[i], ty = O[1] - a[i + 1], tz = O[2] - a[i + 2];
      const u = (tx * px_ + ty * py_ + tz * pz_) * id;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (D[0] * qx + D[1] * qy + D[2] * qz) * id;
      if (v < 0 || u + v > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * id;
      if (tt > 0 && tt < best) best = tt;
    }
    if (best === Infinity) return null;
    // the local ray shares its parameter with the world ray (affine map), so t compares across characters
    return { t: best, q: [O[0] + D[0] * best, O[1] + D[1] * best, O[2] + D[2] * best] };
  }
}
