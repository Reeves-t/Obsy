import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { AnimatedMicButton } from '@/components/home/AnimatedMicButton';
import { AnimatedJournalButton } from '@/components/home/AnimatedJournalButton';
import { PulsingCameraTrigger } from '@/components/home/PulsingCameraTrigger';
import { QuickMoodButton } from '@/components/home/QuickMoodButton';
import { AnimatedDocumentsButton } from '@/components/home/AnimatedDocumentsButton';
import { AmbientBackground } from '@/components/ui/AmbientBackground';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { getThemeAccentRgb } from '@/lib/themeAccent';
import { ReflectedCaption } from '@/components/ui/ReflectedCaption';

// ─── Constants ────────────────────────────────────────────────────────────────

type ActionKey = 'voice' | 'capture' | 'journal' | 'quick-mood' | 'documents';
type OrbitSlot = 'front' | 'left' | 'right' | 'topLeft' | 'topRight';

const BTN = 80;
const RING_PAD = 6;
const STAGE = BTN + RING_PAD;          // 86
const CAROUSEL_W = 280;
const CAROUSEL_H = 190;
const ORBIT_ITEM_TOP = CAROUSEL_H / 2 - STAGE / 2;   // 52
const ORBIT_ITEM_LEFT = CAROUSEL_W / 2 - STAGE / 2;  // 97
const ORBIT_DURATION = 700;
const SWIPE_THRESH = 28;

interface SlotLayout {
    hitSize: number;
    opacity: number;
    scale: number;
    translateX: number;
    translateY: number;
    zIndex: number;
}

// Pentagon arrangement: front (bottom-center, large), left/right at the sides,
// topLeft/topRight as smaller items spread along the upper arc.
const SLOT_LAYOUTS: Record<OrbitSlot, SlotLayout> = {
    front:    { hitSize: STAGE, opacity: 1,    scale: 1,    translateX: 0,    translateY: 14,  zIndex: 5 },
    right:    { hitSize: 72,    opacity: 0.9,  scale: 0.46, translateX: 92,   translateY: -8,  zIndex: 4 },
    topRight: { hitSize: 56,    opacity: 0.7,  scale: 0.34, translateX: 56,   translateY: -54, zIndex: 3 },
    topLeft:  { hitSize: 56,    opacity: 0.7,  scale: 0.34, translateX: -56,  translateY: -54, zIndex: 3 },
    left:     { hitSize: 72,    opacity: 0.9,  scale: 0.46, translateX: -92,  translateY: -8,  zIndex: 4 },
};

interface ActionConfig {
    key: ActionKey;
    label: string;
    render: (opts: { size: number; disabled: boolean; onPress?: () => void }) => React.ReactNode;
}

const ACTIONS: ActionConfig[] = [
    {
        key: 'voice',
        label: 'say it out loud',
        render: ({ size, disabled, onPress }) => (
            <AnimatedMicButton size={size} disabled={disabled} onPress={onPress} />
        ),
    },
    {
        key: 'capture',
        label: 'capture a moment',
        render: ({ size, disabled, onPress }) => (
            <PulsingCameraTrigger size={size} disabled={disabled} onPress={onPress} />
        ),
    },
    {
        key: 'journal',
        label: 'write it out',
        render: ({ size, disabled, onPress }) => (
            <AnimatedJournalButton size={size} disabled={disabled} onPress={onPress} />
        ),
    },
    {
        key: 'quick-mood',
        label: 'just the mood',
        render: ({ size, disabled, onPress }) => (
            <QuickMoodButton size={size} disabled={disabled} onPress={onPress} />
        ),
    },
    {
        key: 'documents',
        label: 'attach a file or photo',
        render: ({ size, disabled, onPress }) => (
            <AnimatedDocumentsButton size={size} disabled={disabled} onPress={onPress} />
        ),
    },
];

function wrap(i: number) {
    return ((i % ACTIONS.length) + ACTIONS.length) % ACTIONS.length;
}

// Pentagon mapping: distance 0 = front, then walk around clockwise.
function slotFor(actionIdx: number, activeIdx: number): OrbitSlot {
    const rel = wrap(actionIdx - activeIdx);
    if (rel === 0) return 'front';
    if (rel === 1) return 'right';
    if (rel === 2) return 'topRight';
    if (rel === 3) return 'topLeft';
    return 'left';
}

