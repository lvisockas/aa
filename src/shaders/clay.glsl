// ---------------------------------------------------------------------------
// Clay family: hand-rolled plasticine figures. A pear/egg body with a ball head
// pressed on, sausage arms with mitten hands, stubby feet, white clay eyeballs
// with heavy half-dome lids, rolled worm brows and a carved mouth (groove, 'O'
// or a toothy grin). Thumbprints, fingerprint whorls, lumps and tool marks are
// a bump function evaluated at shading time; the seed changes every exposure
// so the surface "boils" like real claymation.
// Face anchors are solved on the CPU; the face is evaluated mirrored (|x|) with
// per-side parameters, so two eyes cost one.
// ---------------------------------------------------------------------------
#define HAS_FUR 0

struct Char {
  vec4 col;    // body colour, species
  vec4 col2;   // second colour (belly, muzzle, face), thumbprint amount
  vec4 col3;   // accent colour (beak, feet, nose, ears), accessory
  vec4 accC;   // accessory colour, eye style
  vec4 hq;     // head rotation quaternion (relative to body)
  vec4 bd;     // body radii xyz, body centre y
  vec4 hd;     // head radius, head y, head z, head-body blend
  vec4 look;   // look xy (left eye, mirrored), look xy (right eye)
  vec4 lidL;   // upper lid edge, lid slant, lower lid edge (eyeball radii), hat brim height
  vec4 lidR;
  vec4 kb;     // keyboard centre xyz, amount
  vec4 mouth;  // smile, open, grin, brows on
  vec4 aL0; vec4 aL1; vec4 aL2;
  vec4 aR0; vec4 aR1; vec4 aR2;
  vec4 misc;   // feet, thumb, left pupil scale, boil seed
  vec4 poke;
  vec4 wob;    // wobble amplitude, phase, ball morph, -
  vec4 misc2;  // key tap phase, right pupil scale, beak, pear
  vec4 eyeL;   // left eye centre (mirrored to +x), radius
  vec4 eyeR;
  vec4 bLa; vec4 bLb;   // left brow ends (mirrored), radius
  vec4 bRa; vec4 bRb;
  vec4 nose;   // nose / beak base xyz, radius (0 = none)
  vec4 mc;     // mouth centre xyz, scale
  vec4 neck;   // collar height, collar radius x, collar radius z, front z
  vec4 snout;  // dog snout centre xyz, scale (0 = none)
};

Char loadChar(int i) {
  Char c;
  c.col = D(i, 0); c.col2 = D(i, 1); c.col3 = D(i, 2); c.accC = D(i, 3);
  c.hq = D(i, 4); c.bd = D(i, 5); c.hd = D(i, 6); c.look = D(i, 7);
  c.lidL = D(i, 8); c.lidR = D(i, 9); c.kb = D(i, 10); c.mouth = D(i, 11);
  c.aL0 = D(i, 12); c.aL1 = D(i, 13); c.aL2 = D(i, 14);
  c.aR0 = D(i, 15); c.aR1 = D(i, 16); c.aR2 = D(i, 17);
  c.misc = D(i, 18); c.poke = D(i, 19); c.wob = D(i, 20); c.misc2 = D(i, 21);
  c.eyeL = D(i, 22); c.eyeR = D(i, 23);
  c.bLa = D(i, 24); c.bLb = D(i, 25); c.bRa = D(i, 26); c.bRb = D(i, 27);
  c.nose = D(i, 28); c.mc = D(i, 29); c.neck = D(i, 30); c.snout = D(i, 31);
  return c;
}

int species(Char c) { return int(c.col.w + 0.5); }
int accessory(Char c) { return int(c.col3.w + 0.5); }
int eyeStyle(Char c) { return int(c.accC.w + 0.5); }

vec3 headC(Char c) { return vec3(0.0, c.hd.y, c.hd.z); }
vec3 headRad(Char c) { return c.hd.x * vec3(1.0, 0.96, 0.94); }
vec3 neckPivot(Char c) { return vec3(0.0, c.hd.y - c.hd.x * 0.75, c.hd.z * 0.5); }
vec3 toHead(Char c, vec3 q) { vec3 p = neckPivot(c); return qinv(c.hq, q - p) + p; }

