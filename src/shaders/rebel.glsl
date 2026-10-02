// ---------------------------------------------------------------------------
// Rebels family (RebelMouse-inspired): chibi mouse, panda, raccoon and fox.
// Simple, iconic silhouettes; big eyes whose pupils track the pointer;
// expressive brows; swishing tails; the signature red bandana. The skin is
// either glossy vinyl (hard), plush (volumetric fur) or flat graphic paint.
// ---------------------------------------------------------------------------
#define HAS_FUR 1

struct Char {
  vec4 col;    // body colour, fur length
  vec4 col2;   // light colour (muzzle, belly...), material 0 vinyl 1 plush 2 flat
  vec4 col3;   // dark colour (markings, socks, brows), species
  vec4 body;   // chubbiness, head size, ear size, tail size
  vec4 hq;     // head rotation quaternion (relative to body)
  vec4 eye;    // kind, size, spacing, height
  vec4 eye2;   // blink, upper lid, look x, look y
  vec4 brow;   // left angle, right angle, left raise, right raise
  vec4 mouth;  // style, open, smile, lower lid
  vec4 aL0; vec4 aL1; vec4 aL2;
  vec4 aR0; vec4 aR1; vec4 aR2;
  vec4 t0; vec4 t1; vec4 t2; vec4 t3;   // tail chain (xyz, radius)
  vec4 band;   // bandana style, colour
  vec4 bandA;  // knot sway, ribbon sway, pupil scale, whiskers
  vec4 prop;   // prop type, flag style, wave phase, -
  vec4 glass;  // glasses type, frame colour
  vec4 ears;   // wiggle left, wiggle right, perk, -
  vec4 poke;
  vec4 wob;    // wobble amplitude, phase, excite, blush
  vec4 extra;  // laptop, gears, gear phase, -
  vec4 accent; // accent colour (inner ears, nose, paws), -
  vec4 legs;   // foot lift left, right, -, -
  vec4 eyeR;   // right eye kind (winks), -, -, -
};

Char loadChar(int i) {
  Char c;
  c.col = D(i, 0); c.col2 = D(i, 1); c.col3 = D(i, 2); c.body = D(i, 3); c.hq = D(i, 4);
  c.eye = D(i, 5); c.eye2 = D(i, 6); c.brow = D(i, 7); c.mouth = D(i, 8);
  c.aL0 = D(i, 9); c.aL1 = D(i, 10); c.aL2 = D(i, 11);
  c.aR0 = D(i, 12); c.aR1 = D(i, 13); c.aR2 = D(i, 14);
  c.t0 = D(i, 15); c.t1 = D(i, 16); c.t2 = D(i, 17); c.t3 = D(i, 18);
  c.band = D(i, 19); c.bandA = D(i, 20); c.prop = D(i, 21); c.glass = D(i, 22);
  c.ears = D(i, 23); c.poke = D(i, 24); c.wob = D(i, 25); c.extra = D(i, 26);
  c.accent = D(i, 27); c.legs = D(i, 28); c.eyeR = D(i, 29);
  return c;
}

const vec3 NECK = vec3(0.0, 0.45, 0.0);
const vec3 TORSO_C = vec3(0.0, 0.265, 0.0);

// per species (mouse, panda, raccoon, fox), head space relative to the head centre
const vec3 EAR_B[4] = vec3[4](vec3(0.18, 0.15, -0.03), vec3(0.185, 0.18, -0.02), vec3(0.15, 0.17, -0.02), vec3(0.135, 0.18, -0.02));
const vec2 EAR_T[4] = vec2[4](vec2(0.25, 0.25), vec2(0.205, 0.21), vec2(0.215, 0.315), vec2(0.205, 0.39));
const vec4 EAR_R[4] = vec4[4](vec4(0.12, 0.135, 0.022, 0.034), vec4(0.07, 0.07, 0.04, 0.0), vec4(0.075, 0.028, 0.032, 0.03), vec4(0.08, 0.012, 0.034, 0.028));
const vec3 MUZ_A[4] = vec3[4](vec3(0.0, -0.035, 0.17), vec3(0.0, -0.06, 0.18), vec3(0.0, -0.045, 0.17), vec3(0.0, -0.04, 0.16));
const vec3 MUZ_B[4] = vec3[4](vec3(0.0, -0.065, 0.315), vec3(0.0, -0.075, 0.25), vec3(0.0, -0.07, 0.3), vec3(0.0, -0.075, 0.335));
const vec3 MUZ_R[4] = vec3[4](vec3(0.1, 0.03, 0.03), vec3(0.1, 0.072, 0.034), vec3(0.1, 0.038, 0.03), vec3(0.105, 0.028, 0.027));

int species(Char c) { return int(c.col3.w + 0.5); }
int material(Char c) { return int(c.col2.w + 0.5); }
vec3 headC(Char c) { return NECK + vec3(0.0, 0.215 * c.body.y, 0.0); }
vec3 headR(Char c) { return vec3(0.3, 0.262, 0.275) * c.body.y; }
vec3 torsoR(Char c) { return vec3(0.215 * c.body.x, 0.195, 0.2 * c.body.x); }
vec3 toHead(Char c, vec3 q) { return qinv(c.hq, q - NECK) + NECK; }

vec3 facePoint(Char c, vec2 xy) {
  vec3 hc = headC(c), hr = headR(c);
  vec2 u = (xy - hc.xy) / hr.xy;
  float z = hr.z * sqrt(max(1.0 - dot(u, u), 0.02));
  return vec3(xy, hc.z + z);
}

vec3 warp(Char c, vec3 q) {
  q.x += c.wob.x * sin(q.y * 8.0 + c.wob.y);
  return q;
}

