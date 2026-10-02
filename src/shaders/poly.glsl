// ---------------------------------------------------------------------------
// Polydots family: a low-poly mash-up of OpenAI's Dots blobs and the RebelMouse
// mouse. Bodies are unions of faceted ellipsoids built from icosahedral plane
// sets, so every face is genuinely flat and the silhouette is polygonal too.
// Ears, bandana, tail beads, feet and props are faceted the same way.
// ---------------------------------------------------------------------------
#define HAS_FUR 0

struct Char {
  vec4 b[10];   // 5 blobs: centre xyz + yaw, radii xyz + pitch
  vec4 col;     // body colour, material (0 paper, 1 gem, 2 toy)
  vec4 acc;     // accent colour (ears, nose, tail, feet), facet relief
  vec4 band;    // bandana style, colour
  vec4 bandA;   // headband y, neckerchief y, sway, waist front z
  vec4 eye;     // kind L, kind R, size, -
  vec4 eye2;    // blink, lid, look x, look y
  vec4 face;    // mouth style, open, smile, blush
  vec4 aEL; vec4 nEL; vec4 aER; vec4 nER;   // eye anchors + normals; w: face centre xyz, face height
  vec4 aN; vec4 nN;                         // nose anchor (w: nose on), nose normal (w: whiskers)
  vec4 earL; vec4 earR;                     // ear centres; w: ear size, wiggle
  vec4 poke;
  vec4 wob;     // wobble amplitude, phase, excite, -
  vec4 props;   // bits, bits phase, flag, flag style
  vec4 t0; vec4 t1; vec4 t2;   // tail beads xyz + radius
  vec4 misc;    // foot lift L, R, flag phase, feet z
};

Char loadChar(int i) {
  Char c;
  for (int k = 0; k < 10; k++) c.b[k] = D(i, k);
  c.col = D(i, 10); c.acc = D(i, 11); c.band = D(i, 12); c.bandA = D(i, 13);
  c.eye = D(i, 14); c.eye2 = D(i, 15); c.face = D(i, 16);
  c.aEL = D(i, 17); c.nEL = D(i, 18); c.aER = D(i, 19); c.nER = D(i, 20);
  c.aN = D(i, 21); c.nN = D(i, 22); c.earL = D(i, 23); c.earR = D(i, 24);
  c.poke = D(i, 25); c.wob = D(i, 26); c.props = D(i, 27);
  c.t0 = D(i, 28); c.t1 = D(i, 29); c.t2 = D(i, 30); c.misc = D(i, 31);
  return c;
}

// icosahedron face normals (20 triangles) and vertex directions (12 caps)
const vec3 PF[20] = vec3[20](vec3(-0.57735, -0.57735, -0.57735), vec3(0.00000, -0.93417, -0.35682), vec3(-0.35682, 0.00000, -0.93417), vec3(0.35682, 0.00000, -0.93417), vec3(0.57735, -0.57735, -0.57735), vec3(-0.93417, -0.35682, 0.00000), vec3(0.00000, -0.93417, 0.35682), vec3(-0.57735, -0.57735, 0.57735), vec3(-0.57735, 0.57735, -0.57735), vec3(-0.93417, 0.35682, 0.00000), vec3(0.57735, -0.57735, 0.57735), vec3(-0.35682, 0.00000, 0.93417), vec3(0.35682, 0.00000, 0.93417), vec3(0.00000, 0.93417, -0.35682), vec3(-0.57735, 0.57735, 0.57735), vec3(0.00000, 0.93417, 0.35682), vec3(0.57735, 0.57735, -0.57735), vec3(0.93417, -0.35682, 0.00000), vec3(0.93417, 0.35682, 0.00000), vec3(0.57735, 0.57735, 0.57735));
const vec3 PV[12] = vec3[12](vec3(0.00000, -0.52573, -0.85065), vec3(-0.52573, -0.85065, 0.00000), vec3(-0.85065, 0.00000, -0.52573), vec3(0.00000, -0.52573, 0.85065), vec3(-0.52573, 0.85065, 0.00000), vec3(0.85065, 0.00000, -0.52573), vec3(0.00000, 0.52573, -0.85065), vec3(0.52573, -0.85065, 0.00000), vec3(-0.85065, 0.00000, 0.52573), vec3(0.00000, 0.52573, 0.85065), vec3(0.52573, 0.85065, 0.00000), vec3(0.85065, 0.00000, 0.52573));

