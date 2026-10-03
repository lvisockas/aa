// ---------------------------------------------------------------------------
// Bombers family: chunky glossy toy "bomb heroes". A big round helmet with a
// recessed face window, a springy antenna, a compact suit with a belt, round
// mitts and big boots. Eyes, highlights, blush and mouth are 2D decals on the
// face; the bomb, accessories and power-up tiles are bounded so a part is only
// evaluated when the sample point is near it (mapHard stays cheap).
// ---------------------------------------------------------------------------
#define HAS_FUR 0

struct Char {
  vec4 helm;   // helmet colour, face window style
  vec4 suit;   // suit colour, antenna style
  vec4 gear;   // gloves & boots colour, accessory
  vec4 ball;   // antenna ball colour, bomb style
  vec4 hq;     // head rotation (relative to the body)
  vec4 eL;     // left eye centre xy (window space), size wh
  vec4 eR;
  vec4 aL;     // left eye: rotation, kind, lid amount, lid angle
  vec4 aR;
  vec4 mouth;  // open, smile, cheeks, lower lid
  vec4 sL; vec4 elL; vec4 hL;   // left arm joints (xyz, radius)
  vec4 sR; vec4 elR; vec4 hR;   // right arm joints
  vec4 ant;    // antenna tip displacement (head space), pulse
  vec4 bomb;   // bomb centre xyz, scale (0 = hidden)
  vec4 bomb2;  // spark flicker, time, wobble, -
  vec4 pu;     // power-ups amount, orbit phase, bob phase, -
  vec4 poke;
  vec4 wob;    // wobble amplitude, phase, droop, perk
  vec4 legs;   // foot lift left, right, crouch, -
  vec4 acc;    // accessory colour, flutter
  vec4 win;    // face window half size xy, y offset, -
};

Char loadChar(int i) {
  Char c;
  c.helm = D(i, 0); c.suit = D(i, 1); c.gear = D(i, 2); c.ball = D(i, 3); c.hq = D(i, 4);
  c.eL = D(i, 5); c.eR = D(i, 6); c.aL = D(i, 7); c.aR = D(i, 8); c.mouth = D(i, 9);
  c.sL = D(i, 10); c.elL = D(i, 11); c.hL = D(i, 12);
  c.sR = D(i, 13); c.elR = D(i, 14); c.hR = D(i, 15);
  c.ant = D(i, 16); c.bomb = D(i, 17); c.bomb2 = D(i, 18); c.pu = D(i, 19);
  c.poke = D(i, 20); c.wob = D(i, 21); c.legs = D(i, 22); c.acc = D(i, 23); c.win = D(i, 24);
  return c;
}

const vec3 NECK = vec3(0.0, 0.36, 0.0);
const vec3 HC = vec3(0.0, 0.6, 0.0);          // helmet centre
const vec3 HR = vec3(0.252, 0.236, 0.242);    // helmet radii
const vec3 TC = vec3(0.0, 0.235, 0.0);        // torso
const vec3 TR = vec3(0.148, 0.135, 0.132);
const float BELT_Y = 0.162;
const vec3 FACE_O = vec3(0.0, -0.012, -0.022); // face ball centre (helmet space)
const float FACE_R = 0.235;
const float BOMB_R = 0.068;

// part ids
#define ID_HELM 1
#define ID_FACE 2
#define ID_SUIT 3
#define ID_GLOVE 4
#define ID_BOOT 5
#define ID_STALK 6
#define ID_BALL 7
#define ID_BOMB 8
#define ID_CAP 9
#define ID_FUSE 10
#define ID_SPARK 11
#define ID_CLOTH 12
#define ID_LENS 13
#define ID_STRAP 14
#define ID_GOLD 15
#define ID_TILE 16
#define ID_BUCKLE 17
#define ID_BELT 18

vec3 toHead(Char c, vec3 q) { return qinv(c.hq, q - NECK) + NECK; }

float ellipse2(vec2 p, vec2 ab) {
  return (length(p / ab) - 1.0) * min(ab.x, ab.y);
}

// ------------------------------------------------------------------ bomb
// spark position in (unrotated) bomb-local space
vec3 sparkTip(Char c) {
  vec3 t = int(c.ball.w + 0.5) == 2 ? vec3(0.0, 0.098, 0.0) : vec3(0.0525, BOMB_R + 0.012, 0.0);
  t.xy = rot2(-(0.22 + c.bomb2.z)) * t.xy;
  return t;
}

