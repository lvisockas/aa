import type { Renderer, View } from '../engine/renderer';

/** Render one stage and download it as a PNG (not available in sandboxed viewers). */
export const downloadStagePNG = (renderer: Renderer, view: View, background: string, filename: string): void => {
  renderer.render([view]);
  const gl = renderer.canvas;
  const sx = gl.width / window.innerWidth;
  const sy = gl.height / window.innerHeight;
  const r = view.rect;
  const out = document.createElement('canvas');
  out.width = Math.round(r.width * sx);
  out.height = Math.round(r.height * sy);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(gl, r.left * sx, r.top * sy, r.width * sx, r.height * sy, 0, 0, out.width, out.height);
  out.toBlob((b) => {
    if (!b) return;
    const url = URL.createObjectURL(b);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, 'image/png');
};
