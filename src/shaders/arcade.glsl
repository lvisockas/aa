// ---------------------------------------------------------------------------
// Chompers family: maze-arcade characters as glossy 3D toys.
//   kind 0 chomper: a sphere minus a wedge mouth (max(sphere, -wedge)), boots,
//          floating gloves; eyes sit high on the sphere as decals.
//   kind 1 ghost:   a dome over a short flared tube, cut by a rippling scalloped
//          hem; big eyes whose pupils roam inside the whites.
// Eyes, blush, sunglasses and the ghost mouth are colour decals in surfAt.
// Every optional part (boots, gloves, accessory, dots, fruit) is gated by a
// cheap bounding test so mapHard stays a sphere / dome in the common case.
// ---------------------------------------------------------------------------
#define HAS_FUR 0

struct Char {
  vec4 k;     // kind, facing yaw, mouth half angle, mouth tilt (down)
  vec4 col;   // body colour (linear), neon glow amount
  vec4 eL;    // left eye: centre (chomper: azimuth, elevation; ghost: x, y), half size w h
  vec4 eR;    // right eye
  vec4 aL;    // left eye: kind, lid, lid angle, pupil scale offset
  vec4 aR;    // right eye
  vec4 look;  // look x, look y, eyes on, cheeks
  vec4 acc;   // accessory id, colour
  vec4 sk;    // gear (chomper), hem scallops around (ghost), hem phase, hem amplitude
  vec4 poke;  // dent centre, amplitude
  vec4 fx;    // wobble amplitude, wobble phase, fright, flash
  vec4 props; // dots, dot scroll, fruit, time
  vec4 view;  // view direction (local frame), time
  vec4 mo;    // ghost mouth: smile, open; power-up; -
  vec4 glowC; // neon glow colour, pellet blink
  vec4 pup;   // pupil colour, highlight strength
  vec4 gear;  // boot colour, boot step swing
  vec4 gl;    // left glove centre (body frame, rel. body centre), radius (0 = off)
  vec4 gr;    // right glove
};

Char loadChar(int i) {
  Char c;
  c.k = D(i, 0); c.col = D(i, 1); c.eL = D(i, 2); c.eR = D(i, 3);
  c.aL = D(i, 4); c.aR = D(i, 5); c.look = D(i, 6); c.acc = D(i, 7);
  c.sk = D(i, 8); c.poke = D(i, 9); c.fx = D(i, 10); c.props = D(i, 11);
  c.view = D(i, 12); c.mo = D(i, 13); c.glowC = D(i, 14); c.pup = D(i, 15);
  c.gear = D(i, 16); c.gl = D(i, 17); c.gr = D(i, 18);
  return c;
}

const float CR = 0.42;   // chomper radius
const float CY = 0.5;    // chomper centre height
const float GR = 0.36;   // ghost dome radius
const float GY = 0.58;   // ghost dome centre height
const float SP = 0.2;    // dot spacing

bool isGhost(Char c) { return c.k.x > 0.5; }

// body frame: origin at the body centre, with the jelly wobble
vec3 bodyLocal(Char c, vec3 q) {
  vec3 b = q - vec3(0.0, isGhost(c) ? GY : CY, 0.0);
  b.x += c.fx.x * sin(b.y * 9.0 + c.fx.y);
  return b;
}
// character frame: +Z is where the character faces (mouth, eyes)
vec3 charFrame(Char c, vec3 b) {
  b.xz = rot2(c.k.y) * b.xz;
  return b;
}
vec3 charToBody(Char c, vec3 v) {
  v.xz = rot2(-c.k.y) * v.xz;
  return v;
}

// ------------------------------------------------------------------ chomper
// distance to the mouth wedge, extruded along x; w = (forward, up) in wedge space
float wedgeDist(Char c, vec3 p, out vec2 w) {
  w = rot2(c.k.w) * vec2(p.z + 0.04, p.y);
  float a = c.k.z;
  vec2 cs = vec2(cos(a), sin(a));
  vec2 m = vec2(w.x, abs(w.y));
  return dot(m, cs) < 0.0 ? length(m) : m.y * cs.x - m.x * cs.y;
}

