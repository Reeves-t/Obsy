import { MoodId } from '@/constants/Moods';

/** Two-stop gradient definition for a mood */
export interface MoodGradient {
    from: string;  // hex start color
    to: string;    // hex end color
}

/** Full design token for a mood — gradients, derived solid, and accessibility */
export interface MoodTheme {
    id: string;
    label: string;
    tone: 'low' | 'medium' | 'high';
    gradient: MoodGradient;
    /** Single representative hex derived from gradient midpoint */
    solid: string;
    /** Recommended text color for readability on this mood's background */
    textOn: 'light' | 'dark';
}

/** Preset mood entry with gradient */
export interface PresetMood {
    id: MoodId;
    label: string;
    tone: 'low' | 'medium' | 'high';
    gradient: MoodGradient;
}
