// ---------------------------------------------------------------------------
// Shared raymarch driver. Expects the family file to define:
//   struct Char; Char loadChar(int i);
//   float mapHard(Char c, vec3 q);           hard (non-fur) parts, squash space
//   float mapBase(Char c, vec3 q);           skin under the fur (HAS_FUR only)
//   float furLen(Char c, vec3 q);            fur length field (HAS_FUR only)
//   Fur   furAt(Char c, vec3 q, vec3 n);     fur look at a point (HAS_FUR only)
//   vec3  furCoord(Char c, vec3 q);          coordinates the fur is attached to
//   Surf  surfAt(Char c, vec3 q, vec3 n);    material of a hard surface point
//   vec4  anchorPass(ivec2 px);              optional anchor solver (uMode 2)
// ---------------------------------------------------------------------------

// state of the character currently being rendered
vec4  gXf;
vec4  gQ;
vec3  gSqv;
float gSqMin;

void beginChar(int i) {
  gXf = uXf[i];
  gQ = uRot[i];
  gSqv = uSq[i].xyz;
  gSqMin = minc(gSqv);
}

// Squash-aware wrappers; p is in the (unsquashed) local frame.
float MH(Char c, vec3 p) { return mapHard(c, p / gSqv) * gSqMin; }
#if HAS_FUR
float MB(Char c, vec3 p) { return mapBase(c, p / gSqv) * gSqMin; }
float FL(Char c, vec3 p) { return furLen(c, p / gSqv) * gSqMin; }
float MO(Char c, vec3 p) {
  vec3 q = p / gSqv;
  return min(mapHard(c, q), mapBase(c, q) - furLen(c, q)) * gSqMin;
}
// shadow proxy: constant pile offset keeps the field Lipschitz (no banding)
float MS(Char c, vec3 p) {
  vec3 q = p / gSqv;
  return min(mapHard(c, q), mapBase(c, q) - furNominal(c)) * gSqMin;
}
#else
float MO(Char c, vec3 p) { return MH(c, p); }
float MS(Char c, vec3 p) { return MH(c, p); }
#endif

vec3 nrmHard(Char c, vec3 p, float e) {
  vec3 n = vec3(0.0);
  for (int i = ZERO; i < 4; i++) {
    vec3 k = 0.5773 * (2.0 * vec3(float(((i + 3) >> 1) & 1), float((i >> 1) & 1), float(i & 1)) - 1.0);
    n += k * MH(c, p + e * k);
  }
  return normalize(n);
}
#if HAS_FUR
vec3 nrmBase(Char c, vec3 p, float e) {
  vec3 n = vec3(0.0);
  for (int i = ZERO; i < 4; i++) {
    vec3 k = 0.5773 * (2.0 * vec3(float(((i + 3) >> 1) & 1), float((i >> 1) & 1), float(i & 1)) - 1.0);
    n += k * MB(c, p + e * k);
  }
  return normalize(n);
}
#endif

// Soft shadow that tolerates penetration (Quilez): smooth inner penumbra,
// no banding against thin occluders such as hat brims.
float shadowL(Char c, vec3 p, vec3 n, vec3 rd, float k) {
  // start outside the shadow proxy (short-pile areas sit below its surface)
  vec3 ro = p + n * 0.006;
  float h0 = MS(c, ro);
  if (h0 < 0.0) ro += n * (0.004 - h0);
  float res = 1.0, t = 0.012;
  int steps = int(uQual.z);
  for (int i = ZERO; i < 64; i++) {
    if (i >= steps) break;
    float h = MS(c, ro + rd * t);
    res = min(res, k * h / t);
    if (res < -1.0 || t > 1.8) break;
    t += clamp(h, 0.008, 0.09);
  }
  res = max(res, -1.0);
  return 0.25 * (1.0 + res) * (1.0 + res) * (2.0 - res);
}

float aoL(Char c, vec3 p, vec3 n) {
  if (uQual.w < 0.5) return 1.0;
  float occ = 0.0, sca = 1.0;
  for (int i = ZERO; i < 5; i++) {
    float h = 0.012 + 0.055 * float(i);
    float d = MO(c, p + n * h);
    occ += (h - d) * sca;
    sca *= 0.78;
  }
  return sat(1.0 - 2.6 * occ);
}

