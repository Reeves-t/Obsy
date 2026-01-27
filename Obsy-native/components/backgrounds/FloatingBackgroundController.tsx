import React, { useMemo } from 'react';
import { View, StyleSheet, AccessibilityInfo } from 'react-native';
import { useCaptureStore } from '@/lib/captureStore';
import { isSameDay } from 'date-fns';
import { useIsFocused } from '@react-navigation/native';
import { useFloatingBackgroundStore } from '@/lib/floatingBackgroundStore';
import { ObsyDriftMode } from './modes/ObsyDriftMode';
import { StaticDriftMode } from './modes/StaticDriftMode';
import { OrbitalFloatMode } from './modes/OrbitalFloatMode';
import { ParallaxFloatMode } from './modes/ParallaxFloatMode';

const MAX_BUBBLES = 15;

export interface FloatingBackgroundControllerProps {
    screenName?: string;
}

export function FloatingBackgroundController({ screenName }: FloatingBackgroundControllerProps) {
    const { captures } = useCaptureStore();
    const isFocused = useIsFocused();
    const { enabled, mode } = useFloatingBackgroundStore();
    const [reduceMotion, setReduceMotion] = React.useState(false);

    // Initial check for reduce motion
    React.useEffect(() => {
        AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
        const subscription = AccessibilityInfo.addEventListener(
            'reduceMotionChanged',
            setReduceMotion
        );
        return () => {
            // Check if removal is needed based on React Native version, 
            // but usually addEventListener returns a subscription with .remove()
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

    // SCREEN ISOLATION: Fully unmount if not on Home capture screen OR explicitly disabled OR unfocused
    // The ScreenWrapper handles the screenName === 'home' check, but we double check here
    if (!enabled || !isFocused || screenName !== 'home' || displayCaptures.length === 0 || reduceMotion) {
        return null;
    }

    const renderMode = () => {
        switch (mode) {
            case 'static-drift':
                return <StaticDriftMode captures={displayCaptures} />;
            case 'orbital-float':
                return <OrbitalFloatMode captures={displayCaptures} />;
            case 'parallax-float':
                return <ParallaxFloatMode captures={displayCaptures} />;
            case 'obsy-drift':
            default:
                return <ObsyDriftMode captures={displayCaptures} />;
        }
    };

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {renderMode()}
        </View>
    );
}
