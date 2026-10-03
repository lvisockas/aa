// ---------------------------------------------------------------------------
// Crew family: bean-shaped space crewmates in satin vinyl with a glossy visor.
// The body is a round cone with two stubby legs and a backpack; the visor is a
// pillow-profiled stadium that slides around the bean to look at you, and its
// shape (squint, tilt, happy arch) carries the expression. The highlight,
// stickers, task panel screen and hat patterns are colour decals in surfAt.
// ---------------------------------------------------------------------------
#define HAS_FUR 0

struct Char {
  vec4 body;   // suit colour (linear), bottom shade
  vec4 vtint;  // glass colour (linear), tint mode
  vec4 vgeo;   // visor offset x, centre y, yaw around the body, tilt
  vec4 vshp;   // width scale, height scale, top lid, lid angle
  vec4 vshp2;  // happy arch, bottom lid, glow, blush
  vec4 hl;     // highlight offset xy, size wh
  vec4 hl2;    // highlight kind, dim, rotation, dark visor
  vec4 hat;    // type, tilt, -, -
  vec4 hatC;   // hat colour
  vec4 pk;     // backpack style, jet flame, -, -
  vec4 legs;   // left lift, right lift, left z, right z
  vec4 nubL;   // left arm nub tip xyz, amount
  vec4 nubR;   // right arm nub tip xyz, amount
  vec4 props;  // task panel, meeting button, button press, alarm flash
  vec4 props2; // panel clock, progress, -, -
  vec4 pet;    // type, hop, clock, tuck-in shift
  vec4 petC;   // pet colour
  vec4 stk;    // sticker type, -
  vec4 poke;   // dent centre xyz, amplitude
  vec4 wob;    // jelly wobble amplitude, phase
};

Char loadChar(int i) {
  Char c;
  c.body = D(i, 0); c.vtint = D(i, 1); c.vgeo = D(i, 2); c.vshp = D(i, 3);
  c.vshp2 = D(i, 4); c.hl = D(i, 5); c.hl2 = D(i, 6); c.hat = D(i, 7);
  c.hatC = D(i, 8); c.pk = D(i, 10); c.legs = D(i, 11); c.nubL = D(i, 12);
  c.nubR = D(i, 13); c.props = D(i, 14); c.props2 = D(i, 15); c.pet = D(i, 16);
  c.petC = D(i, 17); c.stk = D(i, 18); c.poke = D(i, 19); c.wob = D(i, 20);
  return c;
}

const float ZS = 0.84;                       // body depth / width
const float VR = 0.112;                      // visor end-cap radius
const vec3 PANEL = vec3(0.52, 0.58, 0.22);    // task panel centre
const vec3 BTN = vec3(0.52, 0.0, 0.13);      // meeting button pedestal foot
const vec3 MINI = vec3(-0.43, 0.0, 0.3);     // mini crewmate pet
const float MINIS = 0.32;
const vec3 BOT = vec3(-0.46, 0.8, 0.1);      // floating robot pet

// ------------------------------------------------------------------ body
float torso(vec3 q) {
  float d = sdRoundCone(vec3(q.x, q.y, q.z / ZS), vec3(0.0, 0.3, 0.0), vec3(0.0, 0.67, 0.0), 0.315, 0.29) * ZS;
  return smax(d, 0.17 - q.y, 0.022);
}

float legsDist(Char c, vec3 q) {
  bool rt = q.x > 0.0;
  float lift = rt ? c.legs.y : c.legs.x;
  float lz = rt ? c.legs.w : c.legs.z;
  vec3 p = vec3(abs(q.x) - 0.152, q.y - 0.135 - lift, q.z - lz);
  return sdRoundBox(p, vec3(0.122, 0.135, 0.19), 0.095);
}

