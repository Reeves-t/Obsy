import { useRef, useEffect, useCallback } from 'react';
import { Dimensions } from 'react-native';
import { DEFAULT_TAB_BAR_HEIGHT } from '@/components/ScreenWrapper';

// ── Layout constants ──────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;

export const GARDEN_LAYOUT = {
    bottom: DEFAULT_TAB_BAR_HEIGHT + 26,   // above tab bar
    height: 230,
    paddingX: 18,
};

export const FOCUS_RING = {
    size: 168,
    topOffset: 96,
};

// ── Physics state per orb ─────────────────────────────────────

export interface OrbPhysics {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
}

function rand(min: number, max: number) {
    return min + Math.random() * (max - min);
}

// ── Hook ──────────────────────────────────────────────────────

export function useGardenPhysics(
    topicIds: string[],
    focusedId: string | null,
) {
    const stateRef = useRef(new Map<string, OrbPhysics>());
    const cooldownRef = useRef(new Map<string, number>()); // orbId → release timestamp
    const draggingIdRef = useRef<string | null>(null); // updated synchronously in touch handlers
    const rafRef = useRef<number>(0);
    const renderTick = useRef(0);
    const forceRenderRef = useRef<() => void>(() => {});

    // Expose a way to trigger re-render from the host
    const setForceRender = useCallback((fn: () => void) => {
        forceRenderRef.current = fn;
    }, []);

    // Mark an orb as just released — drift pauses for 5s
    const markReleased = useCallback((id: string) => {
        cooldownRef.current.set(id, Date.now());
    }, []);

    // Init / sync entries when goal list changes
    useEffect(() => {
        const m = stateRef.current;
        // Remove deleted goals
        for (const id of [...m.keys()]) {
            if (!topicIds.includes(id)) m.delete(id);
        }
        // Add new goals with random positions
        topicIds.forEach((id) => {
            if (!m.has(id)) {
                const size = rand(72, 92);
                m.set(id, {
                    x: rand(GARDEN_LAYOUT.paddingX + size / 2, SCREEN_W - GARDEN_LAYOUT.paddingX - size / 2),
                    y: rand(20, GARDEN_LAYOUT.height - size / 2 - 10),
                    vx: rand(-0.15, 0.15),
                    vy: rand(-0.1, 0.1),
                    size,
                });
            }
        });
    }, [topicIds.join(',')]);

    // Physics loop — reads draggingIdRef each frame so drag exclusion is immediate
    useEffect(() => {
        const tick = () => {
            const m = stateRef.current;
            const ids = [...m.keys()];
            const now = Date.now();
            const draggingId = draggingIdRef.current; // read ref, never stale
            const minX = GARDEN_LAYOUT.paddingX;
            const maxX = SCREEN_W - GARDEN_LAYOUT.paddingX;
            const minY = 6;
            const maxY = GARDEN_LAYOUT.height - 6;

            for (const id of ids) {
                if (id === focusedId) continue;
                if (id === draggingId) continue;
                const p = m.get(id)!;

                // Gentle drift impulse (skip if orb is in post-release cooldown)
                const cooldownAt = cooldownRef.current.get(id);
                if (cooldownAt != null && (now - cooldownAt) >= 5000) {
                    cooldownRef.current.delete(id);
                }
                if (cooldownAt == null || (now - cooldownAt) >= 5000) {
                    p.vx += rand(-0.012, 0.012);
                    p.vy += rand(-0.010, 0.010);
                }

                // Friction
                p.vx *= 0.985;
                p.vy *= 0.985;

                // Speed cap
                const sp = Math.hypot(p.vx, p.vy);
                const cap = 3;
                if (sp > cap) {
                    p.vx = (p.vx / sp) * cap;
                    p.vy = (p.vy / sp) * cap;
                }

                // Integrate
                p.x += p.vx;
                p.y += p.vy;

                // Bounds
                const r = p.size / 2;
                // X: hard clamp to screen edges
                if (p.x < minX + r) { p.x = minX + r; p.vx = Math.abs(p.vx) * 0.5; }
                if (p.x > maxX - r) { p.x = maxX - r; p.vx = -Math.abs(p.vx) * 0.5; }
                // Y: soft spring pull back to garden zone
                if (p.y < minY + r) {
                    p.vy += (minY + r - p.y) * 0.025;
                    p.vy *= 0.92;
                } else if (p.y > maxY - r) {
                    p.vy += (maxY - r - p.y) * 0.025;
                    p.vy *= 0.92;
                }
            }

            // Pairwise repulsion
            for (let i = 0; i < ids.length; i++) {
                for (let j = i + 1; j < ids.length; j++) {
                    const a = m.get(ids[i]);
                    const b = m.get(ids[j]);
                    if (!a || !b) continue;
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const dist = Math.hypot(dx, dy) || 0.001;
                    const minDist = (a.size + b.size) / 2 + 6;
                    if (dist < minDist) {
                        const force = (minDist - dist) * 0.04;
                        const nx = dx / dist;
                        const ny = dy / dist;
                        if (ids[i] !== focusedId && ids[i] !== draggingId) {
                            a.vx -= nx * force;
                            a.vy -= ny * force;
                        }
                        if (ids[j] !== focusedId && ids[j] !== draggingId) {
                            b.vx += nx * force;
                            b.vy += ny * force;
                        }
                    }
                }
            }

            // Trigger re-render
            forceRenderRef.current();
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [focusedId]); // draggingId no longer a dep — read from ref each frame

    return { stateRef, setForceRender, markReleased, draggingIdRef };
}
