# Cute Agents

Interactive, cursor-reactive 3D avatars inspired by the three agent mascots of autumn 2026,
**OpenAI Dots**, **xAI Grok Bot** and **Meta Muse ("Jolly")**, plus a family built around the
**RebelMouse** mascot, a low-poly **Dots × RebelMouse** mash-up, five **2D doodles** and **Clawd**, Claude
Code's terminal crab. Every character
is rendered live, with no three.js and no downloaded assets, and every character is fully customisable.
The renderer is a hybrid: a WebGL2 signed-distance-field ray marcher for the soft characters, a mesh
rasteriser in the same renderer for the low-poly ones, and Canvas2D for the 2D styles.

| Dots (OpenAI) | Grok Bot (xAI) | Muse (Meta) | Rebels (RebelMouse) | Polydots (mash-up) | Doodles (2D) | Clawd (Claude Code) |
|---|---|---|---|---|---|---|
| Plush fleece blobs with bead, diamond and googly eyes, berets, glasses, bow ties, headphones | Inflated geometric shapes with vector slit eyes, 16 expressions, shapes that morph like jelly | Articulated plush "Jolly" cast with longer fur, outfits, hats and held items | The bandana-wearing mouse plus a panda, raccoon and fox: swishing tails, flags and megaphones, in vinyl, plush or flat-logo finishes | Dots silhouettes cut into true low-poly facets, with mouse ears, bead-gem eyes, a bandana and a bead tail, in cut-paper, gem or vinyl finishes | Five characters in five simple styles: flat vector, ink doodle, pixel art, paper cut-out, risograph | The terminal crab at its true block-art resolution, animated in whole pixels, with a working status line |

**Open `dist/index.html` in any modern browser.** It's a single self-contained file.

## What you can do

* **One character per view.** Each overview card shows its family's lead, and each studio shows one character at a time: switch with the ‹ › buttons on the stage, the roster chips or the arrow keys, and the newcomer hops in.
* **Move the pointer** and the character watches you: eyes lead, then body and head follow, each family with its own physical personality.
* **Click** to boop: the surface dents exactly where you clicked (GPU picking), then the character squashes, hops and shows an emote. Five quick boops make it dizzy.
* **Hold** to squish, then release for a big jump. **Drag across** a character to pet it. **Double-click** for a spin.
* **Agent states**: switch states from the bar (idle, thinking, working, waiting, blocked, done, plus each family's own), or press **Run a task** to watch motion-based state expression end to end.
* **Customise everything** in the inspector: shape (with live morphing), colour, material, fur length and fluffiness, eyes and expression, mouth, blush, hats, glasses, outfits, bandanas, held items, even the species. Randomise, reset, copy as JSON, or save a PNG snapshot. Edits persist in your browser.
* Render settings (gear menu): Auto / Low / Medium / High / Ultra quality, and reduced motion.

## Why not three.js?

Short version: these characters *are* soft primitives blended together, which is a distance field.
Ray marching that field directly gives continuous shape morphing, poke dents, squash and stretch, soft
shadows, ambient occlusion and volumetric fur almost for free, in one ~240 KB file. A mesh engine would
need remeshing or morph targets, shadow maps, SSAO and shell geometry to get the same look.
**See [docs/RESEARCH.md](docs/RESEARCH.md)** for the product research (all seven families), the hybrid-rendering decision and the full
comparison: three.js, Babylon, PlayCanvas, Rive, pre-rendered and neural video, Gaussian splats, WebGPU.

## Development

```bash
npm install
npm run dev        # rebuild on change + serve dist/ on http://localhost:5173
npm run build      # minified single-file dist/index.html
npm run typecheck  # tsc --noEmit
npm test           # unit tests (dynamics, framing, family contracts)
npm run interact   # headless pointer/click smoke test for one family (needs Playwright's Chromium)
npm run interact:all  # every family, two at a time (a few minutes in software GL)
npm run bench      # ms per frame per family in software GL
npm run shots -- "t=1#muse" shots/muse.png 1440 900   # headless screenshot
npm run debug      # dist/debug.html: one family, no UI (debug.html?family=dots&only=0,3&q=high&warm=120)
npm run build:artifact  # dist/artifact.html for sandboxed hosts (no document skeleton, no downloads)
```

Routes: `#dots`, `#grok`, `#muse`, `#rebel`, `#poly`, `#doodle`, `#clawd` (overview otherwise). URL parameters: `?q=low|medium|high|ultra`
(quality), `?res=0.4` (pin the render scale), `?t=1.5` (freeze time, deterministic renders), `?stop=N` (stop after N frames).

Headless tests run on SwiftShader (a CPU emulation of the GPU), which is 100× or more slower than real hardware for
this kind of per-pixel work; the unit tests cover the logic in under a second, and the browser tests run at 40%
render scale so they check behaviour rather than pixels.

### Layout

```
src/
  engine/      renderer (multi-view WebGL2), program compile, noise and strand textures, springs, math
  shaders/     common_head.glsl (SDF library, materials) · common_main.glsl (march, fur, shading)
               dots.glsl · grok.glsl · muse.glsl · rebel.glsl (one distance field + materials per family)
               lighting.glsl (shared lights) · mesh.vert/frag.glsl (rasterised families)
  families/    presets, settings schema, expressions, states, parameter packing, compositions, arm rig
  avatar/      per-character brain: gaze, blinks, expression swaps, squash/hop, reactions, states
  app/         stages (DOM-hosted views, picking, framing), overlay emotes, app shell
  ui/          inspector (generated from schema), icons, research drawer, styles
scripts/       build (single-file inline), screenshots, interaction test, test runner
tests/         node:test suites bundled with esbuild
docs/          RESEARCH.md
```

To add a family: write `<name>.glsl` (implement `loadChar`, `mapHard`, `mapBase`, `furLen`, `furAt`,
`surfAt`), add a `FamilyDef` with presets, schema, states and `pack()`, and register it in `app/app.ts`.
Optional hooks: `onChange` applies presets when a key changes (species palettes) and `armPose` swaps a
state's arm pose (the Rebels aim a megaphone instead of raising it).

## Credits

Characters are fan interpretations for research and design exploration. Dots, Grok Bot, Muse, Jolly, the
RebelMouse mascot and Clawd belong to their respective owners; the Polydots and Doodles are original. Rendering techniques draw on work by Inigo Quilez, Khronos (PBR Neutral),
Estevez & Kulla (sheen) and t3ssel8r (procedural motion).