// ─── Single orbit item ────────────────────────────────────────────────────────

function OrbitItem({
    action,
    slot,
    onRotateLeft,
    onRotateRight,
    onFrontPress,
}: {
    action: ActionConfig;
    slot: OrbitSlot;
    onRotateLeft: () => void;
    onRotateRight: () => void;
    onFrontPress: () => void;
}) {
    const layout = SLOT_LAYOUTS[slot];
    const tx = useSharedValue(layout.translateX);
    const ty = useSharedValue(layout.translateY);
    const sc = useSharedValue(layout.scale);
    const op = useSharedValue(layout.opacity);

    useEffect(() => {
        tx.value = withTiming(layout.translateX, { duration: ORBIT_DURATION, easing: Easing.bezier(0.22, 1, 0.36, 1) });
        ty.value = withTiming(layout.translateY, { duration: ORBIT_DURATION, easing: Easing.bezier(0.22, 1, 0.36, 1) });
        sc.value = withTiming(layout.scale, { duration: ORBIT_DURATION, easing: Easing.bezier(0.22, 1, 0.36, 1) });
        op.value = withTiming(layout.opacity, { duration: ORBIT_DURATION - 60, easing: Easing.out(Easing.cubic) });
    }, [layout.opacity, layout.scale, layout.translateX, layout.translateY, op, sc, tx, ty]);

    const animStyle = useAnimatedStyle(() => ({
        opacity: op.value,
        transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: sc.value }],
    }));

    const btn = action.render({
        size: BTN,
        disabled: slot !== 'front',
        onPress: slot === 'front' ? onFrontPress : undefined,
    });

    // Left-side slots rotate right (bringing them forward); right-side slots
    // rotate left. Either way, a tap pulls the tapped button toward "front".
    const onSlotTap = slot === 'left' || slot === 'topLeft'
        ? onRotateRight
        : onRotateLeft;

    return (
        <Animated.View
            style={[
                styles.orbitItem,
                { zIndex: layout.zIndex, elevation: layout.zIndex },
                animStyle,
            ]}
            pointerEvents="box-none"
        >
            {slot === 'front' ? (
                <View style={styles.frontWrap}>{btn}</View>
            ) : (
                <Pressable
                    style={[styles.touchZone, { width: layout.hitSize, height: layout.hitSize }]}
                    onPress={onSlotTap}
                >
                    <View pointerEvents="none">{btn}</View>
                </Pressable>
            )}
        </Animated.View>
    );
}

// ─── Main sheet ───────────────────────────────────────────────────────────────

export interface TopicEntrySheetProps {
    topicId: string;
    topicTitle: string;
    onClose: () => void;
    onSelectDocuments?: () => void;
}

