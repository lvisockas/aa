// ---------------------------------------------------------------------------
// Muse family: detailed plush "Jolly" characters with an articulated rig
// (head, two-segment arms, legs), longer minky fur and layered outfits.
// Arm joints are solved on the CPU and streamed in; everything else is SDF.
// ---------------------------------------------------------------------------
#define HAS_FUR 1

struct Char {
  vec4 col;    // fur colour, fur length
  vec4 fur;    // density, strand scale, clump, droop
  vec4 body;   // chubbiness, head size, species, ear type
  vec4 hq;     // head rotation quaternion (relative to body)
  vec4 eye;    // kind, size, spacing, height
  vec4 eye2;   // blink, squint, look x, look y
  vec4 mouth;  // type, open, smile, -
  vec4 cheek;  // amount, colour
  vec4 aL0; vec4 aL1; vec4 aL2;   // left shoulder / elbow / hand (xyz, radius)
  vec4 aR0; vec4 aR1; vec4 aR2;
  vec4 legs;   // foot x left, foot x right, foot lift left, foot lift right
  vec4 top;    // outfit type, colour
  vec4 hat;    // hat type, colour
  vec4 eyew;   // eyewear type, colour
  vec4 hair;   // hair type, colour
  vec4 neck;   // neckwear type, colour
  vec4 belt;   // belt, boots, number, -
  vec4 held;   // item type, -, -, -
  vec4 accent; // secondary colour, -
  vec4 poke;
  vec4 wob;    // wobble amplitude, phase, excite, -
  vec4 earC;   // inner ear colour
  vec4 kb;     // keyboard amount, tap phase, -, -
};

Char loadChar(int i) {
  Char c;
  c.col = D(i, 0); c.fur = D(i, 1); c.body = D(i, 2); c.hq = D(i, 3);
  c.eye = D(i, 4); c.eye2 = D(i, 5); c.mouth = D(i, 6); c.cheek = D(i, 7);
  c.aL0 = D(i, 8); c.aL1 = D(i, 9); c.aL2 = D(i, 10);
  c.aR0 = D(i, 11); c.aR1 = D(i, 12); c.aR2 = D(i, 13);
  c.legs = D(i, 14); c.top = D(i, 15); c.hat = D(i, 16); c.eyew = D(i, 17);
  c.hair = D(i, 18); c.neck = D(i, 19); c.belt = D(i, 20); c.held = D(i, 21);
  c.accent = D(i, 22); c.poke = D(i, 23); c.wob = D(i, 24); c.earC = D(i, 25); c.kb = D(i, 26);
  return c;
}

const vec3 NECK = vec3(0.0, 0.47, 0.0);
const vec3 TORSO_C = vec3(0.0, 0.29, 0.0);

vec3 headC(Char c) { return NECK + vec3(0.0, 0.21 * c.body.y, 0.0); }
vec3 headR(Char c) { return vec3(0.272, 0.245, 0.252) * c.body.y; }
vec3 torsoR(Char c) { return vec3(0.235 * c.body.x, 0.2, 0.212 * c.body.x); }
vec3 toHead(Char c, vec3 q) { return qinv(c.hq, q - NECK) + NECK; }
int species(Char c) { return int(c.body.z + 0.5); }

// point on the front of the head ellipsoid for face coordinates (x, y)
vec3 facePoint(Char c, vec2 xy) {
  vec3 hc = headC(c), hr = headR(c);
  vec2 u = (xy - hc.xy) / hr.xy;
  float z = hr.z * sqrt(max(1.0 - dot(u, u), 0.02));
  return vec3(xy, hc.z + z);
}

// ------------------------------------------------------------------ skin
float armsSDF(Char c, vec3 q, float k) {
  float a = sdCapsuleT(q, c.aL0.xyz, c.aL1.xyz, c.aL0.w, c.aL1.w);
  a = smin(a, sdCapsuleT(q, c.aL1.xyz, c.aL2.xyz, c.aL1.w, c.aL2.w * 0.85), 0.008);
  a = smin(a, sdSphere(q - c.aL2.xyz, c.aL2.w), 0.008);
  float b = sdCapsuleT(q, c.aR0.xyz, c.aR1.xyz, c.aR0.w, c.aR1.w);
  b = smin(b, sdCapsuleT(q, c.aR1.xyz, c.aR2.xyz, c.aR1.w, c.aR2.w * 0.85), 0.008);
  b = smin(b, sdSphere(q - c.aR2.xyz, c.aR2.w), 0.008);
  return min(a, b);
}

vec3 footPos(Char c, float side) {
  float x = side < 0.0 ? c.legs.x : c.legs.y;
  float lift = side < 0.0 ? c.legs.z : c.legs.w;
  return vec3(x, 0.05 + lift, 0.03);
}

float legsSDF(Char c, vec3 q) {
  float d = 1e5;
  for (int s = 0; s < 2; s++) {
    float side = s == 0 ? -1.0 : 1.0;
    vec3 f = footPos(c, side);
    float leg = sdCapsule(q, vec3(0.1 * side, 0.15, 0.0), f + vec3(0.0, 0.03, -0.025), 0.068);
    float foot = sdEllipsoid(q - f, vec3(0.08, 0.052, 0.1));
    d = min(d, smin(leg, foot, 0.01));
  }
  return d;
}

