// ---------------------------------------------------------------------------
// Shared header for every avatar family shader.
// Layout of a family program:  common_head.glsl + <family>.glsl + common_main.glsl
// Units: one "character unit" ~= the height of an avatar. Local space has its
// origin at the ground contact point, +Y up, +Z towards the viewer.
// ---------------------------------------------------------------------------
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;

out vec4 outColor;

#define MAXC 10
#define PI 3.14159265
#define TAU 6.28318531
// non-constant zero: stops compilers from unrolling heavy loops (compile time!)
#define ZERO min(uCount, 0)

uniform vec4  uView;        // xy: viewport origin (GL px), zw: viewport size (px)
uniform vec3  uCamPos;
uniform mat3  uCamRot;      // columns: right, up, forward
uniform float uFocal;       // 1 / tan(fov/2)
uniform float uPixAng;      // pixel footprint at unit distance
uniform vec2  uShift;       // off-axis lens shift (uv units)
uniform float uTime;
uniform int   uMode;        // 0 render, 1 pick, 2 anchors
uniform vec2  uPickPx;      // viewport-relative pick pixel (GL convention)
uniform int   uCount;
uniform vec4  uXf[MAXC];    // world position xyz, uniform scale w
uniform vec4  uRot[MAXC];   // quaternion local -> world
uniform vec4  uSq[MAXC];    // squash & stretch xyz (pivot at local origin)
uniform vec4  uBnd[MAXC];   // world space bounding sphere
uniform vec4  uOcc[MAXC * 3]; // world space occluder spheres (ground shadows)
uniform sampler2D uData;    // family parameters, texel (k, i)
uniform sampler2D uStrand;  // fur cross-section coverage, mipmapped
uniform sampler3D uNoise;   // tileable value noise, 4 channels
uniform sampler2D uAnchors; // anchor pass output, texel (k, i)
uniform int   uHasAnchors;
uniform vec4  uKey;         // key light dir (world, normalized) + intensity
uniform vec4  uRim;         // rim light dir + intensity
uniform vec4  uFill;        // fill light dir + intensity
uniform vec3  uSky;         // hemisphere ambient (top)
uniform vec3  uGround;      // hemisphere ambient (bottom)
uniform vec4  uStage;       // x: dark stage, y: ground shadow strength, z: exposure, w: ground height
uniform vec4  uQual;        // x: march steps, y: fur steps, z: shadow steps, w: AO taps
uniform vec4  uWarm;        // key light colour rgb, w: env reflection strength

// ------------------------------------------------------------------ helpers
float sat(float x) { return clamp(x, 0.0, 1.0); }
vec3  sat(vec3 x)  { return clamp(x, 0.0, 1.0); }
float sq(float x)  { return x * x; }
float maxc(vec3 v) { return max(v.x, max(v.y, v.z)); }
float minc(vec3 v) { return min(v.x, min(v.y, v.z)); }
mat2  rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
vec3 qinv(vec4 q, vec3 v) { return qrot(vec4(-q.xyz, q.w), v); }

vec4 D(int i, int k) { return texelFetch(uData, ivec2(k, i), 0); }

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

// Tileable value noise from a small 3D texture (hardware trilinear).
vec4  noise4(vec3 p) { return textureLod(uNoise, p, 0.0); }
float noise(vec3 p)  { return textureLod(uNoise, p, 0.0).x; }
float fbm(vec3 p) {
  vec4 a = textureLod(uNoise, p, 0.0);
  vec4 b = textureLod(uNoise, p * 2.03 + 0.37, 0.0);
  return a.x * 0.5 + b.y * 0.3 + a.z * 0.2;
}

// ------------------------------------------------------------ smooth blends
float smin(float a, float b, float k) {
  k *= 4.0;
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
// returns (distance, blend factor towards b)
vec2 sminB(float a, float b, float k) {
  float h = 1.0 - min(abs(a - b) / (4.0 * k), 1.0);
  float w = h * h;
  float m = w * 0.5;
  float s = w * k;
  return (a < b) ? vec2(a - s, m) : vec2(b - s, 1.0 - m);
}

// ------------------------------------------------------------- 3D primitives
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-6);
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = sat(dot(pa, ba) / dot(ba, ba));
  return length(pa - ba * h) - r;
}
// capsule with radius interpolated from ra (at a) to rb (at b)
float sdCapsuleT(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 pa = p - a, ba = b - a;
  float h = sat(dot(pa, ba) / dot(ba, ba));
  return length(pa - ba * h) - mix(ra, rb, h);
}
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a;
  float l2 = dot(ba, ba);
  float rr = r1 - r2;
  float a2 = l2 - rr * rr;
  float il2 = 1.0 / l2;
  vec3 pa = p - a;
  float y = dot(pa, ba);
  float z = y - l2;
  vec3 xv = pa * l2 - ba * y;
  float x2 = dot(xv, xv);
  float y2 = y * y * l2;
  float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
