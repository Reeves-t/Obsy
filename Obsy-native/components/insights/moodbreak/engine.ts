import { Capture } from '@/types/capture';
import { getMoodLabel } from '@/lib/moodUtils';
import { getMoodTheme } from '@/lib/moods';
import { startOfWeek } from 'date-fns';
import { WEEK_STARTS_ON } from '@/lib/dateUtils';
import { AiToneId } from '@/lib/aiTone';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type GamePhase = 'idle' | 'loading' | 'playing' | 'cleared';

export type PowerUpType = 'multiball' | 'widepaddle' | 'fireball' | 'bomb';

export interface CaptureRow {
    moodId: string;
    mood: string;
    color: string;
    gradientFrom: string;
    gradientMid: string;
    gradientTo: string;
    totalForMood: number;
}

export interface Brick {
    id: string;
    // Grid indices. Bricks are built in row-major order, so
    // bricks[row * BRICKS_PER_ROW + col] is always the brick at (row, col) —
    // bomb adjacency relies on this invariant.
    row: number;
    col: number;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    gradientFrom: string;
    gradientMid: string;
    gradientTo: string;
    mood: string;
    moodId: string;
    count: number;
    broken: boolean;
    charged: PowerUpType | null;
}

export interface Ball {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** Per-ball base speed — multiball spawns run slower/faster than the main ball */
    speed: number;
}

export interface Pop {
    id: number;
    x: number;
    y: number;
    text: string;
    color: string;
}

export interface Burst {
    id: number;
    x: number;
    y: number;
    colors: [string, string, string];
    big: boolean;
}