float earsSDF(Char c, vec3 h) {
  int et = int(c.body.w + 0.5);
  if (et == 0) return 1e5;
  vec3 hc = headC(c), hr = headR(c);
  vec3 e = vec3(abs(h.x), h.y, h.z) - hc;
  if (et == 1) {            // bunny
    e -= vec3(0.11, hr.y * 0.82, -0.02);
    e.xy = rot2(0.16) * e.xy;
    return sdEllipsoid(e - vec3(0.0, 0.17, 0.0), vec3(0.068, 0.2, 0.045));
  }
  if (et == 2) {            // bear
    e -= vec3(0.2, hr.y * 0.72, -0.02);
    return sdEllipsoid(e, vec3(0.085, 0.085, 0.05));
  }
  // cat
  e -= vec3(0.15, hr.y * 0.78, 0.0);
  e.xy = rot2(0.25) * e.xy;
  return sdRoundCone(e, vec3(0.0, 0.0, 0.0), vec3(0.0, 0.11, 0.0), 0.07, 0.015);
}

float mohawkSDF(Char c, vec3 h) {
  if (int(c.hair.x + 0.5) != 1) return 1e5;
  vec3 hc = headC(c), hr = headR(c);
  float d = 1e5;
  for (int k = 0; k < 5; k++) {
    float a = -0.75 + float(k) * 0.42;             // from forehead to the back
    vec3 base = hc + vec3(0.0, cos(a) * hr.y * 0.92, sin(a) * hr.z * 0.92);
    vec3 dir = normalize(vec3(0.0, cos(a), sin(a) * 1.1));
    float len = 0.13 - abs(float(k) - 1.5) * 0.012;
    d = smin(d, sdRoundCone(h, base, base + dir * len, 0.045, 0.012), 0.02);
  }
  return d;
}

float tuftSDF(Char c, vec3 h) {
  if (int(c.hair.x + 0.5) != 2) return 1e5;
  vec3 hc = headC(c), hr = headR(c);
  vec3 b = hc + vec3(0.0, hr.y * 0.95, 0.04);
  float d = sdRoundCone(h, b, b + vec3(0.02, 0.07, 0.03), 0.03, 0.012);
  d = smin(d, sdRoundCone(h, b, b + vec3(-0.035, 0.055, 0.0), 0.025, 0.01), 0.01);
  return d;
}

vec3 warp(Char c, vec3 q) {
  q.x += c.wob.x * sin(q.y * 8.0 + c.wob.y);
  return q;
}

float skinSDF(Char c, vec3 q) {
  vec3 h = toHead(c, q);
  float d = smin(sdEllipsoid(q - TORSO_C, torsoR(c)), sdEllipsoid(h - headC(c), headR(c)), 0.022);
  d = smin(d, armsSDF(c, q, 0.0), 0.012);
  d = smin(d, legsSDF(c, q), 0.012);
  d = smin(d, earsSDF(c, h), 0.012);
  return d;
}

float mapBase(Char c, vec3 q) {
  q = warp(c, q);
  float d = skinSDF(c, q);
  vec3 h = toHead(c, q);
  d = min(d, mohawkSDF(c, h));
  d = min(d, tuftSDF(c, h));
  vec3 dp = q - c.poke.xyz;
  d += c.poke.w * exp(-dot(dp, dp) * 45.0);
  return d;
}

// ------------------------------------------------------------- clothing
float topShell(Char c, vec3 q, out float region) {
  int t = int(c.top.x + 0.5);
  region = 1.0;
  if (t == 0) return 1e5;
  float off = c.col.w * 0.3 + 0.014;
  float y0 = t == 3 ? 0.03 : (t == 4 ? 0.12 : 0.13);
  float y1 = 0.475;
  vec3 r = torsoR(c) + off;
  float shell = sdEllipsoid(q - TORSO_C, r);
  if (t == 3) {             // lab coat flares over the hips
    float skirt = sdCappedCone(q - vec3(0.0, 0.11, 0.0), 0.09, 0.27 * c.body.x + off, 0.23 * c.body.x + off);
    shell = smin(shell, skirt, 0.04);
  }
  float band = max(y0 - q.y, q.y - y1);
  // open front for vest / jacket / coat
  if (t <= 3) {
    float gap = (t == 1 ? 0.045 : 0.028) + max(q.y - 0.27, 0.0) * 0.5;
    float open = min(gap - abs(q.x), q.z - 0.02);
    band = max(band, open);
  }
  region = band;
  float d = max(shell, band);
  // sleeves
  if (t >= 2) {
    float s = off + 0.004;
    float sl = min(sdCapsuleT(q, c.aL0.xyz, c.aL1.xyz, c.aL0.w + s, c.aL1.w + s),
                   sdCapsuleT(q, c.aR0.xyz, c.aR1.xyz, c.aR0.w + s, c.aR1.w + s));
    if (t != 4) {           // long sleeves
      vec3 wl = mix(c.aL1.xyz, c.aL2.xyz, 0.55), wr = mix(c.aR1.xyz, c.aR2.xyz, 0.55);
      sl = min(sl, min(sdCapsuleT(q, c.aL1.xyz, wl, c.aL1.w + s, c.aL1.w + s * 1.2),
                       sdCapsuleT(q, c.aR1.xyz, wr, c.aR1.w + s, c.aR1.w + s * 1.2)));
    }
    d = smin(d, sl, 0.02);
  }
  return d;
}

float clothMask(Char c, vec3 q) {
  float region;
  float d = topShell(c, q, region);
  float m = 1.0 - smoothstep(-0.005, 0.03, d - 0.0);
  int nk = int(c.neck.x + 0.5);
  if (nk == 1) {            // bandana bib
    float bib = max(abs(q.x) - max(0.47 - q.y, 0.0) * 1.15, max(0.33 - q.y, q.y - 0.47));
    m = max(m, (1.0 - smoothstep(-0.01, 0.02, bib)) * step(0.0, q.z));
  }
  return m;
}

