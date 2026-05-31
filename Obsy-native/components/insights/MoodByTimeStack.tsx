import React, { memo, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    Extrapolate,
    interpolate,
    runOnJS,
    SharedValue,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Sunrise, Sun, SunMedium, CloudSun, MoonStar, Moon, LucideIcon } from 'lucide-react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import type { TimeBucket } from '@/hooks/useInsightsStats';

type TimeOfDayMood = {
    dominant: string | null;
    moodId: string | null;
    count: number;
    totalCaptures: number;
};

type BucketConfig = {
    bucket: TimeBucket;
    label: string;
    phrase: string;
    Icon: LucideIcon;
    gradient: [string, string, ...string[]];
};

const BUCKETS: BucketConfig[] = [
    { bucket: 'early_morning', label: 'EARLY MORNING', phrase: 'your early mornings', Icon: Sunrise, gradient: ['#1a1a2e', '#3d2c4f', '#c4723a'] },
    { bucket: 'morning', label: 'MORNING', phrase: 'your mornings', Icon: Sun, gradient: ['#2d1b4e', '#6b3fa0', '#e8a87c'] },
    { bucket: 'midday', label: 'MIDDAY', phrase: 'your middays', Icon: SunMedium, gradient: ['#1a4a5e', '#3d8b9e', '#a8d8ea'] },
    { bucket: 'afternoon', label: 'AFTERNOON', phrase: 'your afternoons', Icon: CloudSun, gradient: ['#1e3a5f', '#4a7c9b', '#e8c07a'] },
    { bucket: 'evening', label: 'EVENING', phrase: 'your evenings', Icon: MoonStar, gradient: ['#1a1a2e', '#2d1b4e', '#c97b3d'] },
    { bucket: 'night', label: 'NIGHT', phrase: 'your nights', Icon: Moon, gradient: ['#0a0a1a', '#1a1a2e', '#2d2d4e'] },
];

const N = BUCKETS.length;
const SCREEN_W = Dimensions.get('window').width;
const CARD_W = SCREEN_W - 40;
const CARD_H = 220;
const SWIPE_THRESHOLD = 70;

// Resting transform per depth in the stack (0 = front, peeking down behind it).
const DEPTH_INPUT = [0, 1, 2, 3];
const DEPTH_SCALE = [1, 0.93, 0.86, 0.8];
const DEPTH_TY = [0, 18, 34, 48];

// ─── Single card face ────────────────────────────────────────────────
const CardFace = memo(function CardFace({ config, data }: { config: BucketConfig; data: TimeOfDayMood }) {
    const { Icon, label, phrase, gradient } = config;
    const hasData = data.count > 0 && !!data.dominant;
    const pct = data.totalCaptures > 0 ? Math.round((data.count / data.totalCaptures) * 100) : 0;

    return (
        <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.6, y: 1 }}
            style={styles.card}
        >
            <View style={styles.cardHeader}>
                <Icon size={18} strokeWidth={1.5} color="rgba(255,255,255,0.85)" />
                <ThemedText style={styles.cardLabel}>{label}</ThemedText>
            </View>

            {hasData ? (
                <>
                    <View style={styles.moodBlock}>
                        <ThemedText style={styles.moodName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                            {data.dominant}
                        </ThemedText>
                        <ThemedText style={styles.moodSub}>most often led {phrase}</ThemedText>
                    </View>

                    <View style={styles.metaText}>
                        <ThemedText style={styles.metaPrimary}>
                            Felt {data.count} of {data.totalCaptures} times
                        </ThemedText>
                        <ThemedText style={styles.metaSecondary}>
                            {pct}% of moments this time of day
                        </ThemedText>
                    </View>
                </>
            ) : (
                <View style={styles.emptyBlock}>
                    <ThemedText style={styles.emptyText}>No moments captured at this time yet</ThemedText>
                    <ThemedText style={styles.emptySub}>Log one during {phrase} to see your pattern here</ThemedText>
                </View>
            )}
        </LinearGradient>
    );
});