// Faceted ellipsoid: the intersection of tangent planes of the ellipsoid with
// semi-axes r. k lifts the 12 vertex caps: 0 truncates them flat (pentagons
// between the triangles), 0.26 leaves the pure icosahedron.
float facetBall(vec3 p, vec3 r, float k) {
  vec3 u = p / r;
  float d = -1e5;
  // ZERO keeps the compiler from unrolling these at every call site
  for (int i = ZERO; i < 20; i++) d = max(d, dot(u, PF[i]));
  for (int i = ZERO; i < 12; i++) d = max(d, dot(u, PV[i]) - k);
  return (d - 1.0) * min(r.x, min(r.y, r.z));
}

vec3 blobSpace(vec4 A, vec4 B, vec3 q) {
  vec3 p = q - A.xyz;
  p.xz = rot2(A.w) * p.xz;
  p.yz = rot2(B.w) * p.yz;
  return p;
}

// the body: blobs welded with a small fillet. off grows every blob (bandana shells)
float bodyShell(Char c, vec3 q, float off) {
  float d = 1e5;
  for (int k = ZERO; k < 5; k++) {
    vec4 A = c.b[2 * k], B = c.b[2 * k + 1];
    if (B.x < 0.002) continue;
    d = smin(d, facetBall(blobSpace(A, B, q), B.xyz + off, c.acc.w), 0.012);
  }
  return d;
}

vec3 warp(Char c, vec3 q) {
  q.x += c.wob.x * sin(q.y * 7.0 + c.wob.y);
  return q;
}

vec3 faceC(Char c) { return vec3(c.aEL.w, c.nEL.w, c.aER.w); }

// mouse-head mark for the brand flag
float mouseMark(vec2 g) {
  float head = sd2UnevenCapsule(vec2(g.x, -(g.y - 0.006)), 0.025, 0.007, 0.036);
  return min(head, length(vec2(abs(g.x) - 0.029, g.y - 0.022)) - 0.019);
}

