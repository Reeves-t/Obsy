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

// Soft completed tone — calm green, not a "success checkmark".
const COMPLETE_GREEN = '#5fd6a0';

export function HabitGoalOrb({ size, title, type, completed = false }: HabitGoalOrbProps) {
    const fontSize = Math.max(9, Math.min(14, size * 0.16));
    const shellSize = Math.max(1, size - 8);

    return (
        <View style={[styles.root, { width: size, height: size }]}>
            {/* Completed glow — a soft green halo behind the orb */}
            {completed && (
                <View
                    style={[
                        styles.halo,
                        {
                            top: -size * 0.22,
                            left: -size * 0.22,
                            width: size * 1.44,
                            height: size * 1.44,
                            borderRadius: size * 0.72,
                        },
                    ]}
                />
            )}

            <CTAOrbShell size={shellSize} dim={!completed}>
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

                {/* Tiny type marker — goals get a hollow ring, habits a filled dot */}
                <View
                    style={[
                        styles.typeDot,
                        {
                            borderWidth: type === 'goal' ? 1.5 : 0,
                            backgroundColor: type === 'goal' ? 'transparent' : completed ? COMPLETE_GREEN : 'rgba(255,255,255,0.28)',
                            borderColor: completed ? COMPLETE_GREEN : 'rgba(255,255,255,0.28)',
                        },
                    ]}
                />
            </CTAOrbShell>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    halo: {
        position: 'absolute',
        backgroundColor: 'rgba(95,214,160,0.14)',
        shadowColor: COMPLETE_GREEN,
        shadowOpacity: 0.5,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 0 },
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
    typeDot: {
        position: 'absolute',
        bottom: 9,
        width: 6,
        height: 6,
        borderRadius: 3,
        zIndex: 2,
    },
});