// ------------------------------------------------------------- hard shading
vec4 shadeHardHit(Char c, vec3 pL, vec3 rdW, float tL) {
  gFoot = max(tL * uPixAng, 1e-4);
  vec3 nL = nrmHard(c, pL, max(0.0006, gFoot * 0.5));
  vec3 q = pL / gSqv;
  Surf s = surfAt(c, q, nL);
  vec3 nW = normalize(qrot(gQ, s.n));
  vec3 keyL = qinv(gQ, uKey.xyz);
  float sh = shadowL(c, pL, nL, keyL, 9.0);
  float ao = aoL(c, pL, nL);
  return vec4(shade(s, nW, -rdW, sh, ao), 1.0);
}

#if HAS_FUR
float strandCov(vec3 fc, vec3 w, float h, float lod, Fur f) {
  vec3 nz = noise4(fc * 1.7).xyz - 0.5;
  vec3 p = fc + nz * (f.clump * h * 0.6 / f.scale) * 4.0;
  p.y += f.droop * h * h;
  vec2 ux = p.yz * f.scale, uy = p.zx * f.scale, uz = p.xy * f.scale;
  vec4 s = textureLod(uStrand, ux, lod) * w.x
         + textureLod(uStrand, uy + 0.37, lod) * w.y
         + textureLod(uStrand, uz + 0.71, lod) * w.z;
  return h < 0.5 ? mix(s.r, s.g, h * 2.0) : mix(s.g, s.b, h * 2.0 - 1.0);
}

vec3 furShadeSample(Fur f, float h, vec3 nW, vec3 V, float sh, float ao, float tint) {
  vec3 alb = mix(f.root, f.tip, h * h * (3.0 - 2.0 * h)) * tint;
  float occ = mix(f.occ, 1.0, pow(h, 0.75));
  float ndl = dot(nW, uKey.xyz);
  float diff = sat((ndl + 0.55) / 1.55);
  float kk = sqrt(max(1.0 - ndl * ndl, 0.0));
  diff = mix(diff, kk * 0.85, 0.2);
  float fillD = sat((dot(nW, uFill.xyz) + 0.3) / 1.3) * uFill.w;
  vec3 col = alb * (uWarm.rgb * uKey.w * diff * sh * occ + (hemi(nW) * ao + vec3(0.88, 0.92, 1.0) * fillD) * occ);
  float ndv = abs(dot(nW, V));
  float rim = pow(1.0 - ndv, 2.2) * h;
  float back = sat(dot(-V, uRim.xyz) * 0.5 + 0.55);
  col += mix(f.tip, vec3(1.0), 0.25) * (uRim.w * back + 0.18) * rim * f.sheen * ao;
  return col;
}

