// ---------------------------------------------------------------------------
// Mesh families: flat-shaded facets under the shared studio lights.
// Prepended at load: common_head.glsl + lighting.glsl.
// ---------------------------------------------------------------------------
in vec3 vWorld;
in vec3 vLocal;
in vec3 vCol;
flat in float vMat;
in vec2 vUv;

uniform vec4 uFinish;   // x: finish (0 paper, 1 gem, 2 toy), y: blush
uniform vec4 uCheekL;
uniform vec4 uCheekR;

float sd2UC(vec2 p, float r1, float r2, float h) {
  p.x = abs(p.x);
  float b = (r1 - r2) / h, a = sqrt(1.0 - b * b);
  float k = dot(p, vec2(-b, a));
  if (k < 0.0) return length(p) - r1;
  if (k > a * h) return length(p - vec2(0.0, h)) - r2;
  return dot(p, vec2(a, b)) - r1;
}
// brand flag: blue field, pink sash, a white mouse head (big round ears, tapered snout)
vec3 brandFlag(vec2 uv) {
  vec2 g = (uv - 0.5) * vec2(0.3, 0.19);
  vec3 col = vec3(0.02, 0.24, 0.43);
  if (abs(g.y + g.x * 0.3) < 0.02) col = vec3(1.0, 0.07, 0.72);
  vec2 m = g * 0.95;
  float head = sd2UC(vec2(m.x, -(m.y - 0.006)), 0.025, 0.007, 0.036);
  float ears = length(vec2(abs(m.x) - 0.029, m.y - 0.022)) - 0.019;
  if (min(head, ears) < 0.0) col = vec3(0.95);
  return col;
}

vec4 ground() {
  vec3 g = vWorld;
  float sh = 1.0, ao = 1.0, near = 1e9;
  for (int k = 0; k < MAXC * 3; k++) {
    if (k >= uCount * 3) break;
    vec4 s = uOcc[k];
    if (s.w <= 0.0) continue;
    sh *= sphSoftShadow(g, uKey.xyz, s, 2.2);
    ao *= 1.0 - sat(sphOcclusion(g, vec3(0.0, 1.0, 0.0), s));
    near = min(near, length(g.xz - s.xz) / max(s.w, 1e-3));
  }
  float dark = 1.0 - mix(1.0, sh, 0.45) * mix(1.0, ao, 0.9);
  dark *= 1.0 - smoothstep(2.2, 5.0, near);
  dark *= smoothstep(0.0, 0.12, gl_FragCoord.y / uView.w);
  return vec4(0.0, 0.0, 0.0, sat(dark) * uStage.y);
}

void main() {
  if (vMat < 0.0) {
    outColor = ground();
    return;
  }
  // flat facet normal straight from the rasterised triangle
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 V = normalize(uCamPos - vWorld);
  if (dot(n, V) < 0.0) n = -n;
  int m = int(vMat + 0.5);
  Surf s = surfDefault(vCol, n);
  bool finished = m <= 1;
  if (m == 1 && uFinish.y > 0.0) {
    float b = max(exp(-dot(vLocal - uCheekL.xyz, vLocal - uCheekL.xyz) * 420.0),
                  exp(-dot(vLocal - uCheekR.xyz, vLocal - uCheekR.xyz) * 420.0));
    s.alb = mix(s.alb, vec3(1.0, 0.45, 0.55), b * uFinish.y * 0.7);
  }
  if (m == 2) { s.alb = vec3(0.01); s.rough = 0.08; s.f0 = 0.07; s.clear = 1.0; }
  else if (m == 3) { s.rough = 0.6; }
  else if (m == 4) { s.rough = 0.25; s.clear = 0.7; }
  else if (m == 5) { s.rough = 0.7; }
  else if (m == 6) { s.rough = 0.3; s.clear = 0.5; }
  else if (m == 7) { s.metal = 1.0; s.rough = 0.3; }
  else if (m == 8) { s.rough = 0.8; s.flatK = 0.3; }
  else if (m == 9) { s.alb = brandFlag(vUv); s.rough = 0.8; s.flatK = 0.3; }
  else if (m == 10) { s.rough = 0.2; s.clear = 0.8; s.metal = 0.6; }
  if (finished) {
    int fin = int(uFinish.x + 0.5);
    if (fin == 0) { s.rough = 0.85; s.wrap = 0.2; s.flatK = 0.3; }
    else if (fin == 1) { s.rough = 0.12; s.clear = 0.9; s.wrap = 0.55; s.f0 = 0.06; }
    else { s.rough = 0.3; s.clear = 0.5; s.wrap = 0.3; }
  }
  // soft contact darkening near the floor stands in for ray-marched AO
  float ao = mix(0.72, 1.0, smoothstep(0.0, 0.22, vLocal.y));
  vec3 col = shade(s, n, V, 1.0, ao);
  col = lin2srgb(pbrNeutral(col * uStage.z));
  float dither = (hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5) / 255.0;
  outColor = vec4(col + dither, 1.0);
}
