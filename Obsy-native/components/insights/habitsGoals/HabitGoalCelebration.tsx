import React from 'react';
import { StyleSheet } from 'react-native';
import { BlendMode, Canvas, Picture, Skia, createPicture } from '@shopify/react-native-skia';
import { runOnJS, useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

// One-shot green particle burst fired when a habit/goal is completed. Adapted
// from OrbitParticles: a small fixed pool, spawned once on mount at the orb's
// position, simulated on the UI thread, and torn down (onDone) once every
// particle has died — so there's no idle Canvas or frame callback afterward.

const MAX = 48;
const GREEN = [95, 214, 160] as const; // #5fd6a0, lifted toward white below

interface Pool {
    x: number[];
    y: number[];
    vx: number[];
    vy: number[];
    life: number[];
    max: number[];
    r: number[];
}

function makePool(): Pool {
    const z = () => new Array<number>(MAX).fill(0);
    return { x: z(), y: z(), vx: z(), vy: z(), life: z(), max: z(), r: z() };
}

interface HabitGoalCelebrationProps {
    x: number; // burst origin, box coordinates
    y: number;
    width: number;
    height: number;
    onDone: () => void;
}

// Near-white with a whisper of green — celebratory, not neon.
const lift = (c: number) => Math.round(c + (255 - c) * 0.55);
const RGB = [lift(GREEN[0]), lift(GREEN[1]), lift(GREEN[2])] as const;

export function HabitGoalCelebration({ x, y, width, height, onDone }: HabitGoalCelebrationProps) {
    const pool = useSharedValue<Pool>(makePool());
    const spawned = useSharedValue(false);

    useFrameCallback((info) => {
        const dt = Math.min(0.05, (info.timeSincePreviousFrame ?? 16.7) / 1000);
        let stillAlive = false;

        pool.modify((p) => {
            'worklet';
            if (!spawned.value) {
                spawned.value = true;
                for (let i = 0; i < MAX; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const s = 60 + Math.random() * 150;
                    p.x[i] = x;
                    p.y[i] = y;
                    p.vx[i] = Math.cos(ang) * s;
                    p.vy[i] = Math.sin(ang) * s - 30; // slight upward bias
                    p.max[i] = 0.75 + Math.random() * 0.35;
                    p.life[i] = p.max[i];
                    p.r[i] = 1.6 + Math.random() * 2.6;
                }
            }

            const decay = Math.pow(0.94, dt * 60);
            for (let i = 0; i < MAX; i++) {
                if (p.life[i] <= 0) continue;
                p.life[i] -= dt;
                if (p.life[i] <= 0) {
                    p.life[i] = 0;
                    continue;
                }
                p.vy[i] += 140 * dt; // gravity
                p.x[i] += p.vx[i] * dt;
                p.y[i] += p.vy[i] * dt;
                p.vx[i] *= decay;
                p.vy[i] *= decay;
                stillAlive = true;
            }
            return p;
        });

        if (spawned.value && !stillAlive) runOnJS(onDone)();
    });

    const picture = useDerivedValue(() => {
        const p = pool.value;
        const [r, g, b] = RGB;
        return createPicture(
            (canvas) => {
                const paint = Skia.Paint();
                paint.setBlendMode(BlendMode.Plus);
                for (let i = 0; i < MAX; i++) {
                    if (p.life[i] <= 0) continue;
                    const alpha = Math.max(0, p.life[i] / p.max[i]);
                    paint.setColor(Skia.Color(`rgba(${r},${g},${b},${(alpha * 0.5).toFixed(3)})`));
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
