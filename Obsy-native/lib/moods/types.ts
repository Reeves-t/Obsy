import { MoodId } from '@/constants/Moods';

/** Three-stop radial gradient definition for a mood (center → mid → edge) */
export interface MoodGradient {
    primary: string;    // dominant/center color (most visible)
    mid: string;        // transition tone blending primary → secondary
    secondary: string;  // shadow/depth color at orb edges
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