// shading-time side info written by sceneD
float gHeadW;    // blend weight towards the head (seams, head colours)
float gSeam;     // pressed-on seam strength at the hit point
float gTeeth;    // inside the teeth band of the mouth

// --------------------------------------------------------------- body parts
float bodyD(Char c, vec3 q) {
  vec3 p = q - vec3(0.0, c.bd.w, 0.0);
  float s = 1.0 + c.misc2.w * 0.5 * clamp(-p.y / c.bd.y, -1.0, 1.0);
  return sdEllipsoid(vec3(p.x / s, p.y, p.z / s), c.bd.xyz) * min(s, 1.0);
}

float armD(vec3 q, vec4 a0, vec4 a1, vec4 a2, float thumb, float side) {
  float d = sdCapsuleT(q, a0.xyz, a1.xyz, a0.w, a1.w);
  d = smin(d, sdCapsuleT(q, a1.xyz, a2.xyz, a1.w, min(a1.w, a2.w) * 0.85), 0.004);
  vec3 dir = normalize(a2.xyz - a1.xyz);
  vec3 hc = a2.xyz + dir * a2.w * 0.3;
  float hb = length(q - hc) - a2.w * 1.5;
  if (hb > 0.0) {
    d = min(d, hb + 0.002);
  } else if (thumb > 0.5) {
    // mitten: a squashed ball with a thumb nub pressed on the inner side
    d = smin(d, sdEllipsoid(q - hc, vec3(1.0, 1.1, 0.85) * a2.w), 0.005);
    vec3 tp = hc + normalize(vec3(-side * 0.75, 0.35, 0.55)) * a2.w * 0.8;
    d = smin(d, length(q - tp) - a2.w * 0.42, 0.003);
  } else {
    d = smin(d, length(q - hc) - a2.w, 0.004);
  }
  return d;
}

float mouth2D(Char c, vec2 p, out float teeth) {
  float s = c.mouth.x, o = c.mouth.y, g = c.mouth.z, sc = c.mc.w;
  float w = (0.04 + 0.034 * g + 0.012 * max(s, 0.0) - 0.014 * o * (1.0 - g)) * sc;
  float h = (0.0068 + 0.04 * o) * sc;
  p.y -= s * 7.0 * p.x * p.x / sc;
  p.y += h * 0.35 * g;
  vec2 ab = vec2(w, h);
  float d = (length(p / ab) - 1.0) * min(w, h);
  float top = h * mix(1.0, 0.3, g);
  d = max(d, p.y - top);
  teeth = g * smoothstep(top - 0.03 * sc, top - 0.024 * sc, p.y);
  return d;
}

