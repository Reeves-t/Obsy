import React, { memo, useMemo, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '@/components/ui/GlassCard';
import { ThemedText } from '@/components/ui/ThemedText';
import Colors from '@/constants/Colors';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { resolveMoodColorById, getMoodLabel } from '@/lib/moodUtils';
import { Capture } from '@/types/capture';

interface MoodConnectionDialProps {
    captures: Capture[];
    flat?: boolean;
}

type MoodNode = {
    moodId: string;
    moodLabel: string;
    color: string;
    firstSeenAt: string;
};

type RelationshipCount = Record<string, number>;

type DialModel = {
    orderedEntries: Capture[];
    moodNodes: MoodNode[];
    moodIndexById: Map<string, number>;
    beforeByMood: Record<string, RelationshipCount>;
    afterByMood: Record<string, RelationshipCount>;
    latestMoodIndex: number;
};

const SIZE = 220;
const CENTER = SIZE / 2;
const OUTER_RADIUS = 88;
const INNER_RADIUS = 72;
const POINTER_RADIUS = OUTER_RADIUS + 15;
const NODE_GAP_DEG = 1.6;

const toRadians = (deg: number) => (deg * Math.PI) / 180;

function pointOnCircle(angleDeg: number, radius: number) {
    const rad = toRadians(angleDeg);
    return {
        x: CENTER + Math.cos(rad) * radius,
        y: CENTER + Math.sin(rad) * radius,
    };
}

function normalizeAngleFromTop(rawDeg: number) {
    return (rawDeg + 90 + 360) % 360;
}

function buildRingSegmentPath(startDeg: number, endDeg: number) {
    const outerStart = pointOnCircle(startDeg, OUTER_RADIUS);
    const outerEnd = pointOnCircle(endDeg, OUTER_RADIUS);
    const innerEnd = pointOnCircle(endDeg, INNER_RADIUS);
    const innerStart = pointOnCircle(startDeg, INNER_RADIUS);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;

    return [
        `M ${outerStart.x} ${outerStart.y}`,
        `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
        `L ${innerEnd.x} ${innerEnd.y}`,
        `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
        'Z',
    ].join(' ');
}

function buildModel(captures: Capture[]): DialModel {
    const orderedEntries = [...captures]
        .filter((entry) => entry.includeInInsights !== false && !!entry.mood_id)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const moodNodes: MoodNode[] = [];
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

function sortRelationshipCounts(data: RelationshipCount | undefined, nodes: MoodNode[]) {
    if (!data) return [] as Array<{ moodId: string; label: string; color: string; count: number }>;

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

export const MoodConnectionDial = memo(function MoodConnectionDial({ captures, flat = false }: MoodConnectionDialProps) {
    const { colors, isLight } = useObsyTheme();
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [dialSize, setDialSize] = useState(SIZE);

    const model = useMemo(() => buildModel(captures), [captures]);

    const safeSelectedIndex = model.moodNodes.length === 0
        ? 0
        : Math.min(Math.max(selectedIndex || model.latestMoodIndex, 0), model.moodNodes.length - 1);

    const selectedMood = model.moodNodes[safeSelectedIndex];

    const effectiveSelection = selectedMood ? safeSelectedIndex : model.latestMoodIndex;

    React.useEffect(() => {
        if (model.moodNodes.length === 0) {
            if (selectedIndex !== 0) setSelectedIndex(0);
            return;
        }

        if (selectedIndex >= model.moodNodes.length) {
            setSelectedIndex(model.latestMoodIndex);
        } else if (selectedIndex === 0 && model.latestMoodIndex !== 0 && model.moodNodes.length > 1) {
            setSelectedIndex(model.latestMoodIndex);
        }
    }, [model.moodNodes.length, model.latestMoodIndex]);

    const segmentGeometry = useMemo(() => {
        const count = model.moodNodes.length;
        if (count === 0) return [] as Array<{ startDeg: number; endDeg: number; midDeg: number; path: string }>;

        const slice = 360 / count;
        return model.moodNodes.map((_, index) => {
            const startDeg = -90 + index * slice + NODE_GAP_DEG / 2;
            const endDeg = -90 + (index + 1) * slice - NODE_GAP_DEG / 2;
            const midDeg = (startDeg + endDeg) / 2;
            return {
                startDeg,
                endDeg,
                midDeg,
                path: buildRingSegmentPath(startDeg, endDeg),
            };
        });
    }, [model.moodNodes]);

    const selectedMidDeg = segmentGeometry[effectiveSelection]?.midDeg ?? -90;
    const pointerPoint = pointOnCircle(selectedMidDeg, POINTER_RADIUS);

    const beforeCounts = selectedMood ? sortRelationshipCounts(model.beforeByMood[selectedMood.moodId], model.moodNodes) : [];
    const afterCounts = selectedMood ? sortRelationshipCounts(model.afterByMood[selectedMood.moodId], model.moodNodes) : [];

    const maxRelationshipCount = Math.max(
        1,
        ...beforeCounts.map((r) => r.count),
        ...afterCounts.map((r) => r.count),
    );

    const relationshipPaths = useMemo(() => {
        if (!selectedMood) return [] as Array<{ d: string; color: string; width: number; opacity: number }>;

        const selectedAngle = segmentGeometry[effectiveSelection]?.midDeg;
        if (selectedAngle === undefined) return [];

        const start = pointOnCircle(selectedAngle, INNER_RADIUS - 5);

        const buildCurve = (targetMoodId: string, count: number, isAfter: boolean) => {
            const targetIndex = model.moodIndexById.get(targetMoodId);
            if (targetIndex === undefined) return null;

            const endAngle = segmentGeometry[targetIndex]?.midDeg;
            if (endAngle === undefined) return null;

            const end = pointOnCircle(endAngle, INNER_RADIUS - 5);
            const controlStrength = isAfter ? 0.24 : 0.3;
            const control = pointOnCircle((selectedAngle + endAngle) / 2, INNER_RADIUS * controlStrength);

            const width = 0.7 + (count / maxRelationshipCount) * 2.8;
            const opacity = 0.22 + (count / maxRelationshipCount) * 0.56;
            const color = resolveMoodColorById(targetMoodId);

            return {
                d: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
                color,
                width,
                opacity,
            };
        };

        const lines = [
            ...beforeCounts.map((rel) => buildCurve(rel.moodId, rel.count, false)),
            ...afterCounts.map((rel) => buildCurve(rel.moodId, rel.count, true)),
        ].filter(Boolean);

        return lines as Array<{ d: string; color: string; width: number; opacity: number }>;
    }, [selectedMood, effectiveSelection, segmentGeometry, model.moodIndexById, beforeCounts, afterCounts, maxRelationshipCount]);

    const selectByTouch = (x: number, y: number) => {
        if (model.moodNodes.length === 0) return;
        const localCenter = dialSize / 2;
        const angle = Math.atan2(y - localCenter, x - localCenter) * (180 / Math.PI);
        const fromTop = normalizeAngleFromTop(angle);
        const count = model.moodNodes.length;
        const idx = Math.floor((fromTop / 360) * count) % count;
        setSelectedIndex(Math.max(0, Math.min(count - 1, idx)));
    };

    const panResponder = useMemo(
        () => PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (evt) => selectByTouch(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
            onPanResponderMove: (evt) => selectByTouch(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
        }),
        [model.moodNodes.length, dialSize],
    );

    const onDialLayout = (event: LayoutChangeEvent) => {
        const next = Math.min(event.nativeEvent.layout.width, event.nativeEvent.layout.height);
        if (next > 0 && Math.abs(next - dialSize) > 1) setDialSize(next);
    };

    const content = (
        <View style={[styles.container, flat && styles.flatContainer]}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Ionicons name="git-network-outline" size={17} color={isLight ? 'rgba(0,0,0,0.5)' : Colors.obsy.silver} />
                    <ThemedText type="defaultSemiBold" style={[styles.title, isLight && { color: 'rgba(0,0,0,0.62)' }]}>
                        Mood Connection Dial
                    </ThemedText>
                </View>
                <ThemedText style={[styles.subtleText, isLight && { color: 'rgba(0,0,0,0.45)' }]}>
                    {model.moodNodes.length} mood types
                </ThemedText>
            </View>

            {model.moodNodes.length === 0 ? (
                <View style={[styles.emptyState, { borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }]}>
                    <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>No mood relationships yet</ThemedText>
                    <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>Add a few captures to see how moods connect over time.</ThemedText>
                </View>
            ) : (
                <>
                    <View
                        style={styles.dialFrame}
                        onLayout={onDialLayout}
                        {...panResponder.panHandlers}
                    >
                        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
                            {relationshipPaths.map((line, index) => (
                                <Path
                                    key={`connection-${index}`}
                                    d={line.d}
                                    stroke={line.color}
                                    strokeWidth={line.width}
                                    strokeOpacity={line.opacity}
                                    fill="none"
                                    strokeLinecap="round"
                                />
                            ))}

                            {segmentGeometry.map((segment, index) => {
                                const mood = model.moodNodes[index];
                                const selected = index === effectiveSelection;
                                return (
                                    <Path
                                        key={`${mood.moodId}-${mood.firstSeenAt}`}
                                        d={segment.path}
                                        fill={mood.color}
                                        fillOpacity={selected ? 0.96 : 0.52}
                                        stroke={selected ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.12)'}
                                        strokeWidth={selected ? 1.2 : 0.65}
                                        onPress={() => setSelectedIndex(index)}
                                    />
                                );
                            })}
                        </Svg>

                        <View
                            pointerEvents="none"
                            style={[
                                styles.pointer,
                                {
                                    left: pointerPoint.x - 7,
                                    top: pointerPoint.y - 7,
                                    borderColor: selectedMood?.color ?? '#fff',
                                    backgroundColor: isLight ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.92)',
                                },
                            ]}
                        />
                    </View>

                    <View style={styles.metaArea}>
                        <View style={styles.selectedMoodRow}>
                            <View style={[styles.selectedMoodDot, { backgroundColor: selectedMood.color }]} />
                            <ThemedText style={[styles.selectedMoodName, { color: colors.text }]}>{selectedMood.moodLabel}</ThemedText>
                        </View>

                        <View style={styles.metaGrid}>
                            <View style={styles.metaColumn}>
                                <ThemedText style={[styles.metaHeading, { color: colors.textTertiary }]}>Before</ThemedText>
                                <View style={styles.chipWrap}>
                                    {beforeCounts.length === 0 ? (
                                        <ThemedText style={[styles.metaEmpty, { color: colors.textTertiary }]}>None</ThemedText>
                                    ) : beforeCounts.slice(0, 5).map((item) => (
                                        <Pressable key={`before-${item.moodId}`} style={[styles.chip, { borderColor: `${item.color}66` }]} onPress={() => {
                                            const idx = model.moodIndexById.get(item.moodId);
                                            if (idx !== undefined) setSelectedIndex(idx);
                                        }}>
                                            <View style={[styles.chipDot, { backgroundColor: item.color }]} />
                                            <ThemedText style={[styles.chipLabel, { color: colors.text }]}>{item.label}</ThemedText>
                                            <ThemedText style={[styles.chipCount, { color: colors.textTertiary }]}>{item.count}</ThemedText>
                                        </Pressable>
                                    ))}
                                </View>
                            </View>

                            <View style={styles.metaColumn}>
                                <ThemedText style={[styles.metaHeading, { color: colors.textTertiary }]}>After</ThemedText>
                                <View style={styles.chipWrap}>
                                    {afterCounts.length === 0 ? (
                                        <ThemedText style={[styles.metaEmpty, { color: colors.textTertiary }]}>None</ThemedText>
                                    ) : afterCounts.slice(0, 5).map((item) => (
                                        <Pressable key={`after-${item.moodId}`} style={[styles.chip, { borderColor: `${item.color}66` }]} onPress={() => {
                                            const idx = model.moodIndexById.get(item.moodId);
                                            if (idx !== undefined) setSelectedIndex(idx);
                                        }}>
                                            <View style={[styles.chipDot, { backgroundColor: item.color }]} />
                                            <ThemedText style={[styles.chipLabel, { color: colors.text }]}>{item.label}</ThemedText>
                                            <ThemedText style={[styles.chipCount, { color: colors.textTertiary }]}>{item.count}</ThemedText>
                                        </Pressable>
                                    ))}
                                </View>
                            </View>
                        </View>
                    </View>
                </>
            )}
        </View>
    );

    if (flat) return content;

    return <GlassCard noPadding>{content}</GlassCard>;
});

const styles = StyleSheet.create({
    container: {
        paddingVertical: 12,
        gap: 14,
    },
    flatContainer: {
        paddingHorizontal: 0,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        color: Colors.obsy.silver,
        fontSize: 16,
    },
    subtleText: {
        color: 'rgba(255,255,255,0.42)',
        fontSize: 12,
    },
    emptyState: {
        borderWidth: 1,
        borderRadius: 14,
        paddingVertical: 20,
        paddingHorizontal: 16,
        alignItems: 'center',
        gap: 4,
    },
    emptyTitle: {
        fontSize: 14,
        fontWeight: '600',
    },
    emptyText: {
        fontSize: 12,
        textAlign: 'center',
    },
    dialFrame: {
        width: SIZE,
        height: SIZE,
        alignSelf: 'center',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pointer: {
        position: 'absolute',
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 1.8,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    metaArea: {
        gap: 10,
    },
    selectedMoodRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    selectedMoodDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    selectedMoodName: {
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    metaGrid: {
        flexDirection: 'row',
        gap: 10,
    },
    metaColumn: {
        flex: 1,
        gap: 6,
    },
    metaHeading: {
        fontSize: 11,
        letterSpacing: 0.7,
        textTransform: 'uppercase',
    },
    chipWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        minHeight: 22,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    chipDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    chipLabel: {
        fontSize: 11,
        maxWidth: 72,
    },
    chipCount: {
        fontSize: 11,
        fontWeight: '700',
    },
    metaEmpty: {
        fontSize: 11,
    },
});