// bomb-local space: centre at the origin, unit = character units at scale 1
float bombSDF(Char c, vec3 b, out int id) {
  b.xy = rot2(0.22 + c.bomb2.z) * b.xy;   // a jaunty lean (and a wobble while juggled)
  int st = int(c.ball.w + 0.5);
  float d;
  vec3 tip;
  id = ID_BOMB;
  if (st == 2) {
    // cherry twin: two smaller bombs, fuses joined like stems
    vec3 bq = vec3(abs(b.x), b.y, b.z);
    float r = 0.052;
    vec3 ctr = vec3(0.048, -0.016, 0.0);
    d = length(bq - ctr) - r;
    vec3 capC = ctr + vec3(0.016, r - 0.002, 0.0);
    float cap = sdRoundCylY(bq - capC, 0.018, 0.01, 0.003);
    if (cap < d) { d = cap; id = ID_CAP; }
    tip = vec3(0.0, 0.098, 0.0);
    float fu = sdCapsule(bq, capC + vec3(0.0, 0.008, 0.0), vec3(0.012, 0.086, 0.0), 0.0055);
    if (fu < d) { d = fu; id = ID_FUSE; }
  } else {
    d = length(b) - BOMB_R;
    vec3 capC = vec3(0.0, BOMB_R - 0.002, 0.0);
    float cap = sdRoundCylY(b - capC, 0.026, 0.012, 0.004);
    if (cap < d) { d = cap; id = ID_CAP; }
    // curly fuse: an arc rising from the cap and hooking over
    vec3 fc = vec3(0.026, BOMB_R + 0.021, 0.0);
    vec3 fp = b - fc;
    float fu = sdCappedTorus(vec3(fp.x, fp.y, fp.z), vec2(sin(1.9), cos(1.9)), 0.028, 0.0062);
    if (fu < d) { d = fu; id = ID_FUSE; }
    tip = fc + vec3(0.0265, -0.009, 0.0);
  }
  // flickering spark: a spinning star with a hot core
  vec3 sp = b - tip;
  float fl = c.bomb2.x;
  float sr = 0.02 + 0.014 * fl;
  if (length(sp) < sr + 0.03) {
    vec2 sxy = rot2(c.bomb2.y * 9.0) * sp.xy;
    float star = opExtrude(sd2Star5(sxy, sr, 0.38), sp.z, 0.004) - 0.002;
    star = min(star, length(sp) - 0.011 - 0.004 * fl);
    if (star < d) { d = star; id = ID_SPARK; }
  }
  return d;
}

// ------------------------------------------------------------------ power-ups
// three tiles orbiting the head; returns the tile-local point and index
vec3 tileLocal(Char c, vec3 q, out float k) {
  vec3 r = q - vec3(0.0, HC.y + 0.2, 0.0);
  float seg = TAU / 3.0;
  float an = atan(r.x, r.z);
  k = floor((an - c.pu.y) / seg + 0.5);
  float a = c.pu.y + k * seg;
  float y = 0.03 * sin(c.pu.z + k * 2.1);
  vec3 ctr = vec3(sin(a), 0.0, cos(a)) * 0.37 + vec3(0.0, y, 0.0);
  k = mod(k, 3.0);
  return r - ctr;
}