float chomperBody(Char c, vec3 p) {
  vec2 w;
  float dw = wedgeDist(c, p, w);
  return smax(length(p) - CR, -dw, 0.012);
}

float bootsDist(Char c, vec3 p) {
  float sw = (p.x > 0.0 ? 1.0 : -1.0) * c.gear.w;
  vec3 b = vec3(abs(p.x) - 0.15, p.y + 0.425 - abs(sw) * 0.6, p.z - 0.05 - sw);
  b.yz = rot2(-0.12) * b.yz;
  return sdEllipsoid(b, vec3(0.088, 0.062, 0.128));
}

// a cartoon mitten: a puffy palm plus a thumb pointing up and inwards
float mitten(vec3 l, float r, float side) {
  float d = sdEllipsoid(l, vec3(1.0, 1.05, 0.85) * r);
  return smin(d, length(l - vec3(-side * 0.4, 0.5, 0.62) * r) - 0.42 * r, 0.01);
}
float glovesDist(Char c, vec3 b) {
  return min(mitten(b - c.gl.xyz, c.gl.w, -1.0), mitten(b - c.gr.xyz, c.gr.w, 1.0));
}

// ------------------------------------------------------------------ ghost
float ghostBody(Char c, vec3 p) {
  float rr = length(p.xz);
  float d = p.y > 0.0 ? length(vec2(rr, p.y)) - GR
                      : rr - GR - 0.045 * (1.0 - smoothstep(-0.47, -0.08, p.y));
  if (p.y < -0.24) {
    // scallops: rounded tips, sharp notches; the phase sways and flutters
    float an = atan(p.z, p.x);
    float sc = 1.0 - abs(cos(0.5 * c.sk.y * an + c.sk.z));
    float hem = -0.47 + c.sk.w * sc + 0.012 * sin(an * 3.0 + c.view.w * 4.0);
    d = smax(d, (hem - p.y) * 0.72, 0.02);
  }
  return d;
}

// ------------------------------------------------------------------ accessories
// top-of-head extras in the character frame (R = head radius)
vec3 bowFrame(vec3 p, float R) {
  vec3 b = p - vec3(-0.13, R * 0.86, 0.11);
  b.xy = rot2(-0.5) * b.xy;
  return b;
}
vec3 crownFrame(vec3 p, float R) {
  vec3 b = p - vec3(0.03, R + 0.02, -0.02);
  b.xy = rot2(0.2) * b.xy;
  return b;
}

float accDist(Char c, vec3 p, float R) {
  int id = int(c.acc.x + 0.5);
  if (id == 1) {
    vec3 b = bowFrame(p, R);
    float bb = dot(b, b);
    if (bb > 0.12) return sqrt(bb) - 0.17;
    vec3 l = vec3(abs(b.x) - 0.078, b.y, b.z);
    l.xy = rot2(0.3 * sign(b.x)) * l.xy;
    float d = sdEllipsoid(l, vec3(0.082, 0.06, 0.038));
    return smin(d, length(b) - 0.036, 0.008);
  }
  if (id == 2) {
    float sh = smax(length(p) - (R + 0.022), (0.66 * R + 0.22 * p.z) - p.y, 0.006);
    vec3 br = p - vec3(0.0, 0.8 * R, 0.8 * R);
    br.yz = rot2(-0.12) * br.yz;
    // brim: a thin rounded disc (a flat ellipsoid's distance bound is too loose for shadows)
    float e = (length(br.xz * vec2(1.0, 1.25)) - 0.17) * 0.8;
    float brim = opExtrude(e, br.y, 0.006) - 0.016;
    return min(sh, brim);
  }
  if (id == 4) {
    vec3 b = crownFrame(p, R);
    float bb = dot(b, b);
    if (bb > 0.1) return sqrt(bb) - 0.16;
    float rr = length(b.xz);
    float an = atan(b.z, b.x);
    float tooth = abs(fract(an * 5.0 / TAU) * 2.0 - 1.0);
    float top = 0.03 + 0.065 * tooth;
    float d = max(abs(rr - 0.112) - 0.013, max(-b.y - 0.045, b.y - top)) * 0.8;
    // little balls on the points
    float a = mod(an + TAU / 10.0, TAU / 5.0) - TAU / 10.0;
    return min(d, length(vec3(rr * cos(a) - 0.112, b.y - 0.1, rr * sin(a))) - 0.02);
  }
  return 1e5;
}