// ------------------------------------------------------------- hard parts
// ids: 1 body, 2 ear, 3 ear panel, 4 bead eye, 5 diamond eye, 6 thread, 7 nose,
//      8 mouth, 9 teeth, 10 whisker, 11 bandana, 12 pole, 13 cloth, 14 tail,
//      15 foot, 16 bit
float hardParts(Char c, vec3 q, out int id) {
  q = warp(c, q);
  id = 1;
  vec3 dp = q - c.poke.xyz;
  float d = bodyShell(c, q, 0.0) + c.poke.w * exp(-dot(dp, dp) * 45.0);
  float s = c.eye.z;
  float blink = c.eye2.x;

  // ---- eyes
  for (int k = 0; k < 2; k++) {
    vec4 A = k == 0 ? c.aEL : c.aER;
    vec3 n = (k == 0 ? c.nEL : c.nER).xyz;
    int kind = int((k == 0 ? c.eye.x : c.eye.y) + 0.5);
    vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), n));
    vec3 Bv = cross(n, T);
    // the gaze slides the eye a little across the face
    vec3 a = A.xyz + T * c.eye2.z * 0.022 * s + Bv * c.eye2.w * 0.016 * s;
    vec3 p = q - a;
    vec3 lp = vec3(dot(p, T), dot(p, Bv), dot(p, n));
    float r = 0.05 * s * (kind == 4 ? 1.25 : 1.0);
    float de;
    int eid;
    if (kind == 3 || blink > 0.9) {
      float w = 0.042 * s;
      de = sdCapsule(lp, vec3(-w, 0.0, 0.004), vec3(w, 0.0, 0.004), 0.008 * s);
      eid = 6;
    } else if (kind == 2) {
      float w = 0.04 * s;
      de = sdCappedTorus(vec3(lp.x, lp.y + w * 0.45, lp.z - 0.004), vec2(sin(1.1), cos(1.1)), w, 0.009 * s);
      eid = 6;
    } else {
      float sy = 1.0 - 0.8 * blink - 0.45 * c.eye2.y;   // blinks and squints squash the gem
      vec3 g = vec3(lp.x, lp.y / max(sy, 0.12), lp.z);
      if (kind == 1) {   // flat diamond plate
        de = sdOctahedron(vec3(g.x, g.y, (g.z - 0.004) * 3.2), r * 1.35) * 0.3;
        eid = 5;
      } else {           // faceted bead, a vertex towards the viewer
        de = sdOctahedron(g - vec3(0.0, 0.0, r * 0.3), r) * min(sy, 1.0);
        eid = 4;
      }
    }
    if (de < d) { d = de; id = eid; }
  }

  // ---- nose, whiskers, mouth (all laid out in the nose anchor's frame)
  {
    vec3 n = c.nN.xyz;
    vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), n));
    vec3 Bv = cross(n, T);
    vec3 p = q - c.aN.xyz;
    vec3 lp = vec3(dot(p, T), dot(p, Bv), dot(p, n));
    if (c.aN.w > 0.5) {
      float nose = sdOctahedron(lp - vec3(0.0, 0.0, 0.012), 0.04 * s);
      if (nose < d) { d = nose; id = 7; }
    }
    if (c.nN.w > 0.5) {
      for (int k = 0; k < 2; k++) {
        float side = k == 0 ? -1.0 : 1.0;
        for (int w = 0; w < 3; w++) {
          float fw = float(w) - 1.0;
          vec3 st = vec3(side * 0.035, 0.004 + fw * 0.013, 0.008);
          vec3 en = vec3(side * 0.2, -0.004 + fw * 0.036, 0.0);
          float wh = sdCapsule(lp, st, en, 0.0034);
          if (wh < d) { d = wh; id = 10; }
        }
      }
    }
    int ms = int(c.face.x + 0.5);
    float open = c.face.y;
    vec3 mp = lp - vec3(0.0, -0.058 * s, -0.002);
    if (open > 0.05) {
      // open mouth: a dark faceted cavity, taller the louder
      float cav = sdOctahedron(vec3(mp.x, mp.y / (0.6 + open), mp.z * 2.0), 0.03 * s * (0.6 + 0.6 * open)) * 0.5;
      if (cav < d) { d = cav; id = 8; }
    } else if (ms == 0 || ms == 2) {
      float r2 = 0.03 * s * (1.0 + 0.3 * abs(c.face.z));
      float sg = sign(c.face.z + 1e-3);
      vec3 u = mp - vec3(0.0, r2 * 0.7 * sg, 0.0);
      float sm = sdCappedTorus(vec3(u.x, -u.y * sg, u.z), vec2(sin(0.75), cos(0.75)), r2, 0.0055 * s);
      if (sm < d) { d = sm; id = 6; }
    }
    if (ms == 2) {   // buck teeth under the smile
      vec3 tp = mp - vec3(0.0, -0.016 * s, 0.004);
      tp.x = abs(tp.x) - 0.011 * s;
      float teeth = sdRoundBox(tp, vec3(0.0095, 0.015, 0.005) * s, 0.002);
      if (teeth < d) { d = teeth; id = 9; }
    }
  }

  // ---- ears: faceted discs with an inset panel
  if (c.earL.w > 0.01) {
    for (int k = 0; k < 2; k++) {
      float side = k == 0 ? -1.0 : 1.0;
      vec3 cen = k == 0 ? c.earL.xyz : c.earR.xyz;
      float es = c.earL.w;
      vec3 p = q - cen;
      p.xy = rot2(side * c.earR.w * (k == 0 ? 1.0 : 0.7)) * p.xy;
      p.xz = rot2(side * 0.4) * p.xz;
      float outer = facetBall(p, vec3(es, es, es * 0.26), 0.08);
      float panel = facetBall(p - vec3(0.0, 0.0, es * 0.1), vec3(es * 0.68, es * 0.68, es * 0.26), 0.08);
      if (outer < d) { d = outer; id = 2; }
      if (panel < d + 0.001) { d = min(d, panel); id = 3; }
    }
  }

  // ---- bandana: a faceted shell of the body cut to a band, with a knot and tails
  int bs = int(c.band.x + 0.5);
  if (bs > 0) {
    float shell = bodyShell(c, q, 0.014);
    float band;
    vec3 kp;
    vec4 A0 = c.b[0], B0 = c.b[1];
    if (bs == 1) {
      band = max(shell, abs(q.y - c.bandA.x) - 0.03);
      kp = A0.xyz + vec3(B0.x * 0.5, c.bandA.x - A0.y, -B0.z * 0.86);
    } else if (bs == 2) {
      band = max(shell, c.bandA.x - 0.02 - q.y);
      kp = A0.xyz + vec3(B0.x * 0.5, c.bandA.x - A0.y, -B0.z * 0.86);
    } else {
      band = max(shell, abs(q.y - c.bandA.y) - 0.036);
      kp = vec3(0.04, c.bandA.y - 0.01, c.bandA.w);
    }
    float knot = facetBall(q - kp, vec3(0.045, 0.036, 0.036), 0.1);
    float rib = 1e5;
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float sw = c.bandA.z * (1.0 + 0.5 * fk) + 0.3 * fk;
      vec3 dir = normalize(vec3(0.5 - 0.3 * fk, -0.8, (bs == 3 ? 0.3 : -0.4) + 0.15 * sw));
      float L = 0.14 + 0.03 * fk;
      vec3 rp = q - kp - dir * L * 0.5;
      // frame along the ribbon
      vec3 wd = normalize(cross(dir, vec3(0.0, 0.0, 1.0)));
      vec3 tn = cross(dir, wd);
      vec3 lp = vec3(dot(rp, wd), dot(rp, dir), dot(rp, tn));
      lp.xz = rot2(sw * 0.5) * lp.xz;
      rib = min(rib, facetBall(lp, vec3(0.026, L * 0.5, 0.007), 0.2));
    }
    band = min(band, min(knot, rib));
    if (band < d) { d = band; id = 11; }

    // ---- flag planted at the knot
    if (c.props.z > 0.5) {
      vec3 dir = normalize(vec3(0.12, 1.0, -0.08));
      vec3 top = kp + dir * 0.52;
      float pole = sdCapsule(q, kp - dir * 0.04, top, 0.008);
      pole = min(pole, sdOctahedron(q - top - dir * 0.012, 0.018));
      if (pole < d) { d = pole; id = 12; }
      vec3 pr = q - top;
      float u = pr.x, v = -pr.y, w = pr.z;
      float uu = sat(u / 0.3);
      // paper flag: zig-zag folds that travel along the cloth
      w += 0.022 * (abs(fract(uu * 2.5 - c.misc.z * 0.25) - 0.5) * 2.0 - 0.5) * smoothstep(0.0, 0.3, uu);
      float cloth = sdRoundBox(vec3(u - 0.15, v - 0.095, w), vec3(0.15, 0.095, 0.003), 0.002);
      if (cloth < d) { d = cloth; id = 13; }
    }
  }

  // ---- tail beads and feet
  float tail = min(facetBall(q - c.t0.xyz, vec3(c.t0.w), 0.26), min(facetBall(q - c.t1.xyz, vec3(c.t1.w), 0.26), facetBall(q - c.t2.xyz, vec3(c.t2.w), 0.26)));
  if (tail < d) { d = tail; id = 14; }
  for (int k = 0; k < 2; k++) {
    float side = k == 0 ? -1.0 : 1.0;
    vec3 f = vec3(0.14 * side, 0.045 + (k == 0 ? c.misc.x : c.misc.y), c.misc.w);
    float foot = facetBall(q - f, vec3(0.07, 0.042, 0.085), 0.1);
    if (foot < d) { d = foot; id = 15; }
  }

  // ---- thinking / working bits: little gems orbiting the head
  if (c.props.x > 0.02) {
    vec3 fc = faceC(c);
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float an = c.props.y + fk * 2.094;
      vec3 bc = fc + vec3(cos(an) * 0.16, c.nER.w + 0.16 + 0.03 * sin(an * 2.0 + fk), sin(an) * 0.16);
      float bit = sdOctahedron(q - bc, (0.03 + 0.008 * fk) * c.props.x);
      if (bit < d) { d = bit; id = 16; }
    }
  }
  return d;
}