// --------------------------------------------------------------- the figure
// ids: 1 body, 2 eyeball, 3 lid, 4 brow, 5 nose, 6 beak, 7 ear, 8 accessory,
//      9 pom-pom / knot, 10 keyboard, 11 arm, 12 foot, 13 specs, 14 tuft / antenna,
//      16 mouth inside, 17 teeth, 18 muzzle
float sceneD(Char c, vec3 q, out int id) {
  q.x += c.wob.x * sin(q.y * 8.0 + c.wob.y);
  int sp = species(c);
  float seed = c.misc.w;
  vec3 h = toHead(c, q);
  vec3 hc = headC(c), hr = headRad(c);
  vec3 hm = vec3(abs(h.x), h.y, h.z);
  bool left = h.x < 0.0;
  gTeeth = 0.0;

  // hand-made unevenness that boils from exposure to exposure
  float lump = 0.0045 * sin(q.x * 11.0 + seed) * sin(q.y * 9.0 + seed * 1.3) * sin(q.z * 10.0 + seed * 0.7);

  // ---- body + head pressed together
  float db = bodyD(c, q);
  if (sp == 3) db -= 0.011 * sin(q.x * 41.0) * sin(q.y * 41.0 + 0.6) * sin(q.z * 41.0 + 1.1); // wool lumps
  float dh = sdEllipsoid(h - hc, hr);
  vec2 bh = sminB(db, dh, c.hd.w);
  float d = bh.x + lump;
  float core = d;
  gHeadW = bh.y;
  id = 1;

  // ---- head features (head space), bounded
  // Bounded parts: outside its (tight) bound a part contributes the bound's
  // distance, which keeps the march conservative without fake shadow casters.
  {
    if (c.snout.w > 0.0) {            // dog snout
      float sn = sdEllipsoid(h - c.snout.xyz, vec3(0.088, 0.064, 0.078) * c.snout.w);
      vec2 r = sminB(d, sn, 0.006);
      d = r.x;
      if (r.y > 0.5) id = 18;
    }
    if (sp == 2 || sp == 3) {         // ears
      vec3 e = hm - hc;
      float ear;
      if (sp == 2) {                  // floppy
        e -= vec3(hr.x * 0.9, hr.y * 0.18, -0.03);
        e.xy = rot2(-0.32) * e.xy;
        ear = sdEllipsoid(e + vec3(0.0, 0.07, 0.0), vec3(0.052, 0.11, 0.034) * c.hd.x / 0.205);
      } else {                        // sticking out sideways
        e -= vec3(hr.x * 1.02, hr.y * 0.22, -0.03);
        e.xy = rot2(0.35) * e.xy;
        ear = sdEllipsoid(e, vec3(0.075, 0.03, 0.045));
      }
      vec2 r = sminB(d, ear, 0.004);
      d = r.x;
      if (r.y > 0.5) id = 7;
    } else if (sp == 4) {             // tuft
      vec3 b = hc + vec3(0.0, hr.y * 0.92, 0.02);
      float t = sdRoundCone(h, b, b + vec3(0.035, 0.085, 0.04), 0.022, 0.009);
      t = min(t, sdRoundCone(h, b, b + vec3(-0.03, 0.065, -0.005), 0.02, 0.008));
      vec2 r = sminB(d, t, 0.004);
      d = r.x;
      if (r.y > 0.5) id = 14;
    } else if (sp == 5 && accessory(c) != 3) {   // antenna that wobbles with the boil
      vec3 b = hc + vec3(0.0, hr.y * 0.9, 0.0);
      vec3 tip = b + vec3(0.03 + 0.008 * sin(seed * 3.0), 0.15, 0.012);
      float t = sdCapsuleT(h, b, tip, 0.016, 0.011);
      vec2 r = sminB(d, t, 0.005);
      d = r.x;
      if (r.y > 0.5) id = 1;
      float bl = length(h - tip) - 0.034;
      if (bl < d) { d = bl; id = 14; }
    }

    // nose (or beak)
    if (c.nose.w > 0.0) {
      if (c.misc2.z > 0.5) {
        vec3 b = c.nose.xyz;
        float o = c.mouth.y;
        float up = sdRoundCone(h, b - vec3(0.0, 0.0, 0.03), b + vec3(0.0, -0.014 - 0.01 * o, 0.09), c.nose.w, 0.01);
        up = max(up, -(h.y - b.y + 0.004 + 0.01 * o));
        vec3 lb = b - vec3(0.0, 0.008 + 0.025 * o, 0.0);
        float lo = sdRoundCone(h, lb - vec3(0.0, 0.0, 0.03), lb + vec3(0.0, -0.02 - 0.02 * o, 0.068), c.nose.w * 0.8, 0.009);
        lo = max(lo, h.y - lb.y - 0.004);
        float bk = min(up, lo);
        if (bk < d) { d = bk; id = 6; }
      } else {
        float ns = length(h - c.nose.xyz) - c.nose.w;
        vec2 r = sminB(d, ns, 0.003);
        d = r.x;
        if (r.y > 0.5) id = 5;
      }
    }

    // carved mouth (groove / O / toothy grin)
    if (c.misc2.z < 0.5) {
      vec3 m = h - c.mc.xyz;
      if (length(m) < 0.14 * c.mc.w) {
        float teeth;
        float d2 = mouth2D(c, m.xy, teeth);
        float depth = mix(0.012 + 0.05 * c.mouth.y, 0.006, teeth);
        float cav = max(d2, -m.z - depth);
        float carved = smax(d, -cav, 0.004);
        if (carved > d + 1e-4 && cav < 0.004) { id = (teeth > 0.5 && -m.z < 0.0075 + 0.003) ? 17 : 16; gTeeth = teeth; }
        d = carved;
      }
    }

    // eyes, lids and brows: mirrored, one of each
    vec4 eye = left ? c.eyeL : c.eyeR;
    vec4 lid = left ? c.lidL : c.lidR;
    vec3 e = hm - eye.xyz;
    float R = eye.w;
    float eb = length(e) - R * 1.5;
    if (eb > 0.0) d = min(d, length(e) - R * 1.13);
    else {
      float ball = length(e) - R;
      if (ball < d) { d = ball; id = 2; }
      if (eyeStyle(c) != 2 || lid.x < 1.1) {
        float edge = lid.x * R + lid.y * e.x * 0.9;
        float region = min(edge - e.y, e.y - lid.z * R);
        float lidD = max(length(e) - R * 1.13, region);
        vec2 r = sminB(d, lidD, 0.002);
        if (lidD < d + 0.003) { d = r.x; if (r.y > 0.5) id = 3; }
      }
    }
    if (c.mouth.w > 0.5) {
      vec4 ba = left ? c.bLa : c.bRa, bb = left ? c.bLb : c.bRb;
      // a rolled worm, gently arched
      vec3 ab = bb.xyz - ba.xyz;
      float tb = sat(dot(hm - ba.xyz, ab) / dot(ab, ab));
      vec3 bp = hm - vec3(0.0, 0.007 * 4.0 * tb * (1.0 - tb), 0.0);
      float br = sdCapsuleT(bp, ba.xyz, bb.xyz, ba.w, ba.w * 0.72);
      if (br < d) { d = br; id = 4; }
    }
  }

  // ---- feet (mirrored)
  if (c.misc.x > 0.5) {
    vec3 f = vec3(abs(q.x), q.y, q.z) - vec3(c.bd.x * 0.44, 0.042, 0.035);
    {
      float ft = sdEllipsoid(f, vec3(0.068, 0.046, 0.095));
      vec2 r = sminB(d, ft, 0.004);
      d = r.x;
      if (r.y > 0.5) id = 12;
    }
  }

  // ---- arms, each only near its bounding sphere
  gSeam = 0.0;
  float arm = 1e5;
  arm = min(armD(q, c.aL0, c.aL1, c.aL2, c.misc.y, -1.0), armD(q, c.aR0, c.aR1, c.aR2, c.misc.y, 1.0));
  {
    vec2 r = sminB(d, arm, 0.005);
    // only where the arm was pressed on at the shoulder, not where a hand rests
    float atShoulder = 1.0 - smoothstep(0.05, 0.09, min(length(q - c.aL0.xyz), length(q - c.aR0.xyz)));
    gSeam = (1.0 - min(abs(arm - d) / 0.008, 1.0)) * atShoulder;
    d = r.x;
    if (r.y > 0.5) id = 11;
  }
  // a separately rolled head shows a seam at the neck; one-lump figures do not
  gSeam = max(gSeam, (1.0 - abs(2.0 * gHeadW - 1.0)) * step(c.hd.w, 0.02));

  // ---- accessories
  int acc = accessory(c);
  if (acc > 0) {
    float ny = c.neck.x;
    float sb = max(length(vec2(q.x, q.z)) - max(c.neck.y, c.neck.w) - 0.07, abs(q.y - ny + 0.07) - 0.19);
    float bt = length(q - vec3(0.0, ny - 0.012, c.neck.w + 0.012)) - 0.092;
    if (acc == 1 && sb > 0.0) d = min(d, sb + 0.002);
    else if (acc == 1) {                                // knitted scarf
      vec3 p = q - vec3(0.0, ny, 0.0);
      float k = c.neck.y / c.neck.z;
      float ring = sdTorus(vec3(p.x, p.y, p.z * k), c.neck.y + 0.012, 0.034) / max(k, 1.0);
      vec3 t = q - vec3(c.neck.y * 0.42, ny - 0.11, c.neck.w + 0.035);
      t.yz = rot2(0.32) * t.yz;
      t.xy = rot2(-0.12) * t.xy;
      float tail = sdRoundBox(t, vec3(0.036, 0.1, 0.012), 0.011);
      float sc = smin(ring, tail, 0.004);
      if (sc < d) { d = sc; id = 8; }
    } else if (acc == 2 && bt > 0.0) {
      d = min(d, bt + 0.002);
    } else if (acc == 2) {                              // bow tie
      vec3 p = q - vec3(0.0, ny - 0.012, c.neck.w + 0.012);
      vec3 w = vec3(abs(p.x), p.y, p.z * 1.8);
      float wing = sdRoundCone(w, vec3(0.012, 0.0, 0.0), vec3(0.055, 0.0, 0.0), 0.013, 0.032) / 1.8;
      float knot = sdEllipsoid(p, vec3(0.02, 0.02, 0.016));
      if (wing < d) { d = wing; id = 8; }
      if (knot < d) { d = knot; id = 9; }
    } else if (acc == 3) {                              // knitted hat with pom-pom
      vec3 p = h - hc;
      float pom = length(p - vec3(0.0, hr.y + 0.055, -0.02)) - 0.055;
      if (pom < d) { d = pom; id = 9; }
      float hb = max(dh - 0.052, c.lidL.w - 0.06 - p.y);
      if (hb > 0.0) d = min(d, hb + 0.002);
      else {
      float cut = c.lidL.w + 0.12 * p.z;
      float shell = sdEllipsoid(p, hr + 0.022);
      float hat = max(shell, cut - p.y);
      vec3 rp = p - vec3(0.0, cut, 0.0);
      float rr = hr.x * sqrt(max(1.0 - sq(cut / hr.y), 0.1)) + 0.02;
      rp.yz = rot2(0.12) * rp.yz;
      float brim = sdTorus(vec3(rp.x, rp.y, rp.z * hr.x / hr.z), rr, 0.026);
      hat = smin(hat, brim, 0.004);
      if (hat < d) { d = hat; id = 8; }
      }
    } else if (acc == 4) {                              // clay ring specs
      vec4 eye = left ? c.eyeL : c.eyeR;
      float gb = max(dh - 0.09, abs(hm.y - eye.y) - eye.w * 1.2 - 0.03);
      if (gb > 0.0) d = min(d, gb + 0.002);
      else {
      float R = eye.w * 1.2;
      vec3 ce = eye.xyz + vec3(0.0, 0.0, eye.w * 0.55);
      vec3 p = hm - ce;
      float ring = sdTorusZ(p, R, 0.011);
      float bridge = sdCapsule(hm, vec3(0.0, ce.y + 0.012, ce.z + 0.004), vec3(ce.x - R, ce.y + 0.006, ce.z), 0.009);
      float arm2 = sdCapsule(hm, vec3(ce.x + R, ce.y + 0.004, ce.z), vec3(hr.x * 0.97, ce.y + 0.01, hc.z + 0.02), 0.009);
      float sp2 = min(ring, min(bridge, arm2));
      if (sp2 < d) { d = sp2; id = 13; }
      }
    } else if (acc == 5 && abs(q.y - ny) < 0.35 && q.z > 0.0) {   // tie on the chest
      float top = ny - 0.02;
      float y0 = c.bd.w - c.bd.y * 0.35;
      float kite = max(max(abs(q.x) - (0.017 + (top - q.y) * 0.17), q.y - top), abs(q.x) * 1.15 - (q.y - y0));
      float blade = max(abs(core - 0.008) - 0.0065, kite);
      blade = max(blade, -q.z);
      float knot = sdEllipsoid(q - vec3(0.0, ny - 0.008, c.neck.w + 0.01), vec3(0.024, 0.02, 0.016));
      if (blade < d) { d = blade; id = 8; }
      if (knot < d) { d = knot; id = 9; }
    }
  }

  // ---- little clay keyboard (working)
  if (c.kb.w > 0.02) {
    vec3 kp = q - c.kb.xyz;
    {
      kp.yz = rot2(-0.3) * kp.yz;
      float k = sdRoundBox(kp, vec3(0.19, 0.016, 0.07) * c.kb.w, 0.014);
      if (k < d) { d = k; id = 10; }
    }
  }

  vec3 dp = q - c.poke.xyz;
  d += c.poke.w * exp(-dot(dp, dp) * 45.0);
  // squish into a ball
  if (c.wob.z > 0.001) {
    float ball = length(q - vec3(0.0, 0.29, 0.0)) - 0.29 + lump;
    d = mix(d, ball, c.wob.z);
    if (c.wob.z > 0.7) id = 1;
  }
  return d;
}

