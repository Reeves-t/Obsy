import { useEffect, useMemo, useRef } from 'react';
import {
    runOnJS,
    useFrameCallback,
    useSharedValue,
    withSequence,
    withSpring,
    type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

// ── UI-thread orb physics ─────────────────────────────────────
// Successor to the old JS-RAF hook: the same bounded simulation (wander,
// friction, wall bounce, pairwise repulsion) now runs entirely on the UI
// thread in one useFrameCallback, writing into per-orb shared values. React
// never re-renders while orbs float — FloatingOrb reads its slot's shared
// values in useAnimatedStyle.
//
// Hooks can't run in dynamic loops, so orbs occupy a fixed pool of MAX_ORBS
// slots (same trick as HomeActionCarousel's popScales). Slot assignment is a
// JS-side map; everything per-frame stays in worklets.

export const MAX_ORBS = 16;

const PADDING_X = 8;
const PADDING_Y = 6;

// Tuned per-second equivalents of the old per-frame constants (old · 60).
const WANDER_AX = 43; // px/s² random wander acceleration
const WANDER_AY = 36;
const FRICTION = 0.985; // per 1/60s, dt-corrected in the loop
const SPEED_CAP = 144; // px/s
const RESTITUTION = 0.5;
const REPULSION = 144; // px/s² per px of overlap
const ORB_GAP = 6;
const FLICK_SCALE = 0.72; // gesture px/s → sim px/s (matches the old flick feel)
const FLICK_CAP = 300; // px/s
const COOLDOWN_MS = 5000; // wander suppression after a grab/flick

const BOUNCE_SQUASH_MIN = 120; // px/s of impact before a wall squash triggers
const BOUNCE_HAPTIC_GAP_MS = 150;
const STRETCH_MAX = 0.12;
const STRETCH_PER_SPEED = 0.0006; // stretch per px/s of speed

export interface OrbSlot {
    x: SharedValue<number>; // orb center, box coordinates
    y: SharedValue<number>;
    grabScale: SharedValue<number>; // 1 idle · ~1.08 grabbed · pop pulses
    squashX: SharedValue<number>; // wall-bounce compression, springs back to 1
    squashY: SharedValue<number>;
    stretch: SharedValue<number>; // velocity stretch 0..STRETCH_MAX
    stretchAngle: SharedValue<number>; // radians, direction of travel
}

// Non-reactive sim data: one shared value holding plain arrays, mutated in
// place on the UI thread only (seeded via .modify so writes land there too).
interface SimState {
    vx: number[];
    vy: number[];
    size: number[];
    occupied: boolean[];
    cooldownUntil: number[];
    lastBounceHapticAt: number;
    dragVX: number; // smoothed drag velocity of the held orb (px/s)
    dragVY: number;
    dragLastX: number;
    dragLastY: number;
    dragLastT: number;
}

export interface HabitOrbPhysics {
    slots: OrbSlot[];
    dragSlot: SharedValue<number>; // -1 = none
    slotFor: (id: string) => number | undefined;
    sizeFor: (id: string) => number;
    positionOf: (id: string) => { x: number; y: number } | null;
    // Worklet helpers — call from gesture callbacks on the UI thread.
    beginGrab: (slot: number) => void;
    dragTo: (slot: number, x: number, y: number) => void;
    endGrab: (slot: number, velocityX: number, velocityY: number) => void;
    cancelGrab: (slot: number) => void;
    // JS helper — squishy pop on completion.
    triggerCompletionPop: (id: string) => void;
}

interface PhysicsOpts {
    width: number;
    height: number;
    active: boolean; // frame callback only runs while true
}

function rand(min: number, max: number) {
    return min + Math.random() * (max - min);
}

function makeSimState(): SimState {
    return {
        vx: new Array(MAX_ORBS).fill(0),
        vy: new Array(MAX_ORBS).fill(0),
        size: new Array(MAX_ORBS).fill(64),
        occupied: new Array(MAX_ORBS).fill(false),
        cooldownUntil: new Array(MAX_ORBS).fill(0),
        lastBounceHapticAt: 0,
        dragVX: 0,
        dragVY: 0,
        dragLastX: 0,
        dragLastY: 0,
        dragLastT: 0,
    };
}

function useOrbSlot(): OrbSlot {
    return {
        x: useSharedValue(0),
        y: useSharedValue(0),
        grabScale: useSharedValue(1),
        squashX: useSharedValue(1),
        squashY: useSharedValue(1),
        stretch: useSharedValue(0),
        stretchAngle: useSharedValue(0),
    };
}

function bounceHaptic() {
    Haptics.selectionAsync().catch(() => {});
}

export function useHabitOrbPhysicsV2(ids: string[], { width, height, active }: PhysicsOpts): HabitOrbPhysics {
    /* eslint-disable react-hooks/rules-of-hooks -- fixed-count loop, constant across renders */
    const slots: OrbSlot[] = [];
    for (let i = 0; i < MAX_ORBS; i++) slots.push(useOrbSlot());
    /* eslint-enable react-hooks/rules-of-hooks */

    const sim = useSharedValue<SimState>(makeSimState());
    const dragSlot = useSharedValue(-1);
    const clock = useSharedValue(0);
    // Box size mirrored into shared values so the frame callback and gesture
    // worklets never rely on stale closures.
    const boxW = useSharedValue(width);
    const boxH = useSharedValue(height);
    boxW.value = width;
    boxH.value = height;

    const slotForRef = useRef(new Map<string, number>());
    const sizeForRef = useRef(new Map<string, number>());

    // ── Slot assignment (JS side, synchronous so orbs render immediately) ──
    const idsKey = ids.join(',');
    useMemo(() => {
        if (width <= 0 || height <= 0) return;
        const slotFor = slotForRef.current;
        const sizeFor = sizeForRef.current;

        for (const [id, slot] of [...slotFor]) {
            if (!ids.includes(id)) {
                slotFor.delete(id);
                sizeFor.delete(id);
                sim.modify((s) => {
                    'worklet';
                    s.occupied[slot] = false;
                    return s;
                });
            }
        }

        for (const id of ids) {
            if (slotFor.has(id)) continue;
            const used = new Set(slotFor.values());
            let slot = -1;
            for (let i = 0; i < MAX_ORBS; i++) {
                if (!used.has(i)) {
                    slot = i;
                    break;
                }
            }
            if (slot === -1) break; // pool full — extra items live in the details list only

            const size = rand(58, 74);
            const r = size / 2;
            slotFor.set(id, slot);
            sizeFor.set(id, size);

            const s = slots[slot];
            s.x.value = rand(PADDING_X + r, Math.max(PADDING_X + r, width - PADDING_X - r));
            s.y.value = rand(PADDING_Y + r, Math.max(PADDING_Y + r, height - PADDING_Y - r));
            s.grabScale.value = 1;
            s.squashX.value = 1;
            s.squashY.value = 1;
            s.stretch.value = 0;
            s.stretchAngle.value = 0;

            const vx0 = rand(-9, 9);
            const vy0 = rand(-6, 6);
            sim.modify((st) => {
                'worklet';
                st.occupied[slot] = true;
                st.size[slot] = size;
                st.vx[slot] = vx0;
                st.vy[slot] = vy0;
                st.cooldownUntil[slot] = 0;
                return st;
            });
        }

        // Clamp survivors back inside after a box resize.
        for (const [id, slot] of slotFor) {
            const r = (sizeFor.get(id) ?? 64) / 2;
            const s = slots[slot];
            s.x.value = Math.min(Math.max(s.x.value, PADDING_X + r), Math.max(PADDING_X + r, width - PADDING_X - r));
            s.y.value = Math.min(Math.max(s.y.value, PADDING_Y + r), Math.max(PADDING_Y + r, height - PADDING_Y - r));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idsKey, width, height]);

    // ── Gesture worklet helpers (stable — close only over shared values) ──
    const helpers = useMemo(() => {
        const beginGrab = (slot: number) => {
            'worklet';
            const st = sim.value;
            if (!st.occupied[slot]) return;
            st.vx[slot] = 0;
            st.vy[slot] = 0;
            st.dragVX = 0;
            st.dragVY = 0;
            st.dragLastX = slots[slot].x.value;
            st.dragLastY = slots[slot].y.value;
            st.dragLastT = clock.value;
            dragSlot.value = slot;
        };

        const dragTo = (slot: number, x: number, y: number) => {
            'worklet';
            if (dragSlot.value !== slot) return;
            const st = sim.value;
            if (!st.occupied[slot]) return;
            const r = st.size[slot] / 2;
            const cx = Math.min(Math.max(x, PADDING_X + r), Math.max(PADDING_X + r, boxW.value - PADDING_X - r));
            const cy = Math.min(Math.max(y, PADDING_Y + r), Math.max(PADDING_Y + r, boxH.value - PADDING_Y - r));
            slots[slot].x.value = cx;
            slots[slot].y.value = cy;
            // Smoothed drag velocity — drives the held orb's stretch and how
            // hard it shoves neighbours in the frame loop.
            const now = clock.value;
            const dtMs = Math.max(8, now - st.dragLastT);
            const nvx = ((cx - st.dragLastX) / dtMs) * 1000;
            const nvy = ((cy - st.dragLastY) / dtMs) * 1000;
            st.dragVX = st.dragVX * 0.7 + nvx * 0.3;
            st.dragVY = st.dragVY * 0.7 + nvy * 0.3;
            st.dragLastX = cx;
            st.dragLastY = cy;
            st.dragLastT = now;
        };

        const endGrab = (slot: number, velocityX: number, velocityY: number) => {
            'worklet';
            if (dragSlot.value === slot) dragSlot.value = -1;
            const st = sim.value;
            if (!st.occupied[slot]) return;
            st.vx[slot] = Math.max(-FLICK_CAP, Math.min(FLICK_CAP, velocityX * FLICK_SCALE));
            st.vy[slot] = Math.max(-FLICK_CAP, Math.min(FLICK_CAP, velocityY * FLICK_SCALE));
            st.cooldownUntil[slot] = clock.value + COOLDOWN_MS;
        };

        const cancelGrab = (slot: number) => {
            'worklet';
            if (dragSlot.value !== slot) return;
            dragSlot.value = -1;
            const st = sim.value;
            st.vx[slot] = 0;
            st.vy[slot] = 0;
            st.cooldownUntil[slot] = clock.value + COOLDOWN_MS;
        };

        return { beginGrab, dragTo, endGrab, cancelGrab };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Simulation loop ───────────────────────────────────────
    const frame = useFrameCallback((info) => {
        const now = info.timestamp;
        clock.value = now;
        const dt = Math.min(0.05, (info.timeSincePreviousFrame ?? 16.7) / 1000);
        const st = sim.value;
        const w = boxW.value;
        const h = boxH.value;
        if (w <= 0 || h <= 0) return;

        const drag = dragSlot.value;
        const friction = Math.pow(FRICTION, dt * 60);

        for (let i = 0; i < MAX_ORBS; i++) {
            if (!st.occupied[i]) continue;
            const s = slots[i];

            if (i === drag) {
                // Held orb: position comes from the gesture; just stretch it
                // along its (smoothed) drag velocity.
                const sp = Math.hypot(st.dragVX, st.dragVY);
                s.stretch.value = Math.min(STRETCH_MAX, sp * STRETCH_PER_SPEED);
                if (sp > 20) s.stretchAngle.value = Math.atan2(st.dragVY, st.dragVX);
                continue;
            }

            if (now >= st.cooldownUntil[i]) {
                st.vx[i] += (Math.random() * 2 - 1) * WANDER_AX * dt;
                st.vy[i] += (Math.random() * 2 - 1) * WANDER_AY * dt;
            }

            st.vx[i] *= friction;
            st.vy[i] *= friction;

            const sp = Math.hypot(st.vx[i], st.vy[i]);
            if (sp > SPEED_CAP) {
                st.vx[i] = (st.vx[i] / sp) * SPEED_CAP;
                st.vy[i] = (st.vy[i] / sp) * SPEED_CAP;
            }

            let x = s.x.value + st.vx[i] * dt;
            let y = s.y.value + st.vy[i] * dt;
            const r = st.size[i] / 2;
            const minX = PADDING_X + r;
            const maxX = w - PADDING_X - r;
            const minY = PADDING_Y + r;
            const maxY = h - PADDING_Y - r;

            // Walls: clamp + bounce; hard hits get a directional squash (set
            // then spring — the fresh write cancels any in-flight spring) and
            // a throttled haptic tick.
            if (x < minX) {
                x = minX;
                if (st.vx[i] < -BOUNCE_SQUASH_MIN) {
                    s.squashX.value = 0.84;
                    s.squashX.value = withSpring(1, { damping: 9, stiffness: 320 });
                    if (now - st.lastBounceHapticAt > BOUNCE_HAPTIC_GAP_MS) {
                        st.lastBounceHapticAt = now;
                        runOnJS(bounceHaptic)();
                    }
                }
                st.vx[i] = Math.abs(st.vx[i]) * RESTITUTION;
            } else if (x > maxX) {
                x = maxX;
                if (st.vx[i] > BOUNCE_SQUASH_MIN) {
                    s.squashX.value = 0.84;
                    s.squashX.value = withSpring(1, { damping: 9, stiffness: 320 });
                    if (now - st.lastBounceHapticAt > BOUNCE_HAPTIC_GAP_MS) {
                        st.lastBounceHapticAt = now;
                        runOnJS(bounceHaptic)();
                    }
                }
                st.vx[i] = -Math.abs(st.vx[i]) * RESTITUTION;
            }
            if (y < minY) {
                y = minY;
                if (st.vy[i] < -BOUNCE_SQUASH_MIN) {
                    s.squashY.value = 0.84;
                    s.squashY.value = withSpring(1, { damping: 9, stiffness: 320 });
                    if (now - st.lastBounceHapticAt > BOUNCE_HAPTIC_GAP_MS) {
                        st.lastBounceHapticAt = now;
                        runOnJS(bounceHaptic)();
                    }
                }
                st.vy[i] = Math.abs(st.vy[i]) * RESTITUTION;
            } else if (y > maxY) {
                y = maxY;
                if (st.vy[i] > BOUNCE_SQUASH_MIN) {
                    s.squashY.value = 0.84;
                    s.squashY.value = withSpring(1, { damping: 9, stiffness: 320 });
                    if (now - st.lastBounceHapticAt > BOUNCE_HAPTIC_GAP_MS) {
                        st.lastBounceHapticAt = now;
                        runOnJS(bounceHaptic)();
                    }
                }
                st.vy[i] = -Math.abs(st.vy[i]) * RESTITUTION;
            }

            s.x.value = x;
            s.y.value = y;

            const sp2 = Math.hypot(st.vx[i], st.vy[i]);
            s.stretch.value = Math.min(STRETCH_MAX, sp2 * STRETCH_PER_SPEED);
            if (sp2 > 20) s.stretchAngle.value = Math.atan2(st.vy[i], st.vx[i]);
        }

        // Pairwise repulsion — dragged orb pushes but is never pushed.
        for (let i = 0; i < MAX_ORBS; i++) {
            if (!st.occupied[i]) continue;
            for (let j = i + 1; j < MAX_ORBS; j++) {
                if (!st.occupied[j]) continue;
                const a = slots[i];
                const b = slots[j];
                const dx = b.x.value - a.x.value;
                const dy = b.y.value - a.y.value;
                const dist = Math.hypot(dx, dy) || 0.001;
                const minDist = (st.size[i] + st.size[j]) / 2 + ORB_GAP;
                if (dist < minDist) {
                    const dv = (minDist - dist) * REPULSION * dt;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    if (i !== drag) {
                        st.vx[i] -= nx * dv;
                        st.vy[i] -= ny * dv;
                    }
                    if (j !== drag) {
                        st.vx[j] += nx * dv;
                        st.vy[j] += ny * dv;
                    }
                }
            }
        }
    }, false);

    const frameRef = useRef(frame);
    frameRef.current = frame;
    useEffect(() => {
        frameRef.current.setActive(active && width > 0 && height > 0);
        return () => frameRef.current.setActive(false);
    }, [active, width, height]);

    return {
        slots,
        dragSlot,
        slotFor: (id) => slotForRef.current.get(id),
        sizeFor: (id) => sizeForRef.current.get(id) ?? 64,
        positionOf: (id) => {
            const slot = slotForRef.current.get(id);
            if (slot == null) return null;
            return { x: slots[slot].x.value, y: slots[slot].y.value };
        },
        ...helpers,
        triggerCompletionPop: (id) => {
            const slot = slotForRef.current.get(id);
            if (slot == null) return;
            slots[slot].grabScale.value = withSequence(
                withSpring(1.22, { damping: 12, stiffness: 300 }),
                withSpring(1, { damping: 8, stiffness: 180 })
            );
        },
    };
}