// ------------------------------------------------------------- hard parts
// ids: 1 eye, 2 thread, 3 mouth, 4 tongue, 5 top, 6 trim, 7 hat, 8 hat band,
//      9 lens, 10 metal (silver), 11 gold, 12 bandana, 13 belt, 14 boots,
//      15 bat, 16 glass, 17 liquid, 18 beak, 19 bird feet, 20 keyboard,
//      21 keys, 22 bow, 23 nose, 24 frame
float hardParts(Char c, vec3 q, out int id) {
  q = warp(c, q);
  id = 0;
  float d = 1e5;
  vec3 h = toHead(c, q);
  vec3 hc = headC(c), hr = headR(c);
  float fl = c.col.w;
  int sp = species(c);

  // ---- face (head space), bounded
  if (length(h - hc) < 0.48) {
    float s = c.eye.y * (1.0 + 0.1 * c.wob.z);
    float ex = 0.094 * c.eye.z * c.body.y;
    float ey = hc.y + (c.eye.w - 0.012) * c.body.y;
    vec2 look = c.eye2.zw * vec2(0.022, 0.015);
    int kind = int(c.eye.x + 0.5);
    float blink = c.eye2.x;
    float open = (1.0 - blink * 0.93) * (1.0 - c.eye2.y * 0.5);
    for (int k = 0; k < 2; k++) {
      float side = k == 0 ? -1.0 : 1.0;
      vec3 a = facePoint(c, vec2(side * ex + look.x, ey + look.y));
      vec3 n = normalize((a - hc) / (hr * hr));
      vec3 p = h - a;
      float de;
      if (kind == 1 || kind == 2 || blink > 0.85) {
        float r = 0.034 * s;
        vec3 t = p - n * 0.004;
        if (kind == 2 || blink > 0.85) de = sdCapsule(t, vec3(-r * 0.9, 0.0, 0.0), vec3(r * 0.9, 0.0, 0.0), 0.0075 * s);
        else {
          vec3 u = t + vec3(0.0, r * 0.5, 0.0);
          de = sdCappedTorus(u, vec2(sin(1.15), cos(1.15)), r, 0.0078 * s);
        }
        if (de < d) { d = de; id = 2; }
      } else {
        float big = kind == 3 ? 1.35 : 1.0;
        vec3 e = p - n * (0.006 * s);
        de = sdEllipsoid(e, vec3(0.031, 0.034 * open, 0.027) * s * big);
        if (de < d) { d = de; id = 1; }
      }
    }
    // mouth
    int mt = int(c.mouth.x + 0.5);
    float mo = c.mouth.y;
    vec3 ma = facePoint(c, vec2(0.0, ey - 0.078 * c.body.y));
    vec3 mn = normalize((ma - hc) / (hr * hr));
    vec3 mp = h - ma - mn * 0.002;
    if (sp == 2) {          // beak
      vec3 bp = h - facePoint(c, vec2(0.0, ey - 0.05 * c.body.y));
      float bk = sdRoundCone(bp, vec3(0.0, 0.0, -0.01), vec3(0.0, -0.012, 0.06), 0.034, 0.008);
      bk = smax(bk, -(bp.y + 0.006 + 0.015 * mo), 0.004) ;
      float bk2 = sdRoundCone(bp, vec3(0.0, -0.012 - 0.02 * mo, -0.012), vec3(0.0, -0.022 - 0.02 * mo, 0.04), 0.026, 0.008);
      bk = min(bk, bk2);
      if (bk < d) { d = bk; id = 18; }
    } else if (mt == 1 || mo > 0.05) {
      float o = max(mo, mt == 1 ? 0.45 : 0.0);
      vec3 m = mp;
      m.y -= 9.0 * m.x * m.x * c.mouth.z;
      float cav = sdEllipsoid(m, vec3(0.036, 0.008 + 0.026 * o, 0.016));
      cav = max(cav, m.y - 0.006 - 0.004 * o);
      if (cav < d) { d = cav; id = 3; }
      float tg = sdEllipsoid(m - vec3(0.0, -0.012 * o, 0.006), vec3(0.02, 0.011 * o, 0.012));
      if (o > 0.25 && tg < d) { d = tg; id = 4; }
    } else if (mt == 0) {
      float r = 0.03;
      vec3 u = mp - vec3(0.0, r * 0.7, 0.0);
      float sm = sdCappedTorus(vec3(u.x, -u.y, u.z), vec2(sin(0.8), cos(0.8)), r * (1.0 + 0.3 * c.mouth.z), 0.0062);
      if (sm < d) { d = sm; id = 2; }
    } else if (mt == 2) {   // tiny "o"
      float o = sdTorusZ(mp, 0.012, 0.005);
      if (o < d) { d = o; id = 2; }
    }
  }

  // ---- hats (head space)
  int ht = int(c.hat.x + 0.5);
  if (ht > 0 && length(h - hc) < 0.75) {
    vec3 top = hc + vec3(0.0, hr.y * 0.78 + fl * 0.6, 0.0);
    vec3 p = h - top;
    if (ht == 1) {          // cowboy hat
      p.yz = rot2(-0.12) * p.yz;
      vec3 b = p;
      b.y -= 0.18 * b.x * b.x / 0.1 * 0.5;      // curled brim
      float brim = max(length(b.xz / vec2(1.0, 0.85)) - 0.36, abs(b.y + 0.02) - 0.012) - 0.006;
      vec3 cr = p - vec3(0.0, 0.08, 0.0);
      float crown = sdRoundCylY(cr, 0.175, 0.095, 0.05);
      crown = smax(crown, -sdEllipsoid(cr - vec3(0.0, 0.11, 0.0), vec3(0.04, 0.05, 0.14)), 0.02);
      float band = max(sdRoundCylY(cr + vec3(0.0, 0.055, 0.0), 0.183, 0.022, 0.006), -crown - 0.012);
      float hat = smin(brim, crown, 0.02);
      if (hat < d) { d = hat; id = 7; }
      if (band < d) { d = band; id = 8; }
    } else if (ht == 2) {   // baseball cap hugging the crown of the head
      vec3 hp = h - hc;
      float shell = sdEllipsoid(hp, hr + fl * 0.45 + 0.014);
      float cut = hp.y - hr.y * 0.3 + hp.z * 0.32;
      float dome = smax(shell, -cut, 0.012);
      // bill: a flattened half-disc sticking out at the front
      vec3 bp = hp - vec3(0.0, hr.y * 0.3 - hr.z * 0.32 * 0.9 + 0.01, hr.z * 0.86);
      bp.yz = rot2(0.18) * bp.yz;
      float bill = sdEllipsoid(bp, vec3(0.19, 0.012, 0.15) * c.body.y);
      bill = max(bill, -bp.z + 0.005);
      float btn = sdSphere(hp - vec3(0.0, hr.y + fl * 0.45 + 0.012, 0.0), 0.02);
      float cap = min(min(dome, bill), btn);
      if (cap < d) { d = cap; id = 7; }
    } else if (ht == 3) {   // satin bow
      vec3 bp = p - vec3(0.1, -0.01, 0.06);
      bp.xy = rot2(-0.35) * bp.xy;
      vec3 w = vec3(abs(bp.x), bp.y, bp.z);
      float lobe = sdRoundCone(w * vec3(1.0, 1.0, 1.8), vec3(0.01, 0.0, 0.0), vec3(0.075, 0.0, 0.0), 0.02, 0.05) / 1.8;
      float knot = sdSphere(bp, 0.03);
      float bow = smin(lobe, knot, 0.01);
      if (bow < d) { d = bow; id = 22; }
    } else if (ht == 4) {   // crown
      vec3 k = p - vec3(0.0, 0.0, 0.0);
      float band = max(abs(length(k.xz) - 0.15) - 0.012, abs(k.y - 0.035) - 0.035);
      float an = atan(k.z, k.x);
      float sector = 6.2831853 / 7.0;
      float a2 = mod(an + sector * 0.5, sector) - sector * 0.5;
      vec3 spk = vec3(length(k.xz) * cos(a2), k.y, length(k.xz) * sin(a2)) - vec3(0.15, 0.1, 0.0);
      float cr = min(band, sdSphere(spk, 0.02));
      if (cr < d) { d = cr; id = 11; }
    }
  }

  // ---- eyewear (head space)
  int ew = int(c.eyew.x + 0.5);
  if (ew > 0 && length(h - hc) < 0.6) {
    float ex = 0.094 * c.eye.z * c.body.y;
    float ey = hc.y + (c.eye.w - 0.012) * c.body.y;
    if (ew == 1) {          // goggles pushed up on the forehead
      float gy = ey + 0.11 * c.body.y;
      float gd = 1e5, rim = 1e5;
      for (int k = 0; k < 2; k++) {
        float side = k == 0 ? -1.0 : 1.0;
        vec3 a = facePoint(c, vec2(side * ex * 1.05, gy));
        vec3 n = normalize((a - hc) / (hr * hr));
        vec3 p = h - a - n * (fl + 0.015);
        // orient the lens along the head normal
        vec3 zz = n, xx = normalize(cross(vec3(0.0, 1.0, 0.0), zz)), yy = cross(zz, xx);
        vec3 lp = vec3(dot(p, xx), dot(p, yy), dot(p, zz));
        float cyl = max(length(lp.xy) - 0.058, abs(lp.z) - 0.028);
        rim = min(rim, max(abs(length(lp.xy) - 0.058) - 0.01, abs(lp.z - 0.012) - 0.02));
        gd = min(gd, max(length(lp.xy) - 0.05, abs(lp.z - 0.03) - 0.004));
      }
      vec3 sp2 = h - vec3(hc.x, gy + 0.005, hc.z);
      float strap = max(abs(length(sp2.xz / vec2(hr.x, hr.z) * hr.x) - hr.x - fl - 0.008) - 0.008, abs(sp2.y) - 0.022);
      if (strap < d) { d = strap; id = 13; }
      if (rim < d) { d = rim; id = 10; }
      if (gd < d) { d = gd; id = 9; }
    } else {                // sunglasses / round glasses
      float gy = ey;
      float zf = facePoint(c, vec2(0.0, gy)).z + fl + 0.02;
      float R = ew == 2 ? 0.07 : 0.06;
      vec3 pl = h - vec3(-ex, gy, zf), pr = h - vec3(ex, gy, zf);
      float fr = min(sdTorusZ(pl, R, 0.009), sdTorusZ(pr, R, 0.009));
      fr = min(fr, sdCapsule(h, vec3(-ex + R, gy + 0.01, zf), vec3(ex - R, gy + 0.01, zf), 0.008));
      fr = min(fr, sdCapsule(h, vec3(-ex - R, gy + 0.01, zf), vec3(-hr.x - fl, gy + 0.02, hc.z + 0.02), 0.008));
      fr = min(fr, sdCapsule(h, vec3(ex + R, gy + 0.01, zf), vec3(hr.x + fl, gy + 0.02, hc.z + 0.02), 0.008));
      if (fr < d) { d = fr; id = 24; }
      if (ew == 2) {
        float ln = min(max(length(pl.xy) - R, abs(pl.z) - 0.005), max(length(pr.xy) - R, abs(pr.z) - 0.005));
        if (ln < d) { d = ln; id = 9; }
      }
    }
  }

  // ---- outfit (body space)
  int tt = int(c.top.x + 0.5);
  if (tt > 0 && length(q - TORSO_C) < 0.6) {
    float region;
    float sh = topShell(c, q, region);
    if (sh < d) { d = sh; id = 5; }
    if (tt == 2) {          // jacket collar + zipper pull + chain
      vec3 cp = q - vec3(0.0, 0.45, 0.0);
      float collar = max(sdTorus(cp, 0.15 * c.body.x + fl * 0.3, 0.03), -cp.z - 0.16);
      if (collar < d) { d = collar; id = 5; }
      // silver chain draped across the front, link by link on the jacket surface
      vec3 r = torsoR(c) + c.col.w * 0.3 + 0.02;
      float chain = 1e5;
      if (abs(q.x) < 0.2 && q.y > 0.1 && q.y < 0.3 && q.z > 0.0) {
        for (int k = 0; k < 9; k++) {
          float t = float(k) / 8.0;
          float x = mix(-0.12, 0.12, t) * c.body.x;
          float y = 0.24 - 0.07 * sin(3.14159 * t);
          vec2 u = vec2(x / r.x, (y - TORSO_C.y) / r.y);
          float z = r.z * sqrt(max(1.0 - dot(u, u), 0.05)) + 0.006;
          vec3 lp = q - vec3(x, y, z);
          float tang = cos(3.14159 * t) * 0.9;
          lp.xy = rot2(-tang * 0.5) * lp.xy;
          lp = (k % 2 == 0) ? lp : lp.xzy;
          chain = min(chain, sdTorusZ(lp * vec3(0.8, 1.0, 1.0), 0.011, 0.0042));
        }
      }
      if (chain < d) { d = chain; id = 10; }
    }
  }

  // ---- bandana knot + bib
  int nk = int(c.neck.x + 0.5);
  if (nk == 1 && length(q - NECK) < 0.4) {
    float off = c.col.w * 0.3 + 0.02;
    float shell = sdEllipsoid(q - TORSO_C, torsoR(c) + off + 0.004);
    float bib = max(abs(q.x) - max(0.47 - q.y, 0.0) * 1.15, max(0.33 - q.y, q.y - 0.47));
    bib = max(bib, -q.z);
    float band = max(shell, bib);
    vec3 kp = q - NECK;
    float ring = sdTorus(kp + vec3(0.0, 0.01, 0.0), 0.17 * c.body.x + fl * 0.4, 0.026);
    float bd = min(band, ring);
    if (bd < d) { d = bd; id = 12; }
  } else if (nk == 2 && length(q - NECK) < 0.4) {   // bow tie
    vec3 a = vec3(0.0, 0.445, torsoR(c).z * 0.62 + fl + 0.02);
    vec3 p = q - a;
    vec3 w = vec3(abs(p.x), p.y, p.z);
    float wing = sdRoundCone(vec3(w.x, w.y, w.z * 1.9), vec3(0.01, 0.0, 0.0), vec3(0.055, 0.0, 0.0), 0.014, 0.036) / 1.9;
    float knot = sdRoundBox(p, vec3(0.018, 0.022, 0.016), 0.01);
    float bow = smin(wing, knot, 0.006);
    if (bow < d) { d = bow; id = 25; }
  }

  // ---- belt + buckle
  if (c.belt.x > 0.5) {
    float off = c.col.w * 0.3 + 0.02;
    vec3 bq = q - vec3(0.0, 0.15, 0.0);
    vec3 r = torsoR(c);
    // torso radius at that height
    float k = sqrt(max(1.0 - sq((0.15 - TORSO_C.y) / r.y), 0.05));
    vec2 rr = r.xz * k + off;
    float ring = max(abs(length(bq.xz / rr) - 1.0) * min(rr.x, rr.y) - 0.012, abs(bq.y) - 0.026);
    if (ring < d) { d = ring; id = 13; }
    float buckle = sdRoundBox(bq - vec3(0.0, 0.0, rr.y + 0.006), vec3(0.04, 0.032, 0.008), 0.006);
    buckle = max(buckle, -sdRoundBox(bq - vec3(0.0, 0.0, rr.y + 0.006), vec3(0.024, 0.016, 0.02), 0.004));
    if (buckle < d) { d = buckle; id = 11; }
  }

  // ---- boots / bird feet
  if (c.belt.y > 0.5 || sp == 2) {
    for (int s = 0; s < 2; s++) {
      float side = s == 0 ? -1.0 : 1.0;
      vec3 f = footPos(c, side);
      if (sp == 2) {
        float toes = 1e5;
        for (int t = 0; t < 3; t++) {
          float a = (float(t) - 1.0) * 0.45;
          vec3 tip = f + vec3(sin(a) * 0.09, -0.04, cos(a) * 0.1);
          toes = min(toes, sdCapsule(q, f + vec3(0.0, -0.02, 0.0), tip, 0.018));
        }
        toes = min(toes, sdCapsule(q, f + vec3(0.0, -0.02, 0.0), vec3(0.1 * side, 0.16, 0.0), 0.022));
        if (toes < d) { d = toes; id = 19; }
      } else {
        float boot = sdEllipsoid(q - f - vec3(0.0, 0.005, 0.012), vec3(0.098, 0.068, 0.128));
        boot = smin(boot, sdCapsule(q, f + vec3(0.0, 0.03, -0.02), vec3(0.1 * side, 0.13, 0.0), 0.08), 0.012);
        boot = smax(boot, -(q.y - 0.002), 0.01);
        if (boot < d) { d = boot; id = 14; }
      }
    }
  }

  // ---- held item (right hand)
  int it = int(c.held.x + 0.5);
  if (it > 0) {
    vec3 hp = c.aR2.xyz;
    vec3 fw = normalize(c.aR2.xyz - c.aR1.xyz);
    if (it == 1) {          // baseball bat resting on the shoulder
      vec3 dir = normalize(vec3(-0.25, 0.9, -0.45));
      float bat = sdCapsuleT(q, hp - dir * 0.05, hp + dir * 0.42, 0.017, 0.038);
      if (bat < d) { d = bat; id = 15; }
    } else if (it == 2) {   // test tube
      vec3 b = hp + vec3(0.0, 0.0, 0.05);
      float glass = sdCapsule(q, b - vec3(0.0, 0.05, 0.0), b + vec3(0.0, 0.13, 0.0), 0.028);
      float liquid = max(sdCapsule(q, b - vec3(0.0, 0.05, 0.0), b + vec3(0.0, 0.13, 0.0), 0.022), q.y - b.y - 0.045);
      float lip = sdTorus(q - b - vec3(0.0, 0.155, 0.0), 0.03, 0.006);
      if (liquid < d) { d = liquid; id = 17; }
      float gl = min(max(glass, -liquid), lip);
      if (gl < d) { d = gl; id = 16; }
    } else if (it == 3) {   // mug
      vec3 b = hp + vec3(0.0, 0.03, 0.06);
      float mug = sdRoundCylY(q - b, 0.05, 0.055, 0.008);
      mug = max(mug, -sdCylinderY(q - b - vec3(0.0, 0.03, 0.0), 0.04, 0.06));
      float handle = sdTorus((q - b - vec3(0.055, 0.0, 0.0)).xzy, 0.025, 0.008);
      float m = min(mug, handle);
      if (m < d) { d = m; id = 16 + 0; }
    }
  }

  // ---- keyboard prop (working state)
  if (c.kb.x > 0.02) {
    vec3 kp = q - vec3(0.0, 0.2, 0.36);
    kp.yz = rot2(-0.25) * kp.yz;
    float base = sdRoundBox(kp, vec3(0.2, 0.016, 0.085) * c.kb.x, 0.012);
    if (base < d) { d = base; id = 20; }
    vec2 cell = vec2(0.034, 0.034);
    vec2 g = kp.xz;
    vec2 ci = clamp(floor(g / cell + 0.5), vec2(-5.0, -2.0), vec2(5.0, 2.0));
    vec2 lc = g - ci * cell;
    float tap = 0.006 * step(0.85, fract(sin(dot(ci, vec2(12.9898, 78.233)) + c.kb.y) * 43758.5));
    float key = sdRoundBox(vec3(lc.x, kp.y - 0.02 + tap, lc.y), vec3(0.014, 0.008, 0.014) * c.kb.x, 0.005);
    if (key < d) { d = key; id = 21; }
  }
  return d;
}

