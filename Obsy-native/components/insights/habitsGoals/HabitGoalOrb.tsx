import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { CTAOrbShell } from '@/components/home/CTAOrbShell';
import type { HabitGoalType } from '@/lib/habitGoalStore';

interface HabitGoalOrbProps {
    size: number;
    title: string;
    type: HabitGoalType;
    completed?: boolean;
}

// Dark-ish green gradient painted into the orb body when completed.
const COMPLETE_GRADIENT: readonly [string, string, string] = [
    'rgba(30, 78, 56, 0.78)',
    'rgba(18, 54, 39, 0.82)',
    'rgba(9, 34, 25, 0.88)',
];

export function HabitGoalOrb({ size, title, completed = false }: HabitGoalOrbProps) {
    const fontSize = Math.max(9, Math.min(14, size * 0.16));
    const shellSize = Math.max(1, size - 8);

    return (
        <View style={[styles.root, { width: size, height: size }]}>
            <CTAOrbShell size={shellSize} dim={!completed} overlayColors={completed ? COMPLETE_GRADIENT : undefined}>
                <Text
                    style={[
                        styles.title,
                        {
                            fontSize,
                            paddingHorizontal: size * 0.14,
                            width: shellSize,
                            color: completed ? '#eafff5' : 'rgba(255,255,255,0.82)',
                        },
                    ]}
                    numberOfLines={2}
                >
                    {title}
                </Text>
            </CTAOrbShell>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontWeight: '500',
        letterSpacing: 0.1,
        textAlign: 'center',
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
        zIndex: 2,
    },
});