// backpack; id 0 suit, 4 jet metal, 5 flame
float packDist(Char c, vec3 q, out int id) {
  id = 0;
  int st = int(c.pk.x + 0.5);
  if (st == 0) {
    if (q.z > -0.06) return q.z + 0.145;
    return sdRoundBox(q - vec3(0.0, 0.5, -0.255), vec3(0.205, 0.225, 0.11), 0.085);
  }
  if (st != 1) return 1e5;
  if (q.z > -0.06) return q.z + 0.2;
  vec3 p = vec3(abs(q.x) - 0.108, q.y, q.z + 0.31);
  float d = sdCapsule(p, vec3(0.0, 0.4, 0.0), vec3(0.0, 0.64, 0.0), 0.088);
  d = smin(d, sdRoundBox(q - vec3(0.0, 0.53, -0.27), vec3(0.12, 0.13, 0.05), 0.03), 0.01);
  // nozzles
  d = min(d, sdCappedCone(p - vec3(0.0, 0.305, 0.0), 0.035, 0.05, 0.07));
  id = 4;
  // little fins in the suit colour
  vec3 f = p - vec3(0.1, 0.38, 0.0);
  f.xy = rot2(0.6) * f.xy;
  float fin = sdRoundBox(f, vec3(0.012, 0.07, 0.04), 0.01);
  if (fin < d) { d = fin; id = 12; }
  if (c.pk.y > 0.02) {
    float fl = sdRoundCone(p, vec3(0.0, 0.25, 0.0), vec3(0.0, 0.25 - 0.24 * c.pk.y, 0.0), 0.04, 0.006);
    if (fl < d) { d = fl; id = 5; }
  }
  return d;
}

// ------------------------------------------------------------------ visor
vec3 visorP(Char c, vec3 q) {
  vec3 p = q;
  p.y -= c.vgeo.y;
  p.xz = rot2(c.vgeo.z) * p.xz;
  p.x -= c.vgeo.x;
  p.xy = rot2(-c.vgeo.w) * p.xy;
  return p;
}

float visor2D(Char c, vec2 p) {
  float hw = 0.145 * c.vshp.x;
  float rh = VR * c.vshp.y;
  float sy = VR / rh;
  float d = (sd2Segment(vec2(p.x, p.y * sy), vec2(-hw, 0.0), vec2(hw, 0.0)) - VR) / max(sy, 1.0);
  if (c.vshp.z > 0.001) {
    vec2 lq = rot2(c.vshp.w) * p;
    d = smax(d, lq.y - rh * (1.0 - 2.0 * c.vshp.z), 0.008);
  }
  if (c.vshp2.y > 0.001) d = smax(d, -p.y - rh * (1.0 - 2.0 * c.vshp2.y), 0.008);
  if (c.vshp2.x > 0.001) {
    float u = p.x / (hw + VR);
    float yb = -rh + c.vshp2.x * rh * 0.95 * max(1.0 - u * u, 0.0);
    d = smax(d, yb - p.y, 0.01);
  }
  return d;
}

float visorDist(Char c, vec3 q) {
  vec3 p = visorP(c, q);
  float d2 = visor2D(c, p.xy);
  float zc = 0.2 - 2.2 * p.x * p.x - 1.4 * max(p.y, 0.0) * p.y;
  const float R = 0.08, H = 0.078, k = R / H;
  return (length(vec2(max(d2 + R, 0.0), (p.z - zc) * k)) - R) / k * 0.8;
}

