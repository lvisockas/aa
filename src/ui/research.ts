// In-app summary of the research. The long form lives in docs/RESEARCH.md.

export const researchHTML = `
<div class="doc">
  <p>Three AI-agent launches in eight weeks of 2026 all chose a <b>cute, toy-like face</b> for agents that act on
  your behalf. This studio rebuilds each visual language as a live, cursor-reactive 3D avatar system, plus a
  family built around the RebelMouse mascot and a low-poly mash-up of the two.</p>

  <h3>OpenAI · Dots</h3>
  <p>Announced at DevDay (29 Sep 2026): always-on agents powered by GPT-6 Astra, each with its own cloud computer
  and browser. Every dot is a <b>plush, blobby character</b>. Simple silhouettes, fuzzy surfaces, tiny eyes and one
  recognisable accessory carry the personality.</p>
  <ul>
    <li>Default <b>Dottie</b>: a green bean with two diamond eyes. In the demos: <b>Felipe</b> (blue cloud, beret),
    <b>Alfred</b> (yellow pear/triangle, glasses, bow tie), <b>Todd</b> (smiling frog), <b>Jojo</b> (heart, sunglasses), a bunny with headphones.</li>
    <li>Customise name, shape, colour, eyes, glasses and accessories at any time.</li>
    <li>State-driven animation (as analysed by motion designers): idle, listening, processing, working, speaking,
    awaiting approval, complete, error.</li>
  </ul>

  <h3>xAI · Grok Bot</h3>
  <p>Grok Bot (beta 11 Aug 2026) treats agents as a persistent roster. The default avatar is
  <b>“a colored geometric shape with two slit eyes”</b> in 8 base shapes (circle, oval, rounded square, pill,
  triangle, hexagon, cloud, teardrop), reported with 12 colours and 16 expressions.</p>
  <ul>
    <li><b>Motion is the status channel:</b> calm and slightly curious at rest, acknowledges new work, “kicks into
    gear” while working, changes when waiting or blocked, settles when done. It should be recognisable
    almost peripherally.</li>
    <li>xAI explored initials, emoji, pixel art, watercolour, claymorphism and identicons before choosing shapes and eyes.</li>
  </ul>

  <h3>Meta · Muse (“Jolly”)</h3>
  <p>Shown at Connect (Sep 2026), Muse's default mascot <b>Jolly</b> is cream-coloured with beady black eyes, an
  upward smile, pink cheeks and plush ivory fur. It is Labubu-esque, designed by Alex Cornell. Users customise
  the name, appearance and attire, with matching animations, such as tapping a keyboard while working. It also
  lives on the <b>Muse Charm</b> keychain (2" OLED).</p>
  <ul>
    <li>Meta animates it server-side with <b>Muse Realtime Avatar</b>, a distilled audio-driven diffusion
    transformer streaming 448×768 at 25 fps.</li>
  </ul>

  <h3>RebelMouse · the Rebels</h3>
  <p>RebelMouse is the publishing platform founded in 2012 by former Huffington Post CTO Paul Berry. Its 2026
  pitch is an <b>agentic CMS</b>, where AI agents assist, optimise and repurpose content inside the CMS, behind
  roles, audit logs and review gates. Its mascot is <b>“a mouse with a red bandanna holding a pride flag”</b>.</p>
  <ul>
    <li>The original mouse plus a <b>panda</b>, a <b>raccoon</b> and a <b>fox</b> share one chibi rig. Ears, muzzle, markings and
    tail carry each species: tilted teardrop patches, a bandit mask, a white-tipped brush.</li>
    <li>The bandana works as a headband, cap or neckerchief. Characters can hold a flag, megaphone, newspaper or
    pencil, in a vinyl-toy, plush or flat-logo finish. A “rebel attitude” slider sets brows, lids and smirk.</li>
    <li>States follow the CMS loop: planning, creating on a laptop, optimizing with spinning gears, publishing
    with the flag up and the megaphone aimed at you, growing, and sleeping with the tail curled.</li>
    <li>The logo image itself couldn't be fetched here, so proportions and the grey body interpret the text
    description.</li>
  </ul>

  <h3>Polydots · a low-poly mash-up</h3>
  <p>An original fifth family: Dots silhouettes with the mouse's ears, tail and bandana, cut into <b>true low
  poly</b>. Each body is a union of faceted ellipsoids, the intersection of tangent planes along an
  icosahedron's 20 face normals and 12 vertex directions, so the silhouette is polygonal and every face is
  flat. A facet slider slides the look from soccer ball to pure icosahedron, shapes morph through intermediate
  polyhedra, and the CPU mirrors the field to anchor gem eyes, nose and ears on the actual facets.</p>

  <h3>Doodles · five 2D art styles</h3>
  <p>Five 2D characters, each in its own simple style: Mochi in <b>flat vector</b>, Scribble in <b>ink doodle</b>
  (lines that boil like hand-drawn animation), Bit in <b>pixel art</b>, Fern in <b>paper cut-out</b> and Ribbit in
  <b>risograph</b> (two inks overprinted, halftone, misregistration). Any character can wear any style, and they
  share the 3D families' brain: gaze, blinks, boops, states.</p>

  <h3>Clawd · Claude Code's terminal crab</h3>
  <p>The 8-bit crab Claude Code greets you with, rebuilt from its quadrant-block artwork at its true resolution:
  a 16-column body, tall slit eyes, arm nubs and four legs in terracotta. Everything moves in whole pixels, the
  way pixel art animates. The eyes step towards your cursor, the legs scuttle, the arms type, and squash drops
  whole rows. A terminal status line runs a sparkle spinner with a playful verb while it works.</p>

  <h3>Faces · Notion-style portraits</h3>
  <p>Black-and-white portraits in the style of Notion's avatar maker: one even line weight, solid ink hair, dot
  eyes, no shading. Each face is assembled from parts (face shape, hair, eyes, brows, nose, mouth, glasses, beard,
  freckles, accessories) and sits on an optional pastel disc. The features slide slightly towards your cursor, and
  states bring props drawn in the same line: thinking dots, a pencil and page, a check.</p>

  <h3>Why this renderer (and not three.js by default)</h3>
  <table>
    <tr><th>Option</th><th>Fit for these characters</th></tr>
    <tr><td><b>SDF ray-marching on raw WebGL2</b> <span class="pill">chosen</span></td><td>Characters are soft primitives blended together, so a signed distance field is their native form. Continuous shape morphs, squash and stretch, and poke dents come free. The field also gives soft shadows and AO, volumetric fur fits naturally, and it ships as one ~240 KB file (about 80 KB gzipped) with zero dependencies.</td></tr>
    <tr><td>three.js / Babylon / PlayCanvas</td><td>Excellent mesh engines, but blobby morphing shapes need re-meshing or morph targets, plus shadow maps, SSAO and shell geometry for fur. As a full-screen quad they add little.</td></tr>
    <tr><td>Rive / Lottie</td><td>Great 2D state machines (Dots-style UI loops), but not 3D.</td></tr>
    <tr><td>Pre-rendered, video or neural</td><td>Photoreal (Meta's own path), but no live customisation or pointer physics, and the payload is heavy.</td></tr>
    <tr><td>Gaussian splats</td><td>Captured, not parametric. Can't change shape or outfit.</td></tr>
    <tr><td>WebGPU</td><td>The same algorithms would port easily, but it covers about 87% of users (Firefox on Linux and Android is still missing) and headless CI is harder. WebGL2 today, with WGSL as the upgrade path.</td></tr>
  </table>

  <p><b>Hybrid by design.</b> Ray marching suits the soft, morphing, furry characters, but it was the wrong tool
  for the low-poly Polydots (16 fps on a laptop GPU). They are now rasterised as triangles inside the same
  renderer, under the same lights, and the Doodles use Canvas2D. Each family gets the technique that fits it.</p>

  <h3>Under the hood</h3>
  <ul>
    <li>One full-window canvas renders every stage with scissored viewports. Each character is marched in its own local frame, with bounding-sphere culling.</li>
    <li>Fur is a volumetric shell, integrated front-to-back using a mipmapped strand-coverage texture, triplanar projection, clumping and droop.</li>
    <li>A per-frame GPU <i>anchor pass</i> ray-casts each Dots body, so eyes, glasses, hats and bow ties sit on any shape, even mid-morph.</li>
    <li>Picking uses the same distance fields, so clicks land exactly and dent the surface where you boop.</li>
    <li>Soft shadows tolerate penetration (Quilez). Fabrics use Charlie sheen, colour uses Khronos PBR Neutral tone mapping, and analytic sphere occluders give ground shadows.</li>
    <li>Motion uses second-order dynamics for gaze, body and squash, with per-family “personality” constants and blink-masked expression swaps.</li>
  </ul>

  <h3>Sources</h3>
  <ul class="src">
    <li><a href="https://techcrunch.com/2026/09/29/openai-launches-dots-its-bubbly-agentic-avatar/" target="_blank" rel="noopener">TechCrunch: OpenAI launches Dots</a></li>
    <li><a href="https://www.fastcompany.com/91615068/openai-dots-agent-crew-of-friendly-mascots" target="_blank" rel="noopener">Fast Company: Dots' crew of friendly mascots</a></li>
    <li><a href="https://sfstandard.com/2026/09/29/openai-launches-dots/" target="_blank" rel="noopener">SF Standard: OpenAI launches cute, capable agents</a></li>
    <li><a href="https://dev.to/uianimation/chatgpt-dots-by-openai-building-expressive-ai-assistants-with-rive-animation-2m7g" target="_blank" rel="noopener">DEV: Dots state animation breakdown (third party)</a></li>
    <li><a href="https://x.ai/news/designing-grok-bot" target="_blank" rel="noopener">xAI: Designing Grok Bot for a world of persistent agents</a></li>
    <li><a href="https://www.grokbotexplained.app/avatar-system" target="_blank" rel="noopener">Grok Bot avatar system (unofficial explainer)</a></li>
    <li><a href="https://www.axios.com/2026/09/25/ai-doom-meta-muse-mascot" target="_blank" rel="noopener">Axios: Meta gives Muse an adorable mascot</a></li>
    <li><a href="https://www.nbcnews.com/tech/tech-news/meta-muse-ai-agent-response-animated-avatar-cute-rcna599736" target="_blank" rel="noopener">NBC News: It's cute. It's cuddly.</a></li>
    <li><a href="https://the-gadgeteer.com/2026/09/24/meta-muse-charm-ai-assistant-keychain/" target="_blank" rel="noopener">The Gadgeteer: Muse Charm keychain</a></li>
    <li><a href="https://runtimewire.com/article/meta-muse-realtime-avatar" target="_blank" rel="noopener">Runtime Wire: Muse Realtime Avatar</a></li>
    <li><a href="https://designcompass.org/en/2026/09/30/why-ai-agents-are-getting-cute/" target="_blank" rel="noopener">Design Compass: Why AI agents are getting cute</a></li>
    <li><a href="https://tympanus.net/codrops/2026/05/05/reverse-engineering-claude-ais-mascot-animations-with-svg-and-gsap/" target="_blank" rel="noopener">Codrops: reverse-engineering Claude's mascot animations</a></li>
    <li><a href="https://www.rebelmouse.com/creative-agency" target="_blank" rel="noopener">RebelMouse: creative agency (the mascot)</a></li>
    <li><a href="https://www.rebelmouse.com/2026-platform-updates" target="_blank" rel="noopener">RebelMouse: 2026 platform updates (agentic CMS)</a></li>
    <li><a href="https://www.americanexpress.com/us/small-business/openforum/articles/a-huffpo-veteran-creates-a-new-content-management-site/" target="_blank" rel="noopener">OPEN Forum: a HuffPo veteran creates RebelMouse</a></li>
    <li><a href="https://iquilezles.org/articles/" target="_blank" rel="noopener">Inigo Quilez: SDF, soft shadow and smooth-min articles</a></li>
  </ul>
</div>`;
