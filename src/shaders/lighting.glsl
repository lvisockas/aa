// ---------------------------------------------------------------------------
// Shared lighting: studio softboxes, the surface BRDF and the analytic sphere
// occluders for ground shadows. Used by the ray marcher and the mesh renderer,
// so both kinds of family sit under exactly the same lights.
// ---------------------------------------------------------------------------
// ------------------------------------------------------------- lighting
vec3 hemi(vec3 n) { return mix(uGround, uSky, n.y * 0.5 + 0.5); }

float softbox(vec3 r, vec3 c, vec2 hs, float rough) {
  float cd = dot(r, c);
  if (cd <= 0.0) return 0.0;
  vec3 u = normalize(cross(abs(c.y) > 0.95 ? vec3(1, 0, 0) : vec3(0, 1, 0), c));
  vec3 v = cross(c, u);
  vec2 xy = vec2(dot(r, u), dot(r, v)) / cd;
  float blur = 0.015 + rough * rough * 1.6;
  vec2 d = abs(xy) - hs;
  float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  float area = (hs.x + blur) * (hs.y + blur) / (hs.x * hs.y);
  return (1.0 - smoothstep(-blur, blur, sd)) / area;
}

vec3 envRefl(vec3 r, float rough, float keyVis) {
  vec3 col = hemi(r) * 0.55;
  col += uWarm.rgb * softbox(r, uKey.xyz, vec2(0.55, 0.38), rough) * (2.6 * keyVis);
  col += vec3(0.9, 0.95, 1.0) * softbox(r, uRim.xyz, vec2(0.12, 0.7), rough) * (1.4 * uRim.w);
  col += vec3(0.9, 0.93, 1.0) * softbox(r, uFill.xyz, vec2(0.35, 0.25), rough) * (0.8 * uFill.w);
  return col;
}

vec3 shade(Surf s, vec3 n, vec3 v, float sh, float ao) {
  vec3 L = uKey.xyz;
  float ndl = dot(n, L);
  float ndv = max(dot(n, v), 1e-3);
  float diff = sat((ndl + s.wrap) / (1.0 + s.wrap));
  // soft terminator for wrapped (subsurface-ish) materials
  vec3 sss = s.alb * s.wrap * 0.25 * sat(1.0 - abs(ndl)) * sh;
  float fillD = sat((dot(n, uFill.xyz) + 0.25) / 1.25) * uFill.w;
  float rimD = pow(sat(dot(n, uRim.xyz) + 0.15), 2.0) * uRim.w;
  vec3 kd = s.alb * (1.0 - s.metal);
  vec3 col = kd * (uWarm.rgb * uKey.w * diff * sh + vec3(0.88, 0.92, 1.0) * fillD + hemi(n) * ao)
           + kd * rimD * 0.35 * ao + sss;

  // image based specular from the studio softboxes
  vec3 F0 = mix(vec3(s.f0), s.alb, s.metal);
  vec3 Fr = F0 + (max(vec3(1.0 - s.rough), F0) - F0) * pow(1.0 - ndv, 5.0);
  vec3 r = reflect(-v, n);
  float specOcc = sat(pow(ndv + ao, exp2(-16.0 * s.rough - 1.0)) - 1.0 + ao);
  col += Fr * envRefl(r, s.rough, sh) * specOcc * uWarm.w;

  // Charlie sheen (cloth / felt / velvet)
  if (s.sheen > 0.0) {
    vec3 H = normalize(L + v);
    float alpha = 0.35;
    float sinH = sqrt(max(1.0 - sq(dot(n, H)), 0.0));
    float Dc = (2.0 + 1.0 / alpha) * pow(sinH, 1.0 / alpha) / TAU;
    float Vn = 1.0 / (4.0 * (sat(ndl) + ndv - sat(ndl) * ndv) + 1e-3);
    vec3 sheenCol = mix(s.alb, vec3(1.0), 0.45);
    col += s.sheen * sheenCol * Dc * Vn * sat(ndl) * uKey.w * sh * 2.0;
    col += s.sheen * sheenCol * pow(1.0 - ndv, 4.0) * hemi(n) * ao * 0.6;
  }
  // clear coat (glossy vinyl)
  if (s.clear > 0.0) {
    float Fc = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    col = col * (1.0 - s.clear * Fc) + s.clear * Fc * envRefl(r, 0.06, sh) * specOcc * uWarm.w * 1.2;
  }
  // graphic "flat" look: almost unlit colour with a hint of form
  if (s.flatK > 0.0) {
    float form = 0.86 + 0.14 * sat(ndl * 0.5 + 0.5) - 0.06 * pow(1.0 - ndv, 3.0);
    vec3 flatCol = s.alb * form * (0.92 + 0.08 * ao);
    col = mix(col, flatCol, s.flatK);
  }
  return col + s.emis;
}

// ------------------------------------------------------------- ground
float sphSoftShadow(vec3 ro, vec3 rd, vec4 sph, float k) {
  vec3 oc = ro - sph.xyz;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - sph.w * sph.w;
  float h = b * b - c;
  float d = sqrt(max(0.0, sph.w * sph.w - h)) - sph.w;
  float t = -b - sqrt(max(h, 0.0));
  return (t < 0.0) ? 1.0 : smoothstep(0.0, 1.0, 2.5 * k * d / t);
}
float sphOcclusion(vec3 pos, vec3 nor, vec4 sph) {
  vec3 di = sph.xyz - pos;
  float l = length(di);
  float nl = dot(nor, di / l);
  float h = l / sph.w;
  float h2 = h * h;
  float k2 = 1.0 - h2 * nl * nl;
  float res = max(0.0, nl) / h2;
  if (k2 > 0.001) {
    res = (nl * h + 1.0) / h2;
    res = 0.33 * res * res;
  }
  return res;
}
