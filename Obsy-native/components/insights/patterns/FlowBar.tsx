import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { getPatternTokens } from './tokens';

interface FlowBarProps {
    label: string;
    value: number;
}

const BUCKET_GRADIENTS: Record<string, readonly [string, string, ...string[]]> = {
    calm: ['#7FB59E', '#86B8C4', '#BFD2C2'],
    mixed: ['#D4B17B', '#C9A06A', '#B89060'],
    heavy: ['#A47585', '#8E5C6E', '#6E4858'],
};

const FALLBACK_GRADIENT: readonly [string, string] = ['#9C9C9C', '#7A7A7A'];

function gradientForLabel(label: string): readonly [string, string, ...string[]] {
    const key = label.trim().toLowerCase();
    if (BUCKET_GRADIENTS[key]) return BUCKET_GRADIENTS[key];
    return FALLBACK_GRADIENT;
}

export const FlowBar: React.FC<FlowBarProps> = ({ label, value }) => {
    const { isLight } = useObsyTheme();
    const tokens = getPatternTokens(isLight);
    const clamped = Math.max(0, Math.min(100, value));
    const colors = gradientForLabel(label);

    return (
        <View style={styles.row}>
            <ThemedText style={[styles.label, { color: tokens.ink3 }]}>{label.toUpperCase()}</ThemedText>
            <View style={[styles.track, { backgroundColor: tokens.lineSoft }]}>
                <LinearGradient
                    colors={colors as unknown as string[]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={[styles.fill, { width: `${clamped}%` }]}
                />
            </View>
            <ThemedText style={[styles.value, { color: tokens.ink2 }]}>{clamped}%</ThemedText>
        </View>
    );
};

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', height: 22 },
    label: { width: 56, fontSize: 11, letterSpacing: 0.6, fontWeight: '500' },
    track: { flex: 1, height: 6, borderRadius: 999, overflow: 'hidden', marginHorizontal: 12 },
    fill: { height: 6, borderRadius: 999 },
    value: { width: 36, textAlign: 'right', fontSize: 12, fontWeight: '500' },
});
