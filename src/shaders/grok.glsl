// ---------------------------------------------------------------------------
// Grok Bot family: inflated geometric shapes with vector "slit" eyes.
// The face is a 2D signed-distance decal evaluated at shading time, so eyes can
// morph between any expression without touching the geometry.
// ---------------------------------------------------------------------------
#define HAS_FUR 0

struct Char {
  vec4 sa;    // shape A: id, roundness, aspect, extra (polygon sides / cloud lobes)
  vec4 sb;    // shape B (morph target)
  vec4 sh;    // morph t, tilt, half thickness, inflate
  vec4 col;   // body colour (linear), material mode
  vec4 eL;    // left eye centre xy, size wh
  vec4 eR;    // right eye
  vec4 aL;    // left eye: rotation, kind, lid amount, lid angle
  vec4 aR;    // right eye
  vec4 eC;    // eye colour, lower lid amount
  vec4 poke;  // dent centre xyz, amplitude
  vec4 wob;   // jelly wobble: amplitude, phase, frequency, -
  vec4 props; // orbit rings, ring phase, thinking dots, dot phase
  vec4 mods;  // bulge, wave amplitude, wave count, wave phase
  vec4 ex;    // eye bevel, -, -, -
  vec4 rc;    // prop colour
};

Char loadChar(int i) {
  Char c;
  c.sa = D(i, 0); c.sb = D(i, 1); c.sh = D(i, 2); c.col = D(i, 3);
  c.eL = D(i, 4); c.eR = D(i, 5); c.aL = D(i, 6); c.aR = D(i, 7);
  c.eC = D(i, 8); c.poke = D(i, 9); c.wob = D(i, 10); c.props = D(i, 11);
  c.mods = D(i, 12); c.ex = D(i, 13); c.rc = D(i, 14);
  return c;
}

// 2D silhouette of a preset, roughly fitting [-0.5, 0.5]^2
float shape2D(vec4 s, vec4 mods, vec2 p) {
  int id = int(s.x + 0.5);
  float rnd = s.y;
  float asp = s.z;
  p.x /= asp;
  float d;
  if (id == 0) {                       // circle
    d = length(p) - 0.5;
  } else if (id == 1) {                // oval
    vec2 ab = vec2(0.6, 0.42);
    float k0 = length(p / ab), k1 = length(p / (ab * ab));
    d = k0 * (k0 - 1.0) / k1;
  } else if (id == 2) {                // rounded square
    float r = mix(0.06, 0.3, rnd);
    d = sd2RoundBox(p, vec2(0.45), r);
  } else if (id == 3) {                // pill
    d = sd2Segment(p, vec2(-0.21, 0.0), vec2(0.21, 0.0)) - 0.3;
  } else if (id == 4) {                // triangle
    float r = mix(0.05, 0.2, rnd);
    d = sd2Triangle(p - vec2(0.0, -0.07), 0.6 - r * 1.7) - r;
  } else if (id == 5) {                // hexagon
    float r = mix(0.04, 0.18, rnd);
    d = sd2Hexagon(p, 0.46 - r) - r;
  } else if (id == 6) {                // cloud
    float k = 0.07;
    d = length(p - vec2(0.0, 0.07)) - 0.3;
    d = smin(d, length(p - vec2(-0.27, -0.06)) - 0.22, k);
    d = smin(d, length(p - vec2(0.27, -0.05)) - 0.23, k);
    d = smin(d, length(p - vec2(-0.13, 0.21)) - 0.2, k);
    d = smin(d, length(p - vec2(0.15, 0.2)) - 0.21, k);
    d = smin(d, sd2RoundBox(p - vec2(0.0, -0.17), vec2(0.36, 0.12), 0.11), k);
  } else if (id == 7) {                // teardrop
    d = sd2UnevenCapsule(p - vec2(0.0, -0.14), 0.36, 0.045, 0.56);
  } else {                             // regular polygon with s.w sides
    float n = clamp(s.w, 3.0, 12.0);
    float r = mix(0.04, 0.2, rnd);
    d = sd2Polygon(p, 0.56 - r * 1.3, n) - r;
  }
  d *= min(asp, 1.0);
  // shape modifiers: bulge towards a circle, radial waves
  if (mods.x > 0.0) d = mix(d, length(p * vec2(asp, 1.0)) - 0.5, mods.x);
  if (mods.y > 0.0) {
    float an = atan(p.y, p.x);
    d -= mods.y * cos(an * mods.z + mods.w) * smoothstep(0.0, 0.25, length(p));
  }
  return d;
}

