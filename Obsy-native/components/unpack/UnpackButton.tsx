import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import Animated, {
    Easing,
    FadeInRight,
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const COBALT = '#41caec';

interface UnpackButtonProps {
    onPress: () => void;
    disabled?: boolean;
}

/**
 * The "Unpack ✦" button revealed in the composer once the user has input.
 * Enters with a slide-in from the right plus a subtle scale bump, and fires a
 * selection haptic so the reveal feels intentional. Sits to the right of
 * "Log it"; because they share a flex row, mounting this pushes "Log it" left.
 */
export function UnpackButton({ onPress, disabled }: UnpackButtonProps) {
    const bump = useSharedValue(0.9);

    useEffect(() => {
        bump.value = withSequence(
            withTiming(1.06, { duration: 180, easing: Easing.out(Easing.cubic) }),
            withTiming(1, { duration: 160, easing: Easing.inOut(Easing.ease) }),
        );
        Haptics.selectionAsync().catch(() => {});
    }, [bump]);

    const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));

    return (
        <AnimatedTouchable
            activeOpacity={0.85}
            onPress={onPress}
            disabled={disabled}
            entering={FadeInRight.duration(240).easing(Easing.out(Easing.cubic))}
            style={[styles.button, disabled && styles.disabled, bumpStyle]}
        >
            <Text style={styles.label}>Unpack</Text>
            <Text style={styles.sparkle}>✦</Text>
        </AnimatedTouchable>
    );
}

const styles = StyleSheet.create({
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(65,202,236,0.55)',
        backgroundColor: 'rgba(65,202,236,0.12)',
        borderRadius: 12,
        paddingHorizontal: 15,
        paddingVertical: 10,
        justifyContent: 'center',
    },
    disabled: {
        opacity: 0.4,
    },
    label: {
        fontSize: 14.5,
        fontWeight: '600',
        color: COBALT,
    },
    sparkle: {
        fontSize: 13,
        color: COBALT,
    },
});