float mapHard(Char c, vec3 q) {
  int id;
  return hardParts(c, q, id);
}

float furLen(Char c, vec3 q) {
  q = warp(c, q);
  float L = c.col.w;
  vec3 h = toHead(c, q);
  vec3 hc = headC(c), hr = headR(c);
  // shorter, tidier pile on the face so features stay readable
  vec3 fp = (h - hc) / hr;
  float face = smoothstep(0.62, 0.2, length(fp.xy - vec2(0.0, c.eye.w - 0.16))) * smoothstep(0.2, 0.7, fp.z);
  // long fur keeps a tidy, short face patch (yeti); short fur just gets tidier
  float faceL = min(L * 0.45, 0.016);
  float m = face * (1.0 - faceL / max(L, 1e-4));
  // keep the bead eyes clear of fur
  float ex = 0.094 * c.eye.z * c.body.y;
  float ey = hc.y + (c.eye.w - 0.012) * c.body.y;
  float er = 0.05 * c.eye.y;
  vec3 el = facePoint(c, vec2(-ex, ey)), erp = facePoint(c, vec2(ex, ey));
  float de = min(length(h - el), length(h - erp));
  m = max(m, 1.0 - smoothstep(er, er * 1.9, de));
  m = max(m, clothMask(c, q));
  // hands and feet slightly shorter
  float hands = 1.0 - smoothstep(0.0, 0.05, min(length(q - c.aL2.xyz), length(q - c.aR2.xyz)) - c.aL2.w);
  m = max(m, hands * 0.35);
  vec3 dp = q - c.poke.xyz;
  m = max(m, sat(c.poke.w * 14.0) * exp(-dot(dp, dp) * 60.0) * 0.7);
  float mh = mohawkSDF(c, h);
  float base = skinSDF(c, q);
  float crest = 1.0 - smoothstep(-0.005, 0.02, mh - base);
  return L * (1.0 - m) * mix(1.0, 1.8, crest);
}