// 2D uneven capsule between arbitrary points a (radius r1) and b (radius r2)
float sd2Cone(vec2 p, vec2 a, vec2 b, float r1, float r2) {
  vec2 ba = b - a;
  float l = max(length(ba), 1e-4);
  vec2 dir = ba / l;
  vec2 lp = vec2(dot(p - a, vec2(dir.y, -dir.x)), dot(p - a, dir));
  return sd2UnevenCapsule(lp, r1, r2, l);
}

// ------------------------------------------------------------------ parts
// ears: flat rounded "pillows" with an inner panel; wiggle flops them outward
float earsSDF(Char c, vec3 h, out float inner) {
  int sp = species(c);
  vec3 hc = headC(c);
  float hs = c.body.y, es = c.body.z;
  vec3 B = EAR_B[sp] * hs;
  vec2 T = EAR_T[sp] * hs;
  vec4 R = EAR_R[sp] * hs;
  float d = 1e5;
  inner = 0.0;
  for (int k = 0; k < 2; k++) {
    float side = k == 0 ? -1.0 : 1.0;
    vec3 e = h - hc;
    e.x *= side;
    vec3 ep = e - B;
    float wig = k == 0 ? c.ears.x : c.ears.y;
    ep.xy = rot2(wig) * ep.xy;
    ep.yz = rot2(-c.ears.z * 0.5) * ep.yz;
    ep /= es;
    float d2 = sd2Cone(ep.xy, vec2(0.0), T - B.xy, R.x, R.y);
    float th = R.z;
    float dd = (length(vec2(max(d2 + th, 0.0), ep.z)) - th) * es;
    if (dd < d) {
      d = dd;
      inner = R.w > 0.0 ? (1.0 - smoothstep(-0.006, 0.006, d2 + R.w)) * step(0.0, ep.z) : 0.0;
    }
  }
  return d;
}

float muzzleSDF(Char c, vec3 h) {
  int sp = species(c);
  vec3 hc = headC(c);
  float hs = c.body.y;
  return sdRoundCone(h - hc, MUZ_A[sp] * hs, MUZ_B[sp] * hs, MUZ_R[sp].x * hs, MUZ_R[sp].y * hs);
}

float armsSDF(Char c, vec3 q) {
  float a = sdCapsuleT(q, c.aL0.xyz, c.aL1.xyz, c.aL0.w, c.aL1.w);
  a = smin(a, sdCapsuleT(q, c.aL1.xyz, c.aL2.xyz, c.aL1.w, c.aL2.w * 0.85), 0.008);
  float b = sdCapsuleT(q, c.aR0.xyz, c.aR1.xyz, c.aR0.w, c.aR1.w);
  b = smin(b, sdCapsuleT(q, c.aR1.xyz, c.aR2.xyz, c.aR1.w, c.aR2.w * 0.85), 0.008);
  return min(a, b);
}
float handsSDF(Char c, vec3 q) {
  return min(sdSphere(q - c.aL2.xyz, c.aL2.w), sdSphere(q - c.aR2.xyz, c.aR2.w));
}

vec3 footPos(Char c, float side) {
  float lift = side < 0.0 ? c.legs.x : c.legs.y;
  return vec3(0.1 * side * c.body.x, 0.046 + lift, 0.03);
}
float legsSDF(Char c, vec3 q) {
  float d = 1e5;
  for (int s = 0; s < 2; s++) {
    float side = s == 0 ? -1.0 : 1.0;
    vec3 f = footPos(c, side);
    d = min(d, sdCapsule(q, vec3(0.09 * side * c.body.x, 0.14, 0.0), f + vec3(0.0, 0.03, -0.02), 0.06));
  }
  return d;
}
float feetSDF(Char c, vec3 q) {
  return min(sdEllipsoid(q - footPos(c, -1.0), vec3(0.072, 0.048, 0.095)),
             sdEllipsoid(q - footPos(c, 1.0), vec3(0.072, 0.048, 0.095)));
}

// tail chain; t returns the position along the tail (0 root .. 1 tip)
float tailSDF(Char c, vec3 q, out float t) {
  float d0 = sdRoundCone(q, c.t0.xyz, c.t1.xyz, c.t0.w, c.t1.w);
  float d1 = sdRoundCone(q, c.t1.xyz, c.t2.xyz, c.t1.w, c.t2.w);
  float d2 = sdRoundCone(q, c.t2.xyz, c.t3.xyz, c.t2.w, c.t3.w);
  float d = min(d0, min(d1, d2));
  vec3 a = d == d0 ? c.t0.xyz : (d == d1 ? c.t1.xyz : c.t2.xyz);
  vec3 b = d == d0 ? c.t1.xyz : (d == d1 ? c.t2.xyz : c.t3.xyz);
  vec3 ba = b - a;
  float hh = sat(dot(q - a, ba) / max(dot(ba, ba), 1e-6));
  t = ((d == d0 ? 0.0 : (d == d1 ? 1.0 : 2.0)) + hh) / 3.0;
  return smin(smin(d0, d1, 0.012), d2, 0.012);
}

float skinSDF(Char c, vec3 q) {
  vec3 h = toHead(c, q);
  float inner, tt;
  float d = smin(sdEllipsoid(q - TORSO_C, torsoR(c)), sdEllipsoid(h - headC(c), headR(c)), 0.02);
  d = smin(d, muzzleSDF(c, h), 0.018);
  d = smin(d, earsSDF(c, h, inner), 0.008);
  d = smin(d, min(armsSDF(c, q), handsSDF(c, q)), 0.01);
  d = smin(d, min(legsSDF(c, q), feetSDF(c, q)), 0.01);
  d = smin(d, tailSDF(c, q, tt), 0.012);
  return d;
}

float mapBase(Char c, vec3 q) {
  if (material(c) != 1) return 1e5;
  q = warp(c, q);
  vec3 dp = q - c.poke.xyz;
  return skinSDF(c, q) + c.poke.w * exp(-dot(dp, dp) * 45.0);
}

