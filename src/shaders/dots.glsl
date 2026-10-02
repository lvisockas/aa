// ---------------------------------------------------------------------------
// Dots family: short-pile plush characters with bead eyes and accessories.
// A tiny GPU "anchor pass" ray-casts the body once per frame to find where
// eyes, hats, bow ties and headphones sit, so accessories follow any shape,
// width or morph exactly.
// ---------------------------------------------------------------------------
#define HAS_FUR 1

struct Char {
  vec4 body;   // shape A, shape B, morph, width
  vec4 col;    // body colour, fur length
  vec4 fur;    // density, strand scale, clump, sheen
  vec4 eye;    // kind, size, spacing, height offset
  vec4 eye2;   // blink, squint, look x, look y
  vec4 gl;     // glasses type, frame colour
  vec4 hat;    // type, tilt, size, -
  vec4 hatC;   // hat colour, -
  vec4 neck;   // type, colour
  vec4 ears;   // type, colour
  vec4 poke;   // xyz, amplitude
  vec4 wob;    // amplitude, phase, excite, -
  vec4 mouth;  // type, smile width, open, -
  vec4 cheek;  // amount, colour
  vec4 lens;   // lens colour, -
  vec4 shp;    // eye y, eye spacing, top x, neck y
  vec4 shp2;   // side y, mouth y, -, -
  vec3 aEL; vec3 aER; vec3 aTop; vec3 aNeck; vec3 aSL; vec3 aSR; vec3 aMouth;
  vec3 nEL; vec3 nER; vec3 nTop; vec3 nNeck; vec3 nSL; vec3 nSR; vec3 nMouth;
};

Char loadChar(int i) {
  Char c;
  c.body = D(i, 0); c.col = D(i, 1); c.fur = D(i, 2); c.eye = D(i, 3); c.eye2 = D(i, 4);
  c.gl = D(i, 5); c.hat = D(i, 6); c.hatC = D(i, 7); c.neck = D(i, 8); c.ears = D(i, 9);
  c.poke = D(i, 10); c.wob = D(i, 11); c.mouth = D(i, 12); c.cheek = D(i, 13); c.lens = D(i, 14);
  c.shp = D(i, 15); c.shp2 = D(i, 16);
  if (uHasAnchors == 1) {
    c.aEL = texelFetch(uAnchors, ivec2(0, i), 0).xyz;
    c.aER = texelFetch(uAnchors, ivec2(1, i), 0).xyz;
    c.aTop = texelFetch(uAnchors, ivec2(2, i), 0).xyz;
    c.aNeck = texelFetch(uAnchors, ivec2(3, i), 0).xyz;
    c.aSL = texelFetch(uAnchors, ivec2(4, i), 0).xyz;
    c.aSR = texelFetch(uAnchors, ivec2(5, i), 0).xyz;
    c.aMouth = texelFetch(uAnchors, ivec2(6, i), 0).xyz;
    c.nEL = texelFetch(uAnchors, ivec2(8, i), 0).xyz;
    c.nER = texelFetch(uAnchors, ivec2(9, i), 0).xyz;
    c.nTop = texelFetch(uAnchors, ivec2(10, i), 0).xyz;
    c.nNeck = texelFetch(uAnchors, ivec2(11, i), 0).xyz;
    c.nSL = texelFetch(uAnchors, ivec2(12, i), 0).xyz;
    c.nSR = texelFetch(uAnchors, ivec2(13, i), 0).xyz;
    c.nMouth = texelFetch(uAnchors, ivec2(14, i), 0).xyz;
  } else {
    // no float render targets: coarse per-shape estimates provided by the CPU
    float w = c.body.w;
    float ex = 0.5 * c.eye.z * c.shp.y * w;
    float ey = c.shp.x + c.eye.w;
    float zf = c.shp2.z;
    c.aEL = vec3(-ex, ey, zf); c.aER = vec3(ex, ey, zf);
    c.aTop = vec3(c.shp.z * w, c.shp2.w, 0.0);
    c.aNeck = vec3(0.0, c.shp.w, zf * 0.9);
    c.aSL = vec3(-0.45 * w, c.shp2.x, 0.0); c.aSR = vec3(0.45 * w, c.shp2.x, 0.0);
    c.aMouth = vec3(0.0, c.shp2.y, zf);
    c.nEL = vec3(0.0, 0.0, 1.0); c.nER = c.nEL; c.nNeck = c.nEL; c.nMouth = c.nEL;
    c.nTop = vec3(0.0, 1.0, 0.0); c.nSL = vec3(-1.0, 0.0, 0.0); c.nSR = vec3(1.0, 0.0, 0.0);
  }
  return c;
}