// ------------------------------------------------------------------ hats
// sub 0: main, 1: accent
float hatDist(Char c, vec3 q, out int sub) {
  sub = 0;
  int t = int(c.hat.x + 0.5);
  if (t == 0) return 1e5;
  vec3 hp = q - vec3(0.0, 0.93, 0.0);
  float bnd = length(hp - vec3(0.0, 0.12, 0.0)) - 0.41;
  if (bnd > 0.04) return bnd;
  hp.xy = rot2(-c.hat.y) * hp.xy;
  float d;
  if (t == 1) {                 // party hat
    d = sdRoundCone(hp, vec3(0.0, -0.01, 0.0), vec3(0.0, 0.27, 0.0), 0.125, 0.012);
    float pom = length(hp - vec3(0.0, 0.3, 0.0)) - 0.042;
    if (pom < d) { d = pom; sub = 1; }
  } else if (t == 2) {          // top hat
    d = sdRoundCylY(hp - vec3(0.0, 0.135, 0.0), 0.122, 0.12, 0.016);
    d = min(d, sdRoundCylY(hp - vec3(0.0, 0.018, 0.0), 0.2, 0.014, 0.012));
  } else if (t == 3) {          // sprout
    d = sdCapsule(hp, vec3(0.0, -0.02, 0.0), vec3(0.008, 0.12, 0.0), 0.012);
    sub = 1;
    vec3 lp = vec3(abs(hp.x) - 0.058, hp.y - 0.14, hp.z);
    lp.xy = rot2(0.45) * lp.xy;
    float lf = sdEllipsoid(lp, vec3(0.062, 0.018, 0.04));
    if (lf < d) { d = lf; sub = 0; }
  } else if (t == 4) {          // beanie
    vec3 bp = hp + vec3(0.0, 0.25, 0.0);
    d = sdEllipsoid(bp, vec3(0.305, 0.345, 0.272));
    d = smax(d, -0.1 - hp.y, 0.008);
    float cuff = sdEllipsoid(bp, vec3(0.318, 0.36, 0.286));
    cuff = smax(cuff, abs(hp.y + 0.062) - 0.042, 0.006);
    if (cuff < d) { d = cuff; sub = 1; }
    float pom = length(hp - vec3(0.0, 0.135, 0.0)) - 0.058;
    if (pom < d) { d = pom; sub = 1; }
  } else if (t == 5) {          // crown
    float an = atan(hp.z, hp.x);
    float tri = 1.0 - abs(fract(an * 5.0 / TAU) - 0.5) * 2.0;
    d = sd2Box(vec2(length(hp.xz) - 0.112, hp.y - 0.065), vec2(0.011, 0.065)) - 0.004;
    d = max(d, (hp.y - 0.06 - 0.075 * tri * tri) * 0.6);
  } else if (t == 6) {          // egg shell
    float an = atan(hp.z, hp.x);
    float tri = abs(fract(an * 7.0 / TAU) - 0.5) * 2.0;
    float e = sdEllipsoid(hp - vec3(0.0, 0.07, 0.0), vec3(0.155, 0.175, 0.155));
    d = abs(e) - 0.009;
    d = max(d, (hp.y - 0.06 - 0.04 * tri) * 0.6);
  } else if (t == 7) {          // chef hat
    d = sdRoundCylY(hp - vec3(0.0, 0.065, 0.0), 0.125, 0.065, 0.012);
    float puff = length(hp - vec3(0.0, 0.2, 0.0)) - 0.125;
    puff = smin(puff, length(vec3(abs(hp.x) - 0.085, hp.y - 0.175, hp.z)) - 0.095, 0.015);
    puff = smin(puff, length(vec3(hp.x, hp.y - 0.175, abs(hp.z) - 0.07)) - 0.09, 0.015);
    if (puff < d) { d = puff; sub = 1; }
  } else {                      // halo
    vec3 h = hp - vec3(0.0, 0.2, 0.0);
    h.yz = rot2(0.25) * h.yz;
    d = sdTorus(h, 0.14, 0.02);
  }
  return d;
}

// ------------------------------------------------------------------ props
// id 6 panel, 7 pedestal, 8 button
float propsDist(Char c, vec3 q, out int id) {
  id = 0;
  float d = 1e5;
  float pa = c.props.x;
  if (pa > 0.02) {
    vec3 p = q - PANEL - vec3(0.0, 0.015 * sin(c.props2.x * 2.0), 0.0);
    float b = length(p) - 0.27;
    if (b > 0.04) d = b;
    else {
      p.xz = rot2(-0.5) * p.xz;
      p.yz = rot2(0.12) * p.yz;
      d = sdRoundBox(p / pa, vec3(0.18, 0.125, 0.016), 0.014) * pa;
      id = 6;
    }
  }
  float ba = c.props.y;
  if (ba > 0.02) {
    vec3 p = q - BTN;
    float b = length(p - vec3(0.0, 0.2, 0.0)) - 0.27;
    if (b > 0.04) d = min(d, b);
    else {
      float h = 0.16 * ba;
      float ped = sdRoundCylY(p - vec3(0.0, h, 0.0), 0.085, h, 0.016);
      ped = smin(ped, sdRoundCylY(p - vec3(0.0, 0.02, 0.0), 0.125 * ba, 0.02, 0.012), 0.01);
      if (ped < d) { d = ped; id = 7; }
      float rim = sdRoundCylY(p - vec3(0.0, 2.0 * h, 0.0), 0.12 * ba, 0.018, 0.012);
      if (rim < d) { d = rim; id = 7; }
      float btn = sdEllipsoid(p - vec3(0.0, 2.0 * h + 0.016 - 0.02 * c.props.z, 0.0), vec3(0.1, 0.05, 0.1) * ba);
      if (btn < d) { d = btn; id = 8; }
    }
  }
  return d;
}