vec3 furCoord(Char c, vec3 q) {
  // fur on the head moves with the head
  vec3 h = toHead(c, q);
  float w = smoothstep(0.42, 0.56, q.y);
  return mix(q, h, w);
}

float furNominal(Char c) { return c.col.w * 0.55; }

Fur furAt(Char c, vec3 q, vec3 n) {
  q = warp(c, q);
  Fur f;
  vec3 col = c.col.rgb;
  vec3 h = toHead(c, q);
  vec3 hc = headC(c), hr = headR(c);
  float mh = mohawkSDF(c, h);
  float base = skinSDF(c, q);
  bool crest = mh < base + 0.004;
  if (crest) col = c.hair.yzw;
  int sp = species(c);
  if (sp == 2 && !crest) {
    // pigeon: darker wings, iridescent neck band
    float wingW = 1.0 - smoothstep(0.0, 0.04, min(sdCapsule(q, c.aL0.xyz, c.aL2.xyz, 0.08), sdCapsule(q, c.aR0.xyz, c.aR2.xyz, 0.08)));
    col = mix(col, col * 0.62, wingW);
    float neck = exp(-sq((q.y - 0.465) / 0.03));
    vec3 irid = mix(vec3(0.35, 0.22, 0.45), vec3(0.2, 0.42, 0.32), sat(n.x * 0.5 + 0.5));
    col = mix(col, irid, neck * 0.35);
  }
  // inner ears
  float ears = earsSDF(c, h);
  if (int(c.body.w + 0.5) == 1 && ears < base + 0.003) {
    vec3 e = vec3(abs(h.x), h.y, h.z) - hc;
    float inner = smoothstep(0.0, 0.02, h.z - hc.z + 0.0) * smoothstep(0.75, 0.9, (h.y - hc.y) / hr.y);
    col = mix(col, c.earC.rgb, inner * 0.85);
  }
  // blush
  if (c.cheek.x > 0.0) {
    float ex = 0.094 * c.eye.z * c.body.y;
    float cy = hc.y + (c.eye.w - 0.058) * c.body.y;
    vec3 cl = facePoint(c, vec2(-ex - 0.05, cy));
    vec3 cr = facePoint(c, vec2(ex + 0.05, cy));
    float b = max(exp(-dot(h - cl, h - cl) * 480.0), exp(-dot(h - cr, h - cr) * 480.0));
    col = mix(col, c.cheek.yzw, b * c.cheek.x);
  }
  f.tip = mix(col, vec3(1.0), 0.12);
  f.root = col * 0.8;
  f.dens = c.fur.x;
  f.scale = c.fur.y;
  f.clump = c.fur.z;
  f.droop = c.fur.w;
  f.sheen = 1.0;
  f.occ = 0.6;
  return f;
}