// ------------------------------------------------------------------ bodies
float pillow(float d2, float z, float R, float H) {
  float k = R / H;
  return (length(vec2(max(d2 + R, 0.0), z * k)) - R) / k;
}

float shapeBody(float sid, vec3 q) {
  int id = int(sid + 0.5);
  vec3 p = q;
  float d;
  if (id == 0) {            // bean (Dottie)
    p.x -= 0.06 * sin((p.y - 0.5) * 3.2);
    p.z /= 0.84;
    d = sdCapsuleT(p, vec3(0.0, 0.34, 0.0), vec3(0.0, 0.66, 0.0), 0.34, 0.31) * 0.84;
  } else if (id == 1) {     // cloud (Felipe)
    p.z /= 0.8;
    d = sdSphere(p - vec3(0.0, 0.42, 0.0), 0.36);
    d = smin(d, sdSphere(p - vec3(-0.36, 0.31, 0.0), 0.27), 0.022);
    d = smin(d, sdSphere(p - vec3(0.36, 0.31, 0.0), 0.27), 0.022);
    d = smin(d, sdSphere(p - vec3(-0.17, 0.68, 0.0), 0.26), 0.022);
    d = smin(d, sdSphere(p - vec3(0.19, 0.66, 0.0), 0.27), 0.022);
    d = smax(d, 0.05 - p.y, 0.03);
    d *= 0.8;
  } else if (id == 2) {     // pear / triangle (Alfred)
    p.z /= 0.86;
    d = sdRoundCone(p, vec3(0.0, 0.4, 0.0), vec3(0.0, 0.86, 0.0), 0.4, 0.14) * 0.86;
  } else if (id == 3) {     // heart (Jojo)
    vec2 h = vec2(p.x, p.y - 0.08) / 0.84;
    float d2 = sd2Heart(h) * 0.84 - 0.035;
    d = pillow(d2, p.z, 0.3, 0.24);
  } else if (id == 4) {     // frog (Todd)
    d = sdEllipsoid(p - vec3(0.0, 0.41, 0.0), vec3(0.6, 0.41, 0.48));
    d = smin(d, sdSphere(p - vec3(-0.28, 0.74, 0.1), 0.2), 0.035);
    d = smin(d, sdSphere(p - vec3(0.28, 0.74, 0.1), 0.2), 0.035);
    d = smax(d, 0.03 - p.y, 0.05);
  } else if (id == 5) {     // bunny
    d = sdEllipsoid(p - vec3(0.0, 0.37, 0.0), vec3(0.41, 0.37, 0.37));
    vec3 e = vec3(abs(p.x), p.y, p.z) - vec3(0.15, 0.62, -0.02);
    e.xy = rot2(0.22) * e.xy;
    d = smin(d, sdEllipsoid(e - vec3(0.0, 0.24, 0.0), vec3(0.085, 0.27, 0.05)), 0.02);
  } else if (id == 6) {     // ring
    d = sdTorusZ(p - vec3(0.0, 0.52, 0.0), 0.34, 0.17);
  } else if (id == 7) {     // hexagon
    float d2 = sd2Hexagon(vec2(p.x, p.y - 0.5), 0.34) - 0.1;
    d = pillow(d2, p.z, 0.26, 0.21);
  } else if (id == 8) {     // flower
    vec2 f = vec2(p.x, p.y - 0.5);
    float d2 = length(f) - 0.28;
    for (int k = 0; k < 5; k++) {
      float a = 1.5708 + float(k) * 1.2566;
      d2 = smin(d2, length(f - 0.27 * vec2(cos(a), sin(a))) - 0.2, 0.05);
    }
    d = pillow(d2, p.z, 0.22, 0.19);
  } else if (id == 9) {     // pill
    p.z /= 0.86;
    d = sdCapsule(p, vec3(0.0, 0.3, 0.0), vec3(0.0, 0.7, 0.0), 0.3) * 0.86;
  } else {                  // rounded square
    float d2 = sd2RoundBox(vec2(p.x, p.y - 0.5), vec2(0.44), 0.2);
    d = pillow(d2, p.z, 0.27, 0.22);
  }
  return d;
}