vec2 faceFrame(Char c, vec3 q) {
  vec2 p = q.xy - vec2(0.0, 0.5);
  return rot2(-c.sh.y) * p;
}

float silhouette(Char c, vec2 p) {
  float d2 = shape2D(c.sa, c.mods, p);
  if (c.sh.x > 0.001) d2 = mix(d2, shape2D(c.sb, c.mods, p), c.sh.x);
  return d2;
}

float bodyDist(Char c, vec3 q) {
  vec2 p = faceFrame(c, q);
  p.x += c.wob.x * sin(p.y * c.wob.z + c.wob.y);
  float d2 = silhouette(c, p);
  float H = c.sh.z;
  // Dome the faces beyond the rounded rim. The interior distance of polygons
  // has ridges along the medial axis; a 4-tap blur rounds them off so the
  // dome stays crease-free for every silhouette, morph and modifier.
  float bul = 0.0;
  if (c.sh.w > 0.0 && d2 < -H) {
    float inner = -d2;
    if (abs(q.z) < H + c.sh.w + 0.12) {
      const float r = 0.075;
      inner = -0.25 * (silhouette(c, p + vec2(r, 0.0)) + silhouette(c, p - vec2(r, 0.0)) +
                       silhouette(c, p + vec2(0.0, r)) + silhouette(c, p - vec2(0.0, r)));
    }
    float x = max(inner - H, 0.0);
    bul = c.sh.w * (1.0 - exp(-x * x * 20.0));
  }
  float d = length(vec2(max(d2 + H, 0.0), max(abs(q.z) - bul, 0.0))) - H;
  vec3 dp = q - c.poke.xyz;
  d += c.poke.w * exp(-dot(dp, dp) * 55.0);
  return d;
}

// orbit rings and "thinking" dots; id: 1 ring, 2 dot
float propsDist(Char c, vec3 q, out int id) {
  id = 0;
  float d = 1e5;
  vec3 r = q - vec3(0.0, 0.5, 0.0);
  if (c.props.x > 0.01 && length(r) < 1.0) {
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      vec3 rr = r;
      rr.xz = rot2(c.props.y * (fk * 2.0 - 1.0) * 0.6 + fk * 1.7) * rr.xz;
      rr.xy = rot2(0.55 + fk * 0.9) * rr.xy;
      float tr = sdTorus(rr, 0.74 + 0.05 * fk, 0.013 * c.props.x);
      // a satellite riding each ring
      float an = c.props.y * (1.6 + fk * 0.7) + fk * 2.4;
      vec3 sp = vec3(cos(an), 0.0, sin(an)) * (0.74 + 0.05 * fk);
      tr = min(tr, length(rr - sp) - 0.045 * c.props.x);
      if (tr < d) { d = tr; id = 1; }
    }
  }
  if (c.props.z > 0.01) {
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float bob = sin(c.props.w - fk * 0.9);
      vec3 cpos = vec3((fk - 1.0) * 0.15, 0.62 + 0.06 * max(bob, 0.0), 0.0);
      float dd = length(r - cpos) - 0.042 * c.props.z * (0.85 + 0.15 * bob);
      if (dd < d) { d = dd; id = 2; }
    }
  }
  return d;
}

float mapHard(Char c, vec3 q) {
  int id;
  return min(bodyDist(c, q), propsDist(c, q, id));
}