// 7-segment style digit for the jersey number
float sdDigit(vec2 p, int n) {
  // segments a..g as bits 0..6
  int masks[10] = int[10](0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F);
  int m = masks[clamp(n, 0, 9)];
  float w = 0.05, h = 0.05;
  float d = 1e5;
  if ((m & 1) != 0) d = min(d, sd2Segment(p, vec2(-w, 2.0 * h), vec2(w, 2.0 * h)));
  if ((m & 2) != 0) d = min(d, sd2Segment(p, vec2(w, 2.0 * h), vec2(w, 0.0)));
  if ((m & 4) != 0) d = min(d, sd2Segment(p, vec2(w, 0.0), vec2(w, -2.0 * h)));
  if ((m & 8) != 0) d = min(d, sd2Segment(p, vec2(-w, -2.0 * h), vec2(w, -2.0 * h)));
  if ((m & 16) != 0) d = min(d, sd2Segment(p, vec2(-w, 0.0), vec2(-w, -2.0 * h)));
  if ((m & 32) != 0) d = min(d, sd2Segment(p, vec2(-w, 2.0 * h), vec2(-w, 0.0)));
  if ((m & 64) != 0) d = min(d, sd2Segment(p, vec2(-w, 0.0), vec2(w, 0.0)));
  return d - 0.016;
}

