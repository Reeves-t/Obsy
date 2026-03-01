import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    withSpring,
    withRepeat,
    withSequence,
    Easing,
    cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { MoodGradient } from '@/lib/moods';

// ── Constants ────────────────────────────────────────────────────────
const IMAGE_START_SIZE = 160;          // Starting orb size (circle)
const BUBBLE_SIZE = 80;                // Final bubble size (matches floating bubbles)
const GRID = 4;                        // 4x4 fragment grid
const FRAG_SIZE = BUBBLE_SIZE / GRID;  // 20px per fragment

// Timing (ms)
const SHRINK_DURATION = 500;
const SCATTER_DURATION = 1200;

// Padding from screen edges for random position
const EDGE_PADDING = 100;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Random Position ─────────────────────────────────────────────────
function getRandomPosition(): { x: number; y: number } {
    const minX = EDGE_PADDING;
    const maxX = SCREEN_W - EDGE_PADDING;
    const minY = EDGE_PADDING + 80; // extra top padding for status bar
    const maxY = SCREEN_H - EDGE_PADDING - 80; // extra bottom for tab bar
    return {
        x: minX + Math.random() * (maxX - minX),
        y: minY + Math.random() * (maxY - minY),
    };
}

// ── Fragment Config ──────────────────────────────────────────────────
interface FragmentConfig {
    row: number;
    col: number;
    targetX: number;
    targetY: number;
    rotation: number;
    delay: number;
    gradientStart: { x: number; y: number };
    gradientEnd: { x: number; y: number };
}

function buildFragments(): FragmentConfig[] {
    const frags: FragmentConfig[] = [];
    for (let row = 0; row < GRID; row++) {
        for (let col = 0; col < GRID; col++) {
            const index = row * GRID + col;
            // Random gradient direction per orb
            const angle = Math.random() * Math.PI * 2;
            frags.push({
                row,
                col,
                targetX: (Math.random() - 0.5) * SCREEN_W * 0.9,
                targetY: (Math.random() - 0.5) * SCREEN_H * 0.9,
                rotation: (Math.random() - 0.5) * 540,
                delay: index * 25,
                gradientStart: { x: 0.5 + Math.cos(angle) * 0.5, y: 0.5 + Math.sin(angle) * 0.5 },
                gradientEnd: { x: 0.5 - Math.cos(angle) * 0.5, y: 0.5 - Math.sin(angle) * 0.5 },
            });
        }
    }
    return frags;
}

// ── Fragment Component ───────────────────────────────────────────────
function ShatterFragment({
    frag,
    gradientColors,
    startShatter,
}: {
    frag: FragmentConfig;
    gradientColors: [string, string];
    startShatter: boolean;
}) {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const opacity = useSharedValue(1);
    const rotation = useSharedValue(0);
    const scale = useSharedValue(1);

    useEffect(() => {
        if (!startShatter) return;

        translateX.value = withDelay(
            frag.delay,
            withTiming(frag.targetX, { duration: SCATTER_DURATION, easing: Easing.out(Easing.cubic) })
        );
        translateY.value = withDelay(
            frag.delay,
            withTiming(frag.targetY, { duration: SCATTER_DURATION, easing: Easing.out(Easing.cubic) })
        );
        opacity.value = withDelay(
            frag.delay,
            withTiming(0, { duration: SCATTER_DURATION * 0.8, easing: Easing.in(Easing.quad) })
        );
        rotation.value = withDelay(
            frag.delay,
            withTiming(frag.rotation, { duration: SCATTER_DURATION, easing: Easing.out(Easing.quad) })
        );
        scale.value = withDelay(
            frag.delay,
            withTiming(0.05, { duration: SCATTER_DURATION * 0.7, easing: Easing.in(Easing.cubic) })
        );
    }, [startShatter]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { rotate: `${rotation.value}deg` },
            { scale: scale.value },
        ],
    }));

    return (
        <Animated.View
            style={[
                {
                    position: 'absolute',
                    left: frag.col * FRAG_SIZE,
                    top: frag.row * FRAG_SIZE,
                    width: FRAG_SIZE,
                    height: FRAG_SIZE,
                    borderRadius: FRAG_SIZE / 2,
                    overflow: 'hidden',
                },
                animatedStyle,
            ]}
        >
            <LinearGradient
                colors={gradientColors}
                start={frag.gradientStart}
                end={frag.gradientEnd}
                style={{ width: FRAG_SIZE, height: FRAG_SIZE }}
            />
        </Animated.View>
    );
}

// ── Main Component ───────────────────────────────────────────────────
interface SaveCaptureAnimationProps {
    imageUri: string;
    moodGradient: MoodGradient;  // canonical 2-stop gradient for shatter orbs
    isSaving: boolean;           // true = show rotating orb, false = trigger shatter
    onComplete: () => void;
}