// brand mark: a front-facing mouse head with big round ears and a tapered snout
float mouseMark(vec2 g) {
  float head = sd2Cone(g, vec2(0.0, 0.006), vec2(0.0, -0.03), 0.025, 0.007);
  return min(head, length(vec2(abs(g.x) - 0.029, g.y - 0.022)) - 0.019);
}

// held props scale about the hand: a prop shrinks to nothing when it is stowed
vec3 propSpace(Char c, vec3 q) {
  return c.aR2.xyz + (q - c.aR2.xyz) / max(1.0 - c.prop.w, 0.02);
}
// the megaphone points up and out at rest and at the audience when shouting
vec3 megaphoneAxis(Char c) {
  vec3 fw = normalize(c.aR2.xyz - c.aR1.xyz);
  return normalize(mix(fw * 0.35 + vec3(0.7, 0.5, 0.35), vec3(0.8, 0.3, 0.6), c.extra.w));
}

// ------------------------------------------------------------- hard parts
// ids: 1 skin, 2 sclera, 3 pupil, 4 lid, 5 thread, 6 brow, 7 nose, 8 mouth,
//      9 tongue, 10 teeth, 11 whisker, 12 bandana, 13 frame, 14 lens,
//      15 pole, 16 flag cloth, 17 megaphone, 18 paper, 19 pencil,
//      20 laptop, 21 laptop logo, 22 gear
float hardParts(Char c, vec3 q, out int id) {
  q = warp(c, q);
  id = 0;
  float d = 1e5;
  int sp = species(c);
  float fl = material(c) == 1 ? c.col.w : 0.0;
  if (material(c) != 1) {
    vec3 dp = q - c.poke.xyz;
    float sk = skinSDF(c, q) + c.poke.w * exp(-dot(dp, dp) * 45.0);
    if (sk < d) { d = sk; id = 1; }
  }
  vec3 h = toHead(c, q);
  vec3 hc = headC(c), hr = headR(c);
  float hs = c.body.y;

  if (length(h - hc) < 0.62) {
    // ---- eyes: sclera + tracking pupils + lids, or closed "thread" arcs
    float s = c.eye.y * hs * (1.0 + 0.08 * c.wob.z);
    float ex = 0.1 * c.eye.z * hs;
    float ey = hc.y + (0.045 + c.eye.w) * hs;
    float blink = c.eye2.x;
    for (int k = 0; k < 2; k++) {
      float side = k == 0 ? -1.0 : 1.0;
      int kind = int((k == 0 ? c.eye.x : c.eyeR.x) + 0.5);
      vec3 a = facePoint(c, vec2(side * ex, ey));
      vec3 n = normalize((a - hc) / (hr * hr));
      vec3 R = vec3(0.058, 0.07, 0.04) * s * (kind == 3 ? 1.18 : 1.0);
      if (kind == 1 || kind == 2 || blink > 0.92) {
        vec3 p = h - a - n * (0.004 + fl * 0.6);
        float r = 0.045 * s;
        float de = (kind == 2 || blink > 0.92)
          ? sdCapsule(p, vec3(-r, 0.0, 0.0), vec3(r, 0.0, 0.0), 0.009 * s)
          : sdCappedTorus(p + vec3(0.0, r * 0.5, 0.0), vec2(sin(1.1), cos(1.1)), r, 0.0095 * s);
        if (de < d) { d = de; id = 5; }
      } else {
        vec3 ce = a + n * (R.z * 0.35 + fl * 0.6);
        vec3 e = h - ce;
        float sc = sdEllipsoid(e, R);
        // pupil rides the sclera towards the gaze direction
        vec2 look = c.eye2.zw * vec2(0.5, 0.42);
        vec3 pd = normalize(n + vec3(look, 0.0));
        float pr = 0.033 * s * c.bandA.z * (kind == 3 ? 0.85 : 1.0);
        vec3 pc = pd * R * 0.93;
        float pu = max(length(e - pc) - pr, sc - 0.003);
        float de = sc;
        int eid = 2;
        if (pu < de + 0.0015) { de = min(de, pu); eid = 3; }
        // upper lid (closes for blinks / squints), lower lid (smiles)
        float lidCut = mix(1.15, -1.05, max(blink, c.eye2.y));
        vec3 le = e;
        float lid = max(sdEllipsoid(e, R * 1.08), lidCut * R.y - le.y);
        float low = max(sdEllipsoid(e, R * 1.08), le.y - mix(-1.15, -0.25, c.mouth.w) * R.y);
        if (min(lid, low) < de && (blink > 0.01 || c.eye2.y > 0.01 || c.mouth.w > 0.01)) {
          de = min(lid, low);
          eid = 4;
        }
        if (de < d) { d = de; id = eid; }
      }
      // brows
      float ang = side < 0.0 ? c.brow.x : c.brow.y;
      float rise = side < 0.0 ? c.brow.z : c.brow.w;
      vec3 bc = facePoint(c, vec2(side * ex * 1.02, ey + (0.085 + (sp == 1 ? 0.03 : 0.0) + 0.035 * rise) * s));
      vec3 bn = normalize((bc - hc) / (hr * hr));
      vec3 bp = h - bc - bn * (0.006 + fl * 0.7);
      bp.xy = rot2(-side * ang) * bp.xy;   // positive angle: inner ends down (determined)
      float bw = 0.04 * s;
      bp.y += 0.009 * s * bp.x * bp.x / (bw * bw);   // gentle arch
      float br = 0.92 * sdCapsule(bp, vec3(-bw, 0.0, 0.0), vec3(bw, -0.004 * s, 0.0), 0.0115 * s);
      if (br < d) { d = br; id = 6; }
    }

    // ---- nose, mouth, teeth, whiskers on the muzzle
    vec3 mb = hc + MUZ_B[sp] * hs;
    float r2 = MUZ_R[sp].y * hs;
    vec3 noseC = mb + vec3(0.0, r2 * 0.45, r2 * 0.68 + fl * 0.5);
    float nr = MUZ_R[sp].z * hs;
    float nose = sp == 1 ? sdEllipsoid(h - noseC, vec3(1.25, 0.8, 0.85) * nr) : sdEllipsoid(h - noseC, vec3(1.05, 0.85, 0.9) * nr);
    if (nose < d) { d = nose; id = 7; }

    int ms = int(c.mouth.x + 0.5);
    float open = c.mouth.y;
    vec3 mc = mb + vec3(0.0, -r2 * 0.8 - 0.01 * hs, r2 * 0.45 + fl * 0.4);
    vec3 mp = h - mc;
    if (ms == 1) mp.xy = rot2(0.28) * (mp.xy - vec2(0.012, 0.0));
    if (open > 0.04 || ms == 2) {
      float o = max(open, ms == 2 ? 0.5 : 0.0);
      vec3 m = mp;
      m.y -= 10.0 * m.x * m.x * c.mouth.z;
      float cav = sdEllipsoid(m, vec3(0.034, 0.008 + 0.028 * o, 0.018) * hs);
      cav = max(cav, m.y - 0.005 * hs);
      if (cav < d) { d = cav; id = 8; }
      float tg = sdEllipsoid(m - vec3(0.0, -0.014 * o, 0.004) * hs, vec3(0.018, 0.01 * o, 0.012) * hs);
      if (o > 0.3 && tg < d) { d = tg; id = 9; }
    } else {
      float r = 0.032 * hs * (1.0 + 0.25 * abs(c.mouth.z));
      vec3 u = mp - vec3(0.0, r * 0.7 * sign(c.mouth.z + 1e-3), 0.0);
      float sm = sdCappedTorus(vec3(u.x, -u.y * sign(c.mouth.z + 1e-3), u.z), vec2(sin(0.75), cos(0.75)), r, 0.0058 * hs);
      if (sm < d) { d = sm; id = 5; }
    }
    if (ms == 3) {   // buck teeth
      vec3 tp = h - (mc + vec3(0.0, -0.012 * hs - open * 0.012, 0.004));
      tp.x = abs(tp.x) - 0.0095 * hs;
      float teeth = sdRoundBox(tp, vec3(0.008, 0.012, 0.004) * hs, 0.003 * hs);
      if (teeth < d) { d = teeth; id = 10; }
    }
    if (c.bandA.w > 0.5) {
      for (int k = 0; k < 2; k++) {
        float side = k == 0 ? -1.0 : 1.0;
        for (int w = 0; w < 3; w++) {
          float fw = float(w) - 1.0;
          vec3 st = mb + vec3(side * r2 * 0.85, 0.002 + fw * 0.011, -0.012) * vec3(1.0, hs, 1.0);
          vec3 en = st + vec3(side * 0.13, -0.008 + fw * 0.026, -0.04) * hs;
          float wh = sdCapsule(h, st, en, 0.0028 * hs);
          if (wh < d) { d = wh; id = 11; }
        }
      }
    }

    // ---- bandana
    int bs = int(c.band.x + 0.5);
    if (bs == 1 || bs == 2) {
      vec3 bp = h - hc;
      bp.yz = rot2(0.16) * bp.yz;
      float off = fl * 0.5 + 0.012 * hs;
      float shell = sdEllipsoid(bp, hr + off);
      float y0 = 0.165 * hs;
      float band = bs == 1 ? max(shell, abs(bp.y - y0) - 0.034 * hs) : max(shell, y0 - 0.02 * hs - bp.y);
      // knot at the back-right with two fluttering ribbon tails
      vec3 kp = vec3(hr.x * 0.62, y0, -hr.z * 0.8);
      float knot = sdEllipsoid(bp - kp, vec3(0.035, 0.03, 0.03) * hs);
      float rib = 1e5;
      for (int k = 0; k < 2; k++) {
        float fk = float(k);
        float sw = c.bandA.y * (1.0 + fk * 0.5) + fk * 0.35;
        vec3 dir = normalize(vec3(0.45 + 0.25 * fk, -0.75, -0.55 + 0.1 * sw));
        dir.xz = rot2(sw * 0.6) * dir.xz;
        // flat cloth strip: width across, thin through, rippling as it hangs
        vec3 wd = normalize(cross(dir, vec3(0.3, 0.0, 1.0)));
        vec3 tn = cross(dir, wd);
        vec3 rp = bp - kp;
        float L = (0.14 + 0.035 * fk) * hs;
        float along = dot(rp, dir);
        float ripple = 0.01 * hs * sin(along / hs * 30.0 - c.prop.z * 1.4 + fk * 2.0) * sat(along / L);
        vec3 lp = vec3(dot(rp, wd), along - L * 0.5, dot(rp, tn) - ripple);
        float wid = mix(0.024, 0.017, sat(along / L)) * hs;
        rib = min(rib, 0.9 * sdRoundBox(lp, vec3(wid, L * 0.5, 0.0035 * hs), 0.003 * hs));
      }
      band = min(band, smin(knot, rib, 0.008));
      if (band < d) { d = band; id = 12; }
    }

    // ---- glasses
    int gt = int(c.glass.x + 0.5);
    if (gt > 0) {
      float zf = facePoint(c, vec2(0.0, ey)).z + fl + 0.062 * s;   // clears the eyeballs
      float R = (gt == 1 ? 0.07 : 0.062) * c.eye.y * hs;
      vec3 pl = h - vec3(-ex, ey, zf), pr = h - vec3(ex, ey, zf);
      float fr = min(sdTorusZ(pl, R, 0.009 * hs), sdTorusZ(pr, R, 0.009 * hs));
      fr = min(fr, sdCapsule(h, vec3(-ex + R, ey + 0.01 * hs, zf), vec3(ex - R, ey + 0.01 * hs, zf), 0.008 * hs));
      fr = min(fr, sdCapsule(h, vec3(-ex - R, ey + 0.01 * hs, zf), vec3(-hr.x - fl, ey + 0.02 * hs, hc.z + 0.02), 0.008 * hs));
      fr = min(fr, sdCapsule(h, vec3(ex + R, ey + 0.01 * hs, zf), vec3(hr.x + fl, ey + 0.02 * hs, hc.z + 0.02), 0.008 * hs));
      if (fr < d) { d = fr; id = 13; }
      if (gt == 1) {
        float ln = min(max(length(pl.xy) - R, abs(pl.z) - 0.005), max(length(pr.xy) - R, abs(pr.z) - 0.005));
        if (ln < d) { d = ln; id = 14; }
      }
    }
  }

  // ---- neckerchief
  if (int(c.band.x + 0.5) == 3 && length(q - NECK) < 0.4) {
    float off = fl * 0.3 + 0.016;
    float shell = sdEllipsoid(q - TORSO_C, torsoR(c) + off);
    float bib = max(abs(q.x) - max(0.45 - q.y, 0.0) * 1.1, max(0.31 - q.y, q.y - 0.45));
    bib = max(bib, -q.z);
    float ring = sdTorus(q - NECK + vec3(0.0, 0.012, 0.0), 0.15 * c.body.x + fl * 0.85, 0.024);
    float nk = min(max(shell, bib), ring);
    if (nk < d) { d = nk; id = 12; }
  }

  // ---- props in the right hand (shrink away while both hands are busy)
  int pt = int(c.prop.x + 0.5);
  float ps = 1.0 - c.prop.w;
  if (pt > 0 && ps > 0.02) {
    vec3 H = c.aR2.xyz;
    vec3 fw = normalize(c.aR2.xyz - c.aR1.xyz);
    vec3 p = propSpace(c, q);
    float dp = 1e5;
    int pid = 0;
    if (pt == 1) {           // flag
      vec3 dir = normalize(mix(vec3(0.0, 1.0, 0.0), fw, 0.2));
      vec3 top = H + dir * 0.5;
      dp = min(sdCapsule(p, H - dir * 0.07, top, 0.0075), sdSphere(p - top - dir * 0.012, 0.016));
      pid = 15;
      vec3 X = normalize(cross(dir, vec3(0.0, 0.0, 1.0)));
      if (dot(X, vec3(1.0, 0.0, 0.0)) < 0.0) X = -X;
      vec3 Z = cross(X, dir);
      vec3 pr = p - top;
      float u = dot(pr, X), v = dot(pr, dir), w = dot(pr, Z);
      float uu = sat(u / 0.27);
      w -= 0.022 * sin(uu * 7.0 - c.prop.z) * uu;
      v -= 0.012 * sin(uu * 5.0 - c.prop.z * 0.8) * uu;
      float cloth = sdRoundBox(vec3(u - 0.135, v + 0.085, w), vec3(0.135, 0.085, 0.0035), 0.003);
      if (cloth < dp) { dp = cloth; pid = 16; }
    } else if (pt == 2) {    // megaphone
      vec3 ax = megaphoneAxis(c);
      float horn = sdRoundCone(p, H + ax * 0.02, H + ax * 0.19, 0.022, 0.068);
      float grip = sdCapsule(p, H - ax * 0.01, H - vec3(0.0, 0.05, 0.0), 0.011);
      dp = min(horn, grip);
      pid = 17;
    } else if (pt == 3) {    // newspaper
      vec3 pc = p - (H + vec3(-0.015, 0.075, 0.045));
      pc.xz = rot2(0.25) * pc.xz;
      pc.z += 2.2 * pc.x * pc.x;
      dp = sdRoundBox(pc, vec3(0.085, 0.11, 0.004), 0.003);
      pid = 18;
    } else {                 // pencil
      vec3 ax = normalize(mix(vec3(0.0, 1.0, 0.0), fw, 0.4) + vec3(0.0, 0.0, 0.25));
      dp = min(sdCapsule(p, H - ax * 0.07, H + ax * 0.11, 0.016), sdRoundCone(p, H + ax * 0.11, H + ax * 0.165, 0.016, 0.002));
      pid = 19;
    }
    dp *= ps;
    if (dp < d) { d = dp; id = pid; }
  }

  // ---- laptop (creating) and gears (optimizing)
  if (c.extra.x > 0.02) {
    float s = c.extra.x;
    vec3 lp = q - vec3(0.0, 0.205, 0.33);
    float base = sdRoundBox(lp, vec3(0.16, 0.009, 0.1) * s, 0.006);
    vec3 sp2 = lp - vec3(0.0, 0.0, -0.1 * s);
    sp2.yz = rot2(-0.32) * sp2.yz;
    float screen = sdRoundBox(sp2 - vec3(0.0, 0.1 * s, 0.0), vec3(0.16, 0.1, 0.007) * s, 0.006);
    float lap = min(base, screen);
    if (lap < d) {
      d = lap;
      id = 20;
      // glowing mouse-head logo on the lid, facing the audience
      vec2 g = (sp2.xy - vec2(0.0, 0.1 * s)) / s;
      if (screen < base && sp2.z < 0.0 && mouseMark(g) < 0.0) id = 21;
    }
  }
  if (c.extra.y > 0.02) {
    float s = c.extra.y;
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      vec3 gc = hc + vec3(-0.17 + 0.095 * fk, 0.4 + 0.05 * fk, 0.05);
      float R = (0.055 - 0.018 * fk) * s;
      vec3 gp = q - gc;
      float an = atan(gp.y, gp.x) + (fk == 0.0 ? c.extra.z : -c.extra.z * 1.5 + 0.2);
      float rr = length(gp.xy);
      float teeth = 0.013 * s * smoothstep(-0.35, 0.35, cos(an * (8.0 - 2.0 * fk)));
      float g2 = max(rr - R - teeth, -(rr - R * 0.38));
      float gear = opExtrude(g2, gp.z, 0.01 * s) - 0.003;
      if (gear < d) { d = gear; id = 22; }
    }
  }
  return d;
}