// Integrates the fur shell along the ray starting at the outer envelope.
// stop: 0 left the shell (keep marching), 1 opaque (skin or saturated),
//       2 reached a hard part at tOut (caller shades it - keeps the shader small)
vec4 furLayer(Char c, vec3 ro, vec3 rd, float tIn, float tMax, vec3 rdW, out float tOut, out int stop) {
  vec3 pe = ro + rd * tIn;
  vec3 n0 = nrmBase(c, pe, 0.003);
  vec3 qe = pe / gSqv;
  Fur f = furAt(c, qe, n0);
  float L = max(FL(c, pe), 1e-3);
  vec3 n0W = normalize(qrot(gQ, n0));
  vec3 keyL = qinv(gQ, uKey.xyz);
  float sh = shadowL(c, pe, n0, keyL, 6.0);
  float ao = aoL(c, pe - n0 * L * 0.5, n0);
  vec3 V = -rdW;
  vec3 fe = furCoord(c, qe);
  float tint = 0.92 + 0.16 * noise(fe * 3.1);
  tOut = tIn;
  stop = 1;
  int n = int(uQual.y);
  if (n < 1) {
    // low quality: the envelope shaded as velvet
    return vec4(furShadeSample(f, 0.75, n0W, V, sh, ao, tint), 1.0);
  }
  vec3 fn = normalize(furCoord(c, qe + n0 * 0.01) - fe);
  vec3 w = pow(abs(fn), vec3(3.0));
  w /= (w.x + w.y + w.z);
  float foot = max(tIn * uPixAng, 1e-5);
  float lod = log2(max(foot * f.scale * 256.0, 1.0));

  float ds = L * 0.2;
  float t = tIn + ds * (0.25 + 0.5 * hash12(gl_FragCoord.xy));
  vec4 acc = vec4(0.0);
  stop = 0;
  for (int k = ZERO; k < 64; k++) {
    if (k >= n || t > tMax) break;
    vec3 p = ro + rd * t;
    float db = MB(c, p);
    if (db < 0.0) {
      // dense under-coat: treat as an opaque surface with mid-pile colour
      vec3 col = furShadeSample(f, 0.35, n0W, V, sh, ao, tint) * 0.9;
      acc.rgb += (1.0 - acc.a) * col;
      acc.a = 1.0;
      stop = 1;
      break;
    }
    if (MH(c, p) < 0.0012) {
      stop = 2;
      break;
    }
    float Lp = max(FL(c, p), 1e-4);
    float h = db / Lp;
    if (h > 1.02) {
      if (k > 2) break;
      t += ds;
      continue;
    }
    vec3 fc = furCoord(c, p / gSqv);
    float cov = strandCov(fc, w, sat(h), lod, f);
    float a = 1.0 - exp(-cov * f.dens * ds / Lp * 3.2);
    vec3 col = furShadeSample(f, sat(h), n0W, V, sh, ao, tint);
    acc.rgb += (1.0 - acc.a) * a * col;
    acc.a += (1.0 - acc.a) * a;
    if (acc.a > 0.985) { acc.a = 1.0; stop = 1; break; }
    t += ds * (1.0 + 0.6 * sat(1.0 - abs(dot(rd, n0)) - 0.4));
  }
  tOut = t;
  return acc;
}
#endif

// ------------------------------------------------------------- per character
vec4 renderCharacter(int i, vec3 ro, vec3 rd, float tEnter, float tExit, out vec3 hitQ) {
  Char c = loadChar(i);
  beginChar(i);
  vec3 rol = qinv(gQ, ro - gXf.xyz) / gXf.w;
  vec3 rdl = qinv(gQ, rd);
  float t = max(tEnter, 0.0) / gXf.w;
  float tmax = tExit / gXf.w;
  hitQ = vec3(0.0);

  vec4 acc = vec4(0.0);
  float bestRatio = 1e9, tBest = 0.0;
  bool anyHit = false;
  // the hard surface to shade (once) at the end, with its compositing weight
  float tHard = -1.0, wHard = 0.0;
  int steps = int(uQual.x);
  for (int pass = ZERO; pass < 3; pass++) {
    bool hit = false;
    for (int n = 0; n < 200; n++) {
      if (n >= steps) break;
      vec3 p = rol + rdl * t;
      float d = MO(c, p);
      float foot = t * uPixAng;
      float ratio = d / foot;
      if (pass == 0 && ratio < bestRatio) { bestRatio = ratio; tBest = t; }
      if (d < max(foot * 0.06, 2e-4)) { hit = true; break; }
      t += d * 0.85;
      if (t > tmax) break;
    }
    if (!hit) break;
    vec3 p = rol + rdl * t;
    if (!anyHit) hitQ = p / gSqv;
    anyHit = true;
#if HAS_FUR
    if (MH(c, p) > MB(c, p) - FL(c, p)) {
      float tOut;
      int stop;
      vec4 fc = furLayer(c, rol, rdl, t, tmax, rd, tOut, stop);
      acc.rgb += (1.0 - acc.a) * fc.rgb;
      acc.a += (1.0 - acc.a) * fc.a;
      if (stop == 2) { tHard = tOut; wHard = 1.0 - acc.a; break; }
      if (stop == 1 || acc.a > 0.985) break;
      t = tOut + 0.004;
      continue;
    }
#endif
    tHard = t;
    wHard = 1.0 - acc.a;
    break;
  }

  // analytic edge anti-aliasing for hard silhouettes that the ray just missed
  if (!anyHit && bestRatio < 0.5 && uMode == 0) {
    vec3 p = rol + rdl * tBest;
    bool hard = true;
#if HAS_FUR
    hard = MH(c, p) <= MB(c, p) - FL(c, p);
#endif
    if (hard) {
      tHard = tBest;
      wHard = sat(1.0 - 2.0 * bestRatio);
    }
  }
  if (tHard >= 0.0 && wHard > 0.0) {
    vec4 hc = shadeHardHit(c, rol + rdl * tHard, rd, tHard);
    acc.rgb += wHard * hc.rgb;
    acc.a += wHard;
  }
  return acc;
}