float mapHard(Char c, vec3 q) {
  int id;
  return hardParts(c, q, id);
}

// ------------------------------------------------------------- materials
Surf surfAt(Char c, vec3 q, vec3 n) {
  int id;
  hardParts(c, q, id);
  q = warp(c, q);
  Surf s = surfDefault(c.col.rgb, n);
  int mat = int(c.col.w + 0.5);
  // every facet gets its own slight tint, like cut paper
  float tint = hash13(floor(n * 6.0 + 0.5) + vec3(float(id) * 3.1));
  if (id == 1) {
    s.alb = c.col.rgb;
    // blush on the cheeks below the eyes
    if (c.face.w > 0.0) {
      vec3 cl = c.aEL.xyz + vec3(-0.045, -0.06, 0.0), cr = c.aER.xyz + vec3(0.045, -0.06, 0.0);
      float b = max(exp(-dot(q - cl, q - cl) * 420.0), exp(-dot(q - cr, q - cr) * 420.0));
      s.alb = mix(s.alb, vec3(1.0, 0.45, 0.55), b * c.face.w * 0.7);
    }
  } else if (id == 14 || id == 15 || id == 3) {
    s.alb = c.acc.rgb;
  } else if (id == 2) {
    s.alb = c.col.rgb;
  } else if (id == 4 || id == 5) {              // gem eyes
    s.alb = vec3(0.01); s.rough = 0.08; s.f0 = 0.07; s.clear = 1.0;
    return s;
  } else if (id == 6 || id == 10) {
    s.alb = vec3(0.03, 0.025, 0.025); s.rough = 0.6;
    return s;
  } else if (id == 7) {
    s.alb = mix(c.acc.rgb, vec3(0.3, 0.05, 0.1), 0.35); s.rough = 0.25; s.clear = 0.7;
  } else if (id == 8) {
    s.alb = vec3(0.2, 0.03, 0.05); s.rough = 0.7;
    return s;
  } else if (id == 9) {
    s.alb = vec3(0.97, 0.96, 0.92); s.rough = 0.3; s.clear = 0.5;
    return s;
  } else if (id == 11) {
    s.alb = c.band.yzw;
  } else if (id == 12) {
    s.alb = vec3(0.86, 0.87, 0.9); s.metal = 1.0; s.rough = 0.3;
    return s;
  } else if (id == 13) {
    // flag: pride bands or the brand field with a mouse-head mark
    vec4 A0 = c.b[0], B0 = c.b[1];
    int bs = int(c.band.x + 0.5);
    vec3 kp = bs == 3 ? vec3(0.04, c.bandA.y - 0.01, c.bandA.w) : A0.xyz + vec3(B0.x * 0.5, c.bandA.x - A0.y, -B0.z * 0.86);
    vec3 top = kp + normalize(vec3(0.12, 1.0, -0.08)) * 0.52;
    float u = q.x - top.x, v = top.y - q.y;
    if (int(c.props.w + 0.5) == 0) {
      int bnd = clamp(int(v / 0.19 * 6.0), 0, 5);
      vec3 rb[6] = vec3[6](vec3(0.89, 0.02, 0.02), vec3(1.0, 0.35, 0.0), vec3(1.0, 0.85, 0.0), vec3(0.0, 0.5, 0.15), vec3(0.0, 0.2, 0.75), vec3(0.45, 0.05, 0.55));
      s.alb = rb[bnd];
    } else {
      vec2 g = vec2(u - 0.15, 0.095 - v);
      s.alb = vec3(0.02, 0.24, 0.43);
      if (abs(g.y + g.x * 0.3) < 0.02) s.alb = vec3(1.0, 0.07, 0.72);
      if (mouseMark(g * 0.95) < 0.0) s.alb = vec3(0.95);
    }
    s.rough = 0.8; s.flatK = 0.3;
    s.alb *= 0.94 + 0.12 * tint;
    return s;
  } else if (id == 16) {
    s.alb = vec3(1.0, 0.72, 0.2); s.rough = 0.2; s.clear = 0.8; s.metal = 0.6;
    return s;
  }
  if (mat == 0) {         // cut paper: matte, slightly flat, each face its own shade
    s.rough = 0.85; s.wrap = 0.2; s.flatK = 0.3;
    s.alb *= 0.9 + 0.18 * tint;
  } else if (mat == 1) {  // gem: glassy facets with a glow of transmission
    s.rough = 0.12; s.clear = 0.9; s.wrap = 0.55; s.f0 = 0.06;
    s.alb *= 0.93 + 0.12 * tint;
  } else {                // vinyl toy
    s.rough = 0.3; s.clear = 0.5; s.wrap = 0.3;
    s.alb *= 0.97 + 0.06 * tint;
  }
  return s;
}

vec4 anchorPass(ivec2 px) { return vec4(0.0); }
