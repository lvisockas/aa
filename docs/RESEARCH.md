# Cute agents: research notes and technical decision

Between August and September 2026, three of the largest AI labs gave their agents a face, and all three
chose *cute*. This document covers what each system looks like and how it behaves, what that implies for
a faithful, interactive 3D rebuild, and why this project renders them with a custom signed-distance-field
ray marcher instead of reaching for three.js by default. A fourth family, the **Rebels**, extends the
studio to the RebelMouse mascot and three friends (section 1.5).

> Research method: web search across launch coverage, official posts and design write-ups (Sept–Oct 2026).
> Direct page fetches were blocked by the build environment's network policy, so facts come from
> search-result extracts. Where a detail comes from a third party or an unofficial explainer, it says so.

---

## 1. The systems

### 1.1 OpenAI · Dots

| | |
|---|---|
| **Launched** | DevDay, 29 Sep 2026 (San Francisco) |
| **What it is** | "Remarkably capable, always-on agents" powered by **GPT-6 Astra**. Each dot has its own cloud computer and browser. It runs in ChatGPT and Codex, with messaging in Slack and Teams. Pro / Business Premium first. |
| **Visual language** | Plush, colourful, *blobby* creatures. "Simple silhouettes, fuzzy surfaces, tiny eyes, and recognisable accessories do much of the expressive work." A pair of glasses or a small hat changes the impression without complicating the design. |
| **Roster seen at launch** | **Dottie**, the default: a green bean with two diamond eyes. **Felipe**, a blue cloud in a beret. **Alfred**, a yellow pear or triangle in glasses and a bow tie. **Todd**, a plump smiling frog. **Jojo**, a heart in sunglasses. A bunny with headphones. Other options include a coloured ring and a hexagon in a beret. Leaked asset sheets show blobs, pills, flowers, hearts and rounded squares that "look like dots when shrunk to an icon". |
| **Customisation** | Name (the handle becomes `@name-dot`), shape, colour, eyes, glasses and accessories, changeable any time. |
| **Motion / states** | A motion designer's breakdown (third party) maps app state to animation: *idle* (breathing, occasional blinks), *listening*, *processing*, *working* (restrained loop), *speaking* (mouth follows audio), *awaiting approval* (patient, settled), *complete* (brief acknowledgement) and *error* (clear change of expression). Activity, emotion, mouth and look direction are independent channels. |
| **Design intent** | Defang a technology that asks for more personal access. "Stop being afraid of its AI agents" (Gizmodo). |

