import React, { useMemo } from 'react';
import { View, StyleSheet, AccessibilityInfo } from 'react-native';
import { useCaptureStore } from '@/lib/captureStore';
import { isSameDay } from 'date-fns';
import { useIsFocused } from '@react-navigation/native';
import { useFloatingBackgroundStore } from '@/lib/floatingBackgroundStore';
import { ObsyDriftMode } from './modes/ObsyDriftMode';

const MAX_BUBBLES = 15;

export interface FloatingBackgroundControllerProps {
    screenName?: string;
}

export function FloatingBackgroundController({ screenName }: FloatingBackgroundControllerProps) {
    const { captures } = useCaptureStore();
    const isFocused = useIsFocused();
    const { enabled } = useFloatingBackgroundStore();
    const [reduceMotion, setReduceMotion] = React.useState(false);

    // Initial check for reduce motion
    React.useEffect(() => {
        AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
        const subscription = AccessibilityInfo.addEventListener(
            'reduceMotionChanged',
            setReduceMotion
        );
        return () => {
            if (subscription && 'remove' in subscription) {
                (subscription as any).remove();
            }
        };
    }, []);

    // Filter and randomly select max 15 captures
    const displayCaptures = useMemo(() => {
        const today = new Date();
        const todayCaptures = captures.filter((c) => isSameDay(new Date(c.created_at), today));

        if (todayCaptures.length <= MAX_BUBBLES) return todayCaptures;

        // Fisher-Yates shuffle
        const shuffled = [...todayCaptures];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, MAX_BUBBLES);
    }, [captures]);

    if (!enabled || !isFocused || screenName !== 'home' || displayCaptures.length === 0 || reduceMotion) {
        return null;
    }

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <ObsyDriftMode captures={displayCaptures} />
        </View>
    );
}