// ------------------------------------------------------------------ pets
vec3 miniP(Char c, vec3 q) {
  vec3 p = (q - MINI - vec3(c.pet.w, c.pet.y, c.pet.w * 0.8)) / MINIS;
  p.xz = rot2(0.5) * p.xz;
  return p;
}

// id 9 pet suit, 10 pet visor, 11 robot
float petDist(Char c, vec3 q, out int id) {
  id = 0;
  int t = int(c.pet.x + 0.5);
  if (t == 1) {
    float b = length(q - MINI - vec3(c.pet.w, 0.16 + c.pet.y, c.pet.w * 0.8)) - 0.21;
    if (b > 0.04) return b;
    vec3 p = miniP(c, q);
    float d = sdRoundCone(vec3(p.x, p.y, p.z / ZS), vec3(0.0, 0.3, 0.0), vec3(0.0, 0.67, 0.0), 0.315, 0.29) * ZS;
    d = smax(d, -p.y, 0.03);
    d = smax(d, 0.03 - sdRoundBox(p, vec3(0.0, 0.16, 0.5), 0.0), 0.02);
    d = smin(d, sdRoundBox(p - vec3(0.0, 0.48, -0.25), vec3(0.2, 0.22, 0.11), 0.09), 0.02);
    id = 9;
    float v = sdEllipsoid(p - vec3(0.0, 0.64, 0.2), vec3(0.23, 0.11, 0.09));
    if (v < d) { d = v; id = 10; }
    return d * MINIS;
  }
  if (t == 2) {
    vec3 p = q - BOT - vec3(0.0, c.pet.y, 0.0);
    float b = length(p) - 0.16;
    if (b > 0.04) return b;
    float d = length(p) - 0.075;
    d = min(d, sdCapsule(p, vec3(0.0, 0.07, 0.0), vec3(0.015, 0.12, 0.0), 0.007));
    d = min(d, length(p - vec3(0.015, 0.125, 0.0)) - 0.017);
    id = 11;
    return d;
  }
  return 1e5;
}

// ------------------------------------------------------------------ scene
// ids: 0 suit, 1 visor, 2 hat, 3 hat accent, 4 jet metal, 5 flame, 6 panel,
//      7 pedestal, 8 button, 9 pet suit, 10 pet visor, 11 robot, 12 jet fins
vec3 warpQ(Char c, vec3 q) {
  q.x += c.wob.x * sin(q.y * 9.0 + c.wob.y);
  return q;
}

float scene(Char c, vec3 q, out int id) {
  q = warpQ(c, q);
  id = 0;
  float d = torso(q);
  d = smin(d, legsDist(c, q), 0.02);
  int sub;
  float dp = packDist(c, q, sub);
  if (sub == 0) d = smin(d, dp, 0.012);
  // arm nubs
  if (c.nubL.w > 0.01) d = smin(d, sdCapsule(q, vec3(-0.245, 0.46, 0.03), c.nubL.xyz, 0.062 * min(c.nubL.w * 3.0, 1.0)), 0.02);
  if (c.nubR.w > 0.01) d = smin(d, sdCapsule(q, vec3(0.245, 0.46, 0.03), c.nubR.xyz, 0.062 * min(c.nubR.w * 3.0, 1.0)), 0.02);
  float dv = visorDist(c, q);
  if (dv < d + 0.003) id = 1;
  d = smin(d, dv, 0.004);
  vec3 dq = q - c.poke.xyz;
  d += c.poke.w * exp(-dot(dq, dq) * 55.0);
  if (sub != 0 && dp < d) { d = dp; id = sub; }
  float dh = hatDist(c, q, sub);
  if (dh < d) { d = dh; id = 2 + sub; }
  int pid;
  float dpr = propsDist(c, q, pid);
  if (dpr < d) { d = dpr; id = pid; }
  float dpt = petDist(c, q, pid);
  if (dpt < d) { d = dpt; id = pid; }
  return d;
}

