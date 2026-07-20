import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  BlendMode,
  Canvas,
  Picture,
  Skia,
  createPicture,
} from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { HALF, activeIndexFor, type OrbitPhase } from './useOrbitPhysics';

// Glow/particle trail for the orbital carousel, drawn additively on a Skia
// canvas overlaying the stage. A fixed pool lives in a shared value and is
// simulated in a UI-thread frame callback; a Skia Picture is re-recorded each
// frame the pool has anything alive. Spawn behavior per the design handoff:
// a small trickle while dragging/flinging, a continuous trickle during turbo,
// and a big burst on every settle — all at the front button's position.

const MAX_PARTICLES = 250;
const DRAG_SPAWN_MIN_DELTA = 0.002; // rad per frame

interface ParticlePool {
  x: number[];
  y: number[];
  vx: number[];
  vy: number[];
  life: number[];
  max: number[];
  r: number[];
}

function makePool(): ParticlePool {
  const zeros = () => new Array<number>(MAX_PARTICLES).fill(0);
  return { x: zeros(), y: zeros(), vx: zeros(), vy: zeros(), life: zeros(), max: zeros(), r: zeros() };
}

interface OrbitParticlesProps {
  theta: SharedValue<number>;
  phase: SharedValue<OrbitPhase>;
  settlePulse: SharedValue<number>;
  accentRgb: string; // "r,g,b"
  width: number;
  height: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export function OrbitParticles({
  theta,
  phase,
  settlePulse,
  accentRgb,
  width,
  height,
  cx,
  cy,
  rx,
  ry,
}: OrbitParticlesProps) {
  const pool = useSharedValue<ParticlePool>(makePool());
  const cursor = useSharedValue(0);
  const lastTheta = useSharedValue(theta.value);
  const lastSettle = useSharedValue(0);
  const anyAlive = useSharedValue(false);

  // Near-white with a whisper of the theme accent — restrained, not neon.
  const accent = useMemo(() => {
    const [r, g, b] = accentRgb.split(',').map((v) => Number(v.trim()) || 0);
    const lift = (c: number) => Math.round(c + (255 - c) * 0.72);
    return [lift(r), lift(g), lift(b)] as const;
  }, [accentRgb]);

  useFrameCallback((info) => {
    const dt = Math.min(0.05, (info.timeSincePreviousFrame ?? 16.7) / 1000);

    // Front button position from the live rotation.
    const front = activeIndexFor(theta.value);
    const a = theta.value + front * HALF;
    const fx = cx + rx * Math.cos(a);
    const fy = cy + ry * Math.sin(a);

    const dTheta = theta.value - lastTheta.value;
    lastTheta.value = theta.value;

    const ph = phase.value;
    const dragSpawn =
      (ph === 'drag' || ph === 'fling') && Math.abs(dTheta) > DRAG_SPAWN_MIN_DELTA ? 1 : 0;
    const turboSpawn = ph === 'turbo' ? 2 : 0;
    let settleSpawn = 0;
    if (settlePulse.value !== lastSettle.value) {
      lastSettle.value = settlePulse.value;
      settleSpawn = 8;
    }

    // Skip the whole update (and the picture re-record it triggers) while
    // nothing is alive and nothing wants to spawn.
    if (!anyAlive.value && dragSpawn + turboSpawn + settleSpawn === 0) return;

    let stillAlive = false;
    pool.modify((p) => {
      'worklet';
      const spawn = (count: number, speed: number) => {
        for (let n = 0; n < count; n++) {
          const i = cursor.value;
          cursor.value = (cursor.value + 1) % MAX_PARTICLES;
          const ang = Math.random() * Math.PI * 2;
          const s = speed * (0.3 + Math.random());
          p.x[i] = fx;
          p.y[i] = fy;
          p.vx[i] = Math.cos(ang) * s;
          p.vy[i] = Math.sin(ang) * s;
          p.max[i] = 0.9;
          p.life[i] = 0.5 + Math.random() * 0.4;
          p.r[i] = 1.2 + Math.random() * 1.8;
        }
      };

      if (dragSpawn > 0) spawn(dragSpawn, 40);
      if (turboSpawn > 0) spawn(turboSpawn, 70);
      if (settleSpawn > 0) spawn(settleSpawn, 85);

      const decay = Math.pow(0.96, dt * 60);
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (p.life[i] <= 0) continue;
        p.life[i] -= dt;
        if (p.life[i] <= 0) {
          p.life[i] = 0;
          continue;
        }
        p.x[i] += p.vx[i] * dt;
        p.y[i] += p.vy[i] * dt;
        p.vx[i] *= decay;
        p.vy[i] *= decay;
        stillAlive = true;
      }
      return p;
    });
    anyAlive.value = stillAlive;
  });

  const picture = useDerivedValue(() => {
    // `pool` is a dependency — each pool.modify() commit re-records the frame.
    const p = pool.value;
    const [r, g, b] = accent;
    return createPicture(
      (canvas) => {
        const paint = Skia.Paint();
        paint.setBlendMode(BlendMode.Plus);
        for (let i = 0; i < MAX_PARTICLES; i++) {
          if (p.life[i] <= 0) continue;
          const alpha = Math.max(0, p.life[i] / p.max[i]);
          paint.setColor(Skia.Color(`rgba(${r},${g},${b},${(alpha * 0.32).toFixed(3)})`));
          canvas.drawCircle(p.x[i], p.y[i], p.r[i] * (0.5 + alpha), paint);
        }
      },
      { x: 0, y: 0, width, height }
    );
  });

  return (
    <Canvas pointerEvents="none" style={[StyleSheet.absoluteFill, { width, height }]}>
      <Picture picture={picture} />
    </Canvas>
  );
}