// ------------------------------------------------------------------ props
// dot row ahead of the mouth (character frame); big = power pellet
float dotsDist(Char c, vec3 p, float R, out float big) {
  big = 0.0;
  if (c.props.x < 0.01) return 1e5;
  // chompers eat the row; ghosts glide over it (it slides under the hem)
  bool gh = isGhost(c);
  vec3 r = p - vec3(0.0, gh ? -0.4 : -0.05, 0.0);
  float z0 = gh ? 0.2 : R * 0.62, z1 = 0.9;
  float zc = clamp(r.z, z0, z1);
  float bound = length(vec3(r.xy, r.z - zc)) - 0.07;
  if (bound > 0.04) return bound;
  float zz = r.z + c.props.y;
  float cell = floor(zz / SP);
  float lz = zz - (cell + 0.5) * SP;
  float zcen = r.z - lz;
  big = step(mod(cell, 5.0), 0.5);
  float rad = mix(0.03, 0.06, big) * smoothstep(z0, z0 + 0.09, zcen) * (1.0 - smoothstep(z1 - 0.2, z1, zcen)) * c.props.x;
  return length(vec3(r.xy, lz)) - rad;
}

vec3 fruitFrame(Char c, vec3 q) {
  vec3 r = q - vec3(0.6, 0.8 + 0.03 * sin(c.props.w * 2.2), 0.12);
  r.xz = rot2(0.6 * sin(c.props.w * 1.3)) * r.xz;
  return r / max(c.props.z, 0.05);
}

// bonus cherries beside the body (local frame); part 5 fruit, 6 stem / leaf
float fruitDist(Char c, vec3 q, out int part) {
  part = 5;
  if (c.props.z < 0.01) return 1e5;
  float s = max(c.props.z, 0.05);
  vec3 r = fruitFrame(c, q);
  float rb = dot(r, r);
  if (rb > 0.14) return (sqrt(rb) - 0.22) * s;
  float d1 = min(length(r - vec3(-0.058, -0.075, 0.0)), length(r - vec3(0.06, -0.095, 0.025))) - 0.068;
  float st = min(sdCapsule(r, vec3(-0.05, -0.015, 0.0), vec3(0.025, 0.115, -0.01), 0.008),
                 sdCapsule(r, vec3(0.055, -0.035, 0.025), vec3(0.025, 0.115, -0.01), 0.008));
  vec3 lq = r - vec3(0.08, 0.125, -0.01);
  lq.xy = rot2(-0.35) * lq.xy;
  st = min(st, sdEllipsoid(lq, vec3(0.055, 0.014, 0.03)));
  if (st < d1) part = 6;
  return min(d1, st) * s;
}

// ------------------------------------------------------------------ scene
// id: 0 body, 1 boots, 2 gloves, 3 accessory, 4 dot / pellet, 5 cherry, 6 stem
float scene(Char c, vec3 q, out int id) {
  vec3 b = bodyLocal(c, q);
  vec3 p = charFrame(c, b);
  bool gh = isGhost(c);
  float R = gh ? GR : CR;
  float d = gh ? ghostBody(c, p) : chomperBody(c, p);
  vec3 dp = q - c.poke.xyz;
  d += c.poke.w * exp(-dot(dp, dp) * 55.0);
  id = 0;
  if (!gh) {
    if (c.sk.x > 0.5 && p.y < -0.25) {
      float db = bootsDist(c, p);
      if (db < d) { d = db; id = 1; }
    }
    if (c.gl.w > 0.0) {
      float dg = glovesDist(c, b);
      if (dg < d) { d = dg; id = 2; }
    }
  }
  if (c.acc.x > 0.5) {
    float da = accDist(c, p, R);
    if (da < d) { d = da; id = 3; }
  }
  float big;
  float dd = dotsDist(c, p, R, big);
  if (dd < d) { d = dd; id = 4; }
  int part;
  float df = fruitDist(c, q, part);
  if (df < d) { d = df; id = part; }
  return d;
}