float mapHard(Char c, vec3 q) {
  int id;
  return scene(c, q, id);
}

// ------------------------------------------------------------------ shading
float aaMask(float d, float w) { return 1.0 - smoothstep(-w, w, d); }

// glass of a visor point given in visor-local coordinates (p) and normalised (u)
Surf glass(Char c, vec3 n, vec2 u) {
  int tm = int(c.vtint.w + 0.5);
  vec3 light = c.vtint.rgb;
  vec3 deep = light * light * 0.32 + vec3(0.0, 0.004, 0.012);
  float lower = smoothstep(0.07, -0.07, u.y - (-0.22 + 0.3 * u.x * u.x));
  vec3 alb = mix(light, deep, lower * 0.85);
  alb *= 0.92 + 0.12 * sat(u.y);
  Surf s = surfDefault(alb, n);
  s.rough = 0.06; s.clear = 1.0; s.f0 = 0.05;
  if (tm == 1) { s.metal = 0.35; s.rough = 0.1; s.clear = 0.9; }
  else if (tm == 2) {
    s.alb = mix(vec3(0.5, 0.56, 0.75), vec3(0.98, 0.88, 1.0), sat(u.y * 0.5 + 0.5)) * mix(1.0, 0.55, lower);
    s.metal = 0.8; s.rough = 0.05; s.clear = 0.5;
  }
  else if (tm == 3) { s.rough = 0.05; }
  return s;
}

float highlight(Char c, vec2 p, float W, float rh) {
  int k = int(c.hl2.x + 0.5);
  vec2 hc = vec2(-0.42 * W, 0.4 * rh) + c.hl.xy;
  if (k == 1) {                // heart
    vec2 r = p - hc - vec2(0.03, -0.012);
    float s = 0.075 * c.hl.z;
    return sd2Heart(r / s + vec2(0.0, 0.5)) * s;
  }
  if (k == 2) {                // stars
    vec2 r = p - hc - vec2(0.025, -0.01);
    float d = sd2Star5(r, 0.05 * c.hl.z, 0.45);
    return min(d, sd2Star5(r - vec2(0.115, -0.03), 0.026 * c.hl.z, 0.45));
  }
  if (k == 3) {                // dizzy spiral
    vec2 r = p - vec2(c.hl.x * 0.4, 0.0);
    float rr = length(r);
    float an = atan(r.y, r.x) + c.props2.x * 4.0;
    float b = 0.0065;
    float m = mod(rr / b - an + PI, TAU) - PI;
    return max(abs(m) * b - 0.005, rr - 0.075);
  }
  vec2 r = rot2(-(c.hl2.z - 0.1)) * (p - hc);
  float hwid = 0.05 * c.hl.z;
  float d = sd2Segment(r, vec2(-hwid, 0.0), vec2(hwid, 0.0)) - 0.025 * c.hl.w;
  return min(d, length(r - vec2(hwid + 0.04, -0.006)) - 0.013 * c.hl.w);
}

vec3 stickerCol(int t, vec2 p, float aa, out float m) {
  float disc = length(p) - 0.056;
  m = aaMask(disc, aa);
  vec3 col = vec3(0.96, 0.96, 0.94);
  vec3 bg, ic;
  float di;
  if (t == 1) { bg = vec3(0.95, 0.62, 0.05); ic = vec3(1.0, 0.95, 0.75); di = sd2Star5(p, 0.034, 0.45); }
  else if (t == 2) { bg = vec3(0.9, 0.22, 0.45); ic = vec3(1.0); di = sd2Heart(p / 0.06 + vec2(0.0, 0.48)) * 0.06; }
  else if (t == 3) {
    bg = vec3(0.92, 0.9, 0.86); ic = vec3(0.03);
    vec2 e = p * vec2(1.0, 2.1);
    di = abs(length(e) - 0.03) - 0.006;
    di = min(di, length(p - vec2(0.016, 0.0)) - 0.0105);
  } else { bg = vec3(0.96, 0.96, 0.94); ic = vec3(0.85, 0.06, 0.06); di = min(sd2Box(p, vec2(0.03, 0.009)), sd2Box(p, vec2(0.009, 0.03))); }
  col = mix(col, bg, aaMask(disc + 0.007, aa));
  col = mix(col, ic, aaMask(di, aa));
  return col;
}

