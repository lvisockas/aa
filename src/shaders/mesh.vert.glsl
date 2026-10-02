#version 300 es
// Mesh families: character-local vertices -> world -> the same off-axis
// pinhole camera the ray marcher uses (ndc.x = (focal * x/z + shift.x) / aspect).
precision highp float;

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aCol;
layout(location = 2) in float aMat;
layout(location = 3) in vec2 aUv;

uniform vec3  uCamPos;
uniform mat3  uCamRot;     // columns: right, up, forward
uniform float uFocal;
uniform float uAspect;
uniform vec2  uShift;
uniform vec4  uMXf;        // world position, uniform scale
uniform vec4  uMRot;       // quaternion local -> world
uniform vec4  uMSq;        // squash & stretch
uniform vec4  uMWob;       // wobble amplitude, phase
uniform vec4  uMPoke;      // dent centre (local), amplitude

out vec3 vWorld;
out vec3 vLocal;
out vec3 vCol;
flat out float vMat;
out vec2 vUv;

vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }

void main() {
  vec3 p = aPos;
  if (aMat >= 0.0) {
    // deformations are pure functions of position, so shared corners move together (no cracks)
    p.x -= uMWob.x * sin(p.y * 7.0 + uMWob.y);
    vec3 dp = p - uMPoke.xyz;
    vec3 out_ = p - vec3(0.0, 0.5, 0.0);
    p -= out_ / max(length(out_), 1e-4) * uMPoke.w * exp(-dot(dp, dp) * 45.0);
    vLocal = p;
    p = uMXf.xyz + qrot(uMRot, p * uMSq.xyz) * uMXf.w;
  } else {
    vLocal = p;   // the ground quad arrives in world space
  }
  vWorld = p;
  vCol = aCol;
  vMat = aMat;
  vUv = aUv;
  vec3 v = p - uCamPos;
  vec3 c = vec3(dot(v, uCamRot[0]), dot(v, uCamRot[1]), dot(v, uCamRot[2]));
  const float n = 0.05, f = 60.0;
  gl_Position = vec4((uFocal * c.x + uShift.x * c.z) / uAspect, uFocal * c.y + uShift.y * c.z,
                     (c.z * (f + n) - 2.0 * f * n) / (f - n), c.z);
}
