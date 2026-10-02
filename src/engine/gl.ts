// Thin WebGL2 helpers: program compilation (optionally non-blocking via
// KHR_parallel_shader_compile) and readable error reports.

export interface Program {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
}

const formatLog = (log: string, source: string): string => {
  const lines = source.split('\n');
  const out: string[] = [log];
  const re = /ERROR:\s*\d+:(\d+):/g;
  let m: RegExpExecArray | null;
  const seen = new Set<number>();
  while ((m = re.exec(log))) {
    const ln = parseInt(m[1], 10);
    if (seen.has(ln)) continue;
    seen.add(ln);
    for (let i = Math.max(1, ln - 2); i <= Math.min(lines.length, ln + 2); i++) {
      out.push(`${i === ln ? '>' : ' '} ${String(i).padStart(4)}| ${lines[i - 1]}`);
    }
  }
  return out.join('\n');
};

const compileShader = (gl: WebGL2RenderingContext, type: number, src: string): WebGLShader => {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return sh;
};

export const VERT = `#version 300 es
void main() {
  // one oversized triangle covering the viewport
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * Compiles and links a program. Resolves once linking is finished; when the
 * parallel-compile extension is available this never blocks the main thread.
 */
export const createProgram = (gl: WebGL2RenderingContext, fragSrc: string, label: string): Promise<Program> => {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const prog = gl.createProgram();
  if (!prog) throw new Error('createProgram failed');
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  const ext = gl.getExtension('KHR_parallel_shader_compile');

  const finish = (): Program => {
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const fsLog = gl.getShaderInfoLog(fs) || '';
      const vsLog = gl.getShaderInfoLog(vs) || '';
      const progLog = gl.getProgramInfoLog(prog) || '';
      throw new Error(
        `[${label}] shader link failed\n${fsLog ? formatLog(fsLog, fragSrc) : ''}${vsLog}${progLog}`,
      );
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    const uniforms = new Map<string, WebGLUniformLocation>();
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      if (!info) continue;
      const name = info.name.replace(/\[0\]$/, '');
      const loc = gl.getUniformLocation(prog, info.name);
      if (loc) uniforms.set(name, loc);
    }
    return { gl, prog, uniforms };
  };

  if (!ext) return Promise.resolve().then(finish);
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (gl.isContextLost()) return reject(new Error('context lost'));
      if (gl.getProgramParameter(prog, ext.COMPLETION_STATUS_KHR)) {
        try {
          resolve(finish());
        } catch (e) {
          reject(e);
        }
      } else {
        setTimeout(poll, 16);
      }
    };
    poll();
  });
};