export interface BannerData {
    text: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Physics & gameplay constants
// ─────────────────────────────────────────────────────────────────────────────

export const BALL_RADIUS = 5;
export const PADDLE_HEIGHT = 10;
export const PADDLE_WIDTH = 70;
export const BRICK_PADDING = 2;
export const BRICKS_PER_ROW = 10;
export const MAX_ROWS = 14;
export const BALL_SPEED = 2.6; // px per 60fps frame (dt-normalized)
export const BRICK_ZONE_RATIO = 0.45; // Top 45% of container reserved for bricks

export const CHARGE_RATE = 1 / 8; // base rate — scales up with row count, see buildBricks
export const MAX_CHARGE_RATE = 0.25;
export const MAX_BALLS = 6;
// Multiball spawns travel at different speeds so they don't move in lockstep
export const MULTIBALL_SPEED_FACTORS = [0.85, 1.15];
export const WIDE_PADDLE_MS = 10_000;
export const WIDE_FACTOR = 1.6;
export const FIREBALL_MS = 5_000;
export const POINTS_PER_BRICK = 10;
export const MISS_PENALTY = 30; // lost when the only ball falls off the bottom
export const COMBO_WINDOW_MS = 1_000; // hits within 1s chain the combo (uncapped)
export const POP_DURATION_MS = 700;
export const BURST_DURATION_MS = 500;
export const BANNER_MS = 2_500;
export const BANNER_GAP_MS = 250;
export const INSIGHT_FALL_MS = 2_200; // falling-insight total timeline (read + fall)
export const MAX_POPS = 10;
export const MAX_BURSTS = 6;

export const CHARGE_LABELS: Record<PowerUpType, string> = {
    multiball: 'MULTI!',
    widepaddle: 'WIDE!',
    fireball: 'FIRE!',
    bomb: 'BOOM!',
};

const EFFECTS: PowerUpType[] = ['multiball', 'widepaddle', 'fireball', 'bomb'];

// ─────────────────────────────────────────────────────────────────────────────
// Seeded RNG — charged-brick layout is deterministic per game seed
// ─────────────────────────────────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Micro Insight Generator
// ─────────────────────────────────────────────────────────────────────────────

export function generateMicroInsight(mood: string, count: number, tone: AiToneId): string {
    const m = mood.toLowerCase();
    const M = mood.charAt(0).toUpperCase() + mood.slice(1).toLowerCase();

    switch (tone) {
        case 'gentle_roast':
            return pickRandom([
                `${count} ${m} check-in${count !== 1 ? 's' : ''}. You okay or just allergic to excitement?`,
                `${M} again? ${count} time${count !== 1 ? 's' : ''} this week. Bold strategy.`,
                `${count}x ${m}. At this point it's a lifestyle.`,
                `${M} popped up ${count} time${count !== 1 ? 's' : ''}. Noted, not judged.`,
            ]);
        case 'dry_humor':
            return pickRandom([
                `${M}, ${count} time${count !== 1 ? 's' : ''}. Consistent, at least.`,
                `${count}x ${m}. A pattern or a coincidence? Hard to say.`,
                `${M} showed up ${count} time${count !== 1 ? 's' : ''}. It knows where you live.`,
            ]);
        case 'cinematic':
            return pickRandom([
                `${M} lingered, then cracked.`,
                `A week scored by ${m}, ${count} scene${count !== 1 ? 's' : ''} deep.`,
                `${M} entered the frame ${count} time${count !== 1 ? 's' : ''}. Fade out.`,
            ]);
        case 'dreamlike':
            return pickRandom([
                `${M} drifted through ${count} time${count !== 1 ? 's' : ''}…`,
                `Echoes of ${m}, soft and recurring.`,
                `${count} whisper${count !== 1 ? 's' : ''} of ${m} this week.`,
            ]);
        case 'mystery_noir':
            return pickRandom([
                `${M}. ${count} time${count !== 1 ? 's' : ''}. The usual suspect.`,
                `${count} trace${count !== 1 ? 's' : ''} of ${m}. The plot thickens.`,
                `${M} left ${count} mark${count !== 1 ? 's' : ''} on the week.`,
            ]);
        case 'stoic_calm':
            return pickRandom([
                `${M}. ${count}. Observed.`,
                `${count}x ${m}. It is what it is.`,
                `${M}, noted ${count} time${count !== 1 ? 's' : ''}.`,
            ]);
        case 'romantic':
            return pickRandom([
                `${M} found you ${count} time${count !== 1 ? 's' : ''} this week.`,
                `${count} tender moment${count !== 1 ? 's' : ''} of ${m}.`,
                `${M} kept returning, ${count} time${count !== 1 ? 's' : ''}.`,
            ]);
        case 'inspiring':
            return pickRandom([
                `${M} showed up ${count} time${count !== 1 ? 's' : ''}. Every feeling is a step forward.`,
                `${count}x ${m}. Even this is movement.`,
                `${M}, ${count} time${count !== 1 ? 's' : ''}. You noticed. That matters.`,
            ]);
        case 'neutral':
        default:
            return pickRandom([
                `${M} showed up ${count} time${count !== 1 ? 's' : ''} this week.`,
                `${count}x ${m}.`,
                `${M}: ${count} capture${count !== 1 ? 's' : ''} this week.`,
            ]);
    }
}

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleared-week summary — encouraging recap of ALL moods captured this week,
// shown on the "Week cleared" screen.
// ─────────────────────────────────────────────────────────────────────────────

export function generateClearedSummary(rows: CaptureRow[]): string {
    const byMood = new Map<string, { label: string; count: number }>();
    rows.forEach(r => {
        if (!byMood.has(r.moodId)) {
            byMood.set(r.moodId, { label: r.mood.toLowerCase(), count: r.totalForMood });
        }
    });
    const moods = [...byMood.values()].sort((a, b) => b.count - a.count).map(m => m.label);
    const list =
        moods.length === 1 ? moods[0]
        : moods.length === 2 ? `${moods[0]} & ${moods[1]}`
        : `${moods.slice(0, -1).join(', ')} & ${moods[moods.length - 1]}`;
    const total = [...byMood.values()].reduce((sum, m) => sum + m.count, 0);
    const n = `${total} capture${total !== 1 ? 's' : ''}`;

    return pickRandom([
        `Great job showing up this week: ${n} across ${list}. Keep noticing.`,
        `This week held ${list}. ${n}, and every one counts.`,
        `You noticed ${list} this week. That's ${n} of real self-awareness. Keep going.`,
        `${n}, from ${list}. Showing up is the whole game.`,
    ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Build rows: one row per capture, grouped/sorted by mood
// ─────────────────────────────────────────────────────────────────────────────

export function buildCaptureRows(captures: Capture[]): CaptureRow[] {
    const now = new Date();
    const cutoff = startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON });
    const filtered = captures.filter(c => c.mood_id && new Date(c.created_at) >= cutoff);

    // Count totals per mood for insight text
    const moodCounts: Record<string, number> = {};
    filtered.forEach(c => {
        moodCounts[c.mood_id!] = (moodCounts[c.mood_id!] || 0) + 1;
    });

    // Sort by mood_id so same moods group together as layers
    const sorted = [...filtered].sort((a, b) => {
        if (a.mood_id! < b.mood_id!) return -1;
        if (a.mood_id! > b.mood_id!) return 1;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    return sorted.slice(0, MAX_ROWS).map(c => {
        const label = c.mood_name_snapshot || getMoodLabel(c.mood_id!);
        const theme = getMoodTheme(c.mood_id!);
        return {
            moodId: c.mood_id!,
            mood: label,
            color: theme.solid,
            gradientFrom: theme.gradient.primary,
            gradientMid: theme.gradient.mid,
            gradientTo: theme.gradient.secondary,
            totalForMood: moodCounts[c.mood_id!] || 1,
        };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Build bricks from rows (row-major order — see Brick.row/col invariant)
// ─────────────────────────────────────────────────────────────────────────────

export function buildBricks(
    rows: CaptureRow[],
    containerWidth: number,
    containerHeight: number,
    seed: number,
): Brick[] {
    const bricks: Brick[] = [];
    const topPadding = 8;
    const sidePadding = 8;
    const availableWidth = containerWidth - sidePadding * 2;
    const rng = mulberry32((seed + 1) * 0x9e3779b9);

    // Power-ups get denser as the wall gets taller so heavy weeks still clear
    // fast: 1/8 at ≤4 rows, ramping to ~1/4 at 14 rows.
    const chargeRate = Math.min(MAX_CHARGE_RATE, CHARGE_RATE + Math.max(0, rows.length - 4) * 0.012);

    // Dynamically size rows to fit in the top portion of the container
    const brickZoneHeight = containerHeight * BRICK_ZONE_RATIO;
    const totalVerticalPadding = (rows.length - 1) * BRICK_PADDING;
    const brickH = Math.max(8, Math.floor((brickZoneHeight - topPadding - totalVerticalPadding) / rows.length));

    rows.forEach((row, rowIdx) => {
        const totalHPadding = (BRICKS_PER_ROW - 1) * BRICK_PADDING;
        const brickW = (availableWidth - totalHPadding) / BRICKS_PER_ROW;

        for (let col = 0; col < BRICKS_PER_ROW; col++) {
            const charged = rng() < chargeRate
                ? EFFECTS[Math.floor(rng() * EFFECTS.length)]
                : null;
            bricks.push({
                id: `${row.moodId}-${rowIdx}-${col}`,
                row: rowIdx,
                col,
                x: sidePadding + col * (brickW + BRICK_PADDING),
                y: topPadding + rowIdx * (brickH + BRICK_PADDING),
                width: brickW,
                height: brickH,
                color: row.color,
                gradientFrom: row.gradientFrom,
                gradientMid: row.gradientMid,
                gradientTo: row.gradientTo,
                mood: row.mood,
                moodId: row.moodId,
                count: row.totalForMood,
                broken: false,
                charged,
            });
        }
    });

    // Every game gets at least one power-up
    if (bricks.length > 0 && !bricks.some(b => b.charged)) {
        const idx = Math.floor(rng() * bricks.length);
        bricks[idx].charged = EFFECTS[Math.floor(rng() * EFFECTS.length)];
    }

    return bricks;
}