float mapHard(Char c, vec3 q) {
  int id;
  return scene(c, q, id);
}

// ------------------------------------------------------------------ face decals
const vec3 INK = vec3(0.018, 0.012, 0.03);

float fill(float d, float aa) { return 1.0 - smoothstep(-aa, aa, d); }

// colour + coverage of one eye; uv is relative to the eye centre (world units),
// side -1 left / +1 right; bul returns a dome offset for the shading normal
vec4 eyeDecal(Char c, vec2 uv, vec4 e, vec4 a, float side, vec3 body, out vec2 bul) {
  bul = vec2(0.0);
  vec2 wh = e.zw;
  float aa = gFoot * 1.2 + 0.0015;
  if (dot(uv, uv) > 4.0 * dot(wh, wh)) return vec4(0.0);
  int k = int(a.x + 0.5);
  bool gh = isGhost(c);
  if (k == 0) {
    float de = (length(uv / wh) - 1.0) * min(wh.x, wh.y);
    float cov = fill(de, aa);
    if (cov <= 0.0) return vec4(0.0);
    vec3 col = vec3(0.94, 0.95, 0.97);
    // pupil roams inside the white
    float pr = min(wh.x, wh.y) * (gh ? 0.5 : 0.66) * (1.0 + a.w);
    vec2 lk = c.look.xy * max(wh - pr * 1.05, vec2(0.0)) * vec2(0.9, 0.8);
    vec2 pq = uv - lk;
    float dp = length(pq * vec2(1.0, 0.9)) - pr;
    vec3 pc = c.pup.rgb;
    if (!gh) pc = mix(pc + vec3(0.05, 0.08, 0.2), pc, 1.0 - smoothstep(0.2, 0.75, length(pq) / pr)); // iris rim
    col = mix(col, pc, fill(dp, aa));
    // highlights, top-left like a studio softbox
    col = mix(col, vec3(1.0), fill(length(pq - vec2(-0.3, 0.36) * pr) - pr * 0.3, aa) * c.pup.w);
    col = mix(col, vec3(1.0), fill(length(pq - vec2(0.34, -0.36) * pr) - pr * 0.13, aa) * c.pup.w);
    // soft dark rim around the white
    col *= mix(1.0, 0.6, smoothstep(-0.014, 0.0, de));
    // upper lid (body colour) with a lash line, lower lid joins when closing
    float lid = a.y;
    if (lid > 0.001) {
      float low = smoothstep(0.7, 1.0, lid);
      float ly = uv.y - side * a.z * (1.0 - low) * uv.x - 0.45 * lid * uv.x * uv.x / wh.x;
      float thr = mix(wh.y * 1.02, -0.2 * wh.y, lid);
      float lm = smoothstep(thr - aa, thr + aa, ly);
      float thrL = mix(-wh.y * 1.6, -0.2 * wh.y, low);
      lm = max(lm, low * (1.0 - smoothstep(thrL - aa, thrL + aa, ly)));
      col = mix(col, body * 0.85, lm);
      float edge = 1.0 - smoothstep(0.0, 0.006 + aa, abs(ly - thr));
      col = mix(col, INK, edge * smoothstep(0.0, 0.08, lid));
    }
    bul = uv / wh;
    return vec4(col, cov);
  }
  float d;
  vec3 col = INK;
  float lw = 0.011;
  if (k == 1) {                 // happy arc
    float ra = wh.y * 0.62;
    d = sd2Arc(uv + vec2(0.0, ra * 0.35), vec2(sin(1.1), cos(1.1)), ra, lw);
  } else if (k == 2) {          // closed line
    d = sd2Segment(uv, vec2(-wh.x * 0.8, -0.2 * wh.y), vec2(wh.x * 0.8, -0.2 * wh.y)) - lw;
  } else if (k == 3) {          // X
    float s = wh.x * 0.7;
    d = min(sd2Segment(uv, vec2(-s), vec2(s)), sd2Segment(uv, vec2(-s, s), vec2(s, -s))) - lw;
  } else if (k == 4) {          // spiral
    float rr = length(uv);
    float an = atan(uv.y, uv.x) + c.view.w * 6.0 * side;
    float b = wh.y * 0.09;
    float m = mod(rr / b - an + PI, TAU) - PI;
    d = max(abs(m) * b - lw * 0.8, rr - wh.y * 0.9);
  } else if (k == 5) {          // star
    d = sd2Star5(uv, wh.y * 1.05, 0.45);
    float o = smoothstep(-0.007 - aa, -0.007 + aa, d);
    col = mix(vec3(1.0, 0.8, 0.12), INK, o);
    bul = uv / wh * 0.6;
  } else if (k == 6) {          // heart
    float hs = wh.y * 1.6;
    d = sd2Heart(uv / hs + vec2(0.0, 0.5)) * hs;
    float o = smoothstep(-0.007 - aa, -0.007 + aa, d);
    col = mix(vec3(0.95, 0.06, 0.2), INK, o);
    col = mix(col, vec3(1.0), fill(length(uv - vec2(-0.3, 0.25) * wh) - wh.x * 0.18, aa));
    bul = uv / wh * 0.6;
  } else if (k == 7) {          // frightened: small peach squares
    d = sd2RoundBox(uv - vec2(0.0, -0.1) * wh, vec2(0.036), 0.012);
    col = mix(vec3(1.0, 0.74, 0.56), vec3(0.95, 0.08, 0.06), c.fx.w);
  } else {                      // chevrons > <
    float s = wh.y * 0.55;
    vec2 r = vec2(uv.x * side, uv.y);
    d = min(sd2Segment(r, vec2(s * 0.5, s * 0.75), vec2(-s * 0.5, 0.0)),
            sd2Segment(r, vec2(s * 0.5, -s * 0.75), vec2(-s * 0.5, 0.0))) - lw;
  }
  return vec4(col, fill(d, aa));
}

