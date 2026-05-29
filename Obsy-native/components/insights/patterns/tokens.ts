import type { PatternCategory } from '@/types/patternKeywords';

export interface PatternTokens {
    bg: string;
    paper: string;
    ink: string;
    ink2: string;
    ink3: string;
    ink4: string;
    line: string;
    lineSoft: string;
}

export function getPatternTokens(isLight: boolean): PatternTokens {
    if (isLight) {
        return {
            bg: 'rgba(0,0,0,0.02)',
            paper: 'rgba(255,255,255,0.6)',
            ink: 'rgba(0,0,0,0.92)',
            ink2: 'rgba(0,0,0,0.65)',
            ink3: 'rgba(0,0,0,0.45)',
            ink4: 'rgba(0,0,0,0.3)',
            line: 'rgba(0,0,0,0.08)',
            lineSoft: 'rgba(0,0,0,0.05)',
        };
    }
    return {
        bg: 'rgba(255,255,255,0.03)',
        paper: 'rgba(255,255,255,0.06)',
        ink: 'rgba(255,255,255,0.92)',
        ink2: 'rgba(255,255,255,0.65)',
        ink3: 'rgba(255,255,255,0.45)',
        ink4: 'rgba(255,255,255,0.3)',
        line: 'rgba(255,255,255,0.08)',
        lineSoft: 'rgba(255,255,255,0.05)',
    };
}

export interface CategoryMeta {
    label: string;
    color: string;
    soft: string;
    sub: string;
}

export const CATEGORY_META: Record<PatternCategory, CategoryMeta> = {
    positive: { label: 'Positive', color: '#B26A3A', soft: '#E8D2BC', sub: 'Themes anchored to calm, fulfilled days' },
    draining: { label: 'Draining', color: '#8E5C6E', soft: '#E2CDD4', sub: 'Themes linked to stress and overwhelm' },
    emerging: { label: 'Emerging', color: '#5A7A60', soft: '#CFDDD0', sub: 'A pattern quietly taking shape' },
};