Surf surfAt(Char c, vec3 q, vec3 n) {
  int id;
  hardParts(c, q, id);
  q = warp(c, q);
  Surf s = surfDefault(vec3(0.02), n);
  if (id == 1) {                     // glossy bead eye
    s.alb = vec3(0.01); s.rough = 0.08; s.f0 = 0.05; s.clear = 0.8;
  } else if (id == 2) {              // stitched thread
    s.alb = vec3(0.03, 0.02, 0.02); s.rough = 0.6; s.sheen = 0.4;
  } else if (id == 3) {              // mouth
    s.alb = vec3(0.2, 0.02, 0.03); s.rough = 0.7;
  } else if (id == 4) {              // tongue
    s.alb = vec3(0.85, 0.3, 0.35); s.rough = 0.5; s.wrap = 0.4;
  } else if (id == 5) {              // outfit
    int t = int(c.top.x + 0.5);
    s.alb = c.top.yzw;
    if (t == 1) { s.rough = 0.85; s.sheen = 0.7; }                         // suede vest
    else if (t == 2) {                                                     // leather jacket
      s.rough = 0.32; s.clear = 0.35;
      vec3 g = noise4(q * 6.0).xyz - 0.5;
      s.n = normalize(n + g * 0.14);
      // zipper along the opening
      float zx = abs(abs(q.x) - (0.03 + max(q.y - 0.3, 0.0) * 0.45));
      if (zx < 0.008 && q.z > 0.0 && q.y < 0.48) { s.alb = vec3(0.6); s.metal = 1.0; s.rough = 0.3; }
    } else if (t == 3) {                                                   // lab coat
      s.rough = 0.7; s.sheen = 0.35; s.wrap = 0.2;
      // pocket outline
      vec2 pk = vec2(q.x - 0.12 * c.body.x, q.y - 0.21);
      if (abs(sd2Box(pk, vec2(0.05, 0.04))) < 0.004 && q.z > 0.0) s.alb *= 0.72;
    } else if (t == 4) {                                                   // jersey
      s.rough = 0.62; s.sheen = 0.45;
      float trim = 1.0 - smoothstep(0.004, 0.008, abs(q.y - 0.135));
      // number on the chest
      if (q.z > 0.0) {
        vec2 np = vec2(q.x, q.y - 0.27) * 1.35;
        np.x -= np.y * 0.22;   // athletic italic
        float dn = sdDigit(np, int(c.belt.z + 0.5));
        float aa = gFoot * 1.6;
        float m = 1.0 - smoothstep(-aa, aa, dn);
        s.alb = mix(s.alb, c.accent.rgb, m);
        // placket line
        if (abs(q.x) < 0.006 && q.y > 0.36) s.alb = mix(s.alb, c.accent.rgb, 0.8);
      }
      s.alb = mix(s.alb, c.accent.rgb, trim);
    }
    if (t != 2) {                                                          // woven micro-texture
      vec3 g = noise4(q * 34.0).xyz - 0.5;
      s.n = normalize(s.n + g * 0.12);
    }
  } else if (id == 7) {              // hats
    int ht = int(c.hat.x + 0.5);
    s.alb = c.hat.yzw;
    if (ht == 1) { s.rough = 0.85; s.sheen = 0.6; }
    else {
      s.rough = 0.65; s.sheen = 0.4;
      // cap logo
      vec3 hh = toHead(c, q) - headC(c);
      vec2 lp = vec2(hh.x, hh.y - headR(c).y * 0.62);
      float aa = gFoot * 1.5;
      if (hh.z > 0.12) s.alb = mix(s.alb, c.accent.rgb, 1.0 - smoothstep(0.034 - aa, 0.034 + aa, length(lp)));
    }
  } else if (id == 8) {              // hat band
    s.alb = vec3(0.08, 0.05, 0.03); s.rough = 0.4; s.clear = 0.3;
  } else if (id == 9) {              // lens
    s.alb = vec3(0.02, 0.03, 0.035); s.rough = 0.04; s.f0 = 0.08; s.clear = 1.0;
    if (int(c.eyew.x + 0.5) == 1) { s.alb = vec3(0.25, 0.55, 0.6); s.rough = 0.05; s.f0 = 0.06; }
  } else if (id == 10) {             // silver
    s.alb = vec3(0.86, 0.87, 0.9); s.metal = 1.0; s.rough = 0.22;
  } else if (id == 11) {             // gold
    s.alb = vec3(1.0, 0.77, 0.33); s.metal = 1.0; s.rough = 0.22;
  } else if (id == 12) {             // bandana with dots
    s.alb = c.neck.yzw; s.rough = 0.7; s.sheen = 0.4;
    vec2 g = q.xy * 48.0;
    vec2 cell = fract(g) - 0.5;
    if (length(cell) < 0.16) s.alb = vec3(0.95);
  } else if (id == 13) {             // belt / strap leather
    s.alb = vec3(0.1, 0.06, 0.035); s.rough = 0.42; s.clear = 0.25;
  } else if (id == 14) {             // boots
    s.alb = vec3(0.32, 0.17, 0.08); s.rough = 0.4; s.clear = 0.35;
    vec3 g = noise4(q * 12.0).xyz - 0.5;
    s.n = normalize(n + g * 0.2);
  } else if (id == 15) {             // wood
    float grain = noise(q * vec3(40.0, 6.0, 40.0)) * 0.5 + 0.5 * sin(q.y * 140.0 + noise(q * 10.0) * 6.0) * 0.5 + 0.5;
    s.alb = mix(vec3(0.55, 0.36, 0.18), vec3(0.75, 0.52, 0.28), grain);
    s.rough = 0.4; s.clear = 0.5;
  } else if (id == 16) {             // glass / ceramic
    if (int(c.held.x + 0.5) == 3) { s.alb = c.accent.rgb; s.rough = 0.25; s.clear = 0.8; }
    else { s.alb = vec3(0.55, 0.62, 0.6); s.rough = 0.04; s.f0 = 0.06; s.clear = 1.0; s.wrap = 0.5; }
  } else if (id == 17) {             // glowing liquid
    s.alb = vec3(0.3, 0.95, 0.25); s.rough = 0.15; s.clear = 0.6; s.emis = vec3(0.3, 1.0, 0.2) * 1.4;
  } else if (id == 18 || id == 19) { // beak / bird feet
    s.alb = vec3(0.98, 0.5, 0.12); s.rough = 0.38; s.clear = 0.3; s.wrap = 0.3;
  } else if (id == 20) {             // keyboard
    s.alb = vec3(0.92, 0.92, 0.94); s.rough = 0.35; s.clear = 0.3;
  } else if (id == 21) {             // keys
    s.alb = vec3(0.97); s.rough = 0.45;
  } else if (id == 22 || id == 25) { // satin bow (hat) / bow tie (neck)
    s.alb = id == 22 ? c.hat.yzw : c.neck.yzw;
    s.rough = 0.36; s.sheen = 0.8; s.wrap = 0.3;
  } else if (id == 24) {             // frames
    s.alb = c.eyew.yzw; s.rough = 0.25; s.clear = 0.5;
  }
  return s;
}

vec4 anchorPass(ivec2 px) { return vec4(0.0); }