The plush-with-accessories rows in the reference carousel ("Plush-like texture · Limited character roster ·
Distinctive forms and accessories") are the Dots cast.

### 1.2 xAI · Grok Bot

| | |
|---|---|
| **Launched** | Beta, 11 Aug 2026 |
| **What it is** | Persistent agents. A Bot has a name, an avatar and a title, its own computer and tools, and memory. "When you come back tomorrow, you are coming back to the same Bot." Work can start without a prompt. |
| **Visual language** | "The default avatar is **a colored geometric shape with two slit eyes**." Eight default shapes: circle, oval, rounded square, pill, triangle, hexagon, cloud, teardrop. Reported as 12 colours and 16 expressions (unofficial explainer). Users can also pick a generated face or upload a still or GIF. |
| **Motion is the status channel** | "At rest, the Bot is calm and slightly curious. When work arrives, it acknowledges the task. As work begins, it kicks into gear. Its motion changes again when it is waiting or needs help, then settles once the work is done." The avatar now shows *what the Bot is doing* as well as *which Bot it is*. It should be recognisable "almost peripherally". Working moods are reported as idle, thinking, working, waiting, blocked and done, plus orbiting rings for long-running work. |
| **Design process** | xAI explored initials, emoji, pixel art, watercolour, **claymorphism** and identicons. They kept the construction constant (simple shape plus expressive eyes) and added distinction through controlled variation and accessories. |

These are the flat geometric blobs in the carousel ("Simple geometric forms · Near-infinite shape
variations · Motion-based state expression").

### 1.3 Meta · Muse ("Jolly")

| | |
|---|---|
| **Launched** | Meta Connect, Sept 2026. The app went to the top of the App Store. Muse is restricted to adults (18+). |
| **Mascot** | **Jolly** is cream-coloured with beady black eyes, an upward smile, soft pink cheeks, plush ivory fur and rounded shapes, borrowing openly from Labubu. Designed by Muse product design lead **Alex Cornell**. |
| **Customisation** | Name, appearance and attire, "with matching animations". Meta's team found that employees immediately imagined their own agents, which made personalisation "critical to the product". Examples shown include a mango, a labradoodle, toast in sunglasses, a cowboy, a punk, a pigeon, a yeti, a bunny scientist and a baseball player. |
| **Status animation** | Jolly appears at the top of the app "tapping away at a keyboard" while Muse works, which Cornell calls one of his favourite parts of the design. |
| **Hardware** | **Muse Charm**: a keychain device with a 2-inch OLED for the animated avatar, 5G, mics and speakers. Ships in December. |
| **How Meta renders it** | **Muse Realtime Avatar** is an audio-driven diffusion transformer conditioned on the reference image and recent video latents. A 40-step teacher is distilled into a 2-step causal student. It streams 448×768 at 25 fps with about 870 ms end-of-turn latency, serving 12 sessions per GB200. |

These are the detailed plush characters on the keychain in the carousel ("Cross-cultural friendliness ·
Highly detailed rendering · Extensive customization options").

### 1.4 Why cute, and the critique

Cute and toy-like characters signal low threat, avoid the uncanny valley of human avatars, and make
always-on agents feel like companions rather than surveillance. Critics point at the tension. NBC's take
was "It's cute. It's cuddly. And it wants your data", and Muse is an 18+ product wearing a children's-toy
costume. For a rebuild, the takeaway is that **expressiveness per pixel and per frame** matters more than
realism. All three systems carry state through motion and expression.

### 1.5 RebelMouse · the Rebels (added family)

| | |
|---|---|
| **Who** | RebelMouse is a publishing platform founded in 2012 by Paul Berry, the former CTO of The Huffington Post. It began as a "social front page" that aggregated a brand's social feeds and grew into a full CMS for media companies and brands such as Pepsi, Adidas, MTV, Patagonia, Red Bull and Burger King. |
| **Agents** | Its 2026 pitch is an **agentic CMS**: AI agents work inside the CMS to assist, optimise and repurpose content, with roles, audit logs and review gates on every agent action. It also offers OpenAI-powered assistants for headlines, SEO and cross-channel repurposing. |
| **Mascot** | The logo is "a mouse mascot with a red bandanna holding a pride flag" (RebelMouse's creative-agency page). |
| **The brief** | "Mouse original, panda, raccoon and fox": the mascot plus three friends who follow the same visual rules. |

How the rebuild reads it:

* **One chibi rig, four species.** Big head, short body (about 1:1), stubby limbs. Species identity comes
  only from ears, muzzle, markings and tail. The mouse has big round pink ears, a pink nose, buck teeth and
  a thin tail. The panda gets black ears, limbs and shoulder band, plus tilted teardrop eye patches. The
  raccoon wears a bandit mask with pale brows and a ringed bushy tail. The fox has black-tipped pointed
  ears, white cheeks and chest, black socks and a white-tipped brush.
* **The bandana is the brand.** It works as a headband, a bandana cap or a neckerchief, with fluttering ties.
  The held props come from publishing: a pride or brand flag, a megaphone, a newspaper and a pencil.
* **Three finishes.** Glossy vinyl toy (the default), plush (reusing the volumetric fur shell), and a flat
  logo finish with graphic shading.
* **Attitude.** A "rebel attitude" slider sets the resting brow angle, lid line and smirk, so the same
  character reads anywhere from friendly to defiant.
* **States follow the agentic-CMS loop:** idle, listening (ears perk), planning (chin in hand), creating
  (typing on a laptop), optimizing (gears spin, tail wags), publishing (flag up, megaphone aimed at the
  viewer), growing (celebration) and sleeping (tail curled round). Held props stow while both hands are
  busy.

Caveats. The logo image could not be fetched from this environment, so proportions, the grey body and the
headband placement interpret the text description rather than copy the artwork. The blue-and-pink stage
palette is in the spirit of the RebelMouse site; exact brand colour values were not verified. The mark on
the brand flag is an original tapered-snout mouse head, not a copy of any existing logo.

### 1.11 Toy box · Bombers, Crew, Chompers, Clay (3D) and Pocket pets (2D) (original)

Five families in the spirit of game and toy icons the user named, as original characters. The four 3D ones
reuse the Grok recipe (glossy shapes, no fur, faces as decals evaluated at shading time) and were built to a
budget: each must render no slower than Grok, the cheapest ray-marched family. All four came in at 2-4x faster,
because only the parts near a sample point are evaluated (limbs, props and accessories sit behind bounding
tests) and every face, visor, stripe and buckle is colour rather than geometry.

* **Bombers** (arcade bomb heroes, in the manner of Bomberman). A round helmet as big as the body with a real
  recessed face window, tall eyes painted on the peach face, a coil antenna whose ball rides a damped spring,
  a belted suit, mitts and boots. Props are the round bomb (cap, curly fuse, flickering spark) and orbiting
  power-up tiles; extra states plant a bomb and dance.
* **Crew** (space crewmates, in the manner of Among Us). A bean with stubby legs and a backpack; the face is a
  visor with no features, so emotion lives in the visor's shape (squint, tilt, tall, lids) and its highlight,
  which slides with the gaze; hearts, stars and spirals replace it for big feelings. Hats, a jetpack whose
  flame fires on hops, stickers and a mini pet; "suspicious" and "emergency meeting" states, kept non-violent.
* **Chompers** (maze arcade, in the manner of Pac-Man). A sphere minus a wedge whose angle animates the chomp,
  and ghosts with a rippling scalloped skirt whose pupils roam inside the whites. Working chomps along a
  scrolling row of dots that vanish as the mouth shuts; "frightened" turns ghosts deep blue with a zigzag mouth
  and a flashing end, and "power-up" makes chompers grow and glow.
* **Clay** (stop-motion claymation). Matte, waxy plasticine with procedural thumbprints, fingerprint whorls,
  lumps, tool marks and darkened seams, all as bump in the shading. The pose is held on twos at 12 (or 8) fps
  and the thumbprints re-seed every held frame, so the surface boils like hand-animated clay; speaking swaps
  replacement mouths. A toggle restores smooth motion.
* **Pocket pets** (90s virtual pets, in the manner of Tamagotchi), 2D. The whole keychain is the character: an
  egg shell (solid, translucent with the circuit board showing, glitter, pearl), a ball chain that swings, three
  buttons that press where you click, and a 32x16 dot-matrix LCD with unlit cells, an afterimage and care icons.
  Five pixel species at four life stages hatch, wander, eat, get sick and sleep with the lights off.

### 1.10 A 2D sketchbook · Ghosts, Blobs, Cards, Moods, Bugs (original)

Five more 2D families, each built from a reference sheet the user shared. The characters are original; what
carries over is each style's rules, rebuilt procedurally in Canvas2D on the shared brain.

* **Ghosts** (a 2000s TV-cartoon ghost expression sheet). A flat gumdrop body with no outline and a drippy hem,
  huge eyes with thick black rims, heavy slanted brows, and mouths that go from a line to a shout full of teeth
  and tongue. The style's acting lives in the body, so the top bends towards where it looks, the whole thing
  squashes like rubber, and noodle arms with mitten hands sprout only when a state reaches out (wave, type, chin,
  fist, cheer). Twelve expressions, plus shouting and scheming states (the latter adds a red bandana mask).
* **Blobs** (a flat jelly-blob set). Each outline is a superellipse with separate top and bottom exponents,
  taper, base spread, lean and a few slow lumps, so eight shapes come out of one function and can breathe,
  dent where you click and jiggle back. Faces stay tiny and low: white eyes, maroon pupils, lids as a half-disc in
  a darker body tone. Everything is clipped to the body, so the face slides round the edge when it spins.
* **Cards** (a character-card set). The whole card is the character: title, colour dot, flat panel, a bald
  monoline person and a wrapped description, with titles that shrink and descriptions that step down in size
  to fit. Hands carry the meaning, so the family has its own arm rig (upper arm behind the shirt, forearm in
  front, seven hand shapes) easing between gestures; archetype presets set title, text, colour, pose and decor.
* **Moods** (a crayon emotions poster). The line is the craft: every stroke is two filled ribbons (a faint wide
  pass and a dense core) with pressure swelling along it, ragged edges and seeded wobble, drawn into an offscreen
  layer and rubbed out with a cached paper-grain tile. "Line boil" re-rolls wobble and grain seven times a second,
  the way hand-drawn animation shimmers. Loop hair comes from a cursive-loop generator that runs along the edge.
* **Bugs** (marker-and-gouache picture-book critters). Bodies are semi-opaque paint with a cached brush-grain
  tile, pooled darker and lighter patches, darker edges and wobbly outlines; everything else is a fine black
  liner: stick legs with feet, feelers on springs that lag behind hops, googly eyes, teeth rows, hatched or
  striped wings. Eight body types (from jellyfish dome to caterpillar and snout beetle) take any combination of
  legs, wings, feelers, eyes, mouths and patterns; legs scuttle and wings buzz while working.

### 1.9 Faces · Notion-style portraits

Notion's avatar style, built with Buck as the "Notion Faces" maker, is a black monoline portrait on white:
one uniform stroke weight, no shading, solid black hair, dot eyes and a small set of interchangeable parts
(face, hair, eyes, brows, nose, mouth, glasses, beard, accessories) that combine into millions of faces. Design
Compass's breakdown points out why it works: the parts are deliberately minimal, so a face reads as a
person rather than a likeness, and the same line weight keeps every combination consistent.

The rebuild follows those rules in Canvas2D. Every part is a path drawn at one stroke weight (1.6% of the
head height); hair and beards are solid ink fills, skin is white or a flat tone, and an optional pastel disc
sits behind the bust. Parts are layered back hair → bust → ears → head → details → eyes → brows → nose →
beard → mouth → front hair → glasses → accessory. Movement stays 2D: the features slide a little towards the
cursor as the head turns (a cheap parallax), blinks squash the eyes, and the expressions only move brows and
mouths, the way a flat illustration would. States add props from the same line vocabulary: thinking dots,
a pencil and page for writing, a check for done. Cast: Ivy (bob, round glasses), Theo (curls, square
glasses, beard), Juno (bun, freckles, earring), Max (spiky hair, headphones), Ada (long waves, pencil).

### 1.8 Clawd · Claude Code's terminal crab

Clawd is the 8-bit crab that greets you at the top of a Claude Code session, in rgb(215, 119, 87) on the
terminal's dark background. Codrops published a frame-by-frame rebuild of Claude's mascot animations in
SVG and GSAP (May 2026); that page could not be fetched from this environment, so the motion here is an
independent take. The sprite comes from Claude Code's quadrant-block artwork:

```
 ▐▛███▜▌
▝▜█████▛▘
  ▘▘ ▝▝
```

Each quadrant character is 2×2 pixels and a terminal cell is twice as tall as it is wide, so each pixel is
one grid column by two grid rows: a 16-column body with two tall slit eyes, 2×2 arm nubs and four legs.
The rebuild keeps that resolution and animates it the way pixel art animates. Everything moves in whole
pixels: the eyes step one pixel towards the cursor, blinks shrink the slits, the legs scuttle in two frames,
the arms type or wave, hops snap to the pixel grid, and squash duplicates or drops whole rows (the sprite
is painted at native size and scaled with nearest-neighbour sampling). A terminal status line underneath
plays the role of the CLI: a sparkle spinner that grows and turns its arms next to a playful verb while it
works, an approval prompt, a green check when done. Variants: classic terracotta, green phosphor with
headphones, amber with an antenna; phosphor glow and CRT scanlines are adjustable.

### 1.7 Doodles · five 2D art styles (original)

Five 2D characters, each in its own simple art style, built from a handful of shapes and drawn by
interchangeable style renderers: Mochi in **flat vector** (bold fills, a crescent of shade), Scribble in
**ink doodle** (marker fill off the line, hand-drawn ink that "boils" eight times a second, hatching),
Bit in **pixel art** (rasterised to a coarse grid, snapped to its own palette, one-pixel outline), Fern in
**paper cut-out** (scissor-cut edges, a hair of rotation, drop shadows, paper fibres) and Ribbit in
**risograph** (two spot inks overprinted with multiply, halftone shading, misregistration, speckle). Any
character can wear any style, and they share the 3D families' brain: eyes follow the cursor, blinks,
squash and hop, boops, states and expressions.

### 1.6 Polydots · a low-poly Dots × RebelMouse mash-up (original)

A fifth family answers "what if a Dot were a Rebel": Dots silhouettes (bean, cloud, pear, heart, round,
drop) with the mouse's ears, tail, nose, whiskers and bandana, rendered as **genuine low poly**.

* **Faceting is geometry, not a shading trick.** Each body is a union of *faceted ellipsoids*: the
  intersection of the tangent planes of an ellipsoid along the 20 face normals and 12 vertex directions
  of an icosahedron. The result is the icosidodecahedron family: a "facet size" slider lifts the 12
  vertex caps, sliding the look from a soccer-ball mix of pentagons and triangles to a pure 20-triangle
  icosahedron. Because the distance field is a max of planes, the silhouette is polygonal and the
  finite-difference normals are flat per face with a crisp bevel at edges. Shapes morph by interpolating
  the blob parameters, so a bean becomes a heart through intermediate polyhedra.
* **Rasterised, not ray-marched** (see 3.3): `pack()` emits flat-shaded triangles every frame (the faceted
  polyhedra come from clipping the plane set; the bandana is the body grown a few millimetres and clipped
  to a band), and normals come from screen-space derivatives so every triangle is exactly flat.
* **Anchoring without a GPU pass.** The TypeScript side mirrors the facet SDF and sphere-traces from the
  face centre to find where eyes, nose, ears and the tail root land on the actual facets, with the facet
  normal from a numeric gradient. Eyes are small octahedral gems that slide across the face with the
  gaze; blinks squash them to a line.
* **Materials**: cut paper (matte, slightly flat, each face a hair lighter or darker via a hash of its
  normal), gem (glassy clear coat with a warm transmission wrap) and vinyl toy. The tail is three beads,
  the bandana is a faceted shell of the body cut to a band with a knot and two paper ribbons, and the
  optional flag is planted at the knot with zig-zag folds that travel along the cloth.

---

## 2. Requirements that fall out of the research

| Need | Dots | Grok Bot | Muse | Rebels |
|---|---|---|---|---|
| Surface | short-pile fleece, soft fuzzy silhouette | matte or clay-like vinyl, flat brand colours | longer minky fur, fabrics, leather, metal, glass | glossy vinyl, plush or flat logo paint |
| Shape | ~11 soft silhouettes | 8 primitives with *continuous* variation | articulated body (head, arms, legs) | articulated chibi with species ears, muzzle and tail |
| Face | beads, diamonds, googly eyes, arcs | vector slit eyes, 16 expressions | beady eyes, blush, stitched or open mouth | big tracking eyes, brows, nose, whiskers, teeth |
| Accessories | glasses, beret, bow tie, headphones | rings, thinking dots | hats, jackets, coats, jerseys, held items | bandana (3 styles), flag, megaphone, newspaper, pencil, glasses |
| Motion | 8 app states | 6–8 states, readable peripherally | waving, typing, cheering, sleeping | tail sway, ear twitches, agentic-CMS states |
| Interaction | gaze follows the cursor; click, hold and drag reactions | same | same | same |
| Settings | everything above is live-editable, persists, and morphs smoothly | | | |

---

## 3. Choosing the rendering approach

The obvious move is three.js. The question was whether it's the *right* one for these particular characters.

### 3.1 Options considered

| Approach | Shape variety and morphing | Plush fur | Lighting quality | Payload | Verdict |
|---|---|---|---|---|---|
| **SDF ray marching, raw WebGL2** | Native. Characters *are* blended primitives, so morphs are a `mix()` and squash, stretch and dents are domain warps | Volumetric shell integrated along the ray | Soft shadows and AO fall out of the distance field | ~240 KB single file (~80 KB gzipped), **0 deps** | **Chosen** |
| three.js / Babylon / PlayCanvas (meshes) | Needs procedural meshing (e.g. marching cubes) or morph targets with matching topology. Continuous shape morphs are awkward | Shells and fins, well understood | Shadow maps plus an SSAO pass for soft contact | 170 KB – 1.4 MB gz before content | Great engines, but they fight this content. As a full-screen quad they contribute almost nothing |
| Rive / Lottie | 2D only | — | — | small | Good for Dots-style UI loops, not 3D |
| Pre-rendered, video or neural (Meta's path) | Fixed at render time | Photoreal | Baked | MBs, or a GPU server stream | No live customisation or pointer physics |
| Gaussian splats | Captured, not parametric | Photoreal | Baked | 10s of MB | Can't change shape or outfit |
| WebGPU (WGSL) | Same algorithms | Same | Same | Same | About 87% browser coverage (caniuse, Aug 2026). Firefox on Linux and Android is still missing, and headless CI is harder. **This is the upgrade path, not the baseline** |

### 3.2 Why SDF ray marching wins here

1. **The characters are distance fields already.** A cloud is five smooth-unioned spheres. A Grok Bot is a
   rounded 2D shape inflated into a pillow. A frog is an ellipsoid plus two eye bumps. Writing them as SDFs
   is the shortest path from design to pixels.
2. **"Near-infinite shape variation" is literal.** Switching a Grok Bot from circle to hexagon interpolates
   the two distance fields, wobbling like jelly, with no remeshing and no topology constraints.
3. **Physical interactions are cheap.** A boop adds a Gaussian dent to the field at the exact hit point.
   Squash and stretch is a non-uniform scale with a Lipschitz correction.
4. **Soft studio lighting comes free.** The same field answers "how far to the nearest surface?" for
   penumbra shadows and ambient occlusion, giving plush toys their soft contact look without shadow-map
   acne or a screen-space AO pass.
5. **Fur fits the model.** Plush is a thin participating medium around the skin surface. Marching through
   that shell is a natural extension of marching to the surface.
6. **One tiny, dependency-free file.** The whole studio, including five renderers, UI and docs drawer,
   ships as one ~240 KB HTML file (about 80 KB gzipped).

The costs are real. Per-pixel work grows with scene complexity, compile times grow with shader size, and
picking and anchoring need care. The architecture below exists to manage them.

### 3.3 Where ray marching was the wrong tool: a hybrid renderer

The Polydots were first ray-marched too, and on a real laptop GPU they ran at 16 fps even after the
adaptive system had dropped to the lowest tier at 55% resolution. A faceted body as a distance field costs
32 plane tests per piece per march step (about 16 pieces, ~100 steps per pixel, plus shadow rays), all
to draw what is really ~1,500 flat triangles. Rasterisation draws those in well under a millisecond.

So the renderer is now a hybrid, and each family uses the technique that fits it:

| Family | Technique | Why |
|---|---|---|
| Dots, Grok Bot, Muse, Rebels, Bombers, Crew, Chompers, Clay | SDF ray marching | soft blends, live morphs, dents where you click, volumetric fur, clay thumbprints |
| Polydots | triangle rasterisation, 4x MSAA | it is polygons; the mesh is rebuilt on the CPU each frame from the same parameters |
| Doodles | Canvas2D | flat 2D art styles need paths, strokes, patterns and blend modes, not 3D |
| Clawd | Canvas2D, nearest-neighbour pixel sprite | the original is terminal block art; motion snaps to its pixel grid |
| Faces | Canvas2D, monoline paths | a line-drawn portrait is strokes and flat fills; parts swap as paths |
| Ghosts, Blobs, Cards, Moods, Bugs, Pocket pets | Canvas2D, procedural paths plus cached texture tiles | flat fills, crayon and paint textures, text on cards: illustration, not geometry |

All three share one canvas compositor, the same camera, lights and tone mapping (the lighting code
lives in one `lighting.glsl` used by both GPU paths), the same picking API (exact SDF picking, a CPU
ray-triangle test for meshes, a bounding test for 2D) and the same avatar brain. A mesh library such as
three.js was not needed for this: the mesh path is ~250 lines inside the existing renderer, and a second
engine would have meant a second WebGL context or shared state, a second lighting model, and ~170 KB.

---

## 4. Architecture

```
DOM stage  ─┐   (one per family view; plain elements, CSS backgrounds)
DOM stage  ─┼─► Renderer: one full-window WebGL2 canvas, scissored per stage
DOM stage  ─┘        └─ per-family program = common_head + <family>.glsl + common_main
Avatar (CPU): gaze, blink, squash, hop, states  ─► packs 32 texels of params per character
Overlay (2D canvas): emotes and name tags, projected from 3D
```

* **One canvas, many stages.** Every stage is a normal DOM element. The renderer draws all visible stages
  into one fixed full-window canvas using viewport and scissor rectangles, so scrolling layouts and
  responsive CSS just work and a single WebGL context serves everything.
* **Per-character local marching.** Each pixel intersects bounding spheres, sorts candidates by depth, and
  marches each character in *its own* local frame, so transforms happen once per ray rather than per
  step. Fuzzy edges composite front to back across characters.
* **Data texture, not uniforms.** Each character streams 32 RGBA32F texels of parameters (shape ids,
  colours, eye shapes, arm joints, accessory types), which avoids uniform limits and keeps one shader per
  family.
* **GPU anchor pass (Dots).** A 16×10 pass ray-casts every Dots body once per frame to find where the eyes,
  hat, bow tie and headphone cups sit. Accessories follow any shape, width or morph exactly, using the same
  code as the renderer.
* **GPU picking.** A click renders one pixel with the same distance fields, giving the exact character and
  local hit point. The boop dents the surface *where you clicked*.
* **Single shading call site.** GLSL inlines every call. An earlier version inlined hard-surface shading
  three times and the shadow march five times, and the Dots shader fell off a compile-time cliff in
  SwiftShader. Restructuring so fur integration *reports* hard hits instead of shading them cut both
  compile and run time roughly 3×.

### 4.1 Rendering techniques

| Technique | Where |
|---|---|
| Polynomial smooth-min with blend factor (Quilez) | all bodies, colour blending |
| Rounded extrusion, plus a dome built from a **4-tap blurred interior distance**, so polygon faces stay crease-free | Grok Bot pillows |
| 2D SDF face decals with analytic AA and an enamel bevel (normal tilt across the inlay edge) | Grok eyes: pills, arcs, X, chevrons, hearts, stars, spirals |
| **Volumetric fur shell**: mipmapped strand-*coverage* texture (so distant fur resolves to fuzz, not shimmer), triplanar projection in body-attached coordinates, clumping, gravity droop, Kajiya-style fibre diffuse, rim backscatter | Dots fleece, Muse minky and yeti fur |
| Fur-length field that clears features (eyes, mouth), shortens under clothing and on faces, and flattens under a boop | Dots, Muse |
| Penetration-tolerant soft shadows (Quilez) against a **Lipschitz-safe proxy** (skin + nominal pile), with the ray start lifted out of the proxy | everything (fixes banding under hat brims) |
| Quilez 5-tap SDF ambient occlusion | everything |
| Studio IBL: hemisphere + analytic softboxes with roughness-dependent blur, giving rectangular catchlights in bead eyes | glossy parts |
| Charlie sheen (Estevez & Kulla), clear coat, wrap lighting | felt, satin, vinyl |
| Analytic sphere occluders for contact shadows, faded with distance and at the frame edge | floor |
| Painted markings from nearest-part classification with analytic AA (patches, masks, socks, ringed tails) | Rebels |
| Eye sockets carved with a smooth max, iris and pupil painted on a clear-coated eyeball, polka dots in cylindrical band coordinates | Rebels |
| **Faceted ellipsoids** as max-of-planes fields over icosahedral direction sets, CPU-mirrored for anchoring, per-face hashed tint | Polydots |
| Far-field shortcut: the circumscribed ellipsoid's distance stands in for the plane set beyond the blend's reach (a safe lower bound), so most march steps skip the 32 planes; statically indexed constant arrays keep GPUs fast | Polydots |
| Flat cloth strips with travelling ripples, waving flag cloth, props scaled about the hand so they stow smoothly | Rebels bandana ties and props |
| Khronos PBR Neutral tone mapping, exact sRGB encode, blue-ish dither | output (keeps brand colours true) |
| Edge AA from the closest-approach ratio of missed rays | hard silhouettes |
| Off-axis lens shift | frames the cast between UI overlays |

### 4.2 Motion system

* **Second-order dynamics** (frequency, damping, response). This is the "personality" filter from
  t3ssel8r's talk. It drives body yaw and pitch, eye look, head turn and arm joints, so each family gets
  its own feel. Grok is snappy with overshoot, Dots soft, Muse gentle.
* **Gaze**: eyes lead and the body follows, with clamps per family. When the pointer has been idle for
  10 s, characters glance at neighbours, at the camera, and back at the cursor.
* **Blinks** are randomly scheduled with occasional double blinks. **Expression swaps happen behind a
  blink**, so discrete eye shapes such as pill to arc never pop.
* **Reactions**: a click boops (dent + squash + hop + emote), five quick clicks make a character dizzy,
  holding squishes it and releasing jumps, dragging pets it, and a double-click spins it.
* **States** set the amplitudes of bob, squash, sway, lean, shake and spin, plus props (orbit rings,
  thinking dots, Jolly's keyboard), arm poses and gaze modes, all eased so state changes never snap.
  **Run a task** plays a scripted sequence through every state.
* **Tails and ears** (Rebels): tails are three-segment chains swayed by a travelling wave that speeds up
  with excitement, petting and wagging, and curls round for naps. Ears twitch at irregular intervals,
  perk when listening and flatten under a boop. Family hooks apply species presets and swap arm poses
  for the held prop, so a megaphone is aimed instead of raised.

### 4.3 Performance strategy

* Bounding-sphere culling per pixel, early-out per character, non-unrolled heavy loops (`ZERO` trick).
* Quality tiers (march, fur, shadow steps and AO) plus **adaptive resolution** driven by frame time. The
  renderer drops resolution before dropping features.
* Programs compile up front, non-blocking where `KHR_parallel_shader_compile` exists, so tab switches are
  instant.
* Software GL (SwiftShader) renders a full studio frame in about 5–10 s, which serves as the CI baseline.
  Real GPUs run at interactive rates.

---

## 5. Verification

* `npm test` runs unit tests for the dynamics, composition framing (every character inside the viewport at
  every aspect), and family contracts: every schema key exists, and every preset, state and expression
  packs finite parameters and survives boop, hold, pet and trick without NaNs.
* `npm run interact` drives headless Chromium: gaze follows the pointer left and right, a click GPU-picks
  and selects the right avatar and dents it, the inspector follows, and the state bar works. This is run
  for all eighteen families, plus family-specific checks (shape morphs, accessories, species presets, the
  aimed megaphone, faceted-body morphs, 2D style switching, the terminal crab's states, Notion-style part swaps, a part chip on each sketchbook family). Every 2D family also draws every
  option of every control in every state in a unit test, and `scripts/sheet.mjs` renders a family's roster x
  states (or expressions, or one control's options) as a contact sheet in about two seconds, no WebGL needed). A unit test
  guards against the click-then-squash bug (a quick click used to leave the hold timer running).
* `npm run shots` takes screenshots of any route and size in software GL, with a GPU sync before capture.
* `npm run bench` reports steady-state frame cost per family in software GL (480×300, low quality):
  Grok ~200 ms, Dots and Muse ~340 ms, Rebels ~440 ms per frame for the ray-marched families (and the toy-box
  families built to a Grok budget: Chompers ~52 ms, Bombers ~86 ms, Clay ~87 ms, Crew ~85-103 ms), against
  ~19 ms for the rasterised Polydots (down from ~85 ms when they were ray-marched; most of what is left is
  fixed per-frame overhead). On a GPU the same work is two to three orders of magnitude faster, which is
  what the adaptive resolution and quality tiers manage.

## 6. Limitations and next steps

* **Fur** is strand-coverage volumetrics, not guard hairs. A hybrid with a few explicit strands would add
  sparkle to long fur such as the yeti's.
* **WebGPU port**: the shaders map one-to-one onto WGSL. A compute pre-pass could bin characters into
  screen tiles and drop the per-pixel candidate loop.
* **Temporal accumulation** while the scene is calm would allow higher sample counts for free.
* **Audio-driven talking** (mic to mouth) would mirror the Dots "speaking" state.

## Sources

* TechCrunch: [OpenAI launches Dots, its bubbly agentic avatar](https://techcrunch.com/2026/09/29/openai-launches-dots-its-bubbly-agentic-avatar/)
* Fast Company: [OpenAI's new dots agent comes with a crew of friendly mascots](https://www.fastcompany.com/91615068/openai-dots-agent-crew-of-friendly-mascots)
* SF Standard: [OpenAI launches cute, 'capable' AI agents](https://sfstandard.com/2026/09/29/openai-launches-dots/)
* Gizmodo: [With Dots, OpenAI wants you to stop being afraid of its AI agents](https://gizmodo.com/with-dots-openai-wants-you-to-stop-being-afraid-of-its-ai-agents-2000819082)
* MarkTechPost: [OpenAI launches dots: always-on GPT-6 Astra agents](https://www.marktechpost.com/2026/09/29/openai-launches-dots-always-on-gpt-6-astra-agents-that-work-from-their-own-cloud-computers/)
* DEV (third-party analysis): [ChatGPT Dots: expressive assistants with Rive animation](https://dev.to/uianimation/chatgpt-dots-by-openai-building-expressive-ai-assistants-with-rive-animation-2m7g)
* xAI: [Designing Grok Bot for a world of persistent agents](https://x.ai/news/designing-grok-bot)
* Grok Bot Explained (unofficial): [Avatar system: shapes, colours, expressions and animations](https://www.grokbotexplained.app/avatar-system)
* Layer3 Labs: [Grok Bot explained](https://www.layer3labs.io/guides/what-is-grok-bot)
* Axios: [Meta gives Muse an adorable mascot amid AI doomerism](https://www.axios.com/2026/09/25/ai-doom-meta-muse-mascot)
* NBC News: [It's cute. It's cuddly. And it wants your data.](https://www.nbcnews.com/tech/tech-news/meta-muse-ai-agent-response-animated-avatar-cute-rcna599736)
* The AI Insider: [Meta goes all in on Muse at Connect 2026](https://theaiinsider.tech/2026/09/25/meta-goes-all-in-on-muse-ai-agent-at-connect-2026-with-avatars-camera-free-glasses-and-a-keychain-device/)
* The Gadgeteer: [Meta Muse Charm keychain](https://the-gadgeteer.com/2026/09/24/meta-muse-charm-ai-assistant-keychain/)
* Runtime Wire: [Meta gives Muse a live avatar](https://runtimewire.com/article/meta-muse-realtime-avatar)
* Design Compass: [Why AI agents are getting cute](https://designcompass.org/en/2026/09/30/why-ai-agents-are-getting-cute/)
* Codrops: [Reverse-engineering Claude AI's mascot animations with SVG and GSAP](https://tympanus.net/codrops/2026/05/05/reverse-engineering-claude-ais-mascot-animations-with-svg-and-gsap/) · Stark Insider: [Clawd, the retro mascot of the command line](https://www.starkinsider.com/2025/10/clawd-ai-retro-mascot-command-line.html)
* Buck: [Notion Faces](https://buck.co/work/notion-faces) · Design Compass: [Notion Faces](https://designcompass.org/en/2025/01/08/notion-face/)
* RebelMouse: [Creative agency](https://www.rebelmouse.com/creative-agency) (mascot description) · [2026 platform updates](https://www.rebelmouse.com/2026-platform-updates) · [AI CMS](https://www.rebelmouse.com/ai-cms) · [The agentic website for the AI era](https://www.rebelmouse.com/agentic-website-ai-era) · [How RebelMouse built an agentic CMS](https://www.rebelmouse.com/how-rebelmouse-built-agentic-cms)
* American Express OPEN Forum: [A HuffPo veteran creates a new content management site](https://www.americanexpress.com/us/small-business/openforum/articles/a-huffpo-veteran-creates-a-new-content-management-site/)
* journalism.co.uk: [News outlets given 'social front pages' using new RebelMouse platform](https://www.journalism.co.uk/news-outlets-show-social-sharing-with-new-rebelmouse-platform/)
* Beg to Differ: [RebelMouse as a social brand](https://www.begtodiffer.com/2012/11/16/social_brand_rebelmouse/) · 99designs: [RebelMouse logo contest](https://99designs.com/logo-design/contests/create-logo-rebelmouse-96558) · VectorLogoZone: [RebelMouse logos](https://www.vectorlogo.zone/logos/rebelmouse/index.html)
* WebGPU support: [Wikipedia: WebGPU](https://en.wikipedia.org/wiki/WebGPU) · [web.dev](https://web.dev/blog/webgpu-supported-major-browsers)
* Engine sizes: [Utsubo: three.js vs Babylon.js vs PlayCanvas (2026)](https://www.utsubo.com/blog/threejs-vs-babylonjs-vs-playcanvas-comparison)
* Rive runtime limits: [Rive docs: feature support](https://rive.app/docs/runtimes/features-support)
* Techniques: [Inigo Quilez articles](https://iquilezles.org/articles/) (smooth min, soft shadows, SDF normals, sphere occlusion and shadows) · [Khronos PBR Neutral](https://github.com/KhronosGroup/ToneMapping) · Estevez & Kulla, *Production Friendly Microfacet Sheen BRDF* (2017) · NVIDIA, *Fur (Shells and Fins)* · Andersen et al., *Hybrid fur rendering* (DTU) · t3ssel8r, *Giving Personality to Procedural Animations using Math*