vec3 warp(Char c, vec3 q) {
  q.x += c.wob.x * sin(q.y * 9.0 + c.wob.y);
  return q;
}

float bodyShape(Char c, vec3 q) {
  float w = c.body.w;
  vec3 p = vec3(q.x / w, q.y, q.z);
  float d = shapeBody(c.body.x, p);
  if (c.body.z > 0.001) d = mix(d, shapeBody(c.body.y, p), c.body.z);
  return d * min(w, 1.0);
}

// furry add-ons: animal ears, felt hats, pom-poms
float furryExtras(Char c, vec3 q) {
  float d = 1e5;
  int et = int(c.ears.x + 0.5);
  if (et == 2 || et == 3) {
    vec3 t = c.aTop;
    vec3 e = vec3(abs(q.x - t.x), q.y - t.y, q.z - t.z);
    float sx = 0.17 * c.body.w;
    if (et == 2) {          // bunny ears
      e -= vec3(sx, 0.02, -0.02);
      e.xy = rot2(-0.18) * e.xy;
      d = sdEllipsoid(e - vec3(0.0, 0.2, 0.0), vec3(0.075, 0.23, 0.045));
    } else {                // bear ears
      e -= vec3(sx + 0.03, -0.01, 0.0);
      d = sdEllipsoid(e, vec3(0.1, 0.1, 0.06));
    }
  }
  int ht = int(c.hat.x + 0.5);
  if (ht == 1 || ht == 2) {
    vec3 h = q - c.aTop;
    h.xy = rot2(c.hat.y) * h.xy;
    float s = c.hat.z;
    if (ht == 1) {          // beret (felt)
      vec3 b = h - vec3(0.04 * s, 0.035 * s, 0.0);
      float beret = sdEllipsoid(b, vec3(0.27, 0.075, 0.25) * s);
      beret = smin(beret, sdCapsule(h, vec3(0.0, 0.06, 0.0) * s, vec3(0.012, 0.115, 0.0) * s, 0.017 * s), 0.02);
      d = min(d, beret);
    } else {                // beanie with pom-pom
      vec3 b = h - vec3(0.0, -0.02, 0.0);
      float cap = sdEllipsoid(b, vec3(0.3, 0.24, 0.28) * s);
      cap = smax(cap, -b.y - 0.02, 0.03);
      float brim = sdTorus(b - vec3(0.0, 0.0, 0.0), 0.27 * s, 0.045 * s);
      float pom = sdSphere(h - vec3(0.0, 0.26 * s, 0.0), 0.07 * s);
      d = min(d, min(smin(cap, brim, 0.02), pom));
    }
  }
  return d;
}

float mapBase(Char c, vec3 q) {
  q = warp(c, q);
  float d = bodyShape(c, q);
  vec3 dp = q - c.poke.xyz;
  d += c.poke.w * exp(-dot(dp, dp) * 45.0);
  return min(d, furryExtras(c, q));
}

// ------------------------------------------------------------- hard parts
// id: 1 eye bead, 2 eyeball, 3 pupil, 4 frame, 5 lens, 6 bow, 7 phones,
//     8 cushion, 9 mouth felt, 10 party hat, 11 crown, 12 antenna ball, 13 thread
float eyeDist(Char c, vec3 q, vec3 a, vec3 n, float side, out int id) {
  int kind = int(c.eye.x + 0.5);
  float s = c.eye.y * (1.0 + 0.1 * c.wob.z);
  float blink = c.eye2.x;
  float squint = c.eye2.y;
  vec3 p = q - a;
  id = 1;
  if (kind == 3) {          // googly (frog)
    float R = 0.115 * s;
    vec3 ce = a + n * (R * 0.55);
    vec3 e = q - ce;
    float ball = length(e) - R;
    // eyelid in body colour closes from the top
    vec2 look = c.eye2.zw * vec2(0.45, 0.35);
    vec3 pd = normalize(vec3(look, 1.0));
    float pupil = length(e - pd * R * 0.9) - R * 0.48;
    pupil = max(pupil, ball - 0.004);
    float lidCut = mix(1.2, -1.05, max(blink, squint * 0.6));
    float d = ball;
    id = 2;
    if (pupil < d + 0.002) { d = min(d, pupil); id = 3; }
    if (blink > 0.02 || squint > 0.02) {
      float lid = max(length(e) - R * 1.07, lidCut * R - e.y);
      if (lid < d) { d = lid; id = 14; }
    }
    return d;
  }
  if (kind == 4 || kind == 5 || (blink > 0.85 && kind < 3)) {  // closed: arcs / lines (thread)
    id = 13;
    float r = 0.05 * s;
    vec3 t = p - n * 0.006;
    if (kind == 5 || blink > 0.85) {
      return sdCapsule(t, vec3(-r, 0.0, 0.0), vec3(r, 0.0, 0.0), 0.009 * s);
    }
    vec3 u = t + vec3(0.0, r * 0.55, 0.0);
    return sdCappedTorus(vec3(u.x, u.y, u.z), vec2(sin(1.1), cos(1.1)), r, 0.0095 * s);
  }
  float open = (1.0 - blink * 0.92) * (1.0 - squint * 0.45);
  vec3 e = p - n * (0.012 * s);
  if (kind == 1) {          // oval
    return sdEllipsoid(e, vec3(0.036, 0.058 * open, 0.032) * s);
  }
  if (kind == 2) {          // diamond
    vec3 dd = e / (vec3(0.05, 0.07 * open, 0.035) * s);
    return sdOctahedron(dd, 1.0) * 0.035 * s * 0.9;
  }
  if (kind == 6) {          // big & shiny
    return sdEllipsoid(e, vec3(0.06, 0.068 * open, 0.045) * s);
  }
  return sdEllipsoid(e, vec3(0.042, 0.046 * open, 0.036) * s);   // round bead
}