vec4 ghostMouth(Char c, vec2 uv) {
  float aa = gFoot * 1.2 + 0.0015;
  if (c.fx.z > 0.5) {
    // the frightened wobbly zigzag
    float x = uv.x;
    float tri = abs(fract(x / 0.07 + 0.25) * 2.0 - 1.0) * 2.0 - 1.0;
    float y = 0.016 * tri + 0.005 * sin(c.view.w * 9.0 + x * 40.0);
    float d = max((abs(uv.y - y) - 0.0075) * 0.7, abs(x) - 0.14);
    return vec4(mix(vec3(1.0, 0.74, 0.56), vec3(0.95, 0.08, 0.06), c.fx.w), fill(d, aa));
  }
  float sm = c.mo.x, op = c.mo.y;
  if (op > 0.06) {
    vec2 ab = vec2(0.03 + 0.02 * op, 0.008 + 0.03 * op);
    vec2 r = uv - vec2(0.0, 0.006 * sm);
    float d = (length(r / ab) - 1.0) * min(ab.x, ab.y);
    vec3 col = vec3(0.2, 0.02, 0.05);
    col = mix(col, vec3(0.85, 0.25, 0.35), (1.0 - smoothstep(-0.6, -0.2, r.y / ab.y)) * step(0.3, op));
    return vec4(col, fill(d, aa));
  }
  if (abs(sm) > 0.12) {
    float x = clamp(uv.x, -0.045, 0.045);
    float y = sm * 9.0 * x * x - 0.004 * sign(sm);
    float d = length(vec2(uv.x - x, uv.y - y)) - 0.0065;
    return vec4(INK, fill(d, aa));
  }
  return vec4(0.0);
}