// ------------------------------------------------------------------ scene
float scene(Char c, vec3 q, out int id) {
  q.x += c.wob.x * sin(q.y * 9.0 + c.wob.y);
  id = ID_SUIT;

  // ---- torso with a raised belt and a buckle
  float d = sdEllipsoid(q - TC, TR);
  float belt = max(sdEllipsoid(q - TC, TR + 0.0075), abs(q.y - BELT_Y) - 0.021);
  if (belt < d) { d = belt; id = ID_BELT; }
  if (q.z > 0.06 && abs(q.x) < 0.09 && abs(q.y - BELT_Y) < 0.08) {
    float bk = sdRoundBox(q - vec3(0.0, BELT_Y, 0.116), vec3(0.034, 0.026, 0.012), 0.009);
    if (bk < d) { d = bk; id = ID_BUCKLE; }
  }

  // ---- legs and big boots (only the nearer side)
  if (q.y < 0.24) {
    float side = q.x < 0.0 ? -1.0 : 1.0;
    float lift = (side < 0.0 ? c.legs.x : c.legs.y) + 0.03 * c.legs.z;
    vec3 lp = vec3(abs(q.x), q.y, q.z);
    float leg = sdCapsule(lp, vec3(0.06, 0.14, 0.0), vec3(0.08, 0.085 + lift, 0.008), 0.042);
    if (leg < d) { d = leg; id = ID_SUIT; }
    vec3 bp = lp - vec3(0.0, lift, 0.0);
    float boot = sdEllipsoid(bp - vec3(0.086, 0.052, 0.034), vec3(0.074, 0.054, 0.097));
    boot = smin(boot, sdRoundCylY(bp - vec3(0.082, 0.088, 0.006), 0.052, 0.03, 0.016), 0.012);
    if (boot < d) { d = boot; id = ID_BOOT; }
  }

  // ---- stubby arms with round mitts
  for (int k = 0; k < 2; k++) {
    vec4 S = k == 0 ? c.sL : c.sR;
    vec4 E = k == 0 ? c.elL : c.elR;
    vec4 H = k == 0 ? c.hL : c.hR;
    if (length(q - S.xyz) - 0.21 > d) continue;
    float arm = sdCapsuleT(q, S.xyz, E.xyz, S.w, E.w);
    arm = smin(arm, sdCapsuleT(q, E.xyz, H.xyz, E.w, 0.03), 0.008);
    float s = k == 0 ? -1.0 : 1.0;
    vec3 hd = normalize(H.xyz - E.xyz);
    float mitt = sdEllipsoid(q - H.xyz - hd * 0.012, vec3(H.w, H.w * 0.96, H.w));
    // thumb on the inner, front side
    mitt = smin(mitt, length(q - H.xyz - vec3(-s * 0.03, 0.022, 0.03)) - 0.021, 0.01);
    float dd = smin(d, arm, 0.01);
    if (arm < d) id = ID_SUIT;
    d = dd;
    if (mitt < d) { d = mitt; id = ID_GLOVE; }
  }

  // ---- head group (helmet space)
  vec3 hp = toHead(c, q) - HC;
  if (length(hp) - 0.43 < d) {
    float helm = sdEllipsoid(hp, HR);
    float win = ellipse2(hp.xy - vec2(0.0, c.win.z), c.win.xy);
    float shell = smax(helm, -max(win, 0.05 - hp.z), 0.012);
    float face = max(length(hp - FACE_O) - FACE_R, helm);
    if (shell < d) { d = shell; id = ID_HELM; }
    if (face < d) { d = face; id = ID_FACE; }

    // antenna
    int ast = int(c.suit.w + 0.5);
    vec3 A = vec3(0.0, HR.y + 0.07, 0.0);
    if (ast != 3 && length(hp - A) - 0.16 < d) {
      vec3 ap = hp;
      vec3 disp = c.ant.xyz;
      vec3 B = vec3(0.0, HR.y - 0.014, 0.0);
      vec3 T = B + vec3(0.0, 0.086, 0.0) + disp;
      float br = 0.048 * (1.0 + 0.14 * c.ant.w);
      if (ast == 4) {
        float sd = ap.x < 0.0 ? -1.0 : 1.0;
        ap.x = abs(ap.x);
        disp.x *= sd;
        B = vec3(0.045, HR.y - 0.022, 0.0);
        T = B + vec3(0.04, 0.082, 0.0) + disp;
        br *= 0.78;
      }
      float stalk = sdCapsuleT(ap, B, T, 0.012, 0.0085);
      if (stalk < d) { d = stalk; id = ID_STALK; }
      vec3 dir = normalize(T - B);
      float top;
      if (ast == 1) {
        vec3 tp = ap - T - dir * 0.048;
        tp.xy = rot2(-disp.x * 3.0) * tp.xy;
        top = opExtrude(sd2Star5(tp.xy, 0.062 * (1.0 + 0.12 * c.ant.w), 0.5) + 0.01, tp.z, 0.012) - 0.012;
      } else if (ast == 2) {
        vec3 tp = ap - T - dir * 0.012;
        tp.xy = rot2(-disp.x * 3.0) * tp.xy;
        float hs = 0.078 * (1.0 + 0.12 * c.ant.w);
        top = opExtrude(sd2Heart(tp.xy / hs + vec2(0.0, 0.08)) * hs + 0.01, tp.z, 0.014) - 0.012;
      } else {
        top = length(ap - T - dir * (br - 0.006)) - br;
      }
      if (top < d) { d = top; id = ID_BALL; }
    }

    // helmet accessories
    int acc = int(c.gear.w + 0.5);
    if (acc == 3) {               // headband with knot tails at the back
      vec3 bp = hp;
      bp.yz = rot2(-0.18) * bp.yz;
      float y0 = c.win.z + c.win.y + 0.035;
      float band = smax(sdEllipsoid(bp, HR + 0.011), abs(bp.y - y0) - 0.024, 0.005);
      vec3 kp = bp - vec3(0.0, y0, -HR.z * sqrt(max(1.0 - y0 * y0 / (HR.y * HR.y), 0.05)) - 0.006);
      float knot = sdEllipsoid(kp, vec3(0.03, 0.026, 0.022));
      vec3 tq = vec3(abs(kp.x), kp.y, kp.z);
      float sw = 0.12 * sin(c.acc.w * 1.3);
      tq.xy = rot2(0.9 + sw) * (tq.xy - vec2(0.012, 0.0));
      float tail = sdRoundBox(tq - vec3(0.0, -0.055, -0.01), vec3(0.018, 0.055, 0.004), 0.003);
      band = min(band, smin(knot, tail, 0.006));
      if (band < d) { d = band; id = ID_CLOTH; }
    } else if (acc == 4) {        // goggles pushed up on the forehead
      float y0 = c.win.z + c.win.y + 0.055;
      float strap = smax(sdEllipsoid(hp, HR + 0.006), abs(hp.y - y0) - 0.016, 0.004);
      if (strap < d) { d = strap; id = ID_STRAP; }
      vec3 gq = vec3(abs(hp.x), hp.y, hp.z);
      vec2 u = vec2(0.068, y0) / HR.xy;
      vec3 L = vec3(0.068, y0, HR.z * sqrt(max(1.0 - dot(u, u), 0.05)));
      vec3 n = normalize(L / (HR * HR));
      vec3 e = gq - L;
      float a = dot(e, n);
      float r = length(e - n * a);
      float rim = length(vec2(r - 0.043, a - 0.016)) - 0.013;
      if (rim < d) { d = rim; id = ID_STRAP; }
      float lens = max(r - 0.04, abs(a - 0.016) - 0.008);
      if (lens < d) { d = lens; id = ID_LENS; }
    } else if (acc == 5) {        // little gold crown around the antenna
      vec3 cp = hp - vec3(-0.012, HR.y - 0.03, 0.0);
      cp.xy = rot2(0.16) * cp.xy;
      float rr = length(cp.xz);
      float an = atan(cp.z, cp.x) + 0.3;
      float zig = abs(fract(an * 5.0 / TAU) - 0.5) * 2.0;
      float top = 0.042 + 0.042 * (1.0 - zig);
      float crown = max(abs(rr - 0.082 - 0.06 * cp.y) - 0.009, max(-cp.y, cp.y - top)) * 0.75;
      // balls on the five points
      float a5 = (floor(an * 5.0 / TAU) + 0.5) * TAU / 5.0 - 0.3;
      vec3 tipP = vec3(cos(a5) * 0.087, 0.088, sin(a5) * 0.087);
      crown = min(crown, length(cp - tipP) - 0.012);
      if (crown < d) { d = crown; id = ID_GOLD; }
    }
  }

  // ---- body accessories
  int acc = int(c.gear.w + 0.5);
  if (acc == 1 && abs(q.y - 0.33) < 0.15) {          // chunky scarf, knotted at the front with two tails
    vec3 sp = q - vec3(0.0, 0.372, 0.0);
    float sc = sdTorus(sp * vec3(1.0, 1.3, 1.0), 0.112, 0.034) * 0.77;
    vec3 kp = sp - vec3(0.062, -0.012, 0.1);
    if (length(kp) < 0.16) {
      sc = smin(sc, sdEllipsoid(kp, vec3(0.03, 0.028, 0.024)), 0.008);
      for (int k = 0; k < 2; k++) {
        float fk = float(k);
        vec3 tq = kp;
        tq.xy = rot2(-0.25 - 0.35 * fk + 0.07 * sin(c.acc.w + fk)) * tq.xy;
        tq.z -= 0.012 + 0.25 * max(-tq.y, 0.0) * max(-tq.y, 0.0) * 4.0 - 0.006 * fk;
        tq.x += 0.008 * sin(tq.y * 50.0 + c.acc.w * 2.0 + fk);
        float L = 0.06 - 0.01 * fk;
        float tail = sdRoundBox(tq - vec3(0.0, -L, 0.0), vec3(0.021, L, 0.006), 0.005);
        sc = smin(sc, tail, 0.006);
      }
    }
    if (sc < d) { d = sc; id = ID_CLOTH; }
  } else if (acc == 2 && q.z < 0.0 && q.y > 0.0) {   // cape
    vec3 cp = q - vec3(0.0, 0.21, -0.15);
    float fall = sat((0.37 - q.y) / 0.3);
    cp.z += 1.6 * cp.x * cp.x - 0.04 * fall * fall - 0.015 * fall * sin(cp.x * 22.0 + c.acc.w * 2.0);
    float hw = 0.11 + 0.08 * fall;
    float cape = opExtrude(max(abs(cp.x) - hw, abs(cp.y) - 0.15), cp.z, 0.006) * 0.75 - 0.003;
    if (cape < d) { d = cape; id = ID_CLOTH; }
  }

  // ---- the bomb
  float bs = c.bomb.w;
  if (bs > 0.02) {
    vec3 bp = (q - c.bomb.xyz) / bs;
    if (length(bp) - 0.16 < d / bs) {
      int bid;
      float db = bombSDF(c, bp, bid) * bs;
      if (db < d) { d = db; id = bid; }
    }
  }

  // ---- orbiting power-up tiles
  if (c.pu.x > 0.02) {
    float rr = length(q.xz);
    if (abs(rr - 0.37) < 0.1 + d && abs(q.y - HC.y - 0.2) < 0.12) {
      float k;
      vec3 tp = tileLocal(c, q, k) / c.pu.x;
      float tile = sdRoundBox(tp, vec3(0.05, 0.05, 0.014), 0.014) * c.pu.x;
      if (tile < d) { d = tile; id = ID_TILE; }
    }
  }

  vec3 dp = q - c.poke.xyz;
  d += c.poke.w * exp(-dot(dp, dp) * 55.0);
  return d;
}

