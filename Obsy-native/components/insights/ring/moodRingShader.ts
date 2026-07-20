import { Skia } from '@shopify/react-native-skia';

// Skia mood ring — a single SkSL fragment shader replacing the old 180-segment
// SVG dial. One pass computes the mood sweep gradient, ring band with AA edges,
// a slow continuous rotation, liquid shimmer (same fbm noise family as
// AuroraBackground) and a soft mood-tinted outer glow.

export const RING_RADIUS = 115;
export const RING_STROKE = 40;
export const RING_GLOW_PAD = 30;
export const RING_CANVAS_SIZE = 2 * (RING_RADIUS + RING_STROKE / 2 + RING_GLOW_PAD);
/** Outer diameter of the visible ring band (used for the reader morph origin). */
export const RING_VISUAL_SIZE = RING_RADIUS * 2 + RING_STROKE;

const SHADER_SRC = `
uniform float2 u_res;
uniform float  u_time;
uniform float  u_count;
uniform float3 u_colors[8];
uniform float  u_mids[8];
uniform float  u_light;
uniform float  u_flat;

const float PI = 3.14159265;
const float R = ${RING_RADIUS}.0;
const float HALF_STROKE = ${RING_STROKE / 2}.0;

float hash(float2 p) {
  return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453123);
}

float vnoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm2(float2 p) {
  return 0.65 * vnoise(p) + 0.35 * vnoise(p * 2.13 + float2(11.7, 5.3));
}

// Sweep gradient: interpolate between adjacent mood color stops (cumulative
// midpoints, with wraparound between the last and first stop) — a port of the
// old MoodRingDial JS micro-segment interpolation. The loop body is guarded
// rather than using break to stay within SkSL's strict ES2 loop rules; a
// single-stop ring falls through to the wraparound branch, which mixes the
// first color with itself.
float3 sweepColor(float pos) {
  float3 cPrev = u_colors[0];
  float mPrev = u_mids[0];
  float3 outCol = u_colors[0];
  float found = 0.0;
  for (int i = 1; i < 8; i++) {
    if (float(i) < u_count) {
      float m1 = u_mids[i];
      float3 c1 = u_colors[i];
      if (found < 0.5 && pos >= mPrev && pos < m1) {
        float t = (pos - mPrev) / max(m1 - mPrev, 0.0001);
        outCol = mix(cPrev, c1, t);
        found = 1.0;
      }
      cPrev = c1;
      mPrev = m1;
    }
  }
  if (found < 0.5) {
    // Wraparound region between the last stop and the first
    float m0 = u_mids[0];
    float range = (m0 + 1.0) - mPrev;
    float p2 = pos < m0 ? pos + 1.0 : pos;
    float t = clamp((p2 - mPrev) / max(range, 0.0001), 0.0, 1.0);
    outCol = mix(cPrev, u_colors[0], t);
  }
  return outCol;
}

half4 main(float2 xy) {
  float2 p = xy - u_res * 0.5;
  float d = length(p);

  // Angle measured clockwise from the top (matches the old SVG dial),
  // normalized to 0..1, plus the slow continuous rotation (~90s per rev).
  float ang = atan(p.x, -p.y);
  float pos = fract(ang / (2.0 * PI) + u_time * 0.011);

  float3 col = sweepColor(pos);

  // Ring band with anti-aliased edges
  float band = smoothstep(HALF_STROKE, HALF_STROKE - 1.5, abs(d - R));

  // Liquid shimmer — noise sampled on the unit direction vector so it wraps
  // seamlessly around the ring, drifting slowly with time and radius.
  float live = 1.0 - u_flat * 0.8;
  float2 dir = p / max(d, 1.0);
  float n = fbm2(dir * 2.4 + float2(u_time * 0.10, -u_time * 0.07) + (d - R) * 0.05);
  col *= 1.0 + (0.20 * n - 0.10) * live;
  // Slow specular sweep circling the ring
  col += 0.10 * live * pow(0.5 + 0.5 * cos((pos - u_time * 0.02) * 2.0 * PI * 3.0), 20.0);

  float ringAlpha = band * (u_light > 0.5 ? 0.95 : 0.9);

  // Soft outer/inner glow tinted by the local sweep color
  float g = exp(-pow(max(0.0, abs(d - R) - HALF_STROKE), 2.0) / (2.0 * 14.0 * 14.0));
  float glowStrength = (u_light > 0.5 ? 0.10 : 0.22) * (1.0 - u_flat * 0.7);
  float glowAlpha = g * (1.0 - band) * glowStrength;

  float a = ringAlpha + glowAlpha;
  col = clamp(col, 0.0, 1.0);
  return half4(half3(col * a), a);
}
`;

export const MOOD_RING_EFFECT = Skia.RuntimeEffect.Make(SHADER_SRC);