float sdTorus(vec3 p, float R, float r) { return length(vec2(length(p.xz) - R, p.y)) - r; }
// torus lying in the XY plane (ring facing +Z)
float sdTorusZ(vec3 p, float R, float r) { return length(vec2(length(p.xy) - R, p.z)) - r; }
float sdCappedTorus(vec3 p, vec2 sc, float ra, float rb) {
  p.x = abs(p.x);
  float k = (sc.y * p.x > sc.x * p.y) ? dot(p.xy, sc) : length(p.xy);
  return sqrt(max(dot(p, p) + ra * ra - 2.0 * ra * k, 0.0)) - rb;
}
float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(maxc(q), 0.0) - r;
}
float sdCylinderY(vec3 p, float r, float h) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
float sdRoundCylY(vec3 p, float r, float h, float rb) {
  vec2 d = vec2(length(p.xz) - r + rb, abs(p.y) - h + rb);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - rb;
}
float sdCappedCone(vec3 p, float h, float r1, float r2) {
  vec2 q = vec2(length(p.xz), p.y);
  vec2 k1 = vec2(r2, h);
  vec2 k2 = vec2(r2 - r1, 2.0 * h);
  vec2 ca = vec2(q.x - min(q.x, (q.y < 0.0) ? r1 : r2), abs(q.y) - h);
  vec2 cb = q - k1 + k2 * sat(dot(k1 - q, k2) / dot(k2, k2));
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}
float sdOctahedron(vec3 p, float s) {
  p = abs(p);
  return (p.x + p.y + p.z - s) * 0.57735027;
}

// ------------------------------------------------------------- 2D primitives
float sd2Circle(vec2 p, float r) { return length(p) - r; }
float sd2Box(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float sd2RoundBox(vec2 p, vec2 b, float r) { return sd2Box(p, b - r) - r; }
float sd2Segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = sat(dot(pa, ba) / dot(ba, ba));
  return length(pa - ba * h);
}
float sd2Arc(vec2 p, vec2 sc, float ra, float rb) {
  p.x = abs(p.x);
  return ((sc.y * p.x > sc.x * p.y) ? length(p - sc * ra) : abs(length(p) - ra)) - rb;
}
float sd2Hexagon(vec2 p, float r) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}
float sd2Triangle(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
float sd2Polygon(vec2 p, float r, float n) {
  // regular polygon with a flat bottom edge
  float an = PI / n;
  float bn = mod(atan(p.x, -p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= r * vec2(cos(an), sin(an));
  p.y += clamp(-p.y, 0.0, r * sin(an));
  return length(p) * sign(p.x);
}
float sd2Heart(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot(p - vec2(0.25, 0.75), p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  return sqrt(min(dot(p - vec2(0.0, 1.0), p - vec2(0.0, 1.0)),
                  dot(p - 0.5 * max(p.x + p.y, 0.0), p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}
float sd2Star5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0, 1);
  float h = sat(dot(p, ba) / dot(ba, ba));
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
// circle of radius r1 at the origin blended into a circle r2 at (0, h)
float sd2UnevenCapsule(vec2 p, float r1, float r2, float h) {
  p.x = abs(p.x);
  float b = (r1 - r2) / h;
  float a = sqrt(1.0 - b * b);
  float k = dot(p, vec2(-b, a));
  if (k < 0.0) return length(p) - r1;
  if (k > a * h) return length(p - vec2(0.0, h)) - r2;
  return dot(p, vec2(a, b)) - r1;
}

// Rounded extrusion of a 2D distance along Z with half depth h.
float opExtrude(float d2, float z, float h) {
  vec2 w = vec2(d2, abs(z) - h);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
}

// ------------------------------------------------------------------ colour
vec3 pbrNeutral(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 lin2srgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// ------------------------------------------------------------ materials
float gFoot;   // local-space pixel footprint at the current shading point

struct Surf {
  vec3  alb;
  float rough;
  float metal;
  float f0;
  float sheen;
  float clear;
  float wrap;
  float flatK;
  vec3  emis;
  vec3  n;      // shading normal (local frame)
};

Surf surfDefault(vec3 alb, vec3 n) {
  Surf s;
  s.alb = alb; s.rough = 0.5; s.metal = 0.0; s.f0 = 0.04; s.sheen = 0.0;
  s.clear = 0.0; s.wrap = 0.0; s.flatK = 0.0; s.emis = vec3(0.0); s.n = n;
  return s;
}

// fur look at a point (families with HAS_FUR)
struct Fur {
  vec3  root;   // colour at the base of the pile
  vec3  tip;    // colour at the tips
  float dens;   // optical density multiplier
  float scale;  // strand tiles per local unit
  float clump;  // clumping / waviness
  float droop;  // gravity bend
  float sheen;  // rim backscatter strength
  float occ;    // darkness at the root
};

