import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, View, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { AURORA_BACKGROUNDS } from '@/constants/auroraBackgrounds';
import { ORB_WAVES } from '@/constants/auroraOrbs';

// Small centered popup painted in the user's chosen aura palette — the deep
// background gradient plus a soft glow in their orb-wave colors. Deliberately
// contains NO gesture-handler (no GestureHandlerRootView / GestureDetector):
// a second gesture root inside a Modal, co-mounted with the orb box's root,
// was crashing the app. A plain RN Modal + Pressable backdrop is crash-safe.

interface AuraPopupProps {
    visible: boolean;
    onClose: () => void; // backdrop tap / Cancel / Android back
    children: React.ReactNode;
    maxWidth?: number; // default 340
    avoidKeyboard?: boolean; // default false
    dismissOnBackdrop?: boolean; // default true
}

const OPEN_SPRING = { damping: 16, stiffness: 220 } as const;

export function AuraPopup({
    visible,
    onClose,
    children,
    maxWidth = 340,
    avoidKeyboard = false,
    dismissOnBackdrop = true,
}: AuraPopupProps) {
    const { auroraBackground, orbWave } = useObsyTheme();

    const [mounted, setMounted] = useState(visible);
    const progress = useSharedValue(0); // 0 hidden · 1 open

    useEffect(() => {
        if (visible) {
            setMounted(true);
            progress.value = withSpring(1, OPEN_SPRING);
            Haptics.selectionAsync().catch(() => {});
        } else if (mounted) {
            progress.value = withTiming(0, { duration: 160 }, (finished) => {
                if (finished) runOnJS(setMounted)(false);
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: progress.value,
    }));

    const cardStyle = useAnimatedStyle(() => ({
        opacity: progress.value,
        transform: [{ scale: interpolate(progress.value, [0, 1], [0.92, 1]) }],
    }));

    if (!mounted) return null;

    const palette = AURORA_BACKGROUNDS[auroraBackground] ?? AURORA_BACKGROUNDS.default;
    const wave = ORB_WAVES[orbWave] ?? ORB_WAVES.aurora;
    const [glow, mid, base] = palette.radial;

    const card = (
        <Animated.View style={[styles.card, { maxWidth }, cardStyle]}>
            {/* Base aura gradient — the user's exact background tint */}
            <LinearGradient
                colors={[glow, mid, base]}
                locations={[0, 0.55, 1]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />
            {/* Orb-wave glow accents (top-left A, bottom-right B) */}
            <LinearGradient
                colors={[`rgba(${wave.a},0.20)`, 'rgba(0,0,0,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.9, y: 0.9 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />
            <LinearGradient
                colors={['rgba(0,0,0,0)', `rgba(${wave.b},0.16)`]}
                start={{ x: 0.2, y: 0.2 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />
            {/* Hairline glass edge */}
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.hairline]} />

            {children}
        </Animated.View>
    );

    return (
        <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
            <View style={styles.fill}>
                <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={dismissOnBackdrop ? onClose : undefined} />
                </Animated.View>

                <KeyboardAvoidingView
                    style={styles.center}
                    behavior={avoidKeyboard && Platform.OS === 'ios' ? 'padding' : undefined}
                    pointerEvents="box-none"
                >
                    {card}
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    fill: {
        flex: 1,
    },
    backdrop: {
        backgroundColor: 'rgba(3,5,12,0.55)',
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    card: {
        width: '100%',
        borderRadius: 26,
        overflow: 'hidden',
        // Soft lift off the backdrop
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
    },
    hairline: {
        borderRadius: 26,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
    },
});