float hardParts(Char c, vec3 q, out int id) {
  q = warp(c, q);
  id = 0;
  float d = 1e5;
  int tmp;
  // eyes
  float de = eyeDist(c, q, c.aEL, c.nEL, -1.0, tmp);
  if (de < d) { d = de; id = tmp; }
  de = eyeDist(c, q, c.aER, c.nER, 1.0, tmp);
  if (de < d) { d = de; id = tmp; }

  // glasses
  int gt = int(c.gl.x + 0.5);
  if (gt > 0) {
    float zf = max(c.aEL.z, c.aER.z) + 0.05 + c.col.w;
    float R = (0.085 + 0.02 * c.eye.y) * (gt == 2 ? 1.12 : 1.0);
    vec3 pl = q - vec3(c.aEL.xy, zf);
    vec3 pr = q - vec3(c.aER.xy, zf);
    float fr = min(sdTorusZ(pl, R, 0.013), sdTorusZ(pr, R, 0.013));
    // bridge
    vec3 mid = vec3(0.5 * (c.aEL.xy + c.aER.xy), zf);
    float half_ = max(0.5 * (c.aER.x - c.aEL.x) - R, 0.02);
    vec3 b = q - mid - vec3(0.0, R * 0.25, 0.0);
    fr = min(fr, sdCappedTorus(vec3(b.x, b.y + half_ * 0.2, b.z), vec2(sin(1.2), cos(1.2)), half_ * 1.05, 0.011));
    // temples back to the sides
    float tz = min(c.aSL.z, c.aSR.z);
    fr = min(fr, sdCapsule(q, vec3(c.aEL.x - R * 0.98, c.aEL.y + R * 0.2, zf), vec3(c.aSL.x + 0.01, c.aEL.y + R * 0.25, tz + 0.02), 0.01));
    fr = min(fr, sdCapsule(q, vec3(c.aER.x + R * 0.98, c.aER.y + R * 0.2, zf), vec3(c.aSR.x - 0.01, c.aER.y + R * 0.25, tz + 0.02), 0.01));
    if (fr < d) { d = fr; id = 4; }
    if (gt == 2) {          // dark lenses
      float ln = min(max(length(pl.xy) - R, abs(pl.z) - 0.006), max(length(pr.xy) - R, abs(pr.z) - 0.006));
      if (ln < d) { d = ln; id = 5; }
    }
  }

  // neck: bow tie or bell
  int nt = int(c.neck.x + 0.5);
  if (nt > 0) {
    vec3 a = c.aNeck + c.nNeck * 0.01 + vec3(0.0, 0.0, c.col.w * 0.8);
    vec3 p = q - a;
    if (nt == 1) {
      // puffy satin wings pinched into a knot
      vec3 w = vec3(abs(p.x), p.y, p.z);
      w.y += 0.014 * sin(w.x * 32.0) * smoothstep(0.04, 0.12, w.x);
      vec3 ws = vec3(w.x, w.y * 0.92, w.z * 1.8);
      float wing = sdRoundCone(ws, vec3(0.018, 0.0, 0.0), vec3(0.095, 0.0, 0.0), 0.024, 0.066) / 1.8;
      wing = smax(wing, w.x - 0.145, 0.025);
      float knot = sdRoundBox(p - vec3(0.0, 0.0, 0.01), vec3(0.03, 0.038, 0.03), 0.016);
      float bow = smin(wing, knot, 0.008);
      if (bow < d) { d = bow; id = 6; }
    } else {
      float bell = sdSphere(p - vec3(0.0, -0.03, 0.02), 0.05);
      bell = min(bell, sdTorus(p - vec3(0.0, 0.025, 0.02), 0.014, 0.006));
      if (bell < d) { d = bell; id = 11; }
    }
  }

  // ears / headphones / antenna
  int et = int(c.ears.x + 0.5);
  if (et == 1) {
    vec3 L = c.aSL + c.nSL * 0.035, Rr = c.aSR + c.nSR * 0.035;
    vec3 pl = q - L, pr = q - Rr;
    float cupL = sdRoundCylY(vec3(pl.y, pl.x, pl.z), 0.105, 0.035, 0.012);
    float cupR = sdRoundCylY(vec3(pr.y, pr.x, pr.z), 0.105, 0.035, 0.012);
    float cush = min(sdTorus(vec3(pl.y, pl.x - 0.035, pl.z), 0.075, 0.03), sdTorus(vec3(pr.y, pr.x + 0.035, pr.z), 0.075, 0.03));
    float cups = min(cupL, cupR);
    vec3 cen = vec3(0.5 * (L.x + Rr.x), 0.5 * (L.y + Rr.y), 0.5 * (L.z + Rr.z));
    float Rb = 0.5 * (Rr.x - L.x) + 0.02;
    float ky = max((c.aTop.y + 0.05 + c.col.w - cen.y) / Rb, 0.4);
    vec3 b = q - cen;
    b.y /= ky;
    float band = sdCappedTorus(b, vec2(1.0, 0.0), Rb, 0.024 / ky) * min(ky, 1.0);
    float ph = min(cups, band);
    if (ph < d) { d = ph; id = 7; }
    if (cush < d) { d = cush; id = 8; }
  } else if (et == 4) {
    vec3 t = c.aTop + c.nTop * 0.01;
    float stalk = sdCapsule(q, t, t + vec3(0.03, 0.17, 0.0), 0.012);
    float ball = sdSphere(q - t - vec3(0.035, 0.2, 0.0), 0.045);
    if (stalk < d) { d = stalk; id = 4; }
    if (ball < d) { d = ball; id = 12; }
  }

  // hard hats
  int ht = int(c.hat.x + 0.5);
  if (ht == 3 || ht == 4) {
    vec3 h = q - c.aTop;
    h.xy = rot2(c.hat.y) * h.xy;
    float s = c.hat.z;
    if (ht == 3) {          // party hat
      float cone = sdCappedCone(h - vec3(0.0, 0.13 * s, 0.0), 0.13 * s, 0.13 * s, 0.006);
      float pom = sdSphere(h - vec3(0.0, 0.27 * s, 0.0), 0.035 * s);
      float hh = min(cone, pom);
      if (hh < d) { d = hh; id = 10; }
    } else {                // crown
      vec3 k = h - vec3(0.0, 0.02, 0.0);
      float band = max(abs(length(k.xz) - 0.17 * s) - 0.012, abs(k.y - 0.04 * s) - 0.04 * s);
      float an = atan(k.z, k.x);
      float sector = 6.2831853 / 7.0;
      float a2 = mod(an + sector * 0.5, sector) - sector * 0.5;
      vec3 sp = vec3(length(k.xz) * cos(a2), k.y, length(k.xz) * sin(a2)) - vec3(0.17 * s, 0.12 * s, 0.0);
      float spike = sdSphere(sp, 0.022 * s);
      float cr = min(band, spike);
      if (cr < d) { d = cr; id = 11; }
    }
  }

  // mouth: embroidered smile or a felt patch when open / talking
  int mt = int(c.mouth.x + 0.5);
  float open = c.mouth.z;
  if (mt > 0 || open > 0.02) {
    vec3 a = c.aMouth + c.nMouth * 0.004;
    vec3 p = q - a;
    if (mt == 2 || open > 0.02) {
      float o = max(open, mt == 2 ? 0.55 : 0.0);
      float m = sdEllipsoid(p, vec3(0.05 * c.mouth.y, 0.012 + 0.04 * o, 0.02));
      if (m < d) { d = m; id = 9; }
    } else {
      float r = 0.07 * c.mouth.y;
      vec3 u = p - vec3(0.0, r * 0.75, 0.0);
      float m = sdCappedTorus(vec3(u.x, -u.y, u.z), vec2(sin(0.75), cos(0.75)), r, 0.01);
      if (m < d) { d = m; id = 13; }
    }
  }
  return d;
}