float mapHard(Char c, vec3 q) {
  int id;
  return hardParts(c, q, id);
}

// ------------------------------------------------------------- colouring
// Region colours per species. aa: edge softness (crisp for vinyl, soft for plush)
vec3 regionColor(Char c, vec3 q, float aa) {
  int sp = species(c);
  vec3 h = toHead(c, q);
  vec3 hc = headC(c), hr = headR(c);
  float hs = c.body.y;
  vec3 base = c.col.rgb, light = c.col2.rgb, dark = c.col3.rgb, acc = c.accent.rgb;

  float inner, tt;
  float dT = sdEllipsoid(q - TORSO_C, torsoR(c));
  float dH = sdEllipsoid(h - hc, hr);
  float dM = muzzleSDF(c, h);
  float dE = earsSDF(c, h, inner);
  float dA = armsSDF(c, q);
  float dHd = handsSDF(c, q);
  float dL = legsSDF(c, q);
  float dF = feetSDF(c, q);
  float dTl = tailSDF(c, q, tt);
  // nearest part wins
  float m = dT; int part = 0;
  if (dH < m) { m = dH; part = 1; }
  if (dM < m + 0.004) { m = dM; part = 2; }
  if (dE < m + 0.004) { m = dE; part = 3; }
  if (dA < m) { m = dA; part = 4; }
  if (dHd < m + 0.004) { m = dHd; part = 5; }
  if (dL < m) { m = dL; part = 6; }
  if (dF < m + 0.004) { m = dF; part = 7; }
  if (dTl < m + 0.004) { m = dTl; part = 8; }

  float ex = 0.1 * c.eye.z * hs;
  float ey = hc.y + (0.045 + c.eye.w) * hs;
  vec2 fxy = h.xy - hc.xy;
  float front = smoothstep(-0.05, 0.08, h.z - hc.z);
  // belly eyePatch on the torso front
  float belly = (1.0 - smoothstep(-aa, aa, length((q.xy - vec2(0.0, 0.235)) / vec2(0.13, 0.135) * c.body.x) - 1.0)) * smoothstep(0.0, 0.08, q.z);

  vec3 col = base;
  if (sp == 0) {             // mouse: grey with pink extremities and a pale muzzle & belly
    if (part == 2) col = light;
    else if (part == 3) col = mix(base, acc, inner);
    else if (part == 5 || part == 7 || part == 8) col = acc;
    else if (part == 0) col = mix(base, light, belly);
  } else if (sp == 1) {      // panda: black ears, limbs and shoulder band, eye patches
    if (part == 3 || part == 4 || part == 5 || part == 6 || part == 7) col = dark;
    else if (part == 0) col = mix(base, dark, smoothstep(0.33 - aa, 0.33 + aa, q.y + 0.07 * smoothstep(0.0, 0.18, -q.z)));
    else if (part == 1) {
      // tilted teardrop patches: top tucked in, drooping down and outward
      float eyePatch = 1e5;
      for (int k = 0; k < 2; k++) {
        float side = k == 0 ? -1.0 : 1.0;
        float s = c.eye.y * hs;
        vec2 e = fxy - vec2(side * (ex + 0.012 * s), ey - hc.y - 0.026 * s);
        e = rot2(-side * 0.5) * e;
        e.x *= 1.0 + 0.9 * max(e.y, 0.0) / s;   // narrower towards the top
        eyePatch = min(eyePatch, length(e / (vec2(0.088, 0.112) * s)) - 1.0);
      }
      col = mix(base, dark, (1.0 - smoothstep(-aa * 6.0, aa * 6.0, eyePatch)) * front);
    }
  } else if (sp == 2) {      // raccoon: bandit mask, pale brows & muzzle, ringed tail
    if (part == 2) col = light;
    else if (part == 5 || part == 7) col = dark;
    else if (part == 3) col = mix(base, light, inner);
    else if (part == 8) col = (tt > 0.88 || fract(tt * 4.2) > 0.55) ? dark : base;
    else if (part == 0) col = mix(base, light, belly);
    else if (part == 1) {
      float y = fxy.y - (ey - hc.y);
      float width = 0.235 * hs - 0.08 * abs(y) / 0.06 * hs;
      float mask = max(abs(y + 0.005 * hs) - (0.052 - 0.18 * max(abs(fxy.x) - 0.12 * hs, 0.0)) * hs, abs(fxy.x) - width);
      float brows = 1e5;
      for (int k = 0; k < 2; k++) {
        float side = k == 0 ? -1.0 : 1.0;
        brows = min(brows, length((fxy - vec2(side * ex, ey - hc.y + 0.078 * hs)) / vec2(0.06, 0.028)) - hs);
      }
      col = mix(col, light, (1.0 - smoothstep(-aa * 8.0, aa * 8.0, brows)) * front);
      col = mix(col, dark, (1.0 - smoothstep(-aa, aa, mask)) * front);
    }
  } else {                   // fox: orange, white muzzle/cheeks/chest/tail tip, black socks & ear tips
    if (part == 2) col = light;
    else if (part == 5 || part == 7) col = dark;
    else if (part == 6) col = mix(base, dark, smoothstep(0.1, 0.06, q.y));
    else if (part == 8) col = mix(base, light, smoothstep(0.7 - aa * 4.0, 0.72 + aa * 4.0, tt));
    else if (part == 3) {
      vec3 e = h - hc;
      float tip = smoothstep(0.31 * hs - aa, 0.31 * hs + aa, e.y);
      col = mix(mix(base, acc, inner), dark, tip);
    } else if (part == 0) col = mix(base, light, belly);
    else if (part == 1) {
      float cheek = (1.0 - smoothstep(-aa * 2.0, aa * 2.0, fxy.y - (ey - hc.y) + 0.035 * hs + 0.18 * abs(fxy.x))) * front;
      col = mix(base, light, cheek);
    }
  }
  return col;
}

