// Bundles the app into a single self-contained HTML file (dist/index.html).
//   node scripts/build.mjs           production build (minified)
//   node scripts/build.mjs --serve   rebuild on change + local server
import * as esbuild from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serve = process.argv.includes('--serve');
const outDir = path.join(root, 'dist');

/** Strip comments and indentation from GLSL while keeping line structure for #directives. */
const minifyGlsl = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');

const glslPlugin = {
  name: 'glsl',
  setup(build) {
    build.onLoad({ filter: /\.glsl$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      return { contents: serve ? src : minifyGlsl(src), loader: 'text' };
    });
  },
};

const inlinePlugin = {
  name: 'inline-html',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length) return;
      const js = result.outputFiles.find((f) => f.path.endsWith('.js'));
      const css = result.outputFiles.find((f) => f.path.endsWith('.css'));
      const template = await readFile(path.join(root, 'src/index.html'), 'utf8');
      const html = template
        .replace('<!--STYLE-->', () => `<style>${css ? css.text : ''}</style>`)
        .replace('<!--SCRIPT-->', () => `<script>${js.text.replace(/<\/script/gi, '<\\/script')}</script>`);
      await mkdir(outDir, { recursive: true });
      const name = debug ? 'debug.html' : 'index.html';
      await writeFile(path.join(outDir, name), html);
      const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
      console.log(`[build] dist/${name} ${kb} KB`);
    });
  },
};

const debug = process.argv.includes('--debug');
const options = {
  entryPoints: [path.join(root, debug ? 'src/debug.ts' : 'src/main.ts')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  outdir: outDir,
  minify: !serve,
  sourcemap: serve ? 'inline' : false,
  write: false,
  legalComments: 'none',
  logLevel: 'info',
  plugins: [glslPlugin, inlinePlugin],
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: outDir, port: 5173 });
  console.log(`[dev] http://localhost:${port}`);
} else {
  await esbuild.build(options);
}