export function SaveCaptureAnimation({ imageUri, moodGradient, isSaving, onComplete }: SaveCaptureAnimationProps) {
    const fragments = useMemo(() => buildFragments(), []);
    const gradientColors = useMemo<[string, string]>(
        () => [moodGradient.from, moodGradient.to],
        [moodGradient.from, moodGradient.to]
    );
    const [startShatter, setStartShatter] = useState(false);
    const [shrinkDone, setShrinkDone] = useState(false);
    const hasTriggeredShatter = useRef(false);

    // Random position — computed once on mount
    const randomPos = useMemo(() => getRandomPosition(), []);

    // Phase 1: Single orb image — shrink + saving breathing
    const imageScale = useSharedValue(1);
    const imageOpacity = useSharedValue(1);
    const breatheScale = useSharedValue(1);
    const floatY = useSharedValue(0);
    const orbRotation = useSharedValue(0);

    // Phase 1: Shrink from 160 → 80 on mount
    useEffect(() => {
        const targetScale = BUBBLE_SIZE / IMAGE_START_SIZE;
        imageScale.value = withSpring(targetScale, {
            damping: 14,
            stiffness: 90,
            mass: 1,
        });

        // Haptic when shrink settles
        const hapticTimer = setTimeout(() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShrinkDone(true);
        }, SHRINK_DURATION);

        return () => clearTimeout(hapticTimer);
    }, []);

    // Phase 2: Breathing + floating while saving
    useEffect(() => {
        if (!shrinkDone) return;

        // Gentle breathing (scale 0.94 ↔ 1.06)
        breatheScale.value = withRepeat(
            withSequence(
                withTiming(1.06, { duration: 800, easing: Easing.inOut(Easing.sin) }),
                withTiming(0.94, { duration: 800, easing: Easing.inOut(Easing.sin) })
            ),
            -1,
            true
        );

        // Gentle floating (±6px vertical bob)
        floatY.value = withRepeat(
            withSequence(
                withTiming(-6, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
                withTiming(6, { duration: 1200, easing: Easing.inOut(Easing.sin) })
            ),
            -1,
            true
        );

        // Slow rotation
        orbRotation.value = withRepeat(
            withTiming(360, { duration: 4000, easing: Easing.linear }),
            -1,
            false
        );
    }, [shrinkDone]);

    // Phase 3: When saving completes → shatter
    useEffect(() => {
        if (isSaving || !shrinkDone || hasTriggeredShatter.current) return;

        hasTriggeredShatter.current = true;

        // Stop breathing/floating animations
        cancelAnimation(breatheScale);
        cancelAnimation(floatY);
        cancelAnimation(orbRotation);

        // Snap back to neutral
        breatheScale.value = withTiming(1, { duration: 100 });
        floatY.value = withTiming(0, { duration: 100 });

        // Brief pulse before shatter
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

        // Brief hold, then shatter
        const shatterTimer = setTimeout(() => {
            imageOpacity.value = withTiming(0, { duration: 1 });
            setStartShatter(true);
        }, 200);

        // Complete after scatter finishes
        const completeTimer = setTimeout(() => {
            onComplete();
        }, 200 + SCATTER_DURATION + 100);

        return () => {
            clearTimeout(shatterTimer);
            clearTimeout(completeTimer);
        };
    }, [isSaving, shrinkDone]);

    const imageStyle = useAnimatedStyle(() => ({
        opacity: imageOpacity.value,
        transform: [
            { scale: imageScale.value * breatheScale.value },
            { translateY: floatY.value },
            { rotate: `${orbRotation.value}deg` },
        ],
    }));

    return (
        <View style={styles.overlay} pointerEvents="none">
            {/* Anchor point — random position on screen */}
            <View style={[styles.anchor, { left: randomPos.x, top: randomPos.y }]}>
                {/* Single orb (visible during shrink + saving phases) */}
                <Animated.View style={[styles.imageWrapper, imageStyle]}>
                    <Image
                        source={{ uri: imageUri }}
                        style={styles.image}
                        resizeMode="cover"
                    />
                </Animated.View>

                {/* Fragment grid — hidden until shatter, pre-mounted for image caching */}
                <View style={[styles.fragmentContainer, { opacity: startShatter ? 1 : 0 }]}>
                    {fragments.map((frag, i) => (
                        <ShatterFragment
                            key={i}
                            frag={frag}
                            gradientColors={gradientColors}
                            startShatter={startShatter}
                        />
                    ))}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 99999,
    },
    anchor: {
        position: 'absolute',
        // Content is centered on the anchor point via negative margins
        marginLeft: -IMAGE_START_SIZE / 2,
        marginTop: -IMAGE_START_SIZE / 2,
    },
    imageWrapper: {
        width: IMAGE_START_SIZE,
        height: IMAGE_START_SIZE,
        borderRadius: IMAGE_START_SIZE / 2,
        overflow: 'hidden',
        // Shadow to match floating bubbles
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 8,
    },
    image: {
        width: '100%',
        height: '100%',
    },
    fragmentContainer: {
        width: BUBBLE_SIZE,
        height: BUBBLE_SIZE,
        position: 'absolute',
        // Center fragment grid within anchor (which is IMAGE_START_SIZE)
        left: (IMAGE_START_SIZE - BUBBLE_SIZE) / 2,
        top: (IMAGE_START_SIZE - BUBBLE_SIZE) / 2,
    },
});
