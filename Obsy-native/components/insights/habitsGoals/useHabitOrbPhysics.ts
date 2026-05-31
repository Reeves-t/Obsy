import { useRef, useEffect, useReducer, useCallback } from 'react';

// ── Physics state per orb ─────────────────────────────────────

export interface OrbPhysics {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
}

interface PhysicsOpts {
    width: number;
    height: number;
    active: boolean; // RAF only runs while true (mounted + visible)
}

const PADDING_X = 8;
const PADDING_Y = 6;

function rand(min: number, max: number) {
    return min + Math.random() * (max - min);
}

// ── Hook ──────────────────────────────────────────────────────
// A self-contained, bounded version of the Topics garden physics. Coordinates
// are local to the section box. The animation loop is fully torn down whenever
// `active` is false or the component unmounts — nothing runs globally.

export function useHabitOrbPhysics(ids: string[], { width, height, active }: PhysicsOpts) {
    const stateRef = useRef(new Map<string, OrbPhysics>());
    const cooldownRef = useRef(new Map<string, number>()); // orbId → release timestamp
    const draggingIdRef = useRef<string | null>(null);
    const rafRef = useRef<number>(0);
    const [, forceRender] = useReducer((n: number) => (n + 1) % 1_000_000, 0);

    const markReleased = useCallback((id: string) => {
        cooldownRef.current.set(id, Date.now());
    }, []);

    // Seed / sync orbs when the id list or box size changes.
    useEffect(() => {
        if (width <= 0 || height <= 0) return;
        const m = stateRef.current;
        for (const id of [...m.keys()]) {
            if (!ids.includes(id)) m.delete(id);
        }
        ids.forEach((id) => {
            if (!m.has(id)) {
                const size = rand(58, 74);
                m.set(id, {
                    x: rand(PADDING_X + size / 2, Math.max(PADDING_X + size / 2, width - PADDING_X - size / 2)),
                    y: rand(PADDING_Y + size / 2, Math.max(PADDING_Y + size / 2, height - PADDING_Y - size / 2)),
                    vx: rand(-0.15, 0.15),
                    vy: rand(-0.1, 0.1),
                    size,
                });
            }
        });
    }, [ids.join(','), width, height]);

    // Physics loop — only while active.
    useEffect(() => {
        if (!active || width <= 0 || height <= 0) return;

        const minX = PADDING_X;
        const maxX = width - PADDING_X;
        const minY = PADDING_Y;
        const maxY = height - PADDING_Y;

        const tick = () => {
            const m = stateRef.current;
            const ids2 = [...m.keys()];
            const now = Date.now();
            const draggingId = draggingIdRef.current;

            for (const id of ids2) {
                if (id === draggingId) continue;
                const p = m.get(id)!;

                const cooldownAt = cooldownRef.current.get(id);
                if (cooldownAt != null && now - cooldownAt >= 5000) cooldownRef.current.delete(id);
                if (cooldownAt == null || now - cooldownAt >= 5000) {
                    p.vx += rand(-0.012, 0.012);
                    p.vy += rand(-0.01, 0.01);
                }

                // Friction
                p.vx *= 0.985;
                p.vy *= 0.985;

                // Speed cap
                const sp = Math.hypot(p.vx, p.vy);
                const cap = 2.4;
                if (sp > cap) {
                    p.vx = (p.vx / sp) * cap;
                    p.vy = (p.vy / sp) * cap;
                }

                p.x += p.vx;
                p.y += p.vy;

                // Bounds — gentle bounce off all edges to keep orbs inside the box.
                const r = p.size / 2;
                if (p.x < minX + r) { p.x = minX + r; p.vx = Math.abs(p.vx) * 0.5; }
                if (p.x > maxX - r) { p.x = maxX - r; p.vx = -Math.abs(p.vx) * 0.5; }
                if (p.y < minY + r) { p.y = minY + r; p.vy = Math.abs(p.vy) * 0.5; }
                if (p.y > maxY - r) { p.y = maxY - r; p.vy = -Math.abs(p.vy) * 0.5; }
            }

            // Pairwise repulsion so orbs don't overlap.
            for (let i = 0; i < ids2.length; i++) {
                for (let j = i + 1; j < ids2.length; j++) {
                    const a = m.get(ids2[i]);
                    const b = m.get(ids2[j]);
                    if (!a || !b) continue;
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const dist = Math.hypot(dx, dy) || 0.001;
                    const minDist = (a.size + b.size) / 2 + 6;
                    if (dist < minDist) {
                        const force = (minDist - dist) * 0.04;
                        const nx = dx / dist;
                        const ny = dy / dist;
                        if (ids2[i] !== draggingId) { a.vx -= nx * force; a.vy -= ny * force; }
                        if (ids2[j] !== draggingId) { b.vx += nx * force; b.vy += ny * force; }
                    }
                }
            }

            forceRender();
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [active, width, height]);

    return { stateRef, draggingIdRef, markReleased };
}
