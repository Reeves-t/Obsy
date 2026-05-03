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

// ─── Constants ────────────────────────────────────────────────────────────────

type ActionKey = 'voice' | 'capture' | 'journal' | 'quick-mood';
type OrbitSlot = 'front' | 'left' | 'right' | 'top';

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

const SLOT_LAYOUTS: Record<OrbitSlot, SlotLayout> = {
    front: { hitSize: STAGE, opacity: 1,    scale: 1,    translateX: 0,   translateY: 14,  zIndex: 4 },
    left:  { hitSize: 72,    opacity: 0.9,  scale: 0.46, translateX: -88, translateY: -3,  zIndex: 3 },
    right: { hitSize: 72,    opacity: 0.9,  scale: 0.46, translateX: 88,  translateY: -3,  zIndex: 3 },
    top:   { hitSize: 56,    opacity: 0.7,  scale: 0.34, translateX: 0,   translateY: -54, zIndex: 2 },
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
];

function wrap(i: number) {
    return ((i % ACTIONS.length) + ACTIONS.length) % ACTIONS.length;
}

function slotFor(actionIdx: number, activeIdx: number): OrbitSlot {
    const rel = wrap(actionIdx - activeIdx);
    if (rel === 0) return 'front';
    if (rel === 1) return 'right';
    if (rel === 2) return 'top';
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
                    onPress={slot === 'left' ? onRotateRight : onRotateLeft}
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
}

export function TopicEntrySheet({ topicId, topicTitle, onClose }: TopicEntrySheetProps) {
    const router = useRouter();
    const [activeIdx, setActiveIdx] = useState(1);
    const [isAnimating, setIsAnimating] = useState(false);
    const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (animTimerRef.current) clearTimeout(animTimerRef.current);
        };
    }, []);

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
        const params = { topicId, topicTitle };
        if (key === 'journal') router.push({ pathname: '/journal', params } as never);
        else if (key === 'voice') router.push({ pathname: '/voice', params } as never);
        else if (key === 'quick-mood') router.push({ pathname: '/quick-mood', params } as never);
        else if (key === 'capture') router.push({ pathname: '/capture', params } as never);
    }, [onClose, router, topicId, topicTitle]);

    const activeAction = ACTIONS[activeIdx];

    return (
        <Modal
            visible
            transparent
            animationType="slide"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <View style={styles.backdrop}>
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
                    <Text style={styles.caption}>{activeAction.label}</Text>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#0e0e14',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingTop: 12,
        paddingBottom: 42,
        alignItems: 'center',
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
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
        marginTop: 8,
        fontSize: 14,
        color: 'rgba(210,212,218,0.6)',
        fontWeight: '500',
        letterSpacing: 0.2,
    },
});
