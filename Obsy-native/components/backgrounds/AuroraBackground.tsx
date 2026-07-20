import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Canvas, Fill, Shader, Skia, useClock } from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { auroraFlow } from '@/lib/auroraFlow';
import { useAuroraBreathStore } from '@/lib/auroraBreathStore';
import {
  AURORA_BACKGROUNDS,
  type AuroraBackgroundKey,
} from '@/constants/auroraBackgrounds';
import { ORB_WAVES, type OrbWaveKey } from '@/constants/auroraOrbs';

// Aurora background — a single Skia fragment shader (SkSL) instead of the old
// HTML/CSS-in-a-WebView build. Four soft orbs (two per color family) drift over
// the theme's dark base gradient, with organic noise, vignette and micro-grain
// computed in the shader.
//
// Live inputs, all GPU-uniform driven (no reloads, no bridge messages):
//   • theme palette + orb wave colors — swap instantly, motion uninterrupted
//   • `auroraFlow.theta/energy` — the home carousel's rotation, written every
//     frame by its physics loop, so the orbs swirl continuously with the dial
//     (slow drag = slow drift, hard fling/turbo = visible whip)
//   • breath — the insight-refresh mood bloom rising from the bottom
const SHADER_SRC = `
uniform float2 u_res;
uniform float  u_time;
uniform float  u_flow;
uniform float  u_energy;
uniform float3 u_bg0;
uniform float3 u_bg1;
uniform float3 u_bg2;
uniform float3 u_orbA;
uniform float3 u_orbB;
uniform float  u_breath;
uniform float3 u_breathCol;

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

float orbGlow(float2 uv, float2 base, float orbit, float ang, float radius, float aspect) {
  float2 pos = base + float2(cos(ang), sin(ang)) * orbit;
  float2 d = (uv - pos) * float2(aspect, 1.0);
  float q = dot(d, d) / (radius * radius);
  return exp(-q * 3.0);
}

half4 main(float2 xy) {
  float2 uv = xy / u_res;
  float aspect = u_res.x / u_res.y;

  // Base gradient — radial glow rising from below (same shape as the old stage).
  float rd = length((uv - float2(0.5, 1.1)) * float2(aspect, 1.0)) / 1.25;
  float3 col = mix(u_bg0, u_bg1, smoothstep(0.0, 0.5, rd));
  col = mix(col, u_bg2, smoothstep(0.5, 1.0, rd));

  float t = u_time;
  float fl = u_flow;
  float energy = clamp(u_energy, 0.0, 1.0);

  // Organic texture that also swirls with the dial.
  float tex = fbm2(uv * float2(2.6 * aspect, 2.6) + float2(t * 0.05 + fl * 0.12, -t * 0.03));
  float shape = 0.72 + 0.5 * tex;

  // Four drifting orbs; the carousel rotation swings each around its anchor.
  float g1 = orbGlow(uv, float2(0.24, 0.30), 0.11, t * 0.11 + fl * 0.55 + 1.7, 0.46, aspect);
  float g2 = orbGlow(uv, float2(0.80, 0.24), 0.13, -t * 0.09 - fl * 0.45 + 0.4, 0.42, aspect);
  float g3 = orbGlow(uv, float2(0.30, 0.76), 0.14, t * 0.07 + fl * 0.50 + 3.9, 0.50, aspect);
  float g4 = orbGlow(uv, float2(0.76, 0.80), 0.12, -t * 0.13 - fl * 0.60 + 2.6, 0.44, aspect);

  float boost = 0.75 + 0.65 * energy;
  float3 glow = u_orbA * (g1 * 0.34 + g3 * 0.26) + u_orbB * (g2 * 0.30 + g4 * 0.24);
  glow *= shape * boost;

  // Screen blend keeps the glow luminous without clipping to white.
  col = col + glow - col * glow;

  // Insight-refresh breath: mood-tinted light rising from the bottom.
  float breathBand = smoothstep(0.45, 1.05, uv.y);
  float3 bcol = u_breathCol * (u_breath * 0.30 * breathBand);
  col = col + bcol - col * bcol;

  // Vignette (wide ellipse, like the old stage).
  float vd = length((uv - 0.5) / float2(1.2, 0.8));
  col *= 1.0 - 0.5 * smoothstep(0.55, 1.05, vd);

  // Static micro-grain so the gradients don't band.
  col += (hash(xy) - 0.5) * 0.018;

  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;

const AURORA_EFFECT = Skia.RuntimeEffect.Make(SHADER_SRC);

type Vec3 = [number, number, number];

const hexToVec3 = (hex: string): Vec3 => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const tripletToVec3 = (rgb: string): Vec3 => {
  const p = rgb.split(',').map((s) => parseInt(s.trim(), 10) || 0);
  return [(p[0] ?? 0) / 255, (p[1] ?? 0) / 255, (p[2] ?? 0) / 255];
};

const DEFAULT_BREATH_COLOR = '#96aaff';

interface AuroraBackgroundProps {
  background?: AuroraBackgroundKey;
  orbWave?: OrbWaveKey;
}

export const AuroraBackground: React.FC<AuroraBackgroundProps> = ({
  background = 'default',
  orbWave = 'aurora',
}) => {
  const { width, height } = useWindowDimensions();
  const clock = useClock();

  const palette = useMemo(() => {
    const bg = AURORA_BACKGROUNDS[background] ?? AURORA_BACKGROUNDS.default;
    const wave = ORB_WAVES[orbWave] ?? ORB_WAVES.aurora;
    return {
      bg0: hexToVec3(bg.radial[0]),
      bg1: hexToVec3(bg.radial[1]),
      bg2: hexToVec3(bg.radial[2]),
      orbA: tripletToVec3(wave.a),
      orbB: tripletToVec3(wave.b),
      fallback: bg.fallback,
    };
  }, [background, orbWave]);

  // Insight-refresh breath (refcounted store; eased here, read as a uniform).
  const breathOn = useAuroraBreathStore((s) => s.activeCount > 0);
  const breathColor = useAuroraBreathStore((s) => s.color);
  const breath = useSharedValue(0);

  useEffect(() => {
    breath.value = withTiming(breathOn ? 1 : 0, {
      duration: breathOn ? 900 : 1400,
      easing: Easing.inOut(Easing.ease),
    });
  }, [breathOn, breath]);

  const breathVec = useMemo(
    () => hexToVec3(breathColor || DEFAULT_BREATH_COLOR),
    [breathColor]
  );

  const uniforms = useDerivedValue(() => ({
    u_res: [width, height],
    u_time: clock.value / 1000,
    u_flow: auroraFlow.theta.value,
    u_energy: Math.min(1, auroraFlow.energy.value / 8),
    u_bg0: palette.bg0,
    u_bg1: palette.bg1,
    u_bg2: palette.bg2,
    u_orbA: palette.orbA,
    u_orbB: palette.orbB,
    u_breath: breath.value,
    u_breathCol: breathVec,
  }));

  if (!AURORA_EFFECT) {
    // Shader compilation should never fail in practice; keep the screen usable.
    return (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: palette.fallback }]}
      />
    );
  }

  return (
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Fill>
        <Shader source={AURORA_EFFECT} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
};
