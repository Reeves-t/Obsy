export type PatternCategory = 'positive' | 'draining' | 'emerging';

export type PatternShiftDirection = 'up' | 'down' | 'flat';

export interface PatternFlowBar {
    label: string;
    value: number;
}

export interface PatternShift {
    dir: PatternShiftDirection;
    label: string;
}

export interface PatternTheme {
    id: string;
    name: string;
    keywords: string;
    mentions: number;
    span: string;
    reflection: string;
    flow: PatternFlowBar[];
    trend: number[];
    shift: PatternShift;
}

export interface PatternKeywordsPayload {
    positive: PatternTheme[];
    draining: PatternTheme[];
    emerging: PatternTheme[];
    dateRange: string;
}

export interface StoredPatternKeywords {
    payload: PatternKeywordsPayload;
    eligible_capture_count: number;
    generation_number: number;
    last_emerging_id: string | null;
    updated_at: string;
}

export interface PatternKeywordsChangeResult {
    kind: 'new-emerging' | 'none';
    theme?: PatternTheme;
}