float mapHard(Char c, vec3 q) {
  int id;
  return sceneD(c, q, id);
}

// ------------------------------------------------------------ clay surface
// Height field of thumbprints with fingerprint whorls, lumps and tool marks.
float printsH(vec3 q, float seed) {
  vec3 g = q * 3.4;
  vec3 i = floor(g);
  vec3 f = fract(g);
  float hgt = 0.0;
  if (hash13(i + 17.0) > 0.3) {
    vec3 r3 = vec3(hash13(i), hash13(i + 5.3), hash13(i + 9.1));
    vec3 cp = 0.3 + 0.4 * r3 + 0.02 * sin(seed + r3 * 6.28);
    vec3 dv = f - cp;
    float rad = 0.17 + 0.09 * hash13(i + 2.2);
    float dd = length(dv) / rad;
    float bowl = sat(1.0 - dd * dd);
    bowl *= bowl;
    float ridges = sin(length(dv * vec3(1.0, 1.4, 0.8)) * 160.0 + r3.x * 6.0);
    hgt = -bowl + 0.07 * ridges * bowl * bowl;
  }
  // a rolling tool mark here and there
  vec3 nz = noise4(q * 2.3 + vec3(0.0, 0.0, seed * 0.05)).xyz;
  float mark = smoothstep(0.66, 0.74, nz.x) * sin(dot(q, normalize(vec3(0.6, 1.0, 0.3))) * 230.0);
  return hgt + 0.25 * mark;
}