float mapHard(Char c, vec3 q) {
  int id;
  return hardParts(c, q, id);
}

float featureMask(Char c, vec3 q, vec3 a, float r) {
  vec3 d = q - a;
  return 1.0 - smoothstep(r * 0.8, r * 1.6, length(d));
}

float furLen(Char c, vec3 q) {
  q = warp(c, q);
  float L = c.col.w;
  float s = c.eye.y;
  float m = 0.0;
  int kind = int(c.eye.x + 0.5);
  float er = kind == 3 ? 0.13 * s : 0.07 * s;
  m = max(m, featureMask(c, q, c.aEL, er));
  m = max(m, featureMask(c, q, c.aER, er));
  if (int(c.mouth.x + 0.5) > 0 || c.mouth.z > 0.02) m = max(m, featureMask(c, q, c.aMouth, 0.06 * max(c.mouth.y, 0.6)) * 0.85);
  // flatten the pile where the dent is
  vec3 dp = q - c.poke.xyz;
  m = max(m, sat(c.poke.w * 14.0) * exp(-dot(dp, dp) * 60.0) * 0.7);
  float extra = furryExtras(c, q);
  float body = bodyShape(c, q);
  // felt hats and ears have a shorter, denser pile
  float onExtra = 1.0 - smoothstep(-0.01, 0.02, extra - body);
  return L * (1.0 - m) * mix(1.0, 0.55, onExtra);
}