Surf suit(Char c, vec3 q, vec3 n, vec3 base) {
  float shade = mix(1.0 - c.body.w, 1.0, smoothstep(0.03, 0.72, q.y));
  Surf s = surfDefault(base * shade, n);
  s.rough = 0.4; s.clear = 0.3; s.wrap = 0.3;
  return s;
}

Surf surfAt(Char c, vec3 q, vec3 n) {
  int id;
  scene(c, q, id);
  vec3 w = warpQ(c, q);
  float aa = gFoot * 1.2;
  float alarm = c.props.w;
  Surf s;
  if (id == 0) {
    s = suit(c, w, n, c.body.rgb);
    int st = int(c.stk.x + 0.5);
    if (st > 0 && n.z > 0.2 && w.z > 0.0) {
      float m;
      vec3 sc = stickerCol(st, w.xy - vec2(-0.135, 0.36), aa / max(n.z, 0.4), m);
      m *= smoothstep(0.2, 0.5, n.z);
      s.alb = mix(s.alb, sc, m);
      s.rough = mix(s.rough, 0.32, m);
      s.clear = mix(s.clear, 0.7, m);
    }
  } else if (id == 1) {
    vec3 p = visorP(c, w);
    float hw = 0.145 * c.vshp.x, rh = VR * c.vshp.y, W = hw + VR;
    vec2 u = vec2(p.x / W, p.y / rh);
    s = glass(c, n, u);
    float lower = smoothstep(0.07, -0.07, u.y - (-0.22 + 0.3 * u.x * u.x));
    // blush and talking glow live in the lower band
    s.alb = mix(s.alb, vec3(0.95, 0.3, 0.45), c.vshp2.w * lower * 0.7);
    s.emis += c.vtint.rgb * c.vshp2.z * 0.18 * (0.4 + lower);
    // sleeping: the glass goes dark
    s.alb = mix(s.alb, s.alb * 0.18, c.hl2.w);
    // a thin darker rim where the glass meets the suit
    float d2 = visor2D(c, p.xy);
    s.alb *= mix(0.45, 1.0, smoothstep(0.0, 0.022, -d2));
    float hd = highlight(c, p.xy, W, rh);
    float m = aaMask(hd, aa / max(n.z, 0.35)) * (1.0 - c.hl2.y);
    s.alb = mix(s.alb, vec3(1.0), m);
    s.metal *= 1.0 - m;
    s.emis += vec3(0.85, 0.93, 1.0) * m * 0.55;
  } else if (id == 2 || id == 3) {
    int t = int(c.hat.x + 0.5);
    vec3 hp = w - vec3(0.0, 0.93, 0.0);
    hp.xy = rot2(-c.hat.y) * hp.xy;
    vec3 hc = c.hatC.rgb;
    s = surfDefault(hc, n);
    s.rough = 0.45; s.clear = 0.25; s.wrap = 0.2;
    if (t == 1) {
      float band = step(0.5, fract((hp.y + atan(hp.z, hp.x) * 0.035) * 14.0));
      s.alb = id == 3 ? vec3(0.95, 0.93, 0.88) : mix(hc, vec3(0.95, 0.93, 0.88), band);
      if (id == 3) { s.sheen = 0.8; s.rough = 0.9; s.clear = 0.0; }
    } else if (t == 2) {
      float band = step(abs(hp.y - 0.055), 0.03) * step(0.04, hp.y);
      s.alb = mix(vec3(0.025, 0.025, 0.03), hc, band);
      s.rough = 0.5; s.sheen = 0.4;
    } else if (t == 3) {
      s.alb = id == 3 ? vec3(0.12, 0.38, 0.08) : vec3(0.22, 0.62, 0.12);
      s.wrap = 0.5; s.rough = 0.5;
    } else if (t == 4) {
      float rib = 0.5 + 0.5 * sin(atan(hp.z, hp.x) * 44.0);
      bool pom = length(hp - vec3(0.0, 0.135, 0.0)) < 0.064;
      s.alb = pom ? vec3(0.95, 0.94, 0.9) : id == 3 ? hc * (0.72 + 0.12 * rib) : hc * (0.9 + 0.1 * rib);
      s.sheen = 0.9; s.rough = 0.85; s.clear = 0.0;
    } else if (t == 5) {
      s = surfDefault(vec3(1.0, 0.72, 0.25), n);
      s.metal = 1.0; s.rough = 0.22;
      float an = atan(hp.z, hp.x);
      vec2 g = vec2((fract(an * 5.0 / TAU + 0.5) - 0.5) * 0.14, hp.y - 0.04);
      float gem = aaMask(length(g) - 0.016, aa);
      s.alb = mix(s.alb, vec3(0.75, 0.04, 0.1), gem);
      s.metal = mix(1.0, 0.0, gem);
      s.clear = gem;
    } else if (t == 6) {
      float sp = smoothstep(0.72, 0.78, noise(hp * 9.0));
      s.alb = mix(vec3(0.96, 0.93, 0.86), vec3(0.62, 0.52, 0.4), sp * 0.5);
      s.rough = 0.55; s.wrap = 0.3;
    } else if (t == 7) {
      s.alb = vec3(0.95, 0.95, 0.93);
      s.sheen = 0.7; s.rough = 0.9; s.clear = 0.0; s.wrap = 0.4;
    } else {
      s = surfDefault(vec3(1.0, 0.8, 0.35), n);
      s.metal = 0.6; s.rough = 0.25;
      s.emis = vec3(1.0, 0.78, 0.3) * 0.55;
    }
  } else if (id == 4) {
    s = surfDefault(vec3(0.62, 0.64, 0.68), n);
    s.metal = 0.85; s.rough = 0.3;
    // a suit-coloured band around each tank
    float band = step(abs(w.y - 0.52), 0.035) * step(w.z, -0.24);
    s.alb = mix(s.alb, c.body.rgb, band);
    s.metal *= 1.0 - band;
  } else if (id == 12) {
    s = suit(c, w, n, c.body.rgb);
  } else if (id == 5) {
    vec3 p = vec3(abs(w.x) - 0.108, w.y, w.z + 0.31);
    float t = sat((0.27 - p.y) / max(0.22 * c.pk.y, 0.01));
    s = surfDefault(vec3(0.0), n);
    s.emis = mix(vec3(1.3, 1.1, 0.55), vec3(1.2, 0.28, 0.04), sqrt(t)) * (1.0 - 0.4 * t);
    s.flatK = 1.0;
  } else if (id == 6) {
    vec3 p = w - PANEL - vec3(0.0, 0.015 * sin(c.props2.x * 2.0), 0.0);
    p.xz = rot2(-0.5) * p.xz;
    p.yz = rot2(0.12) * p.yz;
    p /= max(c.props.x, 0.02);
    s = surfDefault(vec3(0.32, 0.34, 0.38), n);
    s.metal = 0.6; s.rough = 0.35;
    if (p.z > 0.012) {
      vec2 sp = p.xy;
      float scr = sd2RoundBox(sp / 1.18, vec2(0.13, 0.09), 0.014) * 1.18;
      float m = aaMask(scr, aa);
      vec3 col = vec3(0.02, 0.04, 0.08);
      // four wires, each joined up to the progress point
      float prog = c.props2.y;
      vec3 wc[4] = vec3[4](vec3(0.95, 0.12, 0.1), vec3(0.12, 0.35, 1.0), vec3(1.0, 0.82, 0.1), vec3(0.95, 0.25, 0.85));
      for (int k = 0; k < 4; k++) {
        float y = 0.052 - float(k) * 0.03;
        float x0 = -0.1, x1 = 0.1;
        float u = sat((sp.x - x0) / (x1 - x0));
        float yy = y + (u < prog ? -0.008 * sin(u * PI) : 0.0);
        float dw = abs(sp.y - yy) - 0.0055;
        dw = max(dw, abs(sp.x) - 0.1);
        float cut = step(prog, u) * step(u, prog + 0.12);
        col = mix(col, wc[k] * 1.3, aaMask(dw, aa) * (1.0 - cut));
        // end terminals
        float dt = min(length(sp - vec2(x0 - 0.006, y)), length(sp - vec2(x1 + 0.006, y))) - 0.009;
        col = mix(col, wc[k] * 0.8, aaMask(dt, aa));
      }
      float bar = sd2Box(sp - vec2(0.0, -0.072), vec2(0.105, 0.007));
      col = mix(col, vec3(0.15, 0.18, 0.22), aaMask(bar, aa));
      float fill = max(bar, sp.x - (-0.105 + 0.21 * prog));
      col = mix(col, vec3(0.25, 1.0, 0.45), aaMask(fill, aa));
      s.alb = mix(s.alb, col * 0.2, m);
      s.emis = col * m * 0.9;
      s.metal *= 1.0 - m; s.rough = mix(s.rough, 0.08, m); s.clear = m;
    }
  } else if (id == 7) {
    s = surfDefault(vec3(0.55, 0.57, 0.6), n);
    s.metal = 0.7; s.rough = 0.32;
    float stripe = step(0.5, fract((w.x + w.y) * 12.0)) * smoothstep(0.03, 0.06, w.y) * (1.0 - smoothstep(0.08, 0.11, w.y));
    s.alb = mix(s.alb, vec3(0.95, 0.75, 0.05), stripe);
    s.metal *= 1.0 - stripe;
  } else if (id == 8) {
    s = surfDefault(vec3(0.85, 0.03, 0.02), n);
    s.rough = 0.15; s.clear = 1.0;
    s.emis = vec3(1.0, 0.05, 0.02) * (0.15 + 0.85 * alarm);
  } else if (id == 9 || id == 10) {
    vec3 p = miniP(c, w);
    if (id == 9) {
      s = suit(c, p, n, c.petC.rgb);
    } else {
      vec2 u = vec2(p.x / 0.23, (p.y - 0.64) / 0.11);
      s = glass(c, n, u);
      float hd = sd2Segment(p.xy - vec2(-0.1, 0.68) - c.hl.xy * 0.5, vec2(-0.04, 0.0), vec2(0.04, 0.0)) - 0.024;
      float m = aaMask(hd, aa / MINIS) * (1.0 - c.hl2.w);
      s.alb = mix(s.alb, vec3(1.0), m);
      s.metal *= 1.0 - m;
      s.emis += vec3(0.85, 0.93, 1.0) * m * 0.55;
    }
  } else {
    vec3 p = w - BOT - vec3(0.0, c.pet.y, 0.0);
    s = surfDefault(vec3(0.9, 0.91, 0.93), n);
    s.rough = 0.25; s.clear = 0.8;
    float band = abs(p.y) - 0.022;
    s.alb = mix(s.alb, c.petC.rgb, aaMask(band, aa));
    // a single glowing eye looking where the crewmate looks
    vec2 e = p.xy - vec2(0.02 + c.hl.x * 0.25, 0.012);
    float eye = aaMask(sd2Segment(e, vec2(-0.012, 0.0), vec2(0.012, 0.0)) - 0.011, aa);
    eye *= step(0.0, p.z);
    s.alb = mix(s.alb, vec3(0.05), eye);
    s.emis = vec3(0.35, 0.95, 1.0) * eye * aaMask(length(e) - 0.03, aa) * 0.9;
    if (p.y > 0.07) s.alb = mix(vec3(0.3), vec3(1.0, 0.25, 0.2), step(0.11, p.y));
  }
  // emergency strobe washes everything in red
  if (alarm > 0.0 && id != 6) s.emis += vec3(1.0, 0.07, 0.04) * alarm * 0.1 * (0.5 + 0.5 * sat(n.x + 0.3));
  return s;
}

vec4 anchorPass(ivec2 px) { return vec4(0.0); }
