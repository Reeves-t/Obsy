import { Capture, CaptureWithMood, withMood } from '@/types/capture';
import { getMoodLabel, resolveMoodColorById } from '@/lib/moodUtils';

export type RelationshipCount = Record<string, number>;

export interface MoodConnectionNode {
    moodId: string;
    moodLabel: string;
    color: string;
    firstSeenAt: string;
}

export interface MoodConnectionRelationship {
    moodId: string;
    label: string;
    color: string;
    count: number;
}

export interface MoodConnectionDialModel {
    orderedEntries: CaptureWithMood[];
    moodNodes: MoodConnectionNode[];
    moodIndexById: Map<string, number>;
    beforeByMood: Record<string, RelationshipCount>;
    afterByMood: Record<string, RelationshipCount>;
    latestMoodIndex: number;
}

export interface MoodConnectionSummary {
    totalEntries: number;
    activeDays: number;
    moodVariety: number;
    selectedMood: string | null;
    beforeVariety: number;
    afterVariety: number;
    strongestBefore: string | null;
    strongestAfter: string | null;
    strongestConnection: string | null;
    loopCount: number;
}

export interface MoodConnectionInterpretationData {
    selectedMoodId: string;
    selectedMood: string;
    summary: MoodConnectionSummary;
    before: MoodConnectionRelationship[];
    after: MoodConnectionRelationship[];
    hasEnoughData: boolean;
}

export function buildMoodConnectionModel(captures: Capture[]): MoodConnectionDialModel {
    const orderedEntries = withMood(captures)
        .filter((entry) => entry.includeInInsights !== false)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const moodNodes: MoodConnectionNode[] = [];
    const moodIndexById = new Map<string, number>();

    orderedEntries.forEach((entry) => {
        if (moodIndexById.has(entry.mood_id)) return;
        moodIndexById.set(entry.mood_id, moodNodes.length);
        moodNodes.push({
            moodId: entry.mood_id,
            moodLabel: getMoodLabel(entry.mood_id, entry.mood_name_snapshot),
            color: resolveMoodColorById(entry.mood_id, entry.mood_name_snapshot),
            firstSeenAt: entry.created_at,
        });
    });

    const beforeByMood: Record<string, RelationshipCount> = {};
    const afterByMood: Record<string, RelationshipCount> = {};

    for (let i = 0; i < orderedEntries.length; i += 1) {
        const currentMood = orderedEntries[i].mood_id;
        const prevMood = i > 0 ? orderedEntries[i - 1].mood_id : null;
        const nextMood = i < orderedEntries.length - 1 ? orderedEntries[i + 1].mood_id : null;

        if (!beforeByMood[currentMood]) beforeByMood[currentMood] = {};
        if (!afterByMood[currentMood]) afterByMood[currentMood] = {};

        if (prevMood) {
            beforeByMood[currentMood][prevMood] = (beforeByMood[currentMood][prevMood] || 0) + 1;
        }

        if (nextMood) {
            afterByMood[currentMood][nextMood] = (afterByMood[currentMood][nextMood] || 0) + 1;
        }
    }

    const latestMoodId = orderedEntries[orderedEntries.length - 1]?.mood_id;
    const latestMoodIndex = latestMoodId ? (moodIndexById.get(latestMoodId) ?? 0) : 0;

    return {
        orderedEntries,
        moodNodes,
        moodIndexById,
        beforeByMood,
        afterByMood,
        latestMoodIndex,
    };
}

export function sortMoodConnectionCounts(
    data: RelationshipCount | undefined,
    nodes: MoodConnectionNode[]
): MoodConnectionRelationship[] {
    if (!data) return [];

    return Object.entries(data)
        .map(([moodId, count]) => {
            const node = nodes.find((n) => n.moodId === moodId);
            return {
                moodId,
                count,
                label: node?.moodLabel ?? getMoodLabel(moodId),
                color: node?.color ?? resolveMoodColorById(moodId),
            };
        })
        .sort((a, b) => b.count - a.count);
}

export function buildMoodConnectionInterpretationData(
    model: MoodConnectionDialModel,
    selectedMoodId: string | null | undefined
): MoodConnectionInterpretationData | null {
    if (!selectedMoodId) return null;
    const selectedNode = model.moodNodes.find((node) => node.moodId === selectedMoodId);
    if (!selectedNode) return null;

    const before = sortMoodConnectionCounts(model.beforeByMood[selectedMoodId], model.moodNodes);
    const after = sortMoodConnectionCounts(model.afterByMood[selectedMoodId], model.moodNodes);
    const strongestBefore = before[0] ?? null;
    const strongestAfter = after[0] ?? null;
    const strongestConnection = [strongestBefore, strongestAfter]
        .filter(Boolean)
        .sort((a, b) => (b?.count ?? 0) - (a?.count ?? 0))[0] ?? null;
    const activeDays = new Set(model.orderedEntries.map((entry) => entry.created_at.slice(0, 10))).size;
    const loopCount = (model.beforeByMood[selectedMoodId]?.[selectedMoodId] ?? 0)
        + (model.afterByMood[selectedMoodId]?.[selectedMoodId] ?? 0);

    return {
        selectedMoodId,
        selectedMood: selectedNode.moodLabel,
        before,
        after,
        hasEnoughData: model.orderedEntries.length >= 4 && (before.length > 0 || after.length > 0),
        summary: {
            totalEntries: model.orderedEntries.length,
            activeDays,
            moodVariety: model.moodNodes.length,
            selectedMood: selectedNode.moodLabel,
            beforeVariety: before.length,
            afterVariety: after.length,
            strongestBefore: strongestBefore?.label ?? null,
            strongestAfter: strongestAfter?.label ?? null,
            strongestConnection: strongestConnection?.label ?? null,
            loopCount,
        },
    };
}
