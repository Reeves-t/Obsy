export type MoodId =
    // Low energy
    | "calm"
    | "relaxed"
    | "peaceful"
    | "tired"
    | "drained"
    | "bored"
    | "reflective"
    | "melancholy"
    | "nostalgic"
    | "lonely"
    | "depressed"
    | "numb"
    | "safe"
    // Medium energy
    | "neutral"
    | "focused"
    | "grateful"
    | "hopeful"
    | "curious"
    | "scattered"
    | "annoyed"
    | "unbothered"
    | "awkward"
    | "tender"
    // High energy
    | "productive"
    | "creative"
    | "inspired"
    | "confident"
    | "joyful"
    | "social"
    | "busy"
    | "restless"
    | "stressed"
    | "overwhelmed"
    | "anxious"
    | "angry"
    | "pressured"
    | "enthusiastic"
    | "hyped"
    | "manic"
    | "playful";

export type Mood = {
    id: MoodId;
    label: string;
    tone: "low" | "medium" | "high";
};

export const MOODS: Mood[] = [
    // Low energy moods
    { id: "calm", label: "Calm", tone: "low" },
    { id: "relaxed", label: "Relaxed", tone: "low" },
    { id: "peaceful", label: "Peaceful", tone: "low" },
    { id: "tired", label: "Tired", tone: "low" },
    { id: "drained", label: "Drained", tone: "low" },
    { id: "bored", label: "Bored", tone: "low" },
    { id: "reflective", label: "Reflective", tone: "low" },
    { id: "melancholy", label: "Melancholy", tone: "low" },
    { id: "nostalgic", label: "Nostalgic", tone: "low" },
    { id: "lonely", label: "Lonely", tone: "low" },
    { id: "depressed", label: "Depressed", tone: "low" },
    { id: "numb", label: "Numb", tone: "low" },
    { id: "safe", label: "Safe", tone: "low" },
    // Medium energy moods
    { id: "neutral", label: "Neutral", tone: "medium" },
    { id: "focused", label: "Focused", tone: "medium" },
    { id: "grateful", label: "Grateful", tone: "medium" },
    { id: "hopeful", label: "Hopeful", tone: "medium" },
    { id: "curious", label: "Curious", tone: "medium" },
    { id: "scattered", label: "Scattered", tone: "medium" },
    { id: "annoyed", label: "Annoyed", tone: "medium" },
    { id: "unbothered", label: "Unbothered", tone: "medium" },
    { id: "awkward", label: "Awkward", tone: "medium" },
    { id: "tender", label: "Tender", tone: "medium" },
    // High energy moods
    { id: "productive", label: "Productive", tone: "high" },
    { id: "creative", label: "Creative", tone: "high" },
    { id: "inspired", label: "Inspired", tone: "high" },
    { id: "confident", label: "Confident", tone: "high" },
    { id: "joyful", label: "Joyful", tone: "high" },
    { id: "social", label: "Social", tone: "high" },
    { id: "busy", label: "Busy", tone: "high" },
    { id: "restless", label: "Restless", tone: "high" },
    { id: "stressed", label: "Stressed", tone: "high" },
    { id: "overwhelmed", label: "Overwhelmed", tone: "high" },
    { id: "anxious", label: "Anxious", tone: "high" },
    { id: "angry", label: "Angry", tone: "high" },
    { id: "pressured", label: "Pressured", tone: "high" },
    { id: "enthusiastic", label: "Enthusiastic", tone: "high" },
    { id: "hyped", label: "Hyped", tone: "high" },
    { id: "manic", label: "Manic", tone: "high" },
    { id: "playful", label: "Playful", tone: "high" },
];

export function isCustomMoodId(moodId: MoodId | string | null): boolean {
    if (!moodId) return false;
    return moodId.startsWith('custom_');
}