// cheek blush under the outer eye corners; fades out on dark markings
float blushAt(Char c, vec3 q, vec3 under, float sharp) {
  vec3 h = toHead(c, q);
  vec3 hc = headC(c);
  float hs = c.body.y;
  float ex = 0.1 * c.eye.z * hs, ey = hc.y + (0.045 + c.eye.w) * hs;
  vec3 cl = facePoint(c, vec2(-ex - 0.035 * hs, ey - 0.07 * hs)), cr = facePoint(c, vec2(ex + 0.035 * hs, ey - 0.07 * hs));
  float b = max(exp(-dot(h - cl, h - cl) * sharp), exp(-dot(h - cr, h - cr) * sharp));
  return b * c.wob.w * smoothstep(0.02, 0.2, luma(under));
}

float furLen(Char c, vec3 q) {
  if (material(c) != 1) return 0.0;
  q = warp(c, q);
  float L = c.col.w;
  vec3 h = toHead(c, q);
  vec3 hc = headC(c), hr = headR(c);
  vec3 fp = (h - hc) / hr;
  // shorter pile on the face, muzzle and ears keeps features crisp
  float face = smoothstep(0.7, 0.25, length(fp.xy - vec2(0.0, -0.1))) * smoothstep(0.2, 0.75, fp.z);
  float inner;
  float ear = 1.0 - smoothstep(0.0, 0.03, earsSDF(c, h, inner) - sdEllipsoid(h - hc, hr));
  float m = max(face * 0.6, ear * 0.55);
  float tt;
  float tail = 1.0 - smoothstep(-0.01, 0.03, tailSDF(c, q, tt) - sdEllipsoid(q - TORSO_C, torsoR(c)));
  vec3 dp = q - c.poke.xyz;
  m = max(m, sat(c.poke.w * 14.0) * exp(-dot(dp, dp) * 60.0) * 0.7);
  // a paw gripping a prop is compact, so its pile doesn't swallow the prop
  if (c.prop.x > 0.5) m = max(m, (1.0 - smoothstep(0.7, 1.25, length(q - c.aR2.xyz) / (c.aR2.w + 0.04))) * 0.75 * (1.0 - c.prop.w));
  int sp = species(c);
  float bushy = (sp == 2 || sp == 3) ? 1.0 + 0.8 * tail : 1.0;
  return L * (1.0 - m) * bushy;
}