vec3 clayNormal(vec3 q, vec3 n, float amt, float seed) {
  if (amt <= 0.001) return n;
  const float e = 0.0025;
  float h0 = printsH(q, seed);
  vec3 g = vec3(printsH(q + vec3(e, 0.0, 0.0), seed) - h0,
                printsH(q + vec3(0.0, e, 0.0), seed) - h0,
                printsH(q + vec3(0.0, 0.0, e), seed) - h0) / e;
  vec3 lumps = noise4(q * 7.0 + seed * 0.37).xyz - 0.5;
  g = g * 0.0095 * amt + lumps * 0.22 * (0.4 + amt);
  return normalize(n - (g - n * dot(g, n)));
}

Surf clayMat(vec3 alb, vec3 n) {
  // saturated but slightly chalky
  alb = mix(alb, vec3(luma(alb)), 0.07) * 0.94 + 0.012;
  Surf s = surfDefault(alb, n);
  s.rough = 0.56;
  s.f0 = 0.03;
  s.wrap = 0.38;
  return s;
}

Surf surfAt(Char c, vec3 q, vec3 n) {
  int id;
  sceneD(c, q, id);
  q.x += c.wob.x * sin(q.y * 8.0 + c.wob.y);
  int sp = species(c);
  float seed = c.misc.w;
  float amt = c.col2.w;
  vec3 h = toHead(c, q);
  vec3 hc = headC(c);
  vec3 body = c.col.rgb, second = c.col2.rgb, accent = c.col3.rgb;
  vec3 alb = body;
  bool headPart = id >= 2 && id <= 7 || id == 13 || id == 14 || id == 16 || id == 17 || id == 18 || (id == 8 && accessory(c) == 3);
  vec3 pq = headPart || (id == 1 && gHeadW > 0.5) ? h : q;

  if (id == 1) {
    // regional colours: penguin belly & face mask, light bellies, woolly dark face
    vec3 hn = normalize((h - hc) / headRad(c));
    float headW = gHeadW;
    if (sp == 1) {
      vec2 bp = vec2(q.x / (c.bd.x * 0.78), (q.y - c.bd.w + 0.02) / (c.bd.y * 0.9));
      float belly = (1.0 - smoothstep(0.92, 1.0, length(bp))) * smoothstep(0.0, 0.06, q.z);
      vec3 hp = h - hc;
      float mask = smoothstep(0.03, 0.06, hp.z) * (1.0 - smoothstep(0.72, 0.8, length(vec2(abs(hp.x) - 0.045, hp.y + 0.02) / vec2(0.13, 0.12))));
      alb = mix(alb, second, max(belly * (1.0 - headW), mask * headW));
    } else if (sp == 3) {
      alb = mix(body, second, smoothstep(0.35, 0.65, headW));
    } else if (sp == 2 || sp == 4 || sp == 5) {
      vec2 bp = vec2(q.x / (c.bd.x * 0.7), (q.y - c.bd.w + 0.03) / (c.bd.y * 0.75));
      float belly = (1.0 - smoothstep(0.85, 1.0, length(bp))) * smoothstep(0.02, 0.1, q.z) * (1.0 - headW);
      alb = mix(alb, second, belly * 0.9);
    }
  } else if (id == 2) {
    alb = vec3(0.93, 0.91, 0.86);
  } else if (id == 3) {
    alb = sp == 3 ? second : body;
    if (sp == 1) alb = body;
  } else if (id == 4) {
    alb = sp == 3 ? body * 0.9 : (sp == 1 ? body * 1.4 + 0.02 : body * 0.55);
    if (sp == 0) alb = accent;
  } else if (id == 5) {
    alb = sp == 2 ? accent * 0.6 : (sp == 0 ? body * 1.04 : accent);
  } else if (id == 6 || id == 14) {
    alb = accent;
  } else if (id == 7) {
    alb = sp == 3 ? second : accent;
  } else if (id == 8 || id == 9) {
    alb = c.accC.rgb;
    if (id == 9 && accessory(c) == 3) alb = mix(alb, vec3(0.95, 0.93, 0.88), 0.7);
    if (id == 9 && accessory(c) != 3) alb = alb * 0.82;
  } else if (id == 10) {
    alb = vec3(0.9, 0.86, 0.78);
  } else if (id == 11) {
    alb = sp == 3 ? second : body;
  } else if (id == 12) {
    alb = (sp == 1 || sp == 4) ? accent : (sp == 3 ? second : body * 0.92);
  } else if (id == 13) {
    alb = c.accC.rgb;
  } else if (id == 16) {
    alb = vec3(0.24, 0.05, 0.06);
  } else if (id == 17) {
    alb = vec3(0.94, 0.92, 0.86);
  } else if (id == 18) {
    alb = second;
  }

  // hand-mixed plasticine is never perfectly even
  float mott = noise(pq * 4.3 + 0.17) - 0.5;
  alb *= 1.0 + 0.09 * mott * (0.5 + amt);
  Surf s = clayMat(alb, n);
  s.n = clayNormal(pq, n, amt * (id == 2 ? 0.4 : 1.0), seed);

  if (id == 2) {
    // black clay pupil pressed onto the white ball, following the cursor
    bool left = h.x < 0.0;
    vec4 eye = left ? c.eyeL : c.eyeR;
    vec3 hm = vec3(abs(h.x), h.y, h.z);
    vec3 e = normalize(hm - eye.xyz);
    vec2 lk = left ? vec2(-c.look.x, c.look.y) : c.look.zw;
    vec3 pd = normalize(vec3(lk.x * 0.6, lk.y * 0.45, 1.0));
    float ps = left ? c.misc.z : c.misc2.y;
    float pr = 0.45 * ps;
    float ang = acos(clamp(dot(e, pd), -1.0, 1.0));
    float aa = gFoot * 1.2 / eye.w;
    float m = 1.0 - smoothstep(pr - aa, pr + aa, ang);
    if (eyeStyle(c) == 2) m = 1.0;
    s.alb = mix(s.alb, vec3(0.025, 0.022, 0.025), m);
    s.rough = mix(0.5, 0.32, m);
    // the pupil is a pressed disc: tilt the normal at its rim
    float rim = smoothstep(pr - 0.12, pr, ang) * (1.0 - smoothstep(pr, pr + 0.05, ang)) * (eyeStyle(c) == 2 ? 0.0 : 1.0);
    vec3 tdir = normalize(e - pd * dot(e, pd));
    vec3 tw = vec3(left ? -tdir.x : tdir.x, tdir.y, tdir.z);
    s.n = normalize(s.n + qrot(c.hq, tw) * rim * 0.35);
  } else if (id == 17) {
    // a row of teeth: dark gaps between them
    vec3 m = h - c.mc.xyz;
    float tw = 0.0175 * c.mc.w;
    float gx = abs(fract(m.x / tw + 0.5) - 0.5) * tw;
    float gap = 1.0 - smoothstep(0.0008, 0.0024, gx);
    s.alb = mix(s.alb, vec3(0.3, 0.12, 0.1), gap * 0.85);
    s.rough = 0.45;
  } else if (id == 16) {
    s.rough = 0.7;
    s.wrap = 0.2;
  } else if (id == 10) {
    // key caps pressed into the slab, one lit up by the typing tap
    vec3 kp = q - c.kb.xyz;
    kp.yz = rot2(-0.3) * kp.yz;
    vec2 cell = vec2(0.034, 0.03) * c.kb.w;
    vec2 ci = clamp(floor(kp.xz / cell + 0.5), vec2(-4.0, -1.0), vec2(4.0, 1.0));
    vec2 lc = kp.xz - ci * cell;
    float key = sd2RoundBox(lc, cell * 0.36, 0.004);
    float km = (1.0 - smoothstep(-0.001, 0.001, key)) * step(0.0, kp.y);
    float hit = step(0.82, hash12(ci + floor(c.misc2.x)));
    vec3 keyCol = mix(vec3(0.24, 0.24, 0.27), c.accC.rgb, hit * 0.8);
    if (accessory(c) == 0) keyCol = mix(vec3(0.24, 0.24, 0.27), vec3(0.9, 0.45, 0.25), hit * 0.8);
    s.alb = mix(s.alb, keyCol, km);
  } else if (id == 8 && (accessory(c) == 1 || accessory(c) == 3)) {
    // knitted ribs
    vec3 kq = accessory(c) == 3 ? h : q;
    float rib = sin(atan(kq.z, kq.x) * 70.0);
    s.n = normalize(s.n + 0.18 * rib * normalize(vec3(-kq.z, 0.0, kq.x)));
    s.rough = 0.75;
  }

  // seams where pieces were pressed together: a soft dark groove
  if (gSeam > 0.0 && (id == 1 || id == 11 || id == 12 || id == 18 || id == 7)) {
    float sm = gSeam * gSeam;
    s.alb *= 1.0 - 0.32 * sm;
  }
  // a little warmth where the clay is thin (lit from behind)
  s.wrap += 0.1 * float(id == 11 || id == 7 || id == 4);
  return s;
}

vec4 anchorPass(ivec2 px) { return vec4(0.0); }