// sunglasses: two mirrored lenses plus a bridge; f is relative to the point between
// the eyes, sep = half the eye distance, wh = eye half size
vec4 shadesDecal(Char c, vec2 f, float sep, vec2 wh) {
  float aa = gFoot * 1.2 + 0.0015;
  vec2 r = vec2(abs(f.x) - sep - wh.x * 0.1, f.y - 0.12 * wh.y);
  // a lens that tapers a little towards the bottom outer corner
  vec2 rl = r;
  rl.x -= 0.18 * max(-r.y, 0.0);
  float d = sd2RoundBox(rl, vec2(wh.x * 1.22, wh.y * 0.8), wh.y * 0.38);
  float bridge = sd2Box(vec2(f.x, f.y - 0.5 * wh.y), vec2(max(sep - wh.x * 0.9, 0.012), 0.011));
  float frame = min(abs(d + 0.008) - 0.008, bridge);
  float cov = fill(min(d, bridge), aa);
  if (cov <= 0.0) return vec4(0.0);
  vec3 col = mix(vec3(0.012, 0.016, 0.035), vec3(0.05, 0.02, 0.07), sat(-r.y / wh.y));
  float streak = 1.0 - smoothstep(0.0, 0.012, abs(r.x * 0.9 + r.y - wh.y * 0.2) - 0.006);
  col = mix(col, c.glowC.rgb * 0.6 + 0.2, streak * 0.55);
  col = mix(col, vec3(0.015), fill(frame, aa));
  return vec4(col, cov);
}

// ------------------------------------------------------------------ shading
Surf plastic(vec3 alb, vec3 n) {
  Surf s = surfDefault(alb, n);
  s.rough = 0.24; s.clear = 0.85; s.wrap = 0.25;
  return s;
}

