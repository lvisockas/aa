# Cute Agents

Interactive, cursor-reactive avatars: 3D characters inspired by the three agent mascots of autumn 2026,
**OpenAI Dots**, **xAI Grok Bot** and **Meta Muse ("Jolly")**, a family built around the **RebelMouse**
mascot and a low-poly **Dots × RebelMouse** mash-up, plus a 2D sketchbook: five **doodles**, **Clawd**,
Claude Code's terminal crab, Notion-style **Faces**, and **Ghosts**, **Blobs**, **Cards**, **Moods** and
**Bugs**, each in its own illustration style. Every character is rendered live, with no three.js and no
downloaded assets, and every character is fully customisable. The renderer is a hybrid: a WebGL2
signed-distance-field ray marcher for the soft characters, a mesh rasteriser in the same renderer for the
low-poly ones, and Canvas2D for the 2D styles.

| Family | Inspired by | What it is |
|---|---|---|
| Dots | OpenAI | Plush fleece blobs with bead, diamond and googly eyes, berets, glasses, bow ties, headphones |
| Grok Bot | xAI | Inflated geometric shapes with vector slit eyes, 16 expressions, shapes that morph like jelly |
| Muse | Meta | Articulated plush "Jolly" cast with longer fur, outfits, hats and held items |
| Rebels | RebelMouse | The bandana-wearing mouse plus a panda, raccoon and fox: swishing tails, flags and megaphones, in vinyl, plush or flat-logo finishes |
| Polydots | mash-up | Dots silhouettes cut into true low-poly facets, with mouse ears, bead-gem eyes, a bandana and a bead tail |
| Doodles | 2D art styles | Five characters in five simple styles: flat vector, ink doodle, pixel art, paper cut-out, risograph |
| Clawd | Claude Code | The terminal crab at its true block-art resolution, animated in whole pixels, with a working status line |
| Faces | Notion-style | Black monoline portraits built from parts: face shapes, hair, eyes, brows, noses, mouths, glasses, beards, accessories |
| Ghosts | 2000s TV cartoons | Rubbery gumdrop ghosts with huge rimmed eyes, shouting mouths, noodle arms that sprout on demand, a bandana disguise |
| Blobs | flat jelly illustration | Mustard jelly blobs with no outlines, lazy lids and tiny mouths, that breathe, dent and wobble |
| Cards | character-card sets | The whole card is the character: title, colour panel and a line-drawn person whose hands act out each state |
| Moods | crayon emotion posters | Flat colour dots with faces in grainy wax crayon, loopy hair escaping the dot, lines that boil |
| Bugs | marker-and-gouache picture books | Streaky painted critters on stick legs, with feelers, googly eyes, patterned wings and many body types |

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
**See [docs/RESEARCH.md](docs/RESEARCH.md)** for the product research (all thirteen families), the hybrid-rendering decision and the full
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
node scripts/sheet.mjs moods shots/moods.png roster   # 2D contact sheet (characters x states, ~2 s)
npm run debug      # dist/debug.html: one family, no UI (debug.html?family=dots&only=0,3&q=high&warm=120)
npm run build:artifact  # dist/artifact.html for sandboxed hosts (no document skeleton, no downloads)
```

Routes: `#dots`, `#grok`, `#muse`, `#rebel`, `#poly`, `#doodle`, `#clawd`, `#faces`, `#ghost`, `#blob`, `#cards`, `#moods`, `#bugs` (overview otherwise). URL parameters: `?q=low|medium|high|ultra`
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
RebelMouse mascot and Clawd belong to their respective owners; the Faces follow the style of Notion's avatar maker
(Notion Faces, by Buck) but every part is drawn from scratch; the Polydots and Doodles are original. The
Ghosts, Blobs, Cards, Moods and Bugs are original characters drawn in styles the user shared as references: a
cartoon ghost expression sheet in the manner of *Foster's Home for Imaginary Friends*, a flat jelly-blob set, a
character-card set, Yuko Yamariko's *Emotions* poster and Elise Gravel's painted bugs. No artwork is copied. Rendering techniques draw on work by Inigo Quilez, Khronos (PBR Neutral),
Estevez & Kulla (sheen) and t3ssel8r (procedural motion).