vec3 furCoord(Char c, vec3 q) { return q; }
float furNominal(Char c) { return c.col.w * 0.6; }

Fur furAt(Char c, vec3 q, vec3 n) {
  q = warp(c, q);
  Fur f;
  vec3 col = c.col.rgb;
  float extra = furryExtras(c, q);
  float body = bodyShape(c, q);
  int ht = int(c.hat.x + 0.5);
  bool onExtra = extra < body;
  if (onExtra) {
    bool onHat = ht == 1 || ht == 2;
    // decide hat vs ears by height above the top anchor
    if (int(c.ears.x + 0.5) >= 2 && (!onHat || abs(q.x - c.aTop.x) > 0.16 * c.body.w)) col = c.ears.yzw;
    else col = c.hatC.rgb;
    if (ht == 2 && q.y > c.aTop.y + 0.2 * c.hat.z) col = vec3(0.92, 0.92, 0.9);
  }
  // blush
  if (c.cheek.x > 0.0 && !onExtra) {
    vec3 cl = c.aEL + vec3(-0.035, -0.085, 0.0);
    vec3 cr = c.aER + vec3(0.035, -0.085, 0.0);
    float b = max(exp(-dot(q - cl, q - cl) * 300.0), exp(-dot(q - cr, q - cr) * 300.0));
    col = mix(col, c.cheek.yzw, b * c.cheek.x);
  }
  f.tip = mix(col, vec3(1.0), 0.06) * 1.02;
  f.root = col * 0.62;
  f.dens = c.fur.x;
  f.scale = c.fur.y;
  f.clump = c.fur.z;
  f.droop = 0.0;
  f.sheen = c.fur.w;
  f.occ = 0.42;
  return f;
}