float mapHard(Char c, vec3 q) {
  int id;
  return scene(c, q, id);
}

// ------------------------------------------------------------------ face decals
float eyeShape(vec2 p, vec4 e, vec4 a, float lidB) {
  vec2 q = p - e.xy;
  vec2 r = rot2(-a.x) * q;
  float k = a.y;
  float w = e.z, h = e.w;
  float d;
  if (k < 0.5) {               // tall classic oval (pill)
    float rad = 0.5 * min(w, h);
    vec2 ab = 0.5 * vec2(w, h);
    d = mix(sd2Box(r, vec2(max(ab.x - rad, 0.0), max(ab.y - rad, 0.0))) - rad, (length(r / ab) - 1.0) * min(ab.x, ab.y), 0.6);
  } else if (k < 1.5) {        // round
    vec2 ab = 0.5 * vec2(w, h);
    d = (length(r / ab) - 1.0) * min(ab.x, ab.y);
  } else if (k < 2.5) {        // happy arc
    float ra = 0.5 * h;
    d = sd2Arc(r + vec2(0.0, ra * 0.45), vec2(sin(1.05), cos(1.05)), ra, 0.5 * w);
  } else if (k < 3.5) {        // closed line, gently curved
    vec2 rr = r;
    rr.y -= 7.0 * rr.x * rr.x;
    d = sd2Segment(rr, vec2(-0.5 * h, 0.0), vec2(0.5 * h, 0.0)) - 0.5 * w;
  } else if (k < 4.5) {        // X
    float s = 0.5 * h * 0.7071;
    d = min(sd2Segment(r, vec2(-s, -s), vec2(s, s)), sd2Segment(r, vec2(-s, s), vec2(s, -s))) - 0.5 * w;
  } else if (k < 5.5) {        // chevron
    float s = 0.5 * h;
    d = min(sd2Segment(r, vec2(-s * 0.55, s * 0.8), vec2(s * 0.55, 0.0)),
            sd2Segment(r, vec2(-s * 0.55, -s * 0.8), vec2(s * 0.55, 0.0))) - 0.5 * w;
  } else if (k < 6.5) {        // heart
    d = sd2Heart(r / h + vec2(0.0, 0.5)) * h;
  } else {                     // star
    d = sd2Star5(r, 0.6 * h, 0.45);
  }
  if (a.z > 0.001) {
    vec2 lq = rot2(a.w) * q;
    d = max(d, lq.y - (0.5 * h - a.z * h));
  }
  if (lidB > 0.001) d = max(d, -(q.y + 0.5 * h - lidB * h));
  return d;
}