float eyeShape(vec2 p, vec4 e, vec4 a, float lidB) {
  vec2 q = p - e.xy;
  vec2 r = rot2(-a.x) * q;
  float k = a.y;
  float w = e.z, h = e.w;
  float d;
  if (k < 0.5) {               // pill / slit
    float rad = 0.5 * min(w, h);
    d = sd2Box(r, vec2(max(0.5 * w - rad, 0.0), max(0.5 * h - rad, 0.0))) - rad;
  } else if (k < 1.5) {        // oval
    vec2 ab = 0.5 * vec2(w, h);
    d = (length(r / ab) - 1.0) * min(ab.x, ab.y);
  } else if (k < 2.5) {        // happy arc
    float ra = 0.5 * h;
    d = sd2Arc(r + vec2(0.0, ra * 0.45), vec2(sin(1.05), cos(1.05)), ra, 0.5 * w);
  } else if (k < 3.5) {        // closed line
    d = sd2Segment(r, vec2(-0.5 * h, 0.0), vec2(0.5 * h, 0.0)) - 0.5 * w;
  } else if (k < 4.5) {        // X
    float s = 0.5 * h * 0.7071;
    d = min(sd2Segment(r, vec2(-s, -s), vec2(s, s)), sd2Segment(r, vec2(-s, s), vec2(s, -s))) - 0.5 * w;
  } else if (k < 5.5) {        // chevron
    float s = 0.5 * h;
    d = min(sd2Segment(r, vec2(-s * 0.55, s * 0.8), vec2(s * 0.55, 0.0)),
            sd2Segment(r, vec2(-s * 0.55, -s * 0.8), vec2(s * 0.55, 0.0))) - 0.5 * w;
  } else if (k < 6.5) {        // heart
    d = sd2Heart(r / h + vec2(0.0, 0.5)) * h;
  } else if (k < 7.5) {        // star
    d = sd2Star5(r, 0.6 * h, 0.45);
  } else if (k < 8.5) {        // spiral
    float rr = length(r);
    float an = atan(r.y, r.x);
    float b = h * 0.075;
    float m = mod(rr / b - an + PI, TAU) - PI;
    d = max(abs(m) * b - 0.5 * w, rr - 0.5 * h);
  } else {                     // sad / content arc
    float ra = 0.5 * h;
    d = sd2Arc(vec2(r.x, -r.y) + vec2(0.0, ra * 0.45), vec2(sin(1.05), cos(1.05)), ra, 0.5 * w);
  }
  if (a.z > 0.001) {
    vec2 lq = rot2(a.w) * q;
    d = max(d, lq.y - (0.5 * h - a.z * h));
  }
  if (lidB > 0.001) d = max(d, -(q.y + 0.5 * h - lidB * h));
  return d;
}

float eyesDist(Char c, vec2 p) {
  return min(eyeShape(p, c.eL, c.aL, c.eC.w), eyeShape(p, c.eR, c.aR, c.eC.w));
}

Surf surfAt(Char c, vec3 q, vec3 n) {
  int pid;
  float dp = propsDist(c, q, pid);
  float db = bodyDist(c, q);
  if (dp < db) {
    Surf s = surfDefault(pid == 1 ? c.rc.rgb : c.eC.rgb, n);
    s.rough = 0.3;
    s.clear = 0.6;
    s.flatK = int(c.col.w + 0.5) == 0 ? 0.8 : 0.0;
    return s;
  }
  int mode = int(c.col.w + 0.5);
  Surf s = surfDefault(c.col.rgb, n);
  if (mode == 0) {          // flat / graphic
    s.flatK = 1.0;
  } else if (mode == 1) {   // soft-touch vinyl
    s.rough = 0.48; s.wrap = 0.45;
  } else if (mode == 2) {   // clay
    s.rough = 0.88; s.wrap = 0.3;
    vec3 g = noise4(q * 14.0).xyz - 0.5;
    s.n = normalize(n + 0.22 * g * (1.0 - abs(n.z) * 0.3));
  } else {                  // glossy candy
    s.rough = 0.28; s.clear = 0.9; s.wrap = 0.2;
  }

  // vector face decal on the front surface
  vec2 p = faceFrame(c, q);
  float front = smoothstep(0.08, 0.42, n.z);
  float de = eyesDist(c, p);
  float aa = gFoot * 0.9 / max(n.z, 0.3);
  float m = (1.0 - smoothstep(-aa, aa, de)) * front;
  if (m > 0.0) {
    s.alb = mix(s.alb, c.eC.rgb, m);
    s.rough = mix(s.rough, 0.2, m * (1.0 - s.flatK));
    s.clear = mix(s.clear, 0.6, m * (1.0 - s.flatK));
    // enamel bevel: tilt the normal across the edge of the inlay
    float e = 0.004;
    vec2 g = vec2(eyesDist(c, p + vec2(e, 0.0)) - eyesDist(c, p - vec2(e, 0.0)),
                  eyesDist(c, p + vec2(0.0, e)) - eyesDist(c, p - vec2(0.0, e))) / (2.0 * e);
    float band = 1.0 - smoothstep(0.0, 0.02, abs(de + 0.006));
    vec2 gl = rot2(c.sh.y) * g;
    s.n = normalize(s.n - vec3(gl, 0.0) * band * c.ex.x * front);
  }
  return s;
}

vec4 anchorPass(ivec2 px) { return vec4(0.0); }