Surf surfAt(Char c, vec3 q, vec3 n) {
  int id;
  scene(c, q, id);
  bool gh = isGhost(c);
  vec3 b = bodyLocal(c, q);
  vec3 p = charFrame(c, b);
  float R = gh ? GR : CR;
  float ndv = sat(dot(n, normalize(c.view.xyz)));
  float rim = pow(1.0 - ndv, 2.6);
  float power = c.mo.z;

  if (id == 4) {
    Surf s = plastic(vec3(1.0, 0.86, 0.68), n);
    float big;
    dotsDist(c, p, R, big);
    s.emis = vec3(1.0, 0.75, 0.5) * mix(0.25, 0.55 + 0.45 * c.glowC.w, big);
    return s;
  }
  if (id == 5) {
    Surf s = plastic(vec3(0.78, 0.015, 0.04), n);
    s.rough = 0.15; s.clear = 1.0;
    s.emis = vec3(0.5, 0.02, 0.05) * rim * 0.6;
    return s;
  }
  if (id == 6) {
    vec3 r = fruitFrame(c, q);
    Surf s = surfDefault(r.y > 0.1 && r.x > 0.04 ? vec3(0.12, 0.5, 0.08) : vec3(0.3, 0.2, 0.06), n);
    s.rough = 0.5;
    return s;
  }
  if (id == 1) {
    Surf s = plastic(c.gear.rgb, n);
    // white sole stripe
    if (p.y < -0.455) s.alb = vec3(0.9);
    return s;
  }
  if (id == 2) {
    Surf s = surfDefault(vec3(0.93, 0.93, 0.92), n);
    s.rough = 0.4; s.clear = 0.3; s.wrap = 0.3;
    return s;
  }
  if (id == 3) {
    int ai = int(c.acc.x + 0.5);
    if (ai == 4) {
      Surf s = surfDefault(vec3(1.0, 0.76, 0.22), n);
      s.metal = 0.6; s.rough = 0.25; s.clear = 0.6;
      s.emis = vec3(0.35, 0.2, 0.02) * (0.25 + rim);
      // gems on the band
      vec3 cb = crownFrame(p, R);
      float an = atan(cb.z, cb.x);
      float g = fract(an * 5.0 / TAU + 0.5) - 0.5;
      float gm = 1.0 - smoothstep(0.006, 0.012, length(vec2(g * 0.7, cb.y + 0.012)) - 0.012);
      if (gm > 0.0) {
        s.alb = mix(s.alb, vec3(0.9, 0.04, 0.15), gm);
        s.metal = mix(0.6, 0.0, gm); s.rough = mix(0.25, 0.08, gm); s.clear = mix(0.5, 1.0, gm);
        s.emis *= 1.0 - gm;
      }
      return s;
    }
    Surf s = plastic(c.acc.yzw, n);
    if (ai == 2) {
      // cap: white button on top
      if (length(p.xz) < 0.035 && p.y > R) s.alb = vec3(0.92);
      s.rough = 0.45; s.clear = 0.35;
    }
    if (ai == 1) {
      // bow: white polka dots
      vec3 bf = bowFrame(p, R);
      vec2 g = fract(bf.xy * 26.0) - 0.5;
      float dotm = (1.0 - smoothstep(0.17, 0.24, length(g))) * step(0.04, abs(bf.x));
      s.alb = mix(s.alb, vec3(0.95), dotm);
    }
    s.emis = c.acc.yzw * rim * 0.25 * c.col.w;
    return s;
  }

  // ---------------------------------------------------------------- body
  vec3 body = c.col.rgb;
  float fr = c.fx.z;
  if (gh && fr > 0.0) {
    body = mix(body, vec3(0.018, 0.03, 0.62), fr);
    body = mix(body, vec3(0.86, 0.86, 0.92), c.fx.w);
  }
  Surf s = plastic(body, n);
  vec3 glow = mix(c.glowC.rgb, vec3(0.2, 0.35, 1.0), gh ? fr : 0.0);
  s.emis = glow * rim * (0.15 + 1.2 * c.col.w + 1.2 * power) + body * power * (0.12 + 0.12 * c.glowC.w);

  vec3 nc = n;
  nc.xz = rot2(c.k.y) * nc.xz;

  if (!gh) {
    // mouth interior: where the wedge face is the surface
    vec2 w;
    float dw = wedgeDist(c, p, w);
    float ds = length(p) - CR;
    float inner = smoothstep(-0.004, 0.004, -dw - ds);
    if (inner > 0.0) {
      float lw = length(w);
      vec3 m = vec3(0.2, 0.012, 0.03) * mix(0.25, 1.0, smoothstep(0.03, 0.3, lw));
      // tongue on the lower jaw
      if (w.y < 0.0) {
        vec2 tq = vec2((lw - 0.25) / 0.12, p.x / 0.17);
        float tg = 1.0 - smoothstep(0.8, 1.0, length(tq));
        vec3 tc = vec3(0.7, 0.08, 0.12) * (0.75 + 0.25 * smoothstep(0.0, 0.02, abs(p.x)));
        m = mix(m, tc, tg);
      }
      s.alb = mix(s.alb, m, inner);
      s.rough = mix(s.rough, 0.45, inner);
      s.clear = mix(s.clear, 0.25, inner);
      s.emis *= 1.0 - inner;
    }
    float outside = 1.0 - inner;
    vec3 v = normalize(p);
    // blush below the eyes
    if (c.look.w > 0.01) {
      for (int i = 0; i < 2; i++) {
        float sd = float(i) * 2.0 - 1.0;
        float az = sd * 0.62, el = 0.36;
        vec3 e = vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el));
        float bl = (1.0 - smoothstep(0.03, 0.07, length(v - e) * CR)) * c.look.w * outside;
        s.alb = mix(s.alb, vec3(1.0, 0.36, 0.5), bl * 0.6);
      }
    }
    bool shades = int(c.acc.x + 0.5) == 3;
    if (shades) {
      // midpoint frame between the eyes
      float el = 0.5 * (c.eL.y + c.eR.y);
      vec3 e0 = vec3(0.0, sin(el), cos(el));
      vec3 tx0 = vec3(1.0, 0.0, 0.0), ty0 = cross(e0, tx0);
      if (dot(v, e0) > 0.5) {
        vec2 f = vec2(dot(v, tx0), dot(v, ty0)) * CR;
        float sep = sin(c.eR.x) * cos(el) * CR;
        vec4 ec = shadesDecal(c, f, sep, c.eR.zw);
        float m = ec.a * outside;
        s.alb = mix(s.alb, ec.rgb, m);
        s.rough = mix(s.rough, 0.06, m);
        s.clear = mix(s.clear, 1.0, m);
        s.emis *= 1.0 - m;
      }
    } else if (c.look.z > 0.5) {
      for (int i = 0; i < 2; i++) {
        float sd = float(i) * 2.0 - 1.0;
        vec4 e4 = i == 0 ? c.eL : c.eR;
        vec4 a4 = i == 0 ? c.aL : c.aR;
        float az = e4.x, el = e4.y;
        vec3 e = vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el));
        if (dot(v, e) < 0.6) continue;
        vec3 tx = vec3(cos(az), 0.0, -sin(az));
        vec3 ty = cross(e, tx);
        vec2 uv = vec2(dot(v, tx), dot(v, ty)) * CR;
        vec2 bul = vec2(0.0);
        vec4 ec = eyeDecal(c, uv, e4, a4, sd, body, bul);
        float m = ec.a * outside;
        if (m > 0.0) {
          s.alb = mix(s.alb, ec.rgb, m);
          s.rough = mix(s.rough, 0.1, m);
          s.clear = mix(s.clear, 1.0, m);
          s.emis *= 1.0 - m;
          vec3 tilt = charToBody(c, tx * bul.x + ty * bul.y);
          s.n = normalize(s.n + tilt * 0.45 * m);
        }
      }
    }
    return s;
  }

  // ghost face on the front of the dome
  float front = smoothstep(0.05, 0.35, nc.z);
  if (front > 0.0) {
    vec2 f = p.xy;
    if (c.look.w > 0.01) {
      vec2 cq = vec2(abs(f.x) - 0.205, f.y + 0.065);
      float bl = (1.0 - smoothstep(0.025, 0.05, length(cq * vec2(1.0, 1.4)))) * c.look.w * front;
      s.alb = mix(s.alb, vec3(1.0, 0.4, 0.55), bl * 0.6);
    }
    vec4 mo = ghostMouth(c, f - vec2(0.0, -0.11));
    if (mo.a > 0.0) {
      s.alb = mix(s.alb, mo.rgb, mo.a * front);
      s.emis *= 1.0 - mo.a * front;
    }
    if (int(c.acc.x + 0.5) == 3 && fr < 0.5) {
      vec2 mid = 0.5 * (c.eL.xy + c.eR.xy);
      vec4 ec = shadesDecal(c, f - mid, 0.5 * (c.eR.x - c.eL.x), c.eR.zw);
      float m = ec.a * front;
      s.alb = mix(s.alb, ec.rgb, m);
      s.rough = mix(s.rough, 0.06, m);
      s.clear = mix(s.clear, 1.0, m);
      s.emis *= 1.0 - m;
    } else if (c.look.z > 0.5) for (int i = 0; i < 2; i++) {
      float sd = float(i) * 2.0 - 1.0;
      vec4 e4 = i == 0 ? c.eL : c.eR;
      vec4 a4 = i == 0 ? c.aL : c.aR;
      vec2 uv = f - e4.xy;
      vec2 bul = vec2(0.0);
      vec4 ec = eyeDecal(c, uv, e4, a4, sd, body, bul);
      float m = ec.a * front;
      if (m > 0.0) {
        s.alb = mix(s.alb, ec.rgb, m);
        s.rough = mix(s.rough, 0.1, m);
        s.clear = mix(s.clear, 1.0, m);
        s.emis *= 1.0 - m;
        vec3 tilt = charToBody(c, vec3(bul, 0.0));
        s.n = normalize(s.n + tilt * 0.5 * m);
      }
    }
  }
  return s;
}

vec4 anchorPass(ivec2 px) { return vec4(0.0); }
