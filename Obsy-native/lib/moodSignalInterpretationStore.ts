import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'obsy:mood-signal-interpretation:v1';

export type MoodSignalInterpretationKind = 'weekly_signal' | 'weekday_shape' | 'mood_connection';

export interface SavedMoodSignalInterpretation {
    kind: MoodSignalInterpretationKind;
    key: string;
    text: string;
    generatedAt: string;
    contextLabel: string;
}

export function buildMoodSignalInterpretationKey(
    userId: string,
    kind: MoodSignalInterpretationKind,
    signalKey: string
): string {
    return `${STORAGE_PREFIX}:${userId}:${kind}:${signalKey}`;
}

export async function loadMoodSignalInterpretation(
    storageKey: string
): Promise<SavedMoodSignalInterpretation | null> {
    try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as SavedMoodSignalInterpretation;
        return typeof parsed?.text === 'string' ? parsed : null;
    } catch {
        return null;
    }
}

export async function saveMoodSignalInterpretation(
    storageKey: string,
    interpretation: SavedMoodSignalInterpretation
): Promise<void> {
    await AsyncStorage.setItem(storageKey, JSON.stringify(interpretation));
}