export function TopicEntrySheet({ topicId, topicTitle, onClose, onSelectDocuments }: TopicEntrySheetProps) {
    const router = useRouter();
    const [activeIdx, setActiveIdx] = useState(1);
    const [isAnimating, setIsAnimating] = useState(false);
    const [displayedLabel, setDisplayedLabel] = useState(ACTIONS[1].label);
    const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const captionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { auroraBackground, orbWave } = useObsyTheme();
    const accentRgb = getThemeAccentRgb(auroraBackground, orbWave);

    const capOpacity = useSharedValue(1);
    const capLift = useSharedValue(0);
    const capScale = useSharedValue(1);

    useEffect(() => {
        return () => {
            if (animTimerRef.current) clearTimeout(animTimerRef.current);
            if (captionTimerRef.current) clearTimeout(captionTimerRef.current);
        };
    }, []);

    // Cross-fade the caption (with a scale settle) when the front action changes.
    useEffect(() => {
        const nextLabel = ACTIONS[activeIdx].label;
        if (nextLabel === displayedLabel) return;
        if (captionTimerRef.current) clearTimeout(captionTimerRef.current);

        capOpacity.value = withTiming(0, { duration: 170, easing: Easing.out(Easing.quad) });
        capLift.value = withTiming(-6, { duration: 170, easing: Easing.out(Easing.quad) });

        captionTimerRef.current = setTimeout(() => {
            setDisplayedLabel(nextLabel);
            capLift.value = 6;
            capScale.value = 0.96;
            capOpacity.value = withTiming(1, { duration: 230, easing: Easing.out(Easing.cubic) });
            capLift.value = withTiming(0, { duration: 230, easing: Easing.out(Easing.cubic) });
            capScale.value = withTiming(1, { duration: 230, easing: Easing.out(Easing.cubic) });
            captionTimerRef.current = null;
        }, 180);
    }, [activeIdx, displayedLabel, capOpacity, capLift, capScale]);

    const captionStyle = useAnimatedStyle(() => ({
        opacity: capOpacity.value,
        transform: [{ translateY: capLift.value }, { scale: capScale.value }],
    }));

    const rotate = useCallback((dir: 'left' | 'right') => {
        if (isAnimating) return;
        setIsAnimating(true);
        setActiveIdx(i => wrap(i + (dir === 'left' ? 1 : -1)));
        if (animTimerRef.current) clearTimeout(animTimerRef.current);
        animTimerRef.current = setTimeout(() => {
            setIsAnimating(false);
            animTimerRef.current = null;
        }, ORBIT_DURATION);
    }, [isAnimating]);

    const panResponder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
            !isAnimating && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onMoveShouldSetPanResponderCapture: (_, g) =>
            !isAnimating && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderRelease: (_, g) => {
            if (g.dx <= -SWIPE_THRESH) rotate('left');
            else if (g.dx >= SWIPE_THRESH) rotate('right');
        },
    }), [isAnimating, rotate]);

    const navigate = useCallback((key: ActionKey) => {
        onClose();
        if (key === 'documents') {
            onSelectDocuments?.();
            return;
        }
        const params = { topicId, topicTitle };
        if (key === 'journal') router.push({ pathname: '/journal', params } as never);
        else if (key === 'voice') router.push({ pathname: '/voice', params } as never);
        else if (key === 'quick-mood') router.push({ pathname: '/quick-mood', params } as never);
        else if (key === 'capture') router.push({ pathname: '/capture', params } as never);
    }, [onClose, router, topicId, topicTitle, onSelectDocuments]);

    return (
        <Modal
            visible
            transparent
            animationType="slide"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <View style={styles.backdrop}>
                <AmbientBackground />
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <View style={styles.sheet}>
                    {/* Drag handle */}
                    <View style={styles.handle} />

                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.headerEyebrow}>reflecting on</Text>
                        <Text style={styles.headerTitle} numberOfLines={1}>{topicTitle}</Text>
                    </View>

                    {/* Mini carousel */}
                    <View
                        style={styles.carouselWrap}
                        {...panResponder.panHandlers}
                    >
                        {ACTIONS.map((action, idx) => (
                            <OrbitItem
                                key={action.key}
                                action={action}
                                slot={slotFor(idx, activeIdx)}
                                onRotateLeft={() => rotate('left')}
                                onRotateRight={() => rotate('right')}
                                onFrontPress={() => navigate(action.key)}
                            />
                        ))}
                    </View>

                    {/* Caption */}
                    <Animated.View style={captionStyle}>
                        <ReflectedCaption
                            text={displayedLabel}
                            textStyle={styles.caption}
                            reflectionColor={`rgb(${accentRgb})`}
                        />
                    </Animated.View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'transparent',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: 'rgba(12,14,22,0.55)',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingTop: 12,
        paddingBottom: 42,
        alignItems: 'center',
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.15)',
        marginBottom: 18,
    },
    header: {
        alignItems: 'center',
        marginBottom: 4,
        paddingHorizontal: 24,
    },
    headerEyebrow: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 1.6,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.32)',
    },
    headerTitle: {
        fontSize: 19,
        fontWeight: '600',
        color: '#fff',
        letterSpacing: -0.2,
        marginTop: 5,
        maxWidth: 280,
        textAlign: 'center',
    },
    carouselWrap: {
        width: CAROUSEL_W,
        height: CAROUSEL_H,
        alignItems: 'center',
        justifyContent: 'center',
    },
    orbitItem: {
        position: 'absolute',
        top: ORBIT_ITEM_TOP,
        left: ORBIT_ITEM_LEFT,
        width: STAGE,
        height: STAGE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    frontWrap: {
        width: STAGE,
        height: STAGE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    touchZone: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    caption: {
        marginTop: 16,
        fontSize: 17,
        lineHeight: 22,
        color: 'rgba(228,232,242,0.7)',
        fontWeight: '500',
        letterSpacing: 0.3,
    },
});