float eyesDist(Char c, vec2 p) {
  return min(eyeShape(p, c.eL, c.aL, c.mouth.w), eyeShape(p, c.eR, c.aR, c.mouth.w));
}

// glossy white catch-lights inside the open eyes
float highlight(vec2 p, vec4 e, vec4 a) {
  if (a.y > 1.5) return 0.0;
  vec2 q = p - e.xy;
  q.y += a.z * e.w * 0.75;   // slide below a lowered lid
  float big = length((q - vec2(-0.24 * e.z, 0.26 * e.w)) / vec2(0.21 * e.z, 0.13 * e.w)) - 1.0;
  float small = length(q - vec2(0.18 * e.z, -0.24 * e.w)) - 0.09 * e.z;
  return max(1.0 - smoothstep(-0.12, 0.12, big), 1.0 - smoothstep(-0.0015, 0.0015, small) * 1.0);
}

vec3 faceColor(Char c, vec3 hp, float aa, inout Surf s) {
  vec2 p = hp.xy - vec2(0.0, c.win.z);
  vec3 skin = vec3(1.0, 0.64, 0.45);
  vec3 col = skin;
  // cheek blush
  float ck = c.mouth.z;
  if (ck > 0.01) {
    vec2 cq = vec2(abs(p.x) - 0.105, p.y + 0.052);
    float b = exp(-dot(cq / vec2(0.034, 0.02), cq / vec2(0.034, 0.02)));
    col = mix(col, vec3(1.0, 0.33, 0.38), b * 0.55 * ck);
  }
  // mouth: only while talking, shouting or surprised
  float open = c.mouth.x;
  if (open > 0.03) {
    vec2 mq = p - vec2(0.0, -0.066);
    float sm = c.mouth.y;
    float ow = 0.019 + 0.007 * max(sm, 0.0) + 0.006 * open;
    float oh = 0.006 + 0.024 * open;
    float md = ellipse2(mq, vec2(ow, oh));
    if (sm > 0.3) md = max(md, mq.y - oh * 0.35);           // laughing D shape
    if (sm < -0.3) md = max(md, -mq.y - oh * 0.35);         // pout
    float m = 1.0 - smoothstep(-aa, aa, md);
    vec3 mc = vec3(0.32, 0.035, 0.05);
    float tongue = 1.0 - smoothstep(-aa, aa, length((mq - vec2(0.0, -oh * 0.75)) / vec2(ow * 0.62, oh * 0.55)) - 1.0);
    mc = mix(mc, vec3(1.0, 0.36, 0.42), tongue * smoothstep(0.25, 0.5, open));
    col = mix(col, mc, m * smoothstep(0.03, 0.12, open));
  }
  // eyes
  float de = eyesDist(c, p);
  float m = 1.0 - smoothstep(-aa, aa, de);
  if (m > 0.0) {
    float hl = max(highlight(p, c.eL, c.aL), highlight(p, c.eR, c.aR));
    vec3 ec = mix(vec3(0.012, 0.012, 0.02), vec3(1.0), hl * smoothstep(0.02, 0.0, de + 0.004) * 0.95);
    col = mix(col, ec, m);
    // satin ink: the painted catch-lights carry the gloss, no hot softbox reflection
    s.rough = mix(s.rough, 0.38, m);
    s.clear = mix(s.clear, 0.15, m);
  }
  return col;
}