vec3 furCoord(Char c, vec3 q) {
  vec3 h = toHead(c, q);
  return mix(q, h, smoothstep(0.42, 0.54, q.y));
}

float furNominal(Char c) { return material(c) == 1 ? c.col.w * 0.55 : 0.0; }

Fur furAt(Char c, vec3 q, vec3 n) {
  q = warp(c, q);
  Fur f;
  vec3 col = regionColor(c, q, 0.012);
  if (c.wob.w > 0.0) col = mix(col, vec3(1.0, 0.45, 0.55), blushAt(c, q, col, 480.0) * 0.8);
  f.tip = mix(col, vec3(1.0), 0.08);
  f.root = col * 0.78;
  f.dens = 1.2;
  f.scale = 5.2;
  f.clump = 0.18;
  f.droop = 0.006;
  f.sheen = 1.0;
  f.occ = 0.55;
  return f;
}

Surf surfAt(Char c, vec3 q, vec3 n) {
  int id;
  hardParts(c, q, id);
  q = warp(c, q);
  Surf s = surfDefault(vec3(0.02), n);
  int mat = material(c);
  if (id == 1) {                      // painted vinyl skin
    s.alb = regionColor(c, q, max(gFoot * 0.9, 0.0015));
    if (c.wob.w > 0.0) s.alb = mix(s.alb, vec3(1.0, 0.45, 0.55), blushAt(c, q, s.alb, 700.0) * 0.6);
    if (mat == 2) { s.flatK = 1.0; }
    else { s.rough = 0.42; s.wrap = 0.35; s.clear = 0.35; }
  } else if (id == 2) {               // sclera
    s.alb = vec3(0.94, 0.94, 0.93); s.rough = 0.18; s.clear = 0.6; s.wrap = 0.25;
  } else if (id == 3) {               // pupil
    s.alb = vec3(0.01); s.rough = 0.08; s.f0 = 0.05; s.clear = 0.9;
  } else if (id == 4) {               // eyelid in the surrounding colour
    s.alb = (species(c) == 1 || species(c) == 2) ? c.col3.rgb : c.col.rgb;
    s.rough = 0.45; s.wrap = 0.3;
  } else if (id == 5 || id == 11) {   // stitched thread / whiskers
    s.alb = vec3(0.025, 0.02, 0.02); s.rough = 0.55;
  } else if (id == 6) {               // brows
    s.alb = species(c) == 3 ? vec3(0.12, 0.06, 0.04) : c.col3.rgb * 0.8 + 0.01; s.rough = 0.7; s.sheen = 0.4;
  } else if (id == 7) {               // nose
    s.alb = species(c) == 0 ? c.accent.rgb * 0.9 : vec3(0.02); s.rough = 0.18; s.clear = 0.8;
  } else if (id == 8) {
    s.alb = vec3(0.22, 0.03, 0.04); s.rough = 0.7;
  } else if (id == 9) {
    s.alb = vec3(0.92, 0.36, 0.42); s.rough = 0.5; s.wrap = 0.4;
  } else if (id == 10) {
    s.alb = vec3(0.97, 0.96, 0.92); s.rough = 0.25; s.clear = 0.6;
  } else if (id == 12) {              // cotton bandana with a paisley-dot print
    s.alb = c.band.yzw; s.rough = 0.72; s.sheen = 0.45;
    vec3 h = toHead(c, q);
    vec2 g = (int(c.band.x + 0.5) == 3 ? q.xy : h.xz + h.yy) * 55.0;
    vec2 cell = fract(g) - 0.5;
    float dot1 = length(cell * vec2(1.0, 1.6)) - 0.15;
    if (dot1 < 0.0) s.alb = mix(s.alb, vec3(0.97), 0.92);
  } else if (id == 13) {
    s.alb = c.glass.yzw; s.rough = 0.25; s.clear = 0.5;
  } else if (id == 14) {
    s.alb = vec3(0.02, 0.03, 0.04); s.rough = 0.04; s.f0 = 0.08; s.clear = 1.0;
  } else if (id == 15) {
    s.alb = vec3(0.86, 0.87, 0.9); s.metal = 1.0; s.rough = 0.25;
  } else if (id == 16) {              // flag cloth: pride rainbow or brand colours
    vec3 H = c.aR2.xyz;
    vec3 fw = normalize(c.aR2.xyz - c.aR1.xyz);
    vec3 dir = normalize(mix(vec3(0.0, 1.0, 0.0), fw, 0.2));
    vec3 top = H + dir * 0.5;
    vec3 X = normalize(cross(dir, vec3(0.0, 0.0, 1.0)));
    if (dot(X, vec3(1.0, 0.0, 0.0)) < 0.0) X = -X;
    vec3 p = propSpace(c, q);
    float u = dot(p - top, X), v = -dot(p - top, dir);
    if (int(c.prop.y + 0.5) == 0) {
      int band = clamp(int(v / 0.17 * 6.0), 0, 5);
      vec3 rb[6] = vec3[6](vec3(0.89, 0.02, 0.02), vec3(1.0, 0.35, 0.0), vec3(1.0, 0.85, 0.0), vec3(0.0, 0.5, 0.15), vec3(0.0, 0.2, 0.75), vec3(0.45, 0.05, 0.55));
      s.alb = rb[band];
    } else {
      // brand flag: blue field, pink stripe, white mouse-head mark
      vec2 g = vec2(u - 0.135, v - 0.085);
      s.alb = vec3(0.02, 0.24, 0.43);
      if (abs(g.y + g.x * 0.3) < 0.02) s.alb = vec3(1.0, 0.07, 0.72);
      if (mouseMark(vec2(g.x, -g.y) * 0.95) < 0.0) s.alb = vec3(0.95);   // v runs downwards
    }
    s.rough = 0.65; s.sheen = 0.5; s.wrap = 0.5;
  } else if (id == 17) {              // megaphone: red horn, white bell rim, dark mouth
    float t = dot(propSpace(c, q) - c.aR2.xyz, megaphoneAxis(c));
    s.alb = t > 0.17 ? vec3(0.95) : vec3(0.85, 0.08, 0.06);
    if (t > 0.205) s.alb = vec3(0.05);
    s.rough = 0.35; s.clear = 0.5;
  } else if (id == 18) {              // newspaper print
    vec3 pc = propSpace(c, q) - (c.aR2.xyz + vec3(-0.015, 0.075, 0.045));
    pc.xz = rot2(0.25) * pc.xz;
    s.alb = vec3(0.95, 0.94, 0.9);
    if (pc.y > 0.075) s.alb = vec3(0.12);                                         // masthead
    else if (pc.y > 0.05 && pc.y < 0.065 && abs(pc.x) < 0.07) s.alb = vec3(0.85, 0.1, 0.1);
    else if (abs(fract(pc.y * 80.0) - 0.5) < 0.18 && abs(pc.x) < 0.075 && pc.y < 0.04) s.alb = vec3(0.55);
    s.rough = 0.85;
  } else if (id == 19) {              // pencil: yellow body, pink eraser, wood tip, graphite
    vec3 H = c.aR2.xyz;
    vec3 fw = normalize(c.aR2.xyz - c.aR1.xyz);
    vec3 ax = normalize(mix(vec3(0.0, 1.0, 0.0), fw, 0.4) + vec3(0.0, 0.0, 0.25));
    float t = dot(propSpace(c, q) - H, ax);
    s.alb = vec3(1.0, 0.78, 0.1);
    if (t < -0.055) s.alb = vec3(0.98, 0.5, 0.6);
    else if (t < -0.04) { s.alb = vec3(0.8); s.metal = 1.0; }
    else if (t > 0.145) s.alb = vec3(0.12);
    else if (t > 0.11) s.alb = vec3(0.86, 0.66, 0.44);
    s.rough = 0.45; s.clear = 0.3;
  } else if (id == 20) {
    s.alb = vec3(0.78, 0.8, 0.84); s.metal = 0.8; s.rough = 0.3;
  } else if (id == 21) {
    s.alb = vec3(0.6, 0.85, 1.0); s.emis = vec3(0.45, 0.75, 1.0) * 1.2; s.rough = 0.3;
  } else if (id == 22) {              // glossy enamel gears
    s.alb = vec3(1.0, 0.66, 0.12); s.rough = 0.28; s.clear = 0.8; s.wrap = 0.2;
  }
  return s;
}

vec4 anchorPass(ivec2 px) { return vec4(0.0); }
