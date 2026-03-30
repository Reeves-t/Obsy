export type OrbEffectType = 'grain' | 'splash' | 'streak';

export interface OrbEffect {
    type: OrbEffectType;
    grainOpacity?: number;
    splashColor?: string;
    splashOffsetX?: number;
    splashOffsetY?: number;
    splashRadius?: number;
    splashOpacity?: number;
    streakAngle?: number; // degrees
    streakCount?: number;
    streakOpacity?: number;
}

type MoodTemperature = 'cool' | 'warm' | 'neutral' | 'purple';

const SPLASH_COLORS = {
    warm: ['#A65D63', '#BF8888', '#F2AD94', '#D9A0C5', '#C49D84', '#F2A679'],
    cool: ['#84C1C4', '#789EBF', '#54678C', '#629799', '#BBABC4', '#A3BFBA'],
} as const;

const MOOD_TEMPERATURE: Record<string, MoodTemperature> = {
    calm: 'cool', peaceful: 'cool', relaxed: 'cool', numb: 'cool', focused: 'cool', safe: 'cool',
    tender: 'purple', reflective: 'purple', restless: 'purple', inspired: 'purple', overwhelmed: 'purple',
    grateful: 'warm', proud: 'warm', confident: 'warm', motivated: 'warm', enthusiastic: 'warm', hopeful: 'warm',
    happy: 'warm', playful: 'warm', annoyed: 'warm', anxious: 'warm', drained: 'warm', unbothered: 'warm',
    bored: 'neutral', neutral: 'neutral', soft: 'neutral', content: 'neutral', doubtful: 'neutral', sad: 'neutral', lonely: 'neutral',
};

function normalizeMoodKey(input: string): string {
    return input.trim().toLowerCase().replace(/[^a-z]/g, '');
}

function randBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function pickFrom<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function getMoodTemperature(moodKey: string): MoodTemperature {
    const normalized = normalizeMoodKey(moodKey);
    return MOOD_TEMPERATURE[normalized] ?? 'neutral';
}

export function getSplashColor(temp: MoodTemperature): string {
    if (temp === 'cool') return pickFrom(SPLASH_COLORS.warm);
    if (temp === 'warm') return pickFrom(SPLASH_COLORS.cool);
    if (temp === 'purple') {
        const pool = Math.random() < 0.5 ? SPLASH_COLORS.warm : SPLASH_COLORS.cool;
        return pickFrom(pool);
    }
    const all = [...SPLASH_COLORS.warm, ...SPLASH_COLORS.cool];
    return pickFrom(all);
}

export function generateOrbEffect(moodKey: string): OrbEffect {
    const roll = Math.random();

    if (roll < 0.4) {
        return {
            type: 'grain',
            grainOpacity: randBetween(0.08, 0.15),
        };
    }

    if (roll < 0.75) {
        const temp = getMoodTemperature(moodKey);
        return {
            type: 'splash',
            splashColor: getSplashColor(temp),
            splashOffsetX: randBetween(-0.2, 0.2),
            splashOffsetY: randBetween(-0.2, 0.2),
            splashRadius: randBetween(0.1, 0.2),
            splashOpacity: randBetween(0.15, 0.3),
        };
    }

    return {
        type: 'streak',
        streakAngle: randBetween(0, 360),
        streakCount: 2 + Math.floor(Math.random() * 3),
        streakOpacity: randBetween(0.1, 0.25),
    };
}