// ------------------------------------------------------------------ tile icons
vec3 tileIcon(float k, vec2 p, float aa) {
  vec3 bg = k < 0.5 ? vec3(0.95, 0.2, 0.06) : (k < 1.5 ? vec3(0.08, 0.3, 0.95) : vec3(0.12, 0.7, 0.25));
  vec3 col = bg;
  float frame = abs(sd2RoundBox(p, vec2(0.05), 0.014) + 0.007) - 0.0025;
  if (k < 0.5) {                 // fire
    float fl = sd2UnevenCapsule(p - vec2(0.0, -0.02), 0.022, 0.003, 0.05);
    float inner = sd2UnevenCapsule(p - vec2(0.0, -0.024), 0.012, 0.002, 0.03);
    col = mix(col, vec3(1.0, 0.75, 0.05), 1.0 - smoothstep(-aa, aa, fl));
    col = mix(col, vec3(1.0, 0.98, 0.8), 1.0 - smoothstep(-aa, aa, inner));
  } else if (k < 1.5) {          // extra bomb
    float b = length(p - vec2(-0.004, -0.006)) - 0.024;
    float fu = sd2Segment(p, vec2(0.008, 0.016), vec2(0.02, 0.03)) - 0.003;
    col = mix(col, vec3(1.0, 0.85, 0.2), 1.0 - smoothstep(-aa, aa, fu));
    col = mix(col, vec3(0.02), 1.0 - smoothstep(-aa, aa, b));
    float hl = length(p - vec2(-0.013, 0.004)) - 0.005;
    col = mix(col, vec3(0.9), 1.0 - smoothstep(-aa, aa, hl));
  } else {                       // roller skate
    float boot = min(sd2RoundBox(p - vec2(-0.008, 0.008), vec2(0.014, 0.018), 0.005), sd2RoundBox(p - vec2(0.004, -0.008), vec2(0.026, 0.008), 0.006));
    float wh = min(length(p - vec2(-0.014, -0.024)) - 0.007, length(p - vec2(0.018, -0.024)) - 0.007);
    col = mix(col, vec3(1.0), 1.0 - smoothstep(-aa, aa, boot));
    col = mix(col, vec3(1.0, 0.85, 0.15), 1.0 - smoothstep(-aa, aa, wh));
  }
  col = mix(col, vec3(1.0), 1.0 - smoothstep(-aa, aa, frame));
  return col;
}