// ------------------------------------------------------------- ground
vec4 groundLayer(vec3 ro, vec3 rd) {
  if (uStage.y <= 0.0 || rd.y > -1e-4) return vec4(0.0);
  float t = (uStage.w - ro.y) / rd.y;
  if (t < 0.0) return vec4(0.0);
  vec3 g = ro + rd * t;
  float sh = 1.0, ao = 1.0, near = 1e9;
  for (int i = 0; i < MAXC; i++) {
    if (i >= uCount) break;
    for (int k = 0; k < 3; k++) {
      vec4 s = uOcc[i * 3 + k];
      if (s.w <= 0.0) continue;
      sh *= sphSoftShadow(g, uKey.xyz, s, 2.2);
      ao *= 1.0 - sat(sphOcclusion(g, vec3(0.0, 1.0, 0.0), s));
      near = min(near, length(g.xz - s.xz) / max(s.w, 1e-3));
    }
  }
  float dark = 1.0 - mix(1.0, sh, 0.45) * mix(1.0, ao, 0.9);
  // contact shadows only: fade out away from the cast so no edge reaches the frame
  dark *= 1.0 - smoothstep(2.2, 5.0, near);
  // and never let the floor touch the bottom edge of the viewport
  float py = (uMode == 1 ? uPickPx.y : gl_FragCoord.y - uView.y) / uView.w;
  dark *= smoothstep(0.0, 0.12, py);
  return vec4(0.0, 0.0, 0.0, sat(dark) * uStage.y);
}

// ------------------------------------------------------------- entry
void main() {
  if (uMode == 2) {
    outColor = anchorPass(ivec2(gl_FragCoord.xy));
    return;
  }
  vec2 px = (uMode == 1) ? uPickPx : (gl_FragCoord.xy - uView.xy);
  vec2 uv = (2.0 * px - uView.zw) / uView.w - uShift;
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamRot * vec3(uv, uFocal));

  float tn[MAXC];
  float tf[MAXC];
  int ids[MAXC];
  int nc = 0;
  for (int i = 0; i < MAXC; i++) {
    if (i >= uCount) break;
    vec4 b = uBnd[i];
    vec3 oc = ro - b.xyz;
    float B = dot(oc, rd);
    float C = dot(oc, oc) - b.w * b.w;
    float h = B * B - C;
    if (h <= 0.0) continue;
    h = sqrt(h);
    float t0 = -B - h, t1 = -B + h;
    if (t1 <= 0.0) continue;
    int j = nc;
    for (int s = 0; s < MAXC; s++) {
      if (j <= 0 || tn[j - 1] <= t0) break;
      tn[j] = tn[j - 1]; tf[j] = tf[j - 1]; ids[j] = ids[j - 1];
      j--;
    }
    tn[j] = t0; tf[j] = t1; ids[j] = i;
    nc++;
  }

  vec4 acc = vec4(0.0);
  vec4 pick = vec4(0.0);
  for (int k = 0; k < MAXC; k++) {
    if (k >= nc || acc.a > 0.985) break;
    vec3 hq;
    vec4 col = renderCharacter(ids[k], ro, rd, tn[k], tf[k], hq);
    if (uMode == 1 && col.a > 0.25 && pick.x == 0.0) pick = vec4(float(ids[k] + 1), hq);
    acc.rgb += (1.0 - acc.a) * col.rgb;
    acc.a += (1.0 - acc.a) * col.a;
  }
  if (uMode == 1) {
    outColor = pick;
    return;
  }
  vec4 g = groundLayer(ro, rd);
  acc.rgb += (1.0 - acc.a) * g.rgb;
  acc.a += (1.0 - acc.a) * g.a;

  vec3 col = acc.a > 1e-4 ? acc.rgb / acc.a : vec3(0.0);
  col = lin2srgb(pbrNeutral(col * uStage.z));
  float dither = (hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5) / 255.0;
  outColor = vec4((col + dither) * acc.a, acc.a);
}
