import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { CTAOrbShell } from '@/components/home/CTAOrbShell';

interface TopicOrbProps {
    size: number;
    title: string;
    selected?: boolean;
}

export function TopicOrb({ size, title, selected = false }: TopicOrbProps) {
    const fontSize = Math.max(10, Math.min(15, size * 0.155));
    const shellSize = Math.max(1, size - 8);

    return (
        <View style={[styles.root, { width: size, height: size }]}>
            {/* Selected halo */}
            {selected && (
                <View style={[styles.halo, {
                    position: 'absolute',
                    top: -size * 0.25,
                    left: -size * 0.25,
                    width: size * 1.5,
                    height: size * 1.5,
                    borderRadius: size * 0.75,
                }]} />
            )}

            <CTAOrbShell size={shellSize}>
                <Text
                    style={[styles.title, {
                        fontSize,
                        paddingHorizontal: size * 0.14,
                        width: shellSize,
                    }]}
                    numberOfLines={3}
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
    halo: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.24,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 0 },
    },
    title: {
        color: '#fff',
        fontWeight: '500',
        letterSpacing: 0.1,
        lineHeight: undefined,
        textAlign: 'center',
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
        zIndex: 2,
    },
});