// ------------------------------------------------------------------ materials
void plastic(inout Surf s, float rough, float clear) {
  s.rough = rough; s.clear = clear; s.wrap = 0.22; s.f0 = 0.045;
}

Surf surfAt(Char c, vec3 q, vec3 n) {
  int id;
  scene(c, q, id);
  q.x += c.wob.x * sin(q.y * 9.0 + c.wob.y);
  float aa = max(gFoot * 0.9, 0.0008);
  Surf s = surfDefault(vec3(0.5), n);
  if (id == ID_HELM) {
    s.alb = c.helm.rgb;
    plastic(s, 0.2, 1.0);
  } else if (id == ID_FACE) {
    vec3 hp = toHead(c, q) - HC;
    plastic(s, 0.42, 0.35);
    s.wrap = 0.4;
    s.alb = faceColor(c, hp, aa / max(abs(n.z), 0.35), s);
  } else if (id == ID_SUIT) {
    s.alb = c.suit.rgb;
    plastic(s, 0.32, 0.6);
  } else if (id == ID_BELT) {
    s.alb = vec3(0.025, 0.025, 0.035);
    plastic(s, 0.25, 0.8);
  } else if (id == ID_BUCKLE) {
    s.alb = vec3(1.0, 0.68, 0.08);
    plastic(s, 0.2, 1.0);
    s.metal = 0.35;
  } else if (id == ID_GLOVE) {
    s.alb = c.gear.rgb;
    plastic(s, 0.24, 0.9);
  } else if (id == ID_BOOT) {
    s.alb = c.gear.rgb;
    float lift = (q.x < 0.0 ? c.legs.x : c.legs.y) + 0.03 * c.legs.z;
    float sole = 1.0 - smoothstep(0.016 - aa, 0.016 + aa, q.y - lift);
    s.alb = mix(s.alb, vec3(0.06, 0.06, 0.08), sole);
    plastic(s, 0.24, 0.9);
  } else if (id == ID_STALK) {
    vec3 hp = toHead(c, q) - HC;
    float coil = smoothstep(0.3, 0.5, abs(fract(hp.y * 75.0) - 0.5));
    s.alb = mix(vec3(0.05, 0.05, 0.06), vec3(0.22, 0.22, 0.25), coil);
    plastic(s, 0.3, 0.6);
  } else if (id == ID_BALL) {
    s.alb = c.ball.rgb;
    plastic(s, 0.16, 1.0);
    s.emis = c.ball.rgb * 0.7 * c.ant.w;
  } else if (id == ID_BOMB) {
    s.alb = vec3(0.014, 0.016, 0.026);
    plastic(s, 0.14, 1.0);
    if (int(c.ball.w + 0.5) == 1) {
      // star mark on the front
      vec3 b = (q - c.bomb.xyz) / max(c.bomb.w, 0.02);
      b.xy = rot2(0.22 + c.bomb2.z) * b.xy;
      float st = sd2Star5(b.xy - vec2(0.0, -0.006), 0.034, 0.45);
      float m = (1.0 - smoothstep(-aa * 2.0, aa * 2.0, st)) * step(0.0, b.z);
      s.alb = mix(s.alb, vec3(1.0, 0.82, 0.1), m);
    }
  } else if (id == ID_CAP) {
    s.alb = vec3(0.62, 0.64, 0.68); s.metal = 1.0; s.rough = 0.28;
  } else if (id == ID_FUSE) {
    vec3 sp = (q - c.bomb.xyz) / max(c.bomb.w, 0.02);
    float burnt = 1.0 - smoothstep(0.012, 0.03, length(sp - sparkTip(c)));
    s.alb = mix(vec3(0.62, 0.42, 0.2), vec3(0.06, 0.04, 0.03), burnt);
    s.rough = 0.75; s.wrap = 0.3;
  } else if (id == ID_SPARK) {
    // hot yellow core, orange star tips
    vec3 sp = (q - c.bomb.xyz) / max(c.bomb.w, 0.02);
    float core = 1.0 - smoothstep(0.008, 0.02, length(sp - sparkTip(c)));
    s.alb = vec3(0.08, 0.03, 0.0); s.rough = 0.6;
    s.emis = mix(vec3(1.0, 0.3, 0.015), vec3(1.15, 0.95, 0.35), core) * (0.85 + 0.3 * c.bomb2.x);
  } else if (id == ID_CLOTH) {
    s.alb = c.acc.rgb; s.rough = 0.62; s.sheen = 0.35; s.wrap = 0.35;
    int acc = int(c.gear.w + 0.5);
    if (acc == 3) {
      // white pinstripes on the headband
      vec3 hp = toHead(c, q) - HC;
      hp.yz = rot2(-0.18) * hp.yz;
      float y0 = c.win.z + c.win.y + 0.035;
      float st = abs(abs(hp.y - y0) - 0.014) - 0.003;
      s.alb = mix(s.alb, vec3(0.97), (1.0 - smoothstep(-aa, aa, st)) * 0.9);
    } else if (acc == 2) {
      s.alb *= n.z > 0.0 ? 0.55 : 1.0;   // darker lining facing the body
      plastic(s, 0.4, 0.4);
    }
  } else if (id == ID_LENS) {
    s.alb = vec3(0.02, 0.06, 0.1); s.rough = 0.04; s.f0 = 0.08; s.clear = 1.0;
  } else if (id == ID_STRAP) {
    s.alb = vec3(0.07, 0.065, 0.075); plastic(s, 0.35, 0.5);
  } else if (id == ID_GOLD) {
    s.alb = vec3(1.0, 0.7, 0.12); plastic(s, 0.18, 1.0); s.metal = 0.45;
  } else if (id == ID_TILE) {
    float k;
    vec3 tp = tileLocal(c, q, k) / max(c.pu.x, 0.02);
    vec2 uv = tp.xy;
    if (tp.z < 0.0) uv.x = -uv.x;
    s.alb = tileIcon(k, uv, aa / max(c.pu.x, 0.02));
    plastic(s, 0.2, 0.9);
  }
  return s;
}

vec4 anchorPass(ivec2 px) { return vec4(0.0); }