Surf surfAt(Char c, vec3 q, vec3 n) {
  int id;
  hardParts(c, q, id);
  Surf s = surfDefault(vec3(0.02), n);
  if (id == 1 || id == 3) {         // glossy black bead / pupil
    s.alb = vec3(0.012); s.rough = 0.1; s.f0 = 0.05; s.clear = 0.7;
  } else if (id == 2) {             // eyeball
    s.alb = vec3(0.9, 0.9, 0.88); s.rough = 0.22; s.clear = 0.5; s.wrap = 0.3;
  } else if (id == 4) {             // frames
    s.alb = c.gl.yzw; s.rough = 0.22; s.clear = 0.5;
  } else if (id == 5) {             // lens
    s.alb = c.lens.rgb; s.rough = 0.04; s.f0 = 0.08; s.clear = 1.0;
  } else if (id == 6) {             // satin bow tie
    s.alb = c.neck.yzw; s.rough = 0.38; s.sheen = 0.7; s.wrap = 0.3;
  } else if (id == 7) {             // headphones
    s.alb = c.ears.yzw; s.rough = 0.32; s.clear = 0.4;
  } else if (id == 8) {             // cushions
    s.alb = c.ears.yzw * 0.25 + 0.02; s.rough = 0.8; s.sheen = 0.8;
  } else if (id == 9) {             // felt mouth patch
    s.alb = vec3(0.32, 0.03, 0.05); s.rough = 0.9; s.sheen = 0.5;
  } else if (id == 10) {            // party hat stripes
    vec3 h = q - c.aTop;
    float band = step(0.5, fract((h.y + 0.6 * h.x) * 22.0));
    s.alb = mix(c.hatC.rgb, vec3(0.95), band);
    if (length(h - vec3(0.0, 0.27 * c.hat.z, 0.0)) < 0.05 * c.hat.z) s.alb = vec3(0.95);
    s.rough = 0.45; s.clear = 0.3;
  } else if (id == 11) {            // gold
    s.alb = vec3(1.0, 0.78, 0.34); s.metal = 1.0; s.rough = 0.25;
  } else if (id == 12) {            // antenna ball
    s.alb = c.ears.yzw; s.rough = 0.15; s.clear = 0.8;
  } else if (id == 13) {            // embroidery thread
    s.alb = vec3(0.015); s.rough = 0.6; s.sheen = 0.4;
  } else if (id == 14) {            // frog eyelid
    s.alb = c.col.rgb * 0.9; s.rough = 0.7; s.sheen = 0.6;
  }
  return s;
}

// ------------------------------------------------------------- anchors
vec3 anchorOrigin(Char c, int k, out vec3 dir) {
  float w = c.body.w;
  float ex = 0.5 * c.eye.z * c.shp.y * w;
  float ey = c.shp.x + c.eye.w;
  vec2 look = c.eye2.zw * vec2(0.045, 0.03);
  if (int(c.eye.x + 0.5) == 3) look *= 0.0;
  dir = vec3(0.0, 0.0, -1.0);
  if (k == 0) return vec3(-ex + look.x, ey + look.y, 2.0);
  if (k == 1) return vec3(ex + look.x, ey + look.y, 2.0);
  if (k == 2) { dir = vec3(0.0, -1.0, 0.0); return vec3(c.shp.z * w, 2.5, 0.0); }
  if (k == 3) return vec3(0.0, c.shp.w, 2.0);
  if (k == 4) { dir = vec3(1.0, 0.0, 0.0); return vec3(-2.0, c.shp2.x, 0.0); }
  if (k == 5) { dir = vec3(-1.0, 0.0, 0.0); return vec3(2.0, c.shp2.x, 0.0); }
  return vec3(0.0, c.shp2.y, 2.0);
}

vec3 bodyNormal(Char c, vec3 p) {
  vec3 n = vec3(0.0);
  for (int i = ZERO; i < 4; i++) {
    vec3 k = 0.5773 * (2.0 * vec3(float(((i + 3) >> 1) & 1), float((i >> 1) & 1), float(i & 1)) - 1.0);
    n += k * bodyShape(c, p + 0.002 * k);
  }
  return normalize(n);
}

vec4 anchorPass(ivec2 px) {
  int k = px.x;
  int i = px.y;
  if (i >= uCount) return vec4(0.0);
  Char c = loadChar(i);
  vec3 dir;
  vec3 ro = anchorOrigin(c, k % 8, dir);
  float t = 0.0;
  bool hit = false;
  for (int s = 0; s < 80; s++) {
    float d = bodyShape(c, ro + dir * t);
    if (d < 1e-4) { hit = true; break; }
    t += d * 0.9;
    if (t > 5.0) break;
  }
  if (!hit) {
    // ray missed (e.g. through the ring's hole): fall back to the closest surface point
    vec3 p = ro + dir * 2.0;
    for (int s = 0; s < 6; s++) p -= bodyNormal(c, p) * bodyShape(c, p);
    t = dot(p - ro, dir);
  }
  vec3 p = ro + dir * t;
  if (k >= 8) return vec4(bodyNormal(c, p), 0.0);
  return vec4(p, 1.0);
}