// ─── One positioned card in the deck (driven by the shared `pos`) ─────
function StackCard({ index, pos, config, data }: { index: number; pos: SharedValue<number>; config: BucketConfig; data: TimeOfDayMood }) {
    const style = useAnimatedStyle(() => {
        const delta = index - pos.value; // 0 = front, >0 = behind, <0 = already swiped away

        // Cards being swiped away slide/tilt off to the left; stacked cards stay centered.
        const translateX = delta < 0 ? delta * SCREEN_W * 1.15 : 0;
        const rotate = delta < 0 ? delta * 7 : 0;
        const scale = interpolate(delta, DEPTH_INPUT, DEPTH_SCALE, Extrapolate.CLAMP);
        const translateY = delta < 0 ? 0 : interpolate(delta, DEPTH_INPUT, DEPTH_TY, Extrapolate.CLAMP);
        const opacity =
            delta < 0
                ? interpolate(delta, [-1, 0], [0, 1], Extrapolate.CLAMP)
                : interpolate(delta, [2, 3], [1, 0], Extrapolate.CLAMP);

        return {
            opacity,
            zIndex: Math.round(100 - delta * 10),
            transform: [{ translateX }, { translateY }, { rotateZ: `${rotate}deg` }, { scale }],
        };
    });

    return (
        <Animated.View style={[styles.cardWrap, style]}>
            <CardFace config={config} data={data} />
        </Animated.View>
    );
}

// ─── Swipeable stack ─────────────────────────────────────────────────
export function MoodByTimeStack({ timeBuckets, isLight }: { timeBuckets: Record<TimeBucket, TimeOfDayMood>; isLight?: boolean }) {
    const [uiIndex, setUiIndex] = useState(0);
    const index = useSharedValue(0); // current front card (UI thread source of truth)
    const pos = useSharedValue(0); // animated/dragged position between cards

    const pan = useMemo(
        () =>
            Gesture.Pan()
                .activeOffsetX([-10, 10]) // only claim horizontal drags, let vertical scroll through
                .onUpdate((e) => {
                    // Drag left → pos increases (advance); drag right → pos decreases (go back).
                    let next = index.value - e.translationX / CARD_W;
                    // Light resistance past the ends.
                    if (next < 0) next = next * 0.35;
                    if (next > N - 1) next = N - 1 + (next - (N - 1)) * 0.35;
                    pos.value = next;
                })
                .onEnd((e) => {
                    let target = index.value;
                    if (e.translationX < -SWIPE_THRESHOLD && index.value < N - 1) target = index.value + 1;
                    else if (e.translationX > SWIPE_THRESHOLD && index.value > 0) target = index.value - 1;
                    index.value = target;
                    pos.value = withTiming(target, { duration: 240 });
                    runOnJS(setUiIndex)(target);
                }),
        [index, pos]
    );

    return (
        <GestureHandlerRootView style={styles.root}>
            <GestureDetector gesture={pan}>
                <View style={styles.stack}>
                    {BUCKETS.map((config, i) => (
                        <StackCard key={config.bucket} index={i} pos={pos} config={config} data={timeBuckets[config.bucket]} />
                    ))}
                </View>
            </GestureDetector>

            {/* Pager dots */}
            <View style={styles.dots}>
                {BUCKETS.map((b, i) => (
                    <View
                        key={b.bucket}
                        style={[
                            styles.dot,
                            {
                                backgroundColor:
                                    i === uiIndex
                                        ? isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)'
                                        : isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.22)',
                                width: i === uiIndex ? 18 : 6,
                            },
                        ]}
                    />
                ))}
            </View>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    root: {
        width: '100%',
    },
    stack: {
        height: CARD_H + DEPTH_TY[3],
        alignItems: 'center',
    },
    cardWrap: {
        position: 'absolute',
        top: 0,
        width: CARD_W,
        height: CARD_H,
    },
    card: {
        flex: 1,
        borderRadius: 24,
        padding: 22,
        justifyContent: 'space-between',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    cardLabel: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 1.5,
        color: 'rgba(255,255,255,0.8)',
    },
    moodBlock: {
        gap: 4,
    },
    moodName: {
        fontSize: 34,
        lineHeight: 42,
        fontWeight: '700',
        color: '#fff',
    },
    moodSub: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
    },
    metaText: {
        gap: 2,
    },
    metaPrimary: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.92)',
    },
    metaSecondary: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.55)',
    },
    emptyBlock: {
        gap: 6,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.85)',
    },
    emptySub: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.55)',
    },
    dots: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 16,
    },
    dot: {
        height: 6,
        borderRadius: 3,
    },
});
